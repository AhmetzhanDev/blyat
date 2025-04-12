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

      // Проверяем номер отправителя в базе данных
      const cleanPhoneNumber = message.from.replace('@c.us', '').replace('+', '').replace(/\D/g, '');
      console.log(`[${timestamp}] 🔍 Ищем номер в базе: ${cleanPhoneNumber}`);
      
      const user = await UserModel.findOne({ 
        phoneNumber: cleanPhoneNumber
      });

      if (user) {
        console.log(`[${timestamp}] ✅ Найден пользователь:`, user);
        
        // Находим настройки компании для этого пользователя
        const companySettings = await CompanySettings.findOne({ userId: user._id });
        if (companySettings && companySettings.companies.length > 0) {
          const company = companySettings.companies[0]; // Берем первую компанию
          console.log(`[${timestamp}] ✅ Найдена компания:`, company);

          // Запускаем таймер для проверки ответа
          if (this.activeTimers.has(message.from)) {
            console.log(`[${timestamp}] 🔄 Сбрасываем предыдущий таймер для ${message.from}`);
            clearTimeout(this.activeTimers.get(message.from));
          }

          const timer = setTimeout(async () => {
            const currentTimestamp = new Date().toISOString();
            console.log(`[${currentTimestamp}] ⚠️ Время ответа истекло для ${message.from}`);
            console.log(`[${currentTimestamp}] ⏰ Прошло ${company.managerResponse} минут без ответа`);
            
            if (company.telegramGroupId) {
              console.log(`[${currentTimestamp}] 📢 Отправляем уведомление в Telegram группу ${company.telegramGroupId}`);
              try {
                const reminderMessage = `⚠️ ВНИМАНИЕ! ⚠️\n\nВ WhatsApp-чате ${company.nameCompany} не ответили на сообщение в течение ${company.managerResponse} минут!\n\nСсылка на чат: https://wa.me/${message.from.replace('@c.us', '')}`;
                
                // Проверяем инициализацию Telegram сервиса
                if (!this.telegramService) {
                  throw new Error('Telegram сервис не инициализирован');
                }
                
                // Преобразуем ID группы в число
                const groupId = company.telegramGroupId.toString();
                console.log(`[${currentTimestamp}] 🔍 Исходный ID группы: ${company.telegramGroupId}`);
                console.log(`[${currentTimestamp}] 🔍 Преобразованный ID группы: ${groupId}`);
                
                if (!groupId) {
                  throw new Error('Неверный формат ID группы Telegram');
                }
                
                // Проверяем подключение к Telegram
                const isConnected = await this.telegramService.isConnected();
                console.log(`[${currentTimestamp}] 🔍 Статус подключения к Telegram: ${isConnected}`);
                
                if (!isConnected) {
                  console.log(`[${currentTimestamp}] 🔄 Переподключаемся к Telegram...`);
                  await this.telegramService.initialize();
                }
                
                // Отправляем сообщение
                console.log(`[${currentTimestamp}] 📤 Отправка сообщения в группу ${groupId}...`);
                await this.telegramService.sendMessage(groupId, reminderMessage);
                console.log(`[${currentTimestamp}] ✅ Сообщение успешно отправлено в группу ${groupId}`);
              } catch (error: any) {
                console.error(`[${currentTimestamp}] ❌ Ошибка при отправке в Telegram:`, error);
                console.error(`[${currentTimestamp}] 🔍 Детали ошибки:`, error.message);
                
                // Пробуем переподключиться и отправить снова
                try {
                  console.log(`[${currentTimestamp}] 🔄 Пробуем переподключиться и отправить снова...`);
                  await this.telegramService.initialize();
                  const retryMessage = `⚠️ ВНИМАНИЕ! ⚠️\n\nВ WhatsApp-чате ${company.nameCompany} не ответили на сообщение в течение ${company.managerResponse} минут!\n\nСсылка на чат: https://wa.me/${message.from.replace('@c.us', '')}`;
                  await this.telegramService.sendMessage((- + Number(company.telegramGroupId)).toString(), retryMessage);
                  console.log(`[${currentTimestamp}] ✅ Сообщение отправлено после переподключения`);
                } catch (retryError: any) {
                  console.error(`[${currentTimestamp}] ❌ Ошибка при повторной отправке:`, retryError);
                }
              }
            } else {
              console.log(`[${currentTimestamp}] ⚠️ Telegram группа не настроена для компании ${company.nameCompany}`);
            }
          }, company.managerResponse * 60 * 1000);

          this.activeTimers.set(message.from, timer);
          console.log(`[${timestamp}] ⏳ Запущен таймер на ${company.managerResponse} минут для ${message.from}`);
          console.log(`[${timestamp}] 📝 Ожидаем ответа до ${new Date(Date.now() + company.managerResponse * 60 * 1000).toISOString()}`);
        } else {
          console.log(`[${timestamp}] ⚠️ Настройки компании не найдены для пользователя`);
        }
      } else {
        console.log(`[${timestamp}] ⚠️ Номер ${message.from} не найден в базе данных`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Ошибка при обработке сообщения:`, error);
    }
  }
} 