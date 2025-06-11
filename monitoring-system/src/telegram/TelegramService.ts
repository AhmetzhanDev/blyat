import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage } from 'telegram/events';
import { Api } from 'telegram/tl';
import { CompanySettings } from '../models/CompanySettings';
import bigInt from 'big-integer';

export class TelegramService {
    private static instance: TelegramService;
    private client: TelegramClient | null = null;
    private isInitialized = false;
    private stringSession: StringSession;

    private constructor() {
        this.stringSession = new StringSession('');
        console.log(`[${new Date().toISOString()}] [TelegramService] Создан новый экземпляр сервиса`);
    }

    public static getInstance(): TelegramService {
        if (!TelegramService.instance) {
            console.log(`[${new Date().toISOString()}] [TelegramService] Создание нового экземпляра сервиса`);
            TelegramService.instance = new TelegramService();
        }
        return TelegramService.instance;
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.log(`[${new Date().toISOString()}] [TelegramService] Сервис уже инициализирован`);
            return;
        }

        console.log(`[${new Date().toISOString()}] [TelegramService] Начало инициализации...`);
        
        try {
            const apiId = parseInt(process.env.TELEGRAM_API_ID || '');
            const apiHash = process.env.TELEGRAM_API_HASH;
            const botToken = process.env.TELEGRAM_BOT_TOKEN;

            console.log(`[${new Date().toISOString()}] [TelegramService] Проверка конфигурации:`, {
                hasApiId: !!apiId,
                hasApiHash: !!apiHash,
                hasBotToken: !!botToken,
                apiId,
                apiHashLength: apiHash?.length,
                botTokenLength: botToken?.length
            });

            if (!apiId || !apiHash || !botToken) {
                console.error(`[${new Date().toISOString()}] [TelegramService] Отсутствуют необходимые переменные окружения`);
                throw new Error('TELEGRAM_API_ID, TELEGRAM_API_HASH или TELEGRAM_BOT_TOKEN не найдены в .env');
            }

            // Create the client
            console.log(`[${new Date().toISOString()}] [TelegramService] Создание клиента Telegram...`);
            this.client = new TelegramClient(this.stringSession, apiId, apiHash, {
                connectionRetries: 5,
                useWSS: true
            });

            // Start the client
            console.log(`[${new Date().toISOString()}] [TelegramService] Запуск клиента...`);
            try {
                await this.client.start({
                    botAuthToken: botToken,
                });
                console.log(`[${new Date().toISOString()}] [TelegramService] Клиент успешно запущен`);
            } catch (startError) {
                console.error(`[${new Date().toISOString()}] [TelegramService] Ошибка при запуске клиента:`, startError);
                throw startError;
            }

            try {
                const me = await this.client.getMe();
                console.log(`[${new Date().toISOString()}] [TelegramService] Клиент успешно подключен:`, {
                    botId: me.id,
                    botUsername: me.username,
                    botFirstName: me.firstName
                });
            } catch (getMeError) {
                console.error(`[${new Date().toISOString()}] [TelegramService] Ошибка при получении информации о боте:`, getMeError);
                throw getMeError;
            }

            // Настраиваем обработчики
            console.log(`[${new Date().toISOString()}] [TelegramService] Настройка обработчиков событий...`);
            this.setupHandlers();
            
            this.isInitialized = true;
            console.log(`[${new Date().toISOString()}] [TelegramService] Инициализация успешно завершена`);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] [TelegramService] Ошибка при инициализации:`, error);
            if (this.client) {
                try {
                    await this.client.disconnect();
                    console.log(`[${new Date().toISOString()}] [TelegramService] Клиент отключен после ошибки`);
                } catch (disconnectError) {
                    console.error(`[${new Date().toISOString()}] [TelegramService] Ошибка при отключении клиента:`, disconnectError);
                }
            }
            throw error;
        }
    }

    private setupHandlers(): void {
        if (!this.client) {
            console.error(`[${new Date().toISOString()}] [TelegramService] Не удалось настроить обработчики: клиент не инициализирован`);
            return;
        }

        console.log(`[${new Date().toISOString()}] [TelegramService] Регистрация обработчика новых сообщений`);

        // Обработчик новых сообщений
        this.client.addEventHandler(async (event) => {
            const message = event.message;
            if (!message) {
                console.log(`[${new Date().toISOString()}] [TelegramService] Получено сообщение без содержимого`);
                return;
            }
            
            console.log(`[${new Date().toISOString()}] [TelegramService] === Новое сообщение ===`);
            console.log(`[${new Date().toISOString()}] [TelegramService] Детали сообщения:`, {
                messageId: message.id,
                date: message.date,
                chatId: message.chatId,
                senderId: message.senderId,
                text: message.text
            });

            const chatId = message.chatId.toString();
            const text = message.text || message.message || '';
            
            console.log(`[${new Date().toISOString()}] [TelegramService] Обработка сообщения:`, { 
                chatId, 
                text,
                chatType: message.chat?.className,
                from: message.sender?.username
            });

            // Ищем 6-значный код в сообщении
            const codeMatch = text.match(/\b(\d{6})\b/);
            if (codeMatch) {
                const code = Number(codeMatch[1]);
                console.log(`[${new Date().toISOString()}] [TelegramService] Найден код верификации:`, code);

                try {
                    // Ищем магазин по коду
                    console.log(`[${new Date().toISOString()}] [TelegramService] Поиск магазина по коду...`);
                    const store = await CompanySettings.findOne({ verificationCode: code });
                    console.log(`[${new Date().toISOString()}] [TelegramService] Результат поиска магазина:`, {
                        found: !!store,
                        storeId: store?._id,
                        storeName: store?.nameCompany
                    });
                    
                    if (!store) {
                        console.log(`[${new Date().toISOString()}] [TelegramService] Магазин не найден, отправка сообщения об ошибке`);
                        await this.sendMessage(chatId, 'Магазин с таким кодом не найден.');
                        return;
                    }

                    // Получаем invite link для группы
                    console.log(`[${new Date().toISOString()}] [TelegramService] Получение информации о чате...`);
                    const chat = await this.client!.getEntity(chatId);
                    console.log(`[${new Date().toISOString()}] [TelegramService] Информация о чате:`, {
                        chatId: chat.id,
                        chatType: chat.className,
                        chatTitle: 'title' in chat ? chat.title : 'Unknown'
                    });

                    console.log(`[${new Date().toISOString()}] [TelegramService] Запрос invite link...`);
                    const result = await this.client!.invoke(new Api.messages.ExportChatInvite({
                        peer: chatId,
                        title: store.nameCompany || 'Store Group',
                        expireDate: 0,
                        usageLimit: 0
                    }));

                    if (result instanceof Api.ChatInviteExported) {
                        console.log(`[${new Date().toISOString()}] [TelegramService] Получен invite link:`, result.link);

                        // Обновляем данные в базе
                        console.log(`[${new Date().toISOString()}] [TelegramService] Обновление данных магазина в базе...`);
                        store.telegramGroupId = chatId;
                        store.telegramInviteLink = result.link;
                        store.verificationCode = undefined; // сбрасываем код после использования
                        await store.save();
                        console.log(`[${new Date().toISOString()}] [TelegramService] Данные магазина успешно обновлены`);

                        await this.sendMessage(chatId, `Группа успешно привязана к магазину: ${store.nameCompany || store._id}`);
                    } else {
                        console.error(`[${new Date().toISOString()}] [TelegramService] Не удалось получить invite link:`, result);
                        throw new Error('Не удалось получить invite link');
                    }
                } catch (error) {
                    console.error(`[${new Date().toISOString()}] [TelegramService] Ошибка при обработке кода:`, error);
                    await this.sendMessage(chatId, 'Произошла ошибка при обработке кода. Попробуйте позже.');
                }
            } else {
                console.log(`[${new Date().toISOString()}] [TelegramService] Код верификации не найден в сообщении`);
            }
        });

        // Добавляем обработчик ошибок
        this.client.addEventHandler((error) => {
            console.error(`[${new Date().toISOString()}] [TelegramService] Ошибка в обработчике событий:`, error);
        });

        console.log(`[${new Date().toISOString()}] [TelegramService] Обработчики событий успешно настроены`);
    }

    public async sendMessage(chatId: string, message: string): Promise<void> {
        if (!this.client) {
            console.error(`[${new Date().toISOString()}] [TelegramService] Попытка отправить сообщение без инициализированного клиента`);
            throw new Error('Клиент не инициализирован');
        }
        try {
            console.log(`[${new Date().toISOString()}] [TelegramService] Отправка сообщения:`, { chatId, message });
            const result = await this.client.sendMessage(chatId, { message });
            console.log(`[${new Date().toISOString()}] [TelegramService] Сообщение успешно отправлено:`, {
                messageId: result.id,
                chatId: result.chatId,
                date: result.date
            });
        } catch (error) {
            console.error(`[${new Date().toISOString()}] [TelegramService] Ошибка отправки сообщения:`, error);
            throw error;
        }
    }

    public async disconnect(): Promise<void> {
        if (this.client) {
            console.log(`[${new Date().toISOString()}] [TelegramService] Отключение клиента...`);
            await this.client.disconnect();
            this.isInitialized = false;
            console.log(`[${new Date().toISOString()}] [TelegramService] Клиент успешно отключен`);
        } else {
            console.log(`[${new Date().toISOString()}] [TelegramService] Нет активного клиента для отключения`);
        }
    }

    public async isConnected(): Promise<boolean> {
        if (!this.client) {
            console.log(`[${new Date().toISOString()}] [TelegramService] Клиент не инициализирован`);
            return false;
        }

        try {
            const isConnected = await this.client.isUserAuthorized();
            console.log(`[${new Date().toISOString()}] [TelegramService] Статус подключения:`, isConnected);
            return isConnected;
        } catch (error) {
            console.error(`[${new Date().toISOString()}] [TelegramService] Ошибка проверки подключения:`, error);
            return false;
        }
    }

    public async makeBotAdmin(groupId: string): Promise<void> {
        if (!this.client) {
            throw new Error('Telegram клиент не инициализирован');
        }

        try {
            const botUsername = process.env.TELEGRAM_BOT_USERNAME;
            if (!botUsername) {
                throw new Error('Username бота не найден в .env');
            }

            console.log(`[${new Date().toISOString()}] [TelegramService] Получение информации о боте...`);
            const botInfo = await this.client.invoke(
                new Api.contacts.ResolveUsername({
                    username: botUsername.replace('@', ''),
                })
            );

            if (!botInfo || !('users' in botInfo) || botInfo.users.length === 0) {
                throw new Error('Не удалось получить информацию о боте');
            }

            const botUser = botInfo.users[0];
            console.log(`[${new Date().toISOString()}] [TelegramService] Назначение бота администратором группы...`);

            await this.client.invoke(
                new Api.messages.EditChatAdmin({
                    chatId: bigInt(groupId),
                    userId: botUser.id,
                    isAdmin: true,
                })
            );

            console.log(`[${new Date().toISOString()}] [TelegramService] Бот успешно назначен администратором группы`);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] [TelegramService] Ошибка при назначении бота администратором:`, error);
            throw error;
        }
    }

    public async createGroupsForCompanies(companies: Array<{ id: string; nameCompany: string }>): Promise<void> {
        if (!this.client) {
            throw new Error('Telegram клиент не инициализирован');
        }

        console.log(`[${new Date().toISOString()}] [TelegramService] Начало создания групп для компаний:`, companies);

        for (const company of companies) {
            try {
                console.log(`[${new Date().toISOString()}] [TelegramService] Создание группы для компании: ${company.nameCompany}`);
                
                // Создаем группу
                const result = await this.client.invoke(
                    new Api.channels.CreateChannel({
                        title: company.nameCompany,
                        about: `Группа для компании ${company.nameCompany}`,
                        megagroup: true,
                    })
                );

                if (!result || !('chats' in result) || result.chats.length === 0) {
                    throw new Error('Не удалось создать группу');
                }

                const chat = result.chats[0];
                const chatId = chat.id.toString();

                // Получаем invite link
                const inviteResult = await this.client.invoke(
                    new Api.messages.ExportChatInvite({
                        peer: chatId,
                        title: company.nameCompany,
                        expireDate: 0,
                        usageLimit: 0
                    })
                );

                if (!(inviteResult instanceof Api.ChatInviteExported)) {
                    throw new Error('Не удалось получить invite link');
                }

                // Обновляем данные в базе
                await CompanySettings.findByIdAndUpdate(company.id, {
                    telegramGroupId: chatId,
                    telegramInviteLink: inviteResult.link,
                    verificationCode: undefined
                });

                // Делаем бота администратором
                await this.makeBotAdmin(chatId);

                console.log(`[${new Date().toISOString()}] [TelegramService] Группа успешно создана для компании ${company.nameCompany}:`, {
                    chatId,
                    inviteLink: inviteResult.link
                });
            } catch (error) {
                console.error(`[${new Date().toISOString()}] [TelegramService] Ошибка при создании группы для компании ${company.nameCompany}:`, error);
                throw error;
            }
        }
    }

    public async verifyGroupCode(code: string, telegramGroupId: string, inviteLink: string): Promise<void> {
        if (!this.client) {
            throw new Error('Telegram клиент не инициализирован');
        }

        try {
            console.log(`[${new Date().toISOString()}] [TelegramService] Верификация группы:`, { code, telegramGroupId, inviteLink });
            
            // Ищем магазин по коду
            const store = await CompanySettings.findOne({ verificationCode: code });
            if (!store) {
                throw new Error('Магазин с таким кодом не найден');
            }

            // Обновляем данные в базе
            store.telegramGroupId = telegramGroupId;
            store.telegramInviteLink = inviteLink;
            store.verificationCode = undefined; // сбрасываем код после использования
            await store.save();

            // Назначаем бота администратором
            await this.makeBotAdmin(telegramGroupId);

            console.log(`[${new Date().toISOString()}] [TelegramService] Группа успешно верифицирована для магазина:`, {
                storeId: store._id,
                storeName: store.nameCompany,
                telegramGroupId,
                inviteLink
            });
        } catch (error) {
            console.error(`[${new Date().toISOString()}] [TelegramService] Ошибка при верификации группы:`, error);
            throw error;
        }
    }

    public async generateInviteLink(chatId: string, title: string): Promise<string> {
        if (!this.client) {
            throw new Error('Telegram клиент не инициализирован');
        }

        try {
            console.log(`[${new Date().toISOString()}] [TelegramService] Генерация invite link для группы:`, { chatId, title });
            
            const result = await this.client.invoke(new Api.messages.ExportChatInvite({
                peer: chatId,
                title: title,
                expireDate: 0,
                usageLimit: 0
            }));

            if (!(result instanceof Api.ChatInviteExported)) {
                throw new Error('Не удалось получить invite link');
            }

            console.log(`[${new Date().toISOString()}] [TelegramService] Invite link успешно сгенерирован:`, result.link);
            return result.link;
        } catch (error) {
            console.error(`[${new Date().toISOString()}] [TelegramService] Ошибка при генерации invite link:`, error);
            throw error;
        }
    }
} 