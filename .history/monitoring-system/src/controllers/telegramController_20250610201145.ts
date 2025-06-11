import { Request, Response } from 'express';
import { TelegramService } from '../telegram/TelegramService';
import { CompanySettings, ICompanySettings } from '../models/CompanySettings';

export class TelegramController {
  private static instance: TelegramController;
  private telegramService: TelegramService;

  private constructor() {
    this.telegramService = TelegramService.getInstance();
  }

  public static getInstance(): TelegramController {
    if (!TelegramController.instance) {
      TelegramController.instance = new TelegramController();
    }
    return TelegramController.instance;
  }

  public async initializeClient(req: Request, res: Response): Promise<void> {
    try {
      console.log(`[${new Date().toISOString()}] [TelegramController] Инициализация клиента...`);
      await this.telegramService.initialize();
      console.log(`[${new Date().toISOString()}] [TelegramController] Клиент успешно инициализирован`);
      res.status(200).json({ message: 'Telegram клиент успешно инициализирован' });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [TelegramController] Ошибка при инициализации клиента:`, error);
      res.status(500).json({ error: 'Ошибка при инициализации Telegram клиента' });
    }
  }

  public async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { chatId, message } = req.body;
      if (!chatId || !message) {
        res.status(400).json({ error: 'Необходимо указать chatId и message' });
        return;
      }

      console.log(`[${new Date().toISOString()}] [TelegramController] Отправка сообщения:`, { chatId, message });
      await this.telegramService.sendMessage(chatId, message);
      console.log(`[${new Date().toISOString()}] [TelegramController] Сообщение успешно отправлено`);
      res.status(200).json({ message: 'Сообщение успешно отправлено' });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [TelegramController] Ошибка при отправке сообщения:`, error);
      res.status(500).json({ error: 'Ошибка при отправке сообщения' });
    }
  }

  public async disconnect(req: Request, res: Response): Promise<void> {
    try {
      console.log(`[${new Date().toISOString()}] [TelegramController] Отключение клиента...`);
      await this.telegramService.disconnect();
      console.log(`[${new Date().toISOString()}] [TelegramController] Клиент успешно отключен`);
      res.status(200).json({ message: 'Telegram клиент успешно отключен' });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [TelegramController] Ошибка при отключении клиента:`, error);
      res.status(500).json({ error: 'Ошибка при отключении Telegram клиента' });
    }
  }

  public async isConnected(req: Request, res: Response): Promise<void> {
    try {
      console.log(`[${new Date().toISOString()}] [TelegramController] Проверка статуса подключения...`);
      const isConnected = await this.telegramService.isConnected();
      console.log(`[${new Date().toISOString()}] [TelegramController] Статус подключения:`, isConnected);
      res.status(200).json({ isConnected });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [TelegramController] Ошибка при проверке статуса подключения:`, error);
      res.status(500).json({ error: 'Ошибка при проверке статуса подключения' });
    }
  }

  public async makeBotAdmin(req: Request, res: Response): Promise<void> {
    try {
      const { groupId } = req.body;
      if (!groupId) {
        res.status(400).json({ error: 'Необходимо указать groupId' });
        return;
      }

      console.log(`[${new Date().toISOString()}] [TelegramController] Назначение бота администратором группы:`, groupId);
      await this.telegramService.makeBotAdmin(groupId);
      console.log(`[${new Date().toISOString()}] [TelegramController] Бот успешно назначен администратором`);
      res.status(200).json({ message: 'Бот успешно назначен администратором группы' });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [TelegramController] Ошибка при назначении бота администратором:`, error);
      res.status(500).json({ error: 'Ошибка при назначении бота администратором' });
    }
  }

  public async createGroupsForCompanies(req: Request, res: Response): Promise<void> {
    try {
      const { companies } = req.body;
      if (!companies || !Array.isArray(companies)) {
        res.status(400).json({ error: 'Необходимо указать массив компаний' });
        return;
      }

      console.log(`[${new Date().toISOString()}] [TelegramController] Создание групп для компаний:`, companies);
      await this.telegramService.createGroupsForCompanies(companies);
      console.log(`[${new Date().toISOString()}] [TelegramController] Группы успешно созданы`);
      res.status(200).json({ message: 'Группы успешно созданы' });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [TelegramController] Ошибка при создании групп:`, error);
      res.status(500).json({ error: 'Ошибка при создании групп' });
    }
  }

  public async verifyGroupCode(req: Request, res: Response): Promise<void> {
    try {
      const { code, telegramGroupId, inviteLink } = req.body;
      
      if (!code || !telegramGroupId || !inviteLink) {
        res.status(400).json({ 
          success: false, 
          message: 'Необходимо указать код подтверждения, ID группы и ссылку-приглашение' 
        });
        return;
      }

      // Find the store by verification code
      const store = await CompanySettings.findOne({ verificationCode: code }) as ICompanySettings;
      
      if (!store) {
        res.status(404).json({ 
          success: false, 
          message: 'Магазин с указанным кодом не найден' 
        });
        return;
      }

      // Update store's Telegram group information
      store.telegramGroupId = String(telegramGroupId);
      store.telegramInviteLink = inviteLink;
      store.verificationCode = undefined; // Clear the verification code after successful verification
      await store.save();

      // Make the bot an admin of the group
      await this.telegramService.makeBotAdmin(telegramGroupId);

      res.status(200).json({ 
        success: true, 
        message: 'Группа успешно привязана к магазину',
        store: {
          id: store.id,
          nameCompany: store.nameCompany,
          telegramGroupId: store.telegramGroupId,
          telegramInviteLink: store.telegramInviteLink
        }
      });
    } catch (error) {
      console.error('Ошибка при верификации группы:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Ошибка при верификации группы',
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      });
    }
  }

  public async generateVerificationCode(req: Request, res: Response): Promise<void> {
    try {
      const { storeId } = req.body;
      
      if (!storeId) {
        res.status(400).json({ 
          success: false, 
          message: 'Необходимо указать ID магазина' 
        });
        return;
      }

      // Find the store
      const store = await CompanySettings.findById(storeId) as ICompanySettings;
      
      if (!store) {
        res.status(404).json({ 
          success: false, 
          message: 'Магазин не найден' 
        });
        return;
      }

      // Generate verification code
      const code = store.generateVerificationCode();
      await store.save();

      res.status(200).json({ 
        success: true, 
        message: 'Код подтверждения успешно сгенерирован',
        code,
        store: {
          id: store.id,
          nameCompany: store.nameCompany
        }
      });
    } catch (error) {
      console.error('Ошибка при генерации кода подтверждения:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Ошибка при генерации кода подтверждения',
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      });
    }
  }
} 