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
	const realCron = '0 3 * * *'

	// Используем реальный режим
	const job = new CronJob(realCron, async () => {
		console.log(
			`[${new Date().toISOString()}] 🚀 Запуск крон-задачи ежедневного отчета`
		)
		try {
			const companies = await CompanySettings.find({
				phoneNumber: { $exists: true, $ne: null },
				nameCompany: { $exists: true, $ne: null },
			})
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
