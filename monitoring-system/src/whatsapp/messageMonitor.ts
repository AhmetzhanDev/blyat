//
import { Client, Message } from 'whatsapp-web.js';
import { UserModel } from '../models/User';
import { CompanySettings } from '../models/CompanySettings';
import { TelegramService } from '../telegram/telegramClient';

export class MessageMonitor {
  private static instance: MessageMonitor;
  private activeTimers: Map<string, NodeJS.Timeout>;
  private telegramService: TelegramService;

  private constructor() {
    this.activeTimers = new Map();
    this.telegramService = TelegramService.getInstance();
  }

  public static getInstance(): MessageMonitor {
    if (!MessageMonitor.instance) {
      MessageMonitor.instance = new MessageMonitor();
    }
    return MessageMonitor.instance;
  }

  public async handleMessage(message: Message): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] 📱 Получено сообщение от: ${message.from}`);
      console.log(`[${timestamp}] 📝 Текст сообщения: "${message.body}"`);

      // Проверяем, является ли это исходящим сообщением
      if (message.fromMe) {
        console.log(`[${timestamp}] 👤 Получено исходящее сообщение`);
        return;
      }

      const clientCleanPhoneNumber = message.from.replace('@c.us', '').replace('+', '').replace(/\D/g, '');

      // Проверяем номер отправителя в базе данных
      const cleanPhoneNumber = message.to.replace('@c.us', '').replace('+', '').replace(/\D/g, '');
      console.log(`[${timestamp}] 🔍 Ищем номер в базе: ${cleanPhoneNumber}`);
      
      const user = await UserModel.findOne({ 
        phoneNumber: cleanPhoneNumber
      });

      if (user) {
        console.log(`[${timestamp}] ✅ Найден пользователь:`, user);
        
        const companySettings = await CompanySettings.findOne({ userId: user._id });
        if (companySettings && companySettings.companies.length > 0) {
          const company = companySettings.companies[0];
          console.log(`[${timestamp}] ✅ Найдена компания:`, company);

          // Если уже есть активный таймер, отменяем его
          if (this.activeTimers.has(message.to)) {
            console.log(`[${timestamp}] 🔄 Перезапускаем таймер для ${message.to}`);
            clearTimeout(this.activeTimers.get(message.to));
          }

          // Запускаем новый таймер
          const timer = setTimeout(async () => {
            const currentTimestamp = new Date().toISOString();
            console.log(`[${currentTimestamp}] ⚠️ Время ответа истекло для ${message.to} (чат ${clientCleanPhoneNumber})`);
            
            if (company.telegramGroupId) {
              try {
                const reminderMessage = `⚠️ ВНИМАНИЕ! ⚠️\n\nВ WhatsApp-чате не ответили на сообщение в течение ${company.managerResponse} минут!\n\nСсылка на чат: https://wa.me/${clientCleanPhoneNumber}`;
                
                if (!this.telegramService) {
                  throw new Error('Telegram сервис не инициализирован');
                }
                
                const isConnected = await this.telegramService.isConnected();
                if (!isConnected) {
                  await this.telegramService.initialize();
                }
                
                await this.telegramService.sendMessage(`-${company.telegramGroupId}`, reminderMessage);
                console.log(`[${currentTimestamp}] ✅ Уведомление отправлено в Telegram`);
              } catch (error) {
                console.error(`[${currentTimestamp}] ❌ Ошибка при отправке уведомления:`, error);
              }
            }
          }, company.managerResponse * 60 * 1000);

          this.activeTimers.set(message.from, timer);
          console.log(`[${timestamp}] ⏳ Запущен таймер на ${company.managerResponse} минут для ${message.to} (чат ${message.from})`);
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Ошибка при обработке сообщения:`, error);
    }
  }

  public async handleAdminMessage(message: Message): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] 📱 Получено сообщение от: ${message.from}`);
      console.log(`[${timestamp}] 📝 Текст сообщения: "${message.body}"`);

      // Проверяем, является ли это исходящим сообщением
      if (message.fromMe) {
        console.log(`[${timestamp}] 👤 Получено исходящее сообщение`);
        return;
      }

      // Проверяем, является ли это кодом подтверждения Telegram
      const isTelegramCode = message.body.match(/^\d{5}$/);
      if (isTelegramCode) {
        console.log(`[${timestamp}] 🔑 Обнаружен код подтверждения Telegram: ${message.body}`);
        console.log(`[${timestamp}] 🔑 Проверяем, ожидает ли Telegram код...`);
        
        // Проверяем состояние Telegram сервиса
        const isConnected = await this.telegramService.isConnected();
        console.log(`[${timestamp}] 🔑 Telegram сервис подключен: ${isConnected}`);
        
        if (!isConnected) {
          console.log(`[${timestamp}] 🔑 Пробуем инициализировать Telegram сервис...`);
          await this.telegramService.initialize();
        }
        
        console.log(`[${timestamp}] 🔑 Передаем код в Telegram сервис...`);
        this.telegramService.setVerificationCode(message.body);
        console.log(`[${timestamp}] 🔑 Код передан в Telegram сервис`);
        return;
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Ошибка при обработке сообщения:`, error);
    }
  }

  public async handleOutgoingMessage(message: Message): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] 📤 Исходящее сообщение от клиента:`);
      console.log(`[${timestamp}] 📝 Текст: "${message.body}"`);
      console.log(`[${timestamp}] 👤 Получатель: ${message.to}`);

      // Отключаем таймер при отправке ответа
      if (this.activeTimers.has(message.to)) {
        console.log(`[${timestamp}] 🛑 Отключаем таймер для ${message.to}`);
        clearTimeout(this.activeTimers.get(message.to));
        this.activeTimers.delete(message.to);
        console.log(`[${timestamp}] ✅ Таймер успешно отключен`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Ошибка при обработке исходящего сообщения:`, error);
    }
  }
} 