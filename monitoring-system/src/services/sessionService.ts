import fs from 'fs';
import path from 'path';
import { WhatsAppAccountModel } from '../models/WhatsAppAccount';

export class SessionService {
  private static instance: SessionService;
  private saveInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): SessionService {
    if (!SessionService.instance) {
      SessionService.instance = new SessionService();
    }
    return SessionService.instance;
  }

  public async saveSessionToDB(userId: string, sessionPath: string): Promise<void> {
    try {
      // Читаем содержимое директории сессии
      const sessionDir = path.join(sessionPath, '.wwebjs_auth');
      const sessionFiles = fs.readdirSync(sessionDir);
      
      // Собираем все файлы сессии
      const sessionData: { [key: string]: string } = {};
      for (const file of sessionFiles) {
        const filePath = path.join(sessionDir, file);
        if (fs.statSync(filePath).isFile()) {
          // Если это QR-код, сохраняем его в base64
          if (file === 'qr.png') {
            sessionData[file] = fs.readFileSync(filePath, 'base64');
          } else {
            sessionData[file] = fs.readFileSync(filePath, 'utf-8');
          }
        }
      }

      // Обновляем или создаем запись в MongoDB
      await WhatsAppAccountModel.findOneAndUpdate(
        { userId },
        { 
          $set: { 
            sessionData: JSON.stringify(sessionData),
            sessionPath: sessionPath
          }
        },
        { upsert: true }
      );

      console.log(`[${new Date().toISOString()}] Сессия для пользователя ${userId} успешно сохранена в MongoDB`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Ошибка при сохранении сессии в MongoDB:`, error);
      throw error;
    }
  }

  public async restoreSessionFromDB(userId: string): Promise<string | null> {
    try {
      // Ищем сессию в MongoDB
      const account = await WhatsAppAccountModel.findOne({ userId });
      
      if (!account || !account.sessionData) {
        console.log(`[${new Date().toISOString()}] Сессия для пользователя ${userId} не найдена в MongoDB`);
        return null;
      }

      // Создаем директорию для сессии
      const sessionPath = path.join(process.cwd(), '.wwebjs_auth', `session-${userId}`);
      const sessionDir = path.join(sessionPath, '.wwebjs_auth');
      
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }

      // Восстанавливаем файлы сессии
      const sessionData = JSON.parse(account.sessionData);
      for (const [fileName, content] of Object.entries(sessionData)) {
        const filePath = path.join(sessionDir, fileName);
        // Если это QR-код, сохраняем его как бинарный файл
        if (fileName === 'qr.png') {
          fs.writeFileSync(filePath, Buffer.from(content as string, 'base64'));
        } else {
          fs.writeFileSync(filePath, content as string);
        }
      }

      console.log(`[${new Date().toISOString()}] Сессия для пользователя ${userId} успешно восстановлена`);
      return sessionPath;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Ошибка при восстановлении сессии из MongoDB:`, error);
      return null;
    }
  }

  public startSessionSaving(userId: string, sessionPath: string): void {
    // Сохраняем сессию каждую минуту
    this.saveInterval = setInterval(async () => {
      try {
        await this.saveSessionToDB(userId, sessionPath);
      } catch (error) {
        console.error('Ошибка при периодическом сохранении сессии:', error);
      }
    }, 60000); // 60000 мс = 1 минута
  }

  public stopSessionSaving(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
  }
} 