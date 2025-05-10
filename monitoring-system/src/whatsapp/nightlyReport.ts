import { MessageMonitor } from './messageMonitor'
import { CompanySettings } from '../models/CompanySettings'
import { WhatsappChat } from '../models/WhatsappChat'
import { WhatsappMessage } from '../models/WhatsappMessage'
import { Types } from 'mongoose'
import { format, subDays, addHours, isWithinInterval, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { CronJob } from 'cron'

interface IReportStats {
	totalChats: number
	respondedChats: number
	unansweredChats: number
	avgResponseTime: number
}

export const initNightlyReportCron = (messageMonitor: MessageMonitor) => {
	console.log(
		`[${new Date().toISOString()}] 🔄 Инициализация крон для ночного отчета...`
	)

	// Функция для создания крона для конкретной компании
	const createCompanyCron = async (company: any) => {
		try {
			// Конвертируем рабочее время в UTC
			const [workStartHours, workStartMinutes] = company
				.working_hours_start!.split(':')
				.map(Number)

			// Проверяем валидность времени
			if (isNaN(workStartHours) || isNaN(workStartMinutes)) {
				console.log(
					`[${new Date().toISOString()}] ⚠️ Некорректный формат рабочего времени для компании ${
						company.nameCompany
					}`
				)
				return null
			}

			// Вычисляем время запуска (за 5 часов до начала рабочего дня)
			const reportHours = workStartHours - 5
			const reportMinutes = workStartMinutes

			// Создаем cron выражение
			const cronExpression = `${reportMinutes} ${reportHours} * * *`

			console.log(
				`[${new Date().toISOString()}] ⏰ Создание крона для компании ${
					company.nameCompany
				}:`,
				{
					workStartLocal: company.working_hours_start,
					reportTime: `${reportHours}:${reportMinutes}`,
					cronExpression,
				}
			)

			const job = new CronJob(
				cronExpression,
				async () => {
					console.log(
						`[${new Date().toISOString()}] 🚀 Запуск ночного отчета для компании ${
							company.nameCompany
						}`
					)
					console.log(
						`[${new Date().toISOString()}] 🔍 Проверка данных компании:`,
						{
							id: company._id,
							name: company.nameCompany,
							phoneNumber: company.phoneNumber,
							telegramGroupId: company.telegramGroupId,
							working_hours_start: company.working_hours_start,
							working_hours_end: company.working_hours_end,
						}
					)

					try {
						// Конвертируем рабочее время в UTC
						const [workStartHours, workStartMinutes] = company
							.working_hours_start!.split(':')
							.map(Number)
						const [workEndHours, workEndMinutes] = company
							.working_hours_end!.split(':')
							.map(Number)

						// Рассчитываем период для отчета
						const now = new Date()
						const almatyTime = toZonedTime(now, 'Asia/Almaty') // UTC+5

						// Конец периода - начало рабочего дня
						const reportEnd = new Date(almatyTime)
						reportEnd.setHours(workStartHours, workStartMinutes, 0, 0)

						// Начало периода - конец предыдущего рабочего дня
						const reportStart = new Date(reportEnd)
						reportStart.setDate(reportStart.getDate() - 1)
						reportStart.setHours(workEndHours, workEndMinutes, 0, 0)

						console.log(
							`[${new Date().toISOString()}] 📅 Период отчета для компании ${
								company._id
							}:`,
							{
								start: reportStart.toISOString(),
								end: reportEnd.toISOString(),
								workStart: company.working_hours_start,
								workEnd: company.working_hours_end,
								almatyTime: format(almatyTime, 'yyyy-MM-dd HH:mm:ss'),
							}
						)

						// Получаем все чаты за период
						const chats = await WhatsappChat.find({
							companyId: new Types.ObjectId(company._id),
							createdAt: {
								$gte: reportStart,
								$lt: reportEnd,
							},
						}).lean()

						// Статистика
						const stats: IReportStats = {
							totalChats: chats.length,
							respondedChats: chats.filter(chat => chat.sendMessage === true)
								.length,
							unansweredChats: 0,
							avgResponseTime: 0,
						}
						stats.unansweredChats = chats.filter(
							chat => chat.sendMessage === false
						).length

						// Получаем все сообщения за период для расчета среднего времени ответа
						const messages = await WhatsappMessage.find({
							whatsappChatId: { $in: chats.map(chat => chat._id) },
							createdAt: {
								$gte: reportStart,
								$lt: reportEnd,
							},
						}).lean()

						// Расчет среднего времени ответа
						const responseTimes: number[] = []
						for (const chat of chats) {
							const chatMessages = messages.filter(m =>
								m.whatsappChatId.equals(chat._id)
							)
							for (let i = 0; i < chatMessages.length - 1; i++) {
								if (!chatMessages[i].isEcho && chatMessages[i + 1].isEcho) {
									const responseTime =
										chatMessages[i + 1].createdAt.getTime() -
										chatMessages[i].createdAt.getTime()
									responseTimes.push(responseTime)
								}
							}
						}

						stats.avgResponseTime =
							responseTimes.length > 0
								? Math.round(
										responseTimes.reduce((a, b) => a + b, 0) /
											responseTimes.length /
											1000
								  )
								: 0

						// Получаем непросмотренные чаты
						const unviewedChats = chats.filter(
							chat => chat.sendMessage === false
						)

						// Формируем сообщение отчета
						let reportMessage = `🌙 <b>Ночной отчет от SalesTrack</b>\n\n
					🗓 <b>Период:</b> с ${format(reportStart, 'HH:mm')} до ${format(
							reportEnd,
							'HH:mm'
						)} (Алматы)\n
						🏢 <b>Компания:</b> ${company.nameCompany}\n\n
					<b>Статистика по обращениям вне рабочего времени:</b>\n\n
					✍️ <b>Начато диалогов:</b> ${stats.totalChats}\n
					✅ <b>Ответ получен:</b> ${stats.respondedChats}\n
					⚠️ <b>Без ответа:</b> ${stats.unansweredChats}\n
					⚡️ <b>Среднее время ответа:</b> ${Math.floor(
						stats.avgResponseTime / 60
					)} мин. ${stats.avgResponseTime % 60} сек.`

						// Добавляем ссылки на непросмотренные чаты
						if (unviewedChats.length > 0) {
							const links = unviewedChats
								.map(chat => `https://wa.me/${chat.chatId}`)
								.join('\n')

							reportMessage += `\n\n📌 <b>Рекомендуем проверить и ответить на непросмотренные обращения:</b>\n${links}`
						}

						// Отправляем отчет
						if (company.phoneNumber && company.telegramGroupId) {
							console.log(
								`[${new Date().toISOString()}] 📤 Отправка ночного отчета для компании ${
									company.nameCompany
								}`
							)
							console.log(
								`[${new Date().toISOString()}] 🔍 Telegram Group ID: ${
									company.telegramGroupId
								}`
							)

							try {
								await messageMonitor.sendTelegramMessage(
									company._id,
									reportMessage
								)
								console.log(
									`[${new Date().toISOString()}] ✅ Ночной отчет отправлен в Telegram для компании ${
										company.nameCompany
									}`
								)
							} catch (error) {
								console.error(
									`[${new Date().toISOString()}] ❌ Ошибка при отправке отчета для компании ${
										company.nameCompany
									}:`,
									error
								)
								if (error instanceof Error) {
									console.error(
										`[${new Date().toISOString()}] ❌ Детали ошибки:`,
										error.message
									)
								}
							}
						} else {
							console.log(
								`[${new Date().toISOString()}] ⚠️ У компании ${
									company.nameCompany
								} не указан telegramGroupId или phoneNumber`
							)
						}
					} catch (error) {
						console.error(
							`[${new Date().toISOString()}] ❌ Ошибка при формировании ночного отчета для компании ${
								company.nameCompany
							}:`,
							error
						)
					}
				},
				null,
				false,
				'Asia/Almaty'
			)

			// Запускаем крон
			job.start()

			// Проверяем, что крон создался
			if (!job) {
				console.log(
					`[${new Date().toISOString()}] ⚠️ Не удалось создать крон для компании ${
						company.nameCompany
					}`
				)
				return null
			}

			// Проверяем следующую дату запуска
			const nextRun = job.nextDate()
			if (!nextRun) {
				console.log(
					`[${new Date().toISOString()}] ⚠️ Не удалось определить следующую дату запуска для компании ${
						company.nameCompany
					}`
				)
				return null
			}

			console.log(`[${new Date().toISOString()}] 🔍 Проверка статуса крона:`, {
				nextDate: nextRun.toString(),
				timezone: 'Asia/Almaty',
			})

			console.log(
				`[${new Date().toISOString()}] ✅ Крон для ночного отчета компании ${
					company.nameCompany
				} запущен`
			)
			console.log(
				`[${new Date().toISOString()}] ⏰ Следующий запуск в ${reportHours}:${reportMinutes} (Алматы)`
			)
			console.log(
				`[${new Date().toISOString()}] 📅 Следующая дата запуска: ${nextRun.toLocaleString()}`
			)

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

	// Инициализация кронов для всех компаний
	const initCrons = async () => {
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
				const job = await createCompanyCron(company)
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

	// Запускаем инициализацию кронов
	initCrons()

	return {
		stop: () => {
			// Здесь можно добавить логику остановки всех кронов при необходимости
		},
	}
}
