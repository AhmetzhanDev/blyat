import { WhatsappChat } from '../models/WhatsappChat'
import { WhatsappMessage } from '../models/WhatsappMessage'
import { CompanySettings } from '../models/CompanySettings'
import { MessageMonitor } from './messageMonitor'
import { CronJob } from 'cron'
import { TelegramService } from '../telegram/telegramClient'

// Время для ежедневного отчета
export const initDailyReportCron = (messageMonitor: MessageMonitor) => {
	console.log(
		`[${new Date().toISOString()}] 🔄 Инициализация крон для ежедневного отчета...`
	)

	// Тестовый режим - запуск каждую минуту
	const testCron = '*/1 * * * *'
	// Реальный режим - запуск в 21:00 каждый день
	const realCron = '25 6 * * *'

	// Используем реальный режим
	const job = new CronJob(realCron, async () => {
		console.log(
			`[${new Date().toISOString()}] 🚀 Запуск крон-задачи ежедневного отчета`
		)
		try {
			const companies = await CompanySettings.find({ isRunning: true })
			console.log(
				`[${new Date().toISOString()}] 📊 Найдено компаний для отчета: ${
					companies.length
				}`
			)

			for (const company of companies) {
				console.log(
					`[${new Date().toISOString()}] 🔍 Обработка компании: ${
						company.nameCompany
					}`
				)
				console.log(
					`[${new Date().toISOString()}] 🔍 Telegram Group ID: ${
						company.telegramGroupId
					}`
				)

				if (!company.telegramGroupId) {
					console.log(
						`[${new Date().toISOString()}] ⚠️ У компании ${
							company.nameCompany
						} не указан telegramGroupId`
					)
					continue
				}

				try {
					const report = await messageMonitor.generateDailyReport(company._id)
					await messageMonitor.sendTelegramMessage(company._id, report)
					console.log(
						`[${new Date().toISOString()}] ✅ Отчет отправлен в Telegram для компании ${
							company.nameCompany
						}`
					)
				} catch (error) {
					console.error(
						`[${new Date().toISOString()}] ❌ Ошибка при обработке компании ${
							company.nameCompany
						}:`,
						error
					)
				}
			}
		} catch (error) {
			console.error(
				`[${new Date().toISOString()}] ❌ Ошибка при отправке отчета:`,
				error
			)
		}
	})

	// Запускаем крон
	job.start()
	console.log(
		`[${new Date().toISOString()}] ✅ Крон для ежедневного отчета запущен`
	)
	console.log(
		`[${new Date().toISOString()}] ⏰ Следующий запуск в 21:00 каждый день`
	)

	// Проверяем, что крон действительно запущен
	if (job) {
		console.log(
			`[${new Date().toISOString()}] ✅ Крон для ежедневного отчета успешно инициализирован`
		)
		console.log(
			`[${new Date().toISOString()}] ⏰ Следующий запуск: ${job
				.nextDate()
				.toLocaleString()}`
		)
	} else {
		console.error(
			`[${new Date().toISOString()}] ❌ Крон для ежедневного отчета не инициализирован!`
		)
	}
}

const sendDailyReport = async (messageMonitor: MessageMonitor) => {
	console.log(
		`[${new Date().toISOString()}] 📊 Начало формирования ежедневного отчета`
	)

	const companies = await CompanySettings.find({})
	console.log(
		`[${new Date().toISOString()}] 🔍 Найдено компаний: ${companies.length}`
	)

	for (const company of companies) {
		console.log(
			`[${new Date().toISOString()}] 🔍 Обработка компании: ${
				company.nameCompany
			}`
		)

		if (!company.telegramGroupId) {
			console.log(
				`[${new Date().toISOString()}] ⚠️ У компании ${
					company.nameCompany
				} не указан telegramGroupId, пропускаем`
			)
			continue
		}

		console.log(
			`[${new Date().toISOString()}] 🔍 Обработка компании: ${
				company.nameCompany
			}`
		)

		// Получаем все чаты за сегодня
		const today = new Date()
		today.setHours(0, 0, 0, 0)

		const chats = await WhatsappChat.find({
			companyId: company._id,
			createdAt: { $gte: today },
		})

		// Получаем все сообщения за сегодня
		const messages = await WhatsappMessage.find({
			whatsappChatId: { $in: chats.map(chat => chat._id) },
			createdAt: { $gte: today },
		})

		// Статистика
		const startedChats = chats.length
		const closedChats = chats.filter(chat => chat.isClosed).length

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

		const avgResponseTime =
			responseTimes.length > 0
				? Math.round(
						responseTimes.reduce((a, b) => a + b, 0) /
							responseTimes.length /
							1000
				  )
				: 0

		// Диалоги без ответа (есть сообщения от клиента, но нет ответа менеджера)
		const unansweredChats = chats.filter(chat => {
			const chatMessages = messages.filter(m =>
				m.whatsappChatId.equals(chat._id)
			)
			return chatMessages.length > 0 && !chatMessages.some(m => m.isEcho)
		}).length

		// Просроченные ответы (время ответа больше 2 минут)
		const overdueResponses = responseTimes.filter(
			time => time > 2 * 60 * 1000
		).length

		// Непросмотренные чаты (sendMessage: false)
		const unviewedChats = chats.filter(chat => !chat.sendMessage)

		// Формируем сообщение
		const message = `📊 <b>Ежедневный отчет от SalesTrack</b>\n\n🗓 <b>Дата:</b> ${new Date().toLocaleDateString()}\n\n🏢 <b>Компания:</b> ${
			company.nameCompany
		}\n\n<b>Статистика за сегодня:</b>\n\n✍️ <b>Диалогов начато:</b> ${startedChats}\n✅ <b>Диалогов закрыто:</b> ${closedChats}\n⚡️<b>Среднее время ответа:</b> ${Math.floor(
			avgResponseTime / 60
		)} мин. ${
			avgResponseTime % 60
		} сек.\n⚠️ <b>Диалогов без ответа:</b> ${unansweredChats}\n🕓 <b>Просроченных ответов (больше 2 мин):</b> ${overdueResponses}\n\n📌 <b>Список непросмотренных чатов:</b>\n\n${unviewedChats
			.map(chat => `https://wa.me/${chat.chatId}`)
			.join('\n')}`

		try {
			console.log(
				`[${new Date().toISOString()}] 📤 Отправка отчета для компании ${
					company.nameCompany
				}`
			)
			await messageMonitor.sendTelegramMessage(company._id, message)
			console.log(
				`[${new Date().toISOString()}] ✅ Отчет успешно отправлен для компании ${
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
	}
}
