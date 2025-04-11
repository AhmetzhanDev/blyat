import Docker from 'dockerode';
import path from 'path';
import fs from 'fs';
import { WhatsAppAccountModel } from '../models/WhatsAppAccount';
import { SessionService } from './sessionService';



export class DockerService {
  private static instance: DockerService;
  private docker: Docker;
  private sessionService: SessionService;

  private constructor() {
    this.docker = new Docker();
    this.sessionService = SessionService.getInstance();
  }

  public static getInstance(): DockerService {
    if (!DockerService.instance) {
      DockerService.instance = new DockerService();
    }
    return DockerService.instance;
  }


 

  public async createWhatsAppContainer(userId: string): Promise<void> {
    try {
      // Проверяем наличие сессии в MongoDB
      const sessionPath = await this.sessionService.restoreSessionFromDB(userId);
      
      if (!sessionPath) {
        throw new Error('Не удалось восстановить сессию из MongoDB');
      }

      // Создаем контейнер
      const container = await this.docker.createContainer({
        Image: 'whatsapp-client:latest',
        name: `whatsapp-${userId}`,
        Env: [`USER_ID=${userId}`],
        HostConfig: {
          Binds: [
            `${sessionPath}:/app/.wwebjs_auth`
          ],
          RestartPolicy: {
            Name: 'always'
          }
        }
      });

      // Запускаем контейнер
      await container.start();
      
      // Начинаем сохранение сессии
      this.sessionService.startSessionSaving(userId, sessionPath);

      console.log(`Контейнер WhatsApp для пользователя ${userId} успешно создан и запущен`);
    } catch (error) {
      console.error('Ошибка при создании контейнера:', error);
      throw error;
    }
  }

  public async stopWhatsAppContainer(userId: string): Promise<void> {
    try {
      const containerName = `whatsapp-${userId}`;
      const container = this.docker.getContainer(containerName);
      
      // Останавливаем сохранение сессии
      this.sessionService.stopSessionSaving();
      
      // Останавливаем и удаляем контейнер
      await container.stop();
      await container.remove();
      
      console.log(`Контейнер WhatsApp для пользователя ${userId} успешно остановлен и удален`);
    } catch (error) {
      console.error('Ошибка при остановке контейнера:', error);
      throw error;
    }
  }

  public async getContainerStatus(userId: string): Promise<string> {
    try {
      const containerName = `whatsapp-${userId}`;
      const container = this.docker.getContainer(containerName);
      const containerInfo = await container.inspect();
      return containerInfo.State.Status;
    } catch (error) {
      console.error('Ошибка при получении статуса контейнера:', error);
      return 'not_found';
    }
  }
} 