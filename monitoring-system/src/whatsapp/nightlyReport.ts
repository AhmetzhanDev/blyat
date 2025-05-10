import { MessageMonitor } from './messageMonitor'
import { CompanySettings } from '../models/CompanySettings'
import { WhatsappChat } from '../models/WhatsappChat'
import { WhatsappMessage } from '../models/WhatsappMessage'
import { Types, Document } from 'mongoose'
import { format, subDays, addHours, isWithinInterval, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { CronJob } from 'cron'
import { TelegramService } from '../telegram/telegramClient'

interface IWhatsappChat {
	_id: Types.ObjectId
	companyId: Types.ObjectId
	chatId: string
	isClosed: boolean
	sendMessage: boolean
	createdAt: Date
}

type WhatsappChatDocument = Document<unknown, {}, IWhatsappChat> & IWhatsappChat

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
			// Проверяем наличие рабочих часов
			if (!company.working_hours_start || !company.working_hours_end) {
				console.log(
					`[${new Date().toISOString()}] ⚠️ У компании ${
						company.nameCompany
					} не указаны рабочие часы, крон не будет создан`
				)
				return null
			}

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
			const workStartUTC = workStartHours - 5
			const workEndUTC = workEndHours - 5

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
			// Запускаем отчет только если текущее время точно равно времени отчета
			const timeDiff = currentTimeInMinutes - reportTimeInMinutes
			const shouldRunNow = timeDiff === 0

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
						// Для конвертации из UTC+6 в UTC просто вычитаем 6 часов
						const workStartUTC = workStartHours - 5
						const workEndUTC = workEndHours - 5

						// Вычисляем период отчета
						// Конец периода - начало текущего рабочего дня
						const reportEnd = new Date(now)
						reportEnd.setUTCHours(workStartUTC, workStartMinutes, 0, 0)

						// Начало периода - конец предыдущего рабочего дня
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
							`[${new Date().toISOString()}] 📊 Найдено чатов за период отчета: ${
								chats.length
							}`
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
							`[${new Date().toISOString()}] 📊 Найдено сообщений за период отчета: ${
								messages.length
							}`
						)

						// Считаем непросмотренные чаты по той же логике, что и в messageMonitor
						const unansweredChats = chats.filter((chat: any) => {
							const chatMessages = messages.filter(
								m => m.whatsappChatId.toString() === chat._id.toString()
							)
							return (
								chatMessages.length > 0 && !chatMessages.some(m => m.isEcho)
							)
						}).length

						// Считаем отвеченные чаты как общее количество минус неотвеченные
						const respondedChats = chats.length - unansweredChats

						// Считаем среднее время ответа
						let totalResponseTime = 0
						let respondedCount = 0
						for (const chat of chats) {
							const typedChat = chat as any
							if (typedChat.firstResponseTime && typedChat.createdAt) {
								const responseTime =
									typedChat.firstResponseTime.getTime() -
									typedChat.createdAt.getTime()
								totalResponseTime += responseTime
								respondedCount++
							}
						}
						const avgResponseTime =
							respondedCount > 0 ? totalResponseTime / respondedCount : 0
						const avgResponseMinutes = Math.floor(avgResponseTime / (1000 * 60))
						const avgResponseSeconds = Math.floor(
							(avgResponseTime % (1000 * 60)) / 1000
						)

						// Формируем ссылки на чаты
						const chatLinks = chats
							.filter((chat: any) => {
								const chatMessages = messages.filter(
									m => m.whatsappChatId.toString() === chat._id.toString()
								)
								return (
									chatMessages.length > 0 && !chatMessages.some(m => m.isEcho)
								)
							})
							.map((chat: any) => `https://wa.me/${chat.chatId}`)
							.join('\n')

						// Формируем отчет
						const reportMessage = `
🌙 Ночной отчет от SalesTrack

🗓 Период: с ${reportStart.toLocaleString('ru-RU', {
							timeZone: 'Asia/Almaty',
							hour: '2-digit',
							minute: '2-digit',
						})} до ${reportEnd.toLocaleString('ru-RU', {
							timeZone: 'Asia/Almaty',
							hour: '2-digit',
							minute: '2-digit',
						})} (Алматы)

🏢 Компания: ${company.nameCompany}

Статистика по обращениям вне рабочего времени:

✍️ Начато диалогов: ${chats.length}
✅ Ответ получен: ${respondedChats}
⚠️ Без ответа: ${unansweredChats}
⚡️ Среднее время ответа: ${avgResponseMinutes} мин. ${avgResponseSeconds} сек.

${
	chatLinks
		? `📌 Рекомендуем проверить и ответить на непросмотренные обращения:\n${chatLinks}`
		: ''
}`

						// Отправляем отчет в Telegram
						if (company.telegramGroupId) {
							const telegramService = TelegramService.getInstance()
							await telegramService.initialize()

							await telegramService.sendMessage(
								company.telegramGroupId.toString(),
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
				working_hours_start: { $exists: true, $ne: null, $nin: ['', null] },
				working_hours_end: { $exists: true, $ne: null, $nin: ['', null] },
			})

			if (companies.length === 0) {
				console.log(
					`[${new Date().toISOString()}] ℹ️ Нет компаний с настроенными рабочими часами, ночной отчет не будет отправлен`
				)
				return
			}

			console.log(
				`[${new Date().toISOString()}] 📊 Найдено ${
					companies.length
				} компаний с настроенными рабочими часами`
			)

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
