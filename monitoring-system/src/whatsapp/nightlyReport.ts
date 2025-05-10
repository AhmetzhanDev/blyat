import { MessageMonitor } from './messageMonitor'
import { CompanySettings } from '../models/CompanySettings'
import { WhatsappChat } from '../models/WhatsappChat'
import { WhatsappMessage } from '../models/WhatsappMessage'
import { Types } from 'mongoose'
import { format, subDays, addHours, isWithinInterval, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { CronJob } from 'cron'
import { TelegramService } from '../telegram/telegramClient'

interface IReportStats {
	totalChats: number
	respondedChats: number
	unansweredChats: number
	avgResponseTime: number
}

export class NightlyReportManager {
	private static instance: NightlyReportManager
	private activeJobs: Map<string, CronJob>
	private messageMonitor: MessageMonitor | null

	private constructor() {
		this.activeJobs = new Map()
		this.messageMonitor = null
	}

	public static getInstance(): NightlyReportManager {
		if (!NightlyReportManager.instance) {
			NightlyReportManager.instance = new NightlyReportManager()
		}
		return NightlyReportManager.instance
	}

	public setMessageMonitor(monitor: MessageMonitor) {
		this.messageMonitor = monitor
	}

	public async createCompanyCron(company: any) {
		try {
			// Останавливаем существующий крон, если он есть
			const existingJob = this.activeJobs.get(company._id.toString())
			if (existingJob) {
				console.log(
					`[${new Date().toISOString()}] 🔄 Остановка существующего крона для компании ${
						company.nameCompany
					}`
				)
				existingJob.stop()
			}

			// Конвертируем рабочее время в UTC
			const [workStartHours, workStartMinutes] = company
				.working_hours_start!.split(':')
				.map(Number)
			const [workEndHours, workEndMinutes] = company
				.working_hours_end!.split(':')
				.map(Number)

			console.log(`[${new Date().toISOString()}] ⏰ Исходное рабочее время:`, {
				start: `${workStartHours}:${workStartMinutes}`,
				end: `${workEndHours}:${workEndMinutes}`,
			})

			// Конвертируем в UTC (Almaty UTC+6)
			// Для конвертации из UTC+6 в UTC просто вычитаем 6 часов
			const workStartUTC = workStartHours - 6
			const workEndUTC = workEndHours - 6

			console.log(`[${new Date().toISOString()}] ⏰ Рабочее время в UTC:`, {
				start: `${workStartUTC}:${workStartMinutes}`,
				end: `${workEndUTC}:${workEndMinutes}`,
			})

			// Получаем текущее время в UTC
			const now = new Date()
			const currentHour = now.getUTCHours()
			const currentMinute = now.getUTCMinutes()
			const currentTimeInMinutes = currentHour * 60 + currentMinute

			// Время отчета (в начале рабочего дня)
			const reportHour = workStartUTC
			const reportMinute = workStartMinutes
			const reportTimeInMinutes = reportHour * 60 + reportMinute

			console.log(`[${new Date().toISOString()}] ⏰ Время отчета:`, {
				currentTime: `${currentHour}:${currentMinute} UTC`,
				reportTime: `${reportHour}:${reportMinute} UTC`,
				currentTimeInMinutes,
				reportTimeInMinutes,
			})

			// Проверяем, нужно ли запустить отчет сейчас
			// Запускаем отчет, если текущее время в пределах 2 минут от времени отчета
			const timeDiff = Math.abs(reportTimeInMinutes - currentTimeInMinutes)
			const shouldRunNow = timeDiff <= 2

			console.log(
				`[${new Date().toISOString()}] ⏰ Проверка времени для компании ${
					company.nameCompany
				}:`,
				{
					currentTime: `${currentHour}:${currentMinute} UTC`,
					reportTime: `${reportHour}:${reportMinute} UTC`,
					timeDiff,
					shouldRunNow,
				}
			)

			// Создаем крон выражение для ежедневного запуска в UTC
			const cronExpression = `${reportMinute} ${reportHour} * * *`

			const job = new CronJob(
				cronExpression,
				async () => {
					console.log(
						`[${new Date().toISOString()}] 🚀 Запуск ночного отчета для компании ${
							company.nameCompany
						}`
					)
					try {
						if (!this.messageMonitor) {
							throw new Error('MessageMonitor не инициализирован')
						}

						// Получаем текущую дату в UTC
						const now = new Date()

						// Конвертируем рабочее время в UTC
						const [workStartHours, workStartMinutes] = company
							.working_hours_start!.split(':')
							.map(Number)
						const [workEndHours, workEndMinutes] = company
							.working_hours_end!.split(':')
							.map(Number)

						// Конвертируем в UTC (Almaty UTC+6)
						const workStartUTC = workStartHours - 5
						const workEndUTC = workEndHours - 5

						// Вычисляем период отчета
						const reportEnd = new Date(now)
						reportEnd.setUTCHours(workStartUTC, workStartMinutes, 0, 0)

						const reportStart = new Date(reportEnd)
						reportStart.setUTCDate(reportEnd.getUTCDate() - 1)
						reportStart.setUTCHours(workEndUTC, workEndMinutes, 0, 0)

						console.log(
							`[${new Date().toISOString()}] 📊 Период отчета для компании ${
								company.nameCompany
							}:`,
							{
								start: reportStart.toISOString(),
								end: reportEnd.toISOString(),
								startLocal: reportStart.toLocaleString('ru-RU', {
									timeZone: 'Asia/Almaty',
								}),
								endLocal: reportEnd.toLocaleString('ru-RU', {
									timeZone: 'Asia/Almaty',
								}),
							}
						)

						// Получаем все чаты за период отчета
						const chats = await WhatsappChat.find({
							companyId: company._id,
							createdAt: {
								$gte: reportStart,
								$lte: reportEnd,
							},
						})

						console.log(
							`[${new Date().toISOString()}] 📊 Найдено чатов: ${chats.length}`
						)

						// Получаем все сообщения за период отчета
						const messages = await WhatsappMessage.find({
							companyId: company._id,
							createdAt: {
								$gte: reportStart,
								$lte: reportEnd,
							},
						})

						console.log(
							`[${new Date().toISOString()}] 📊 Найдено сообщений: ${
								messages.length
							}`
						)

						// Формируем отчет
						const report = {
							companyName: company.nameCompany,
							period: {
								start: reportStart.toISOString(),
								end: reportEnd.toISOString(),
							},
							stats: {
								totalChats: chats.length,
								totalMessages: messages.length,
							},
						}

						// Отправляем отчет в Telegram
						if (company.telegramGroupId) {
							const telegramService = TelegramService.getInstance()
							await telegramService.initialize()

							const reportMessage = `
📊 *Ночной отчет*
Компания: ${report.companyName}
Период: ${reportStart.toLocaleString('ru-RU', {
								timeZone: 'Asia/Almaty',
							})} - ${reportEnd.toLocaleString('ru-RU', {
								timeZone: 'Asia/Almaty',
							})}
Всего чатов: ${report.stats.totalChats}
Всего сообщений: ${report.stats.totalMessages}
`

							await telegramService.sendMessage(
								company.telegramGroupId,
								reportMessage
							)
							console.log(
								`[${new Date().toISOString()}] ✅ Отчет отправлен в Telegram для компании ${
									company.nameCompany
								}`
							)
						} else {
							console.log(
								`[${new Date().toISOString()}] ⚠️ Telegram группа не настроена для компании ${
									company.nameCompany
								}`
							)
						}
					} catch (error) {
						console.error(
							`[${new Date().toISOString()}] ❌ Ошибка при генерации отчета для компании ${
								company.nameCompany
							}:`,
							error
						)
					}
				},
				null,
				true,
				'UTC'
			)

			// Запускаем крон
			job.start()

			// Сохраняем крон в хранилище
			this.activeJobs.set(company._id.toString(), job)

			console.log(
				`[${new Date().toISOString()}] ✅ Крон создан для компании ${
					company.nameCompany
				}`,
				{
					cronExpression,
					nextRun: job.nextDate().toString(),
					shouldRunNow,
					currentTime: `${currentHour}:${currentMinute} UTC`,
					reportTime: `${reportHour}:${reportMinute} UTC`,
					timeDiff,
				}
			)

			// Если текущее время равно времени отчета, запускаем отчет сразу
			if (shouldRunNow) {
				console.log(
					`[${new Date().toISOString()}] 🚀 Запуск отчета немедленно для компании ${
						company.nameCompany
					}`
				)
				job.fireOnTick()
			}

			return job
		} catch (error) {
			console.error(
				`[${new Date().toISOString()}] ❌ Ошибка при создании крона для компании ${
					company.nameCompany
				}:`,
				error
			)
			return null
		}
	}

	public async updateCompanyCron(company: any) {
		console.log(
			`[${new Date().toISOString()}] 🔄 Обновление крона для компании ${
				company.nameCompany
			}`
		)
		return this.createCompanyCron(company)
	}

	public async initCrons() {
		try {
			// Получаем все компании с настроенными рабочими часами
			const companies = await CompanySettings.find({
				whatsappAuthorized: true,
				phoneNumber: { $exists: true, $ne: null },
				nameCompany: { $exists: true, $ne: null },
				working_hours_start: { $exists: true, $ne: null },
				working_hours_end: { $exists: true, $ne: null },
			})

			if (companies.length === 0) {
				console.log(
					`[${new Date().toISOString()}] ℹ️ Нет компаний с настроенными рабочими часами, ночной отчет не будет отправлен`
				)
				return
			}

			// Создаем крон для каждой компании
			for (const company of companies) {
				const job = await this.createCompanyCron(company)
				if (!job) {
					console.log(
						`[${new Date().toISOString()}] ⚠️ Не удалось создать крон для компании ${
							company.nameCompany
						}`
					)
				}
			}
		} catch (error) {
			console.error(
				`[${new Date().toISOString()}] ❌ Ошибка при инициализации кронов:`,
				error
			)
		}
	}

	public stop() {
		// Останавливаем все активные кроны
		for (const [companyId, job] of this.activeJobs.entries()) {
			console.log(
				`[${new Date().toISOString()}] 🔄 Остановка крона для компании ${companyId}`
			)
			job.stop()
		}
		this.activeJobs.clear()
	}
}

export const initNightlyReportCron = (
	messageMonitor: MessageMonitor | null
) => {
	console.log(
		`[${new Date().toISOString()}] 🔄 Инициализация крон для ночного отчета...`
	)

	const manager = NightlyReportManager.getInstance()
	if (messageMonitor) {
		manager.setMessageMonitor(messageMonitor)
	}
	manager.initCrons()

	return {
		stop: () => manager.stop(),
		updateCompanyCron: (company: any) => manager.updateCompanyCron(company),
	}
}
