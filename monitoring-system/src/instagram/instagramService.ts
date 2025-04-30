import axios from "axios"
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';
import dotenv from "dotenv"
import { TelegramService } from "../telegram/telegramClient";
import { MessageMonitor } from "../whatsapp/messageMonitor";
import { CompanySettings } from "../models/CompanySettings";
import { InstagramChat } from "../models/InstagramChat";
import { InstagramMessage } from "../models/InstagramMessage";

dotenv.config()




export class InstagramService {
    private static instance: MessageMonitor;
    private activeTimers: Map<string, NodeJS.Timeout>;
    private telegramService: TelegramService;
    
    private readonly appId = process.env.IG_APP_ID;
    private readonly appSecret = process.env.IG_APP_SECRET;
    private readonly redirectUri = process.env.IG_REDIRECT_URI;
    //private readonly apiUrl = 'https://graph.facebook.com/v18.0';
    private readonly apiUrl = 'https://graph.instagram.com/v22.0';
    // private readonly apiUrl = 'https://graph.instagram.com';
    private readonly apiUrl_TokenLive = 'https://api.instagram.com/oauth/access_token';

    constructor() {
        // private readonly http: HttpService,
        // private readonly userService: UserService
        this.activeTimers = new Map();
        this.telegramService = TelegramService.getInstance();
    }

    async exchangeCodeForToken(code: string) {
        // Меняем code на access_token
        try {

            const { access_token, user_id } = await this.sendFormData(code);

            // Получаем ID пользователя и список страниц
            console.log("Trying get bussines account", access_token);
            const userUrl = `${this.apiUrl}/me?access_token=${access_token}`;
            // const userUrl = `${this.apiUrl}/me?fields=id,username,media_count&access_token=${access_token}`;
            console.log(userUrl)
            const userResponse = await axios.get(userUrl);
            console.log(userResponse?.data)
            if (!userResponse || !userResponse.data) {
                throw new Error('No connected Instagram business accounts');
            }

            const page = userResponse.data;
            const pageAccessToken = page.access_token;
            const pageId = page.id;

            // Получаем Instagram Business ID
            console.log(user_id, access_token)
            const igUrl = `${this.apiUrl}/${user_id}?fields=instagram_business_account&access_token=${access_token}`;
            const igResponse = await axios.get(igUrl);
            if (!igResponse || !igResponse.data || !igResponse.data.instagram_business_account) {
                throw new Error('Failed to retrieve Instagram Business Account ID');
            }

            const instagramAccountId = igResponse.data.instagram_business_account.id;

            // Сохраняем данные в MongoDB
            // await this.userService.saveUser(user_id, instagramAccountId, access_token);
            // TODO: Сохранение токенов в компании

            return { message: 'User authenticated and saved successfully' };
        } catch (error: any) {
            console.log(error.response.data)
            console.error('Instagram authentication error:', error.message);
            throw new Error(`Authentication failed: ${error.message}`);
        }

    }

    async sendFormData(code: string) {
        // Create FormData instance and append the necessary fields
        const form = new FormData();
        form.append('client_id', process.env.IG_APP_ID || "");
        form.append('client_secret', process.env.IG_APP_SECRET || "");
        form.append('grant_type', 'authorization_code');
        form.append('redirect_uri', process.env.IG_REDIRECT_URI || "");
        form.append('code', code);

        // Send POST request with form-data
        try {
            const response = await axios.post(this.apiUrl_TokenLive, form, {
                    headers: form.getHeaders(), // Include correct headers for FormData
                })

            // The response is JSON and will be automatically parsed
            console.log(response.data); // Log or return the JSON response
            return response.data;
        } catch (error: any) {
            console.log(process.env.IG_REDIRECT_URI);
            console.log(process.env.IG_APP_SECRET);
            console.log(process.env.IG_APP_ID);
            console.log(code);


            console.error('Error during Instagram OAuth exchange:', error.response?.data || error.message);
            throw new Error('Failed to exchange code for token');
        }
    }

    async handleMessage(body: any) {
        console.log("Got Webhook");
        if (body.entry) {
            body.entry.forEach((entry: any) => {
                entry.messaging?.forEach(async (event: any) => {
                    console.log(`New message from ${event.sender.id}: ${event.message.text}`);

                    try {
                        const timestamp = new Date().toISOString();
                        console.log(`[${timestamp}] 📱 Получено Instagram сообщение от: ${event.sender.id}`);
                        console.log(`[${timestamp}] 📝 Текст сообщения: "${event.message.text}"`);
                        
                        // Находим компанию по номеру телефона
                        const company = await CompanySettings.findOne({ instagramUserId: event.recipient.id });
                        if (!company) {
                          console.log(`[${timestamp}] ❌ Компания не найдена для ID: ${event.recipient.id}`);
                          return; // Прерываем выполнение, если компания не найдена
                        }
                        console.log(`[${timestamp}] ✅ Найдена компания:`, company);
                    
                        // Проверка на наличие чата в базе данных
                        let chat = await InstagramChat.findOne({ chatId: event.sender.id });
                    
                        console.log(chat)
                        if (!chat) {
                          console.log(`[${timestamp}] ❌ Чат с номером ${event.sender.id} не найден, создаем новый`);

                          const url = `https://graph.instagram.com/v22.0/${event.message.is_echo ? event.recipient.id : event.sender.id}?fields=name,username&access_token=${company.accessToken}`

                          const userInfo = await axios.get(url)
                    
                          // Если чат не найден, создаем новый
                          try {
                            chat = new InstagramChat({
                              companyId: company._id,
                              chatId: event.sender.id,
                              userName: userInfo.data.username,
                              name: userInfo.data.name
                            });
                            await chat.save(); // Сохраняем новый чат
                            console.log(`[${timestamp}] 📝 Новый чат успешно сохранен для: ${event.sender.id}`);
                          } catch (error) {
                            console.error(`[${timestamp}] ❌ Ошибка при сохранении нового чата:`, error);
                            return; // Прерываем выполнение, если не удалось сохранить чат
                          }
                        } else {
                          console.log(`[${timestamp}] ✅ Чат найден:`, chat);
                        }
                    
                        // Сохраняем сообщение
                        const whatsappMessage = new InstagramMessage({
                          isEcho: event.message.is_echo || false,
                          text: event.message.text,
                          instagramChatId: chat._id,
                          isClosed: false  // Сделка еще не закрыта
                        });
                    
                        try {
                          await whatsappMessage.save(); // Сохраняем сообщение в базе
                          console.log(`[${timestamp}] ✅ Сообщение сохранено:`, whatsappMessage);
                        } catch (error) {
                          console.error(`[${timestamp}] ❌ Ошибка при сохранении сообщения:`, error);
                          return; // Прерываем выполнение, если не удалось сохранить сообщение
                        }

                        // Проверяем, является ли это исходящим сообщением
                        if (event.message.is_echo) {
                            console.log(`[${timestamp}] 👤 Получено исходящее сообщение`);

                            if (this.activeTimers.has(event.recipient.id)) {
                                console.log(`[${timestamp}] 🛑 Отключаем таймер для ${event.recipient.id}`);
                                clearTimeout(this.activeTimers.get(event.recipient.id));
                                this.activeTimers.delete(event.recipient.id);
                                console.log(`[${timestamp}] ✅ Таймер успешно отключен`);
                            }
                            return;
                        }
                    
                        // Логика с таймером остается
                        if (this.activeTimers.has(event.sender.id)) {
                          console.log(`[${timestamp}] 🔄 Перезапускаем таймер для ${event.sender.id}`);
                          clearTimeout(this.activeTimers.get(event.sender.id));
                        }
                    
                        // Отключаем таймер при отправке ответа
                        if (this.activeTimers.has(event.sender.id)) {
                          console.log(`[${timestamp}] 🛑 Отключаем таймер для ${event.sender.id}`);
                          clearTimeout(this.activeTimers.get(event.sender.id));
                          this.activeTimers.delete(event.sender.id);
                          console.log(`[${timestamp}] ✅ Таймер успешно отключен`);
                        }
                    
                        // Запускаем новый таймер
                        const timer = setTimeout(async () => {
                          const currentTimestamp = new Date().toISOString();
                          console.log(`[${currentTimestamp}] ⚠️ Время ответа истекло для ${event.recipient.id} (чат ${chat.userName})`);
                          
                          if (company.telegramGroupId) {
                            try {
                              const reminderMessage = `⚠️ ВНИМАНИЕ! ⚠️\n\nВ Instagram-чате не ответили на сообщение в течение ${company.managerResponse} минут!\n\nЧат: @${chat.userName} (${chat.name})`;
                              
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
                        }, (company?.managerResponse || 5) * 60 * 1000);
                    
                        this.activeTimers.set(event.recipient.id, timer);
                        console.log(`[${timestamp}] ⏳ Запущен таймер на ${company.managerResponse} минут для ${event.recipient.id} (чат ${chat.userName})`);
                      } catch (error) {
                        console.error(`[${new Date().toISOString()}] ❌ Ошибка при обработке сообщения:`, error);
                      }
                });
            });
        }
        return { status: 'success' };
    }

    async getUserMessages(instagramAccountId: string, accessToken: string, limit: number) {
        try {
            // Формируем запрос для получения сообщений
            const url = `${this.apiUrl}${instagramAccountId}/messages`;

            const response = await axios.get(url, {
                    params: {
                        access_token: accessToken,
                        limit: limit,  // Количество сообщений
                    },
                })

            // Возвращаем сообщения
            return response.data.data;
        } catch (error: any) {
            // Логируем ошибку и кидаем исключение
            console.error('Error fetching user messages:', error.response ? error.response.data : error.message);
            throw new Error('Failed to fetch user messages');
        }
    }
}