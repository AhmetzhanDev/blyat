import { Request, Response } from 'express';
import { TelegramService } from '../telegram/TelegramService';
import { CompanySettings, ICompanySettings } from '../models/CompanySettings';

export class TelegramController {
  private telegramService: TelegramService;

  constructor() {
    this.telegramService = TelegramService.getInstance();
  }

  public async initializeClient(req: Request, res: Response): Promise<void> {
    try {
      await this.telegramService.initialize();
      res.status(200).json({ message: 'Telegram клиент успешно инициализирован' });
    } catch (error) {
      console.error('Ошибка при инициализации Telegram клиента:', error);
      res.status(500).json({ error: 'Ошибка при инициализации Telegram клиента' });
    }
  }

  public async createGroups(req: Request, res: Response): Promise<void> {
    try {
      const companies = req.body.companies || [];
      
      if (!companies.length) {
        res.status(400).json({ 
          success: false, 
          message: 'Необходимо указать список компаний' 
        });
        return;
      }

      await this.telegramService.createGroupsForCompanies(companies);
      res.status(200).json({ 
        success: true,
        message: 'Группы успешно созданы' 
      });
    } catch (error) {
      console.error('Ошибка при создании групп:', error);
      res.status(500).json({ 
        success: false,
        error: 'Ошибка при создании групп',
        message: error instanceof Error ? error.message : 'Неизвестная ошибка'
      });
    }
  }

  public async disconnectClient(req: Request, res: Response): Promise<void> {
    try {
      await this.telegramService.disconnect();
      res.status(200).json({ message: 'Telegram клиент успешно отключен' });
    } catch (error) {
      console.error('Ошибка при отключении Telegram клиента:', error);
      res.status(500).json({ error: 'Ошибка при отключении Telegram клиента' });
    }
  }

  public async makeBotAdmin(req: Request, res: Response): Promise<void> {
    try {
      const { groupId } = req.body;
      
      if (!groupId) {
        res.status(400).json({ 
          success: false, 
          message: 'Необходимо указать ID группы' 
        });
        return;
      }

      await this.telegramService.makeBotAdmin(groupId);
      
      res.status(200).json({ 
        success: true, 
        message: 'Бот успешно назначен администратором группы' 
      });
    } catch (error) {
      console.error('Ошибка при назначении бота администратором:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Ошибка при назначении бота администратором',
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      });
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