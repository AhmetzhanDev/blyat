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

	// Запускаем каждый день в 5:00 UTC (10:00 по Алматы, UTC+5)
	const cronExpression = '0 5 * * *'

	const job = new CronJob(cronExpression, async () => {
		console.log(
			`[${new Date().toISOString()}] 📊 Начало формирования ночного отчета`
		)

		try {
			// Получаем все компании с настроенными рабочими часами
			const companies = await CompanySettings.find({
				whatsappAuthorized: true,
				phoneNumber: { $exists: true, $ne: null },
				nameCompany: { $exists: true, $ne: null },
				$and: [
					{ working_hours_start: { $exists: true } },
					{ working_hours_start: { $ne: null } },
					{ working_hours_start: { $ne: '' } },
					{ working_hours_end: { $exists: true } },
					{ working_hours_end: { $ne: null } },
					{ working_hours_end: { $ne: '' } },
				],
			})

			if (companies.length === 0) {
				console.log(
					`[${new Date().toISOString()}] ℹ️ Нет компаний с настроенными рабочими часами`
				)
				return
			}

			for (const company of companies) {
				const companyId = company._id
				const workStart = Number(company.working_hours_start)
				const workEnd = Number(company.working_hours_end)

				// Рассчитываем период для отчета
				const now = new Date()
				const almatyTime = toZonedTime(now, 'Asia/Almaty') // UTC+5

				// Конец периода - начало рабочего дня
				const reportEnd = new Date(almatyTime)
				reportEnd.setHours(workStart, 0, 0, 0)

				// Начало периода - конец предыдущего рабочего дня
				const reportStart = new Date(reportEnd)
				reportStart.setDate(reportStart.getDate() - 1)
				reportStart.setHours(workEnd, 0, 0, 0)

				console.log(
					`[${new Date().toISOString()}] 📅 Период отчета для компании ${companyId}:`,
					{
						start: reportStart,
						end: reportEnd,
						almatyTime: format(almatyTime, 'yyyy-MM-dd HH:mm:ss'),
						utcTime: format(now, 'yyyy-MM-dd HH:mm:ss'),
					}
				)

				// Получаем все чаты за период
				const chats = await WhatsappChat.find({
					companyId: new Types.ObjectId(companyId),
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
				const unviewedChats = chats.filter(chat => chat.sendMessage === false)

				// Формируем сообщение отчета
				let reportMessage = `🌙 <b>Ночной отчет от SalesTrack</b>\n\n
				🗓 <b>Период:</b> с ${format(reportStart, 'HH:mm')} до ${format(
					reportEnd,
					'HH:mm'
				)}\n
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
				if (company.phoneNumber) {
					await messageMonitor.sendTelegramMessage(companyId, reportMessage)
				}

				console.log(
					`[${new Date().toISOString()}] ✅ Ночной отчет отправлен для компании ${companyId}`
				)
			}
		} catch (error) {
			console.error(
				`[${new Date().toISOString()}] ❌ Ошибка при формировании ночного отчета:`,
				error
			)
		}
	})

	job.start()

	console.log(
		`[${new Date().toISOString()}] ✅ Крон для ночного отчета запущен`
	)
	console.log(
		`[${new Date().toISOString()}] ⏰ Следующий запуск в 5:00 UTC (10:00 по Алматы)`
	)

	return job
}
