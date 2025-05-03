//telegramClient.ts
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram/tl';
import bigInt from 'big-integer';
import dotenv from 'dotenv';
import * as readline from 'readline';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { CompanySettings } from '../models/CompanySettings';

dotenv.config();

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(query, (answer: string) => {
      rl.close();
      resolve(answer);
    });
  });
};

export class TelegramService {
  private static instance: TelegramService;
  private client: TelegramClient | null = null;
  private stringSession: StringSession;
  private phoneCode: string | null = null;
  private phone: string;
  private sessionFile = path.join(__dirname, 'telegram_session.txt');
  private codePromise: Promise<string> | null = null;
  private codeResolve: ((code: string) => void) | null = null;

  private constructor() {
    this.phone = process.env.TELEGRAM_PHONE || '';
    this.stringSession = new StringSession('');
    this.loadSession();
  }

  private loadSession() {
    try {
      if (fs.existsSync(this.sessionFile)) {
        const sessionString = fs.readFileSync(this.sessionFile, 'utf8');
        this.stringSession = new StringSession(sessionString);
      }
    } catch (error) {
      console.error('Ошибка при загрузке сессии:', error);
    }
  }

  private saveSession() {
    try {
      fs.writeFileSync(this.sessionFile, this.stringSession.save());
    } catch (error) {
      console.error('Ошибка при сохранении сессии:', error);
    }
  }

  public static getInstance(): TelegramService {
    if (!TelegramService.instance) {
      TelegramService.instance = new TelegramService();
    }
    return TelegramService.instance;
  }

  public setVerificationCode(code: string): void {
    if (this.codeResolve) {
      this.codeResolve(code);
      this.codeResolve = null;
      this.codePromise = null;
    }
  }

  private waitForVerificationCode(): Promise<string> {
      console.log('=== Вызов phoneCode ===')
			console.log('Ожидаем код подтверждения...')
    if (!this.codePromise) {
      this.codePromise = new Promise((resolve) => {
        this.codeResolve = resolve;
      });
    }
    return this.codePromise;
  }

  public async initialize(): Promise<void> {
    if (!this.client) {
      this.client = new TelegramClient(
        this.stringSession,
        Number(process.env.TELEGRAM_API_ID),
        process.env.TELEGRAM_API_HASH!,
        { connectionRetries: 5 }
      );

      await this.client.start({
        phoneNumber: this.phone,
        phoneCode: async () => {
          console.log('\n=== ОЖИДАНИЕ КОДА ПОДТВЕРЖДЕНИЯ TELEGRAM ===');
          console.log('Пожалуйста, отправьте код подтверждения на номер WhatsApp админа');
          console.log(`Номер WhatsApp админа: ${this.phone}`);
          const code = await this.waitForVerificationCode();
          console.log('Получен код подтверждения');
          console.log('========================\n');
          return code;
        },
        onError: (err) => console.error('Ошибка Telegram:', err),
      });

      this.saveSession();
    }
  }

  public setPhoneCode(code: string): void {
    this.phoneCode = code;
  }

  public async createGroupsForCompanies(companies: any[]): Promise<void> {
    if (!this.client) {
      throw new Error('Telegram клиент не инициализирован');
    }

    for (const comp of companies) {
      try {
        if (!comp.telegramGroupId) {
          console.log(`Создание группы для компании ${comp.nameCompany}...`);

          // Сначала получаем информацию о себе
          const me = await this.client.getMe();
          if (!me) {
            throw new Error('Не удалось получить информацию о текущем пользователе');
          }

          // Создаем группу с собой в качестве участника
          const result = await this.client.invoke(new Api.messages.CreateChat({
            users: [me.id],
            title: comp.nameCompany
          }));

          console.log('Полный ответ от API Telegram:', JSON.stringify(result, null, 2));

          if (!('updates' in result)) {
            throw new Error('Ответ не содержит поле updates');
          }

          const updates = (result.updates as any).updates;

          const chatUpdate = updates.find((update: any) =>
            update.className === 'UpdateChatParticipants' &&
            update.participants &&
            'chatId' in update.participants
          );

          if (!chatUpdate) {
            throw new Error('Не найдено обновление с информацией о чате');
          }

          comp.telegramGroupId = chatUpdate.participants.chatId.toString();
          console.log(`[${new Date().toISOString()}] 🔍 Получен ID группы: ${comp.telegramGroupId}`);

          try {
            const botUsername = process.env.TELEGRAM_BOT_USERNAME;
            if (!botUsername) {
              throw new Error('Username бота не найден в .env');
            }

            console.log(`[${new Date().toISOString()}] 🔍 Добавление бота ${botUsername} в группу...`);

            const botInfo = await this.client.invoke(new Api.contacts.ResolveUsername({
              username: botUsername.replace('@', '')
            }));

            if (!botInfo || !('users' in botInfo) || botInfo.users.length === 0) {
              throw new Error('Не удалось получить информацию о боте');
            }

            const botUser = botInfo.users[0];
            console.log(`[${new Date().toISOString()}] 🔍 ID бота: ${botUser.id}`);

            // Добавляем бота в группу
            await this.client.invoke(new Api.messages.AddChatUser({
              chatId: bigInt(comp.telegramGroupId),
              userId: botUser.id,
              fwdLimit: 0
            }));

            console.log(`[${new Date().toISOString()}] ✅ Бот успешно добавлен в группу`);

            // Назначаем бота администратором
            await this.client.invoke(new Api.messages.EditChatAdmin({
              chatId: bigInt(comp.telegramGroupId),
              userId: botUser.id,
              isAdmin: true
            }));

            console.log(`[${new Date().toISOString()}] ✅ Бот успешно назначен администратором в группу ${comp.nameCompany}`);

            // Отправляем приветственное сообщение
            try {
              const botToken = process.env.TELEGRAM_BOT_TOKEN;
              if (!botToken) {
                throw new Error('Токен бота не найден');
              }

              console.log(`[${new Date().toISOString()}] 📤 Отправка приветственного сообщения...`);
              
              // Формируем ID группы для API бота
              const botGroupId = `-${comp.telegramGroupId}`;
              console.log(`[${new Date().toISOString()}] 🔍 ID группы для API бота: ${botGroupId}`);
              
              const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  chat_id: botGroupId,
                  text: "Здравствуйте, это бот Sales-Track"
                })
              });

              const result = await response.json();
              console.log(`[${new Date().toISOString()}] 📝 Ответ от Telegram API:`, JSON.stringify(result, null, 2));

              if (!result.ok) {
                console.warn(`[${new Date().toISOString()}] ⚠️ Не удалось отправить приветственное сообщение: ${result.description}`);
              } else {
                console.log(`[${new Date().toISOString()}] ✅ Приветственное сообщение успешно отправлено`);
              }
            } catch (error) {
              console.warn(`[${new Date().toISOString()}] ⚠️ Ошибка при отправке приветственного сообщения:`, error);
            }

            const inviteLink = await this.client.invoke(new Api.messages.ExportChatInvite({
              peer: new Api.InputPeerChat({ chatId: bigInt(comp.telegramGroupId) })
            }));

            if (!inviteLink || !('link' in inviteLink)) {
              throw new Error('Не удалось получить ссылку-приглашение');
            }

            comp.telegramInviteLink = inviteLink.link;

            console.log(comp._id)
            await CompanySettings.updateOne(
              { '_id': comp._id },
              {
                $set: {
                  'telegramGroupId': comp.telegramGroupId,
                  'telegramInviteLink': comp.telegramInviteLink
                }
              }
            );

            console.log(`Создана группа и получена ссылка-приглашение для компании ${comp.nameCompany}`);
          } catch (botError) {
            console.error(`Ошибка при добавлении бота в группу ${comp.nameCompany}:`, botError);
          }
        }
      } catch (error) {
        console.error(`Ошибка при создании группы для компании ${comp.nameCompany}:`, error);
      }
    }
  }

  public async makeBotAdmin(groupId: string): Promise<void> {
    try {
      if (!this.client) {
        throw new Error('Telegram клиент не инициализирован');
      }

      const botUsername = process.env.TELEGRAM_BOT_USERNAME;
      if (!botUsername) {
        throw new Error('Username бота не найден в .env');
      }

      // Получаем информацию о боте
      const botInfo = await this.client.invoke(new Api.contacts.ResolveUsername({
        username: botUsername.replace('@', '')
      }));

      if (!botInfo || !('users' in botInfo) || botInfo.users.length === 0) {
        throw new Error('Не удалось получить информацию о боте');
      }

      const botUser = botInfo.users[0];

      // Назначаем бота администратором в обычной группе
      await this.client.invoke(new Api.messages.EditChatAdmin({
        chatId: bigInt(groupId),
        userId: botUser.id,
        isAdmin: true
      }));

      console.log(`[${new Date().toISOString()}] ✅ Бот успешно назначен администратором группы ${groupId}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Ошибка при назначении бота администратором:`, error);
      throw error;
    }
  }

  public async sendMessage(groupId: string, message: string): Promise<void> {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        throw new Error('Токен бота не найден');
      }

      // Проверяем, что ID группы не пустой
      if (!groupId) {
        throw new Error('ID группы не может быть пустым');
      }

      console.log(`[${new Date().toISOString()}] 🔍 Отправка сообщения в группу: ${groupId}`);

      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: groupId,
          text: message,
          parse_mode: 'HTML'
        })
      });

      const result = await response.json();
      
      if (!result.ok) {
        console.error(`[${new Date().toISOString()}] ❌ Ошибка отправки в Telegram:`, result.description);
        throw new Error(`Не удалось отправить сообщение в группу: ${result.description}`);
      }

      console.log(`[${new Date().toISOString()}] ✅ Сообщение успешно отправлено в группу ${groupId}`);
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] ❌ Ошибка при отправке сообщения:`, error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
    }
  }

  public async isConnected(): Promise<boolean> {
    try {
      if (!this.client) {
        console.log('[Telegram] Клиент не инициализирован');
        return false;
      }

      const isAuthorized = await this.client.isUserAuthorized();
      console.log(`[Telegram] Пользователь авторизован: ${isAuthorized}`);
      
      if (!isAuthorized) {
        console.log('[Telegram] Пользователь не авторизован, требуется код подтверждения');
        return false;
      }

      // Проверяем, что мы можем получить информацию о пользователе
      await this.client.getMe();
      console.log('[Telegram] Успешно получена информация о пользователе');
      return true;
    } catch (error) {
      console.error('[Telegram] Ошибка при проверке подключения:', error);
      return false;
    }
  }
}