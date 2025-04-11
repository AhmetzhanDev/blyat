import { Request, Response } from 'express';
import { TelegramService } from '../telegram/telegramClient';

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
      await this.telegramService.createGroupsForCompanies(companies);
      res.status(200).json({ message: 'Группы успешно созданы' });
    } catch (error) {
      console.error('Ошибка при создании групп:', error);
      res.status(500).json({ error: 'Ошибка при создании групп' });
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
} 