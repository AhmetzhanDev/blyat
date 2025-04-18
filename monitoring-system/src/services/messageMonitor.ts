import { WhatsAppAccountModel } from '../models/WhatsAppAccount';
import { CompanySettings } from '../models/CompanySettings';
import fetch from 'node-fetch';

export class MessageMonitor {
  private static instance: MessageMonitor;
  private messageTimers: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {}

  public static getInstance(): MessageMonitor {
    if (!MessageMonitor.instance) {
      MessageMonitor.instance = new MessageMonitor();
    }
    return MessageMonitor.instance;
  }

  // public async startMonitoring(phoneNumber: string, message: string, companyId: string): Promise<void> {
  //   try {
  //     // Находим компанию и получаем время ожидания ответа
  //     const companySettings = await CompanySettings.findOne({ 'companies.id': companyId });
  //     if (!companySettings) {
  //       throw new Error('Компания не найдена');
  //     }

  //     const company = companySettings.companies.find(c => c.id === companyId);
  //     if (!company) {
  //       throw new Error('Компания не найдена');
  //     }

  //     const responseTime = company.managerResponse * 60 * 1000; // Конвертируем минуты в миллисекунды

  //     // Создаем таймер для проверки ответа
  //     const timerId = setTimeout(async () => {
  //       try {
  //         // Проверяем, был ли ответ
  //         const account = await WhatsAppAccountModel.findOne({ phoneNumber });
  //         if (!account) {
  //           throw new Error('Аккаунт WhatsApp не найден');
  //         }

  //         // Если ответа не было, отправляем уведомление в Telegram
  //         if (company.telegramGroupId) {
  //           const botToken = process.env.TELEGRAM_BOT_TOKEN;
  //           if (!botToken) {
  //             throw new Error('Токен бота не найден');
  //           }

  //           const notificationMessage = `⚠️ Внимание! Не получен ответ на сообщение в WhatsApp более ${company.managerResponse} минут.\n\nСообщение: ${message}\n\nСсылка на чат WhatsApp: https://wa.me/${phoneNumber}`;

  //           await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
  //             method: 'POST',
  //             headers: {
  //               'Content-Type': 'application/json',
  //             },
  //             body: JSON.stringify({
  //               chat_id: -company.telegramGroupId,
  //               text: notificationMessage
  //             })
  //           });
  //         }
  //       } catch (error) {
  //         console.error('Ошибка при отправке уведомления в Telegram:', error);
  //       }
  //     }, responseTime);

  //     // Сохраняем таймер
  //     this.messageTimers.set(`${phoneNumber}-${companyId}`, timerId);
  //   } catch (error) {
  //     console.error('Ошибка при запуске мониторинга:', error);
  //   }
  // }

  public stopMonitoring(phoneNumber: string, companyId: string): void {
    const timerId = this.messageTimers.get(`${phoneNumber}-${companyId}`);
    if (timerId) {
      clearTimeout(timerId);
      this.messageTimers.delete(`${phoneNumber}-${companyId}`);
    }
  }
} 