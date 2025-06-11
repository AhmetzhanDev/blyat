import { WhatsappChat } from '../models/WhatsappChat'
import { WhatsappMessage } from '../models/WhatsappMessage'
import { CompanySettings, ICompanySettings } from '../models/CompanySettings' // Добавил импорт ICompanySettings
import { MessageMonitor } from './messageMonitor'
import { CronJob } from 'cron'
import { TelegramService } from '../telegram/TelegramService' // Убедитесь, что этот импорт нужен, если TelegramService не используется напрямую в этом файле
import { Types } from 'mongoose' // Важный импорт для Types.ObjectId

// Время для ежедневного отчета
export const initDailyReportCron = (messageMonitor: MessageMonitor) => {
    console.log(
        `[${new Date().toISOString()}] 🔄 Инициализация крон для ежедневного отчета...`
    )

    // Тестовый режим - запуск каждую минуту
    const testCron = '*/1 * * * *'
    // Реальный режим - запуск в 21:00 каждый день (или '0 3 * * *' если 3 утра)
    const realCron = '0 3 * * *' // Измените на '0 21 * * *' если нужно в 21:00

    // Используем реальный режим
    const job = new CronJob(realCron, async () => {
        console.log(
            `[${new Date().toISOString()}] 🚀 Запуск крон-задачи ежедневного отчета`
        )
        try {
            // Уточняем тип возвращаемых компаний, чтобы TypeScript знал, что _id будет Types.ObjectId
            const companies: (ICompanySettings & { _id: Types.ObjectId })[] = await CompanySettings.find({
                phoneNumber: { $exists: true, $ne: null },
                nameCompany: { $exists: true, $ne: null },
            });

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
                    // generateDailyReport должен ожидать Types.ObjectId для company._id
                    const report = await messageMonitor.generateDailyReport(company._id);
                    
                    // Исправление: Приведение company._id к Types.ObjectId
                    // Это безопасно, так как мы знаем, что company._id является ObjectId из MongoDB
                    await messageMonitor.sendTelegramMessage(company._id as Types.ObjectId, report); 
                    
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