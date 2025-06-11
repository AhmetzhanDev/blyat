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
        // Create a new session
        this.stringSession = new StringSession('');
        console.log('[TelegramService] Создан новый экземпляр сервиса');
    }

    public static getInstance(): TelegramService {
        if (!TelegramService.instance) {
            console.log('[TelegramService] Создание нового экземпляра сервиса');
            TelegramService.instance = new TelegramService();
        }
        return TelegramService.instance;
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.log('[TelegramService] Сервис уже инициализирован');
            return;
        }

        console.log('[TelegramService] Начало инициализации...');
        
        try {
            const apiId = parseInt(process.env.TELEGRAM_API_ID || '');
            const apiHash = process.env.TELEGRAM_API_HASH;
            const botToken = process.env.TELEGRAM_BOT_TOKEN;

            console.log('[TelegramService] Проверка конфигурации:', {
                hasApiId: !!apiId,
                hasApiHash: !!apiHash,
                hasBotToken: !!botToken,
                apiId,
                apiHashLength: apiHash?.length,
                botTokenLength: botToken?.length
            });

            if (!apiId || !apiHash || !botToken) {
                console.error('[TelegramService] Отсутствуют необходимые переменные окружения');
                throw new Error('TELEGRAM_API_ID, TELEGRAM_API_HASH или TELEGRAM_BOT_TOKEN не найдены в .env');
            }

            // Create the client
            console.log('[TelegramService] Создание клиента Telegram...');
            this.client = new TelegramClient(this.stringSession, apiId, apiHash, {
                connectionRetries: 5,
                useWSS: true
            });

            // Start the client
            console.log('[TelegramService] Запуск клиента...');
            try {
                await this.client.start({
                    botAuthToken: botToken,
                });
                console.log('[TelegramService] Клиент успешно запущен');
            } catch (startError) {
                console.error('[TelegramService] Ошибка при запуске клиента:', startError);
                throw startError;
            }

            try {
                const me = await this.client.getMe();
                console.log('[TelegramService] Клиент успешно подключен:', {
                    botId: me.id,
                    botUsername: me.username,
                    botFirstName: me.firstName
                });
            } catch (getMeError) {
                console.error('[TelegramService] Ошибка при получении информации о боте:', getMeError);
                throw getMeError;
            }

            // Настраиваем обработчики
            console.log('[TelegramService] Настройка обработчиков событий...');
            this.setupHandlers();
            
            this.isInitialized = true;
            console.log('[TelegramService] Инициализация успешно завершена');
        } catch (error) {
            console.error('[TelegramService] Ошибка при инициализации:', error);
            if (this.client) {
                try {
                    await this.client.disconnect();
                    console.log('[TelegramService] Клиент отключен после ошибки');
                } catch (disconnectError) {
                    console.error('[TelegramService] Ошибка при отключении клиента:', disconnectError);
                }
            }
            throw error;
        }
    }

    private setupHandlers(): void {
        if (!this.client) {
            console.error('[TelegramService] Не удалось настроить обработчики: клиент не инициализирован');
            return;
        }

        console.log('[TelegramService] Регистрация обработчика новых сообщений');

        // Обработчик новых сообщений
        this.client.addEventHandler(async (event) => {
            const message = event.message;
            if (!message) {
                console.log('[TelegramService] Получено сообщение без содержимого');
                return;
            }
            
            console.log('[TelegramService] === Новое сообщение ===');
            console.log('[TelegramService] Детали сообщения:', {
                messageId: message.id,
                date: message.date,
                chatId: message.chatId,
                senderId: message.senderId,
                text: message.text
            });

            const chatId = message.chatId.toString();
            const text = message.text || '';
            
            console.log('[TelegramService] Обработка сообщения:', { 
                chatId, 
                text,
                chatType: message.chat?.className,
                from: message.sender?.username
            });

            // Ищем 6-значный код в сообщении
            const codeMatch = text.match(/\b(\d{6})\b/);
            if (codeMatch) {
                const code = Number(codeMatch[1]);
                console.log('[TelegramService] Найден код верификации:', code);

                try {
                    // Ищем магазин по коду
                    console.log('[TelegramService] Поиск магазина по коду...');
                    const store = await CompanySettings.findOne({ verificationCode: code });
                    console.log('[TelegramService] Результат поиска магазина:', {
                        found: !!store,
                        storeId: store?._id,
                        storeName: store?.nameCompany
                    });
                    
                    if (!store) {
                        console.log('[TelegramService] Магазин не найден, отправка сообщения об ошибке');
                        await this.sendMessage(chatId, 'Магазин с таким кодом не найден.');
                        return;
                    }

                    // Получаем invite link для группы
                    console.log('[TelegramService] Получение информации о чате...');
                    const chat = await this.client!.getEntity(chatId);
                    console.log('[TelegramService] Информация о чате:', {
                        chatId: chat.id,
                        chatType: chat.className,
                        chatTitle: 'title' in chat ? chat.title : 'Unknown'
                    });

                    console.log('[TelegramService] Запрос invite link...');
                    const result = await this.client!.invoke(new Api.messages.ExportChatInvite({
                        peer: chatId,
                        title: store.nameCompany || 'Store Group',
                        expireDate: 0,
                        usageLimit: 0
                    }));

                    if (result instanceof Api.ChatInviteExported) {
                        console.log('[TelegramService] Получен invite link:', result.link);

                        // Обновляем данные в базе
                        console.log('[TelegramService] Обновление данных магазина в базе...');
                        store.telegramGroupId = chatId;
                        store.telegramInviteLink = result.link;
                        store.verificationCode = undefined; // сбрасываем код после использования
                        await store.save();
                        console.log('[TelegramService] Данные магазина успешно обновлены');

                        await this.sendMessage(chatId, `Группа успешно привязана к магазину: ${store.nameCompany || store._id}`);
                    } else {
                        console.error('[TelegramService] Не удалось получить invite link:', result);
                        throw new Error('Не удалось получить invite link');
                    }
                } catch (error) {
                    console.error('[TelegramService] Ошибка при обработке кода:', error);
                    await this.sendMessage(chatId, 'Произошла ошибка при обработке кода. Попробуйте позже.');
                }
            } else {
                console.log('[TelegramService] Код верификации не найден в сообщении');
            }
        });

        // Добавляем обработчик ошибок
        this.client.addEventHandler((error) => {
            console.error('[TelegramService] Ошибка в обработчике событий:', error);
        });

        console.log('[TelegramService] Обработчики событий успешно настроены');
    }

    public async sendMessage(chatId: string, message: string): Promise<void> {
        if (!this.client) {
            console.error('[TelegramService] Попытка отправить сообщение без инициализированного клиента');
            throw new Error('Клиент не инициализирован');
        }
        try {
            console.log('[TelegramService] Отправка сообщения:', { chatId, message });
            const result = await this.client.sendMessage(chatId, { message });
            console.log('[TelegramService] Сообщение успешно отправлено:', {
                messageId: result.id,
                chatId: result.chatId,
                date: result.date
            });
        } catch (error) {
            console.error('[TelegramService] Ошибка отправки сообщения:', error);
            throw error;
        }
    }

    public async disconnect(): Promise<void> {
        if (this.client) {
            console.log('[TelegramService] Отключение клиента...');
            await this.client.disconnect();
            this.isInitialized = false;
            console.log('[TelegramService] Клиент успешно отключен');
        } else {
            console.log('[TelegramService] Нет активного клиента для отключения');
        }
    }

    public async isConnected(): Promise<boolean> {
        if (!this.client) {
            console.log('[TelegramService] Клиент не инициализирован');
            return false;
        }

        try {
            const isConnected = await this.client.isUserAuthorized();
            console.log('[TelegramService] Статус подключения:', isConnected);
            return isConnected;
        } catch (error) {
            console.error('[TelegramService] Ошибка проверки подключения:', error);
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

            console.log('[TelegramService] Получение информации о боте...');
            const botInfo = await this.client.invoke(
                new Api.contacts.ResolveUsername({
                    username: botUsername.replace('@', ''),
                })
            );

            if (!botInfo || !('users' in botInfo) || botInfo.users.length === 0) {
                throw new Error('Не удалось получить информацию о боте');
            }

            const botUser = botInfo.users[0];
            console.log('[TelegramService] Назначение бота администратором группы...');

            await this.client.invoke(
                new Api.messages.EditChatAdmin({
                    chatId: bigInt(groupId),
                    userId: botUser.id,
                    isAdmin: true,
                })
            );

            console.log('[TelegramService] Бот успешно назначен администратором группы');
        } catch (error) {
            console.error('[TelegramService] Ошибка при назначении бота администратором:', error);
            throw error;
        }
    }

    public async createGroupsForCompanies(companies: Array<{ id: string; nameCompany: string }>): Promise<void> {
        if (!this.client) {
            throw new Error('Telegram клиент не инициализирован');
        }

        console.log('[TelegramService] Начало создания групп для компаний:', companies);

        for (const company of companies) {
            try {
                console.log(`[TelegramService] Создание группы для компании: ${company.nameCompany}`);
                
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

                console.log(`[TelegramService] Группа успешно создана для компании ${company.nameCompany}:`, {
                    chatId,
                    inviteLink: inviteResult.link
                });
            } catch (error) {
                console.error(`[TelegramService] Ошибка при создании группы для компании ${company.nameCompany}:`, error);
                throw error;
            }
        }
    }
} 