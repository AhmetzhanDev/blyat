import { Client, LocalAuth } from 'whatsapp-web.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { io } from '../server';
import { sendVerificationCode } from './adminClient';
import qrcode from 'qrcode';
import { Socket } from 'socket.io';
import { UserModel } from '../models/User';
import { MessageMonitor } from './messageMonitor';
import { CompanySettings } from '../models/CompanySettings';
import { Types } from 'mongoose';
import { initCron } from './closedChats';

// Глобальная переменная для хранения таймеров QR-кодов
const qrTimers = new Map<string, NodeJS.Timeout>();

const messageMonitor = MessageMonitor.getInstance();

// Создаем директорию для сессий в домашней директории
const sessionsDir = path.join(os.homedir(), '.whatsapp-sessions');
fs.mkdirSync(sessionsDir, { recursive: true });
console.log('Создана директория для сессий:', sessionsDir);

// Создаем директорию для .wwebjs_auth
// const wwebjsDir = path.join(process.cwd(), '.wwebjs_auth');
// fs.mkdirSync(wwebjsDir, { recursive: true });
// console.log('Создана директория .wwebjs_auth:', wwebjsDir);

// Очистка файлов блокировки
const clearLockFiles = () => {
  const sessionDir = path.join(process.cwd(), '.wwebjs_auth');
  if (fs.existsSync(sessionDir)) {
    try {
      // Удаляем всю директорию с сессиями
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log('Удалена директория с сессиями:', sessionDir);
    } catch (error) {
      console.error('Ошибка при удалении директории с сессиями:', error);
    }
  }
};

initCron(messageMonitor);

// Глобальная переменная для хранения статуса QR-кода
export let qrStatus: { [userId: string]: 'pending' | 'scanned' | 'ready' | 'error' } = {};

// Получение или создание клиента
export const getOrCreateClient = (companyId: string): Client => {
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: `company-${companyId}`,
      // dataPath: path.join(process.cwd(), '.wwebjs_auth', `session-${userId}`)
    }),
    puppeteer: {
      // headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-software-rasterizer',
        '--disable-features=site-per-process',
        '--disable-features=IsolateOrigins',
        '--disable-site-isolation-trials'
      ],
      // executablePath: process.platform === 'darwin' 
      //   ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      //   : undefined,
      // ignoreDefaultArgs: ['--disable-extensions'],
      // handleSIGINT: false,
      // handleSIGTERM: false,
      // handleSIGHUP: false
    }
  });

  return client;
};

// Экспорт функций
export {
  sendVerificationCode
};

// Функция для отправки статуса через WebSocket
const emitQRStatus = (userId: string, status: string, message?: string, io?: any) => {
  if (!io) {
    console.error('[QR-DEBUG] WebSocket не инициализирован в emitQRStatus');
    return;
  }
  
  try {
    console.log('[QR-DEBUG] Отправка статуса через WebSocket:', {
      userId,
      status,
      message,
      timestamp: new Date().toISOString()
    });
    
    io.emit(`whatsapp:qr_status:${userId}`, {
      status,
      message
    });
  } catch (error) {
    console.error('[QR-DEBUG] Ошибка при отправке статуса через WebSocket:', error);
  }
};

// Функция для получения socketId по userId
const getSocketIdByUserId = (io: any, userId: string): string | null => {
  const sockets = io.sockets.sockets;
  for (const [socketId, socket] of sockets) {
    if (socket.data.user?.id === userId) {
      return socketId;
    }
  }
  return null;
};

// Функция для генерации QR-кода пользователя
export const generateUserQR = async (userId: string, io: any, companyId: string): Promise<{client: Client | undefined, qr: string}> => {
  return new Promise(async (resolve, reject) => {
    const settings = await CompanySettings.findOne({ userId, _id: new Types.ObjectId(companyId), whatsappAuthorized: true, isRunning: true });

    if (settings) {
      io.emit(`user:${userId}:ready`, {
        status: 'ready',
        message: 'WhatsApp клиент готов к работе',
        timestamp: new Date().toISOString(),
        whatsappAuthorized: true,
        companyId
      });
      return;
    }

    try {
      console.log('[QR-DEBUG] Начало generateUserQR для пользователя:', userId);
      
      if (!io) {
        throw new Error('WebSocket не инициализирован');
      }
      
      const client = getOrCreateClient(companyId);

      // Clear any existing QR timer for this user
      if (qrTimers.has(userId)) {
        clearTimeout(qrTimers.get(userId));
        qrTimers.delete(userId);
      }

      // Set a longer timeout (5 minutes instead of default)
      const qrTimeout = setTimeout(() => {
        console.log('[QR-DEBUG] QR код устарел. Перезапуск клиента...');
        client.destroy().then(() => {
          emitQRStatus(userId, 'error', 'QR код устарел. Пожалуйста, обновите страницу для получения нового кода.', io);
        });
      }, 300000); // 5 minutes in milliseconds

      qrTimers.set(userId, qrTimeout);

      await CompanySettings.findOneAndUpdate(
        {
          userId,
          _id: new Types.ObjectId(companyId),
        },
        { isRunning: true },
        { new: true }
      );

      qrStatus[userId] = 'pending';
      emitQRStatus(userId, 'pending', 'Генерация QR-кода. У вас есть 5 минут на сканирование. QR-код будет обновляться каждые 20-30 секунд.', io);
      
      // Добавляем обработчик события 'qr' до инициализации
      const qrHandler = async (qr: string) => {
        console.log('[QR-DEBUG] Получено событие QR для пользователя:', userId);
        try {
          console.log('[QR-DEBUG] Начало генерации QR-кода в формате base64');

          await CompanySettings.findOneAndUpdate(
            {
              userId,
              _id: new Types.ObjectId(companyId),
              phoneNumber: null
            },
            { whatsappAuthorized: false },
            { new: true }
          ).then(() => {
            console.log(`[QR-DEBUG] Статус WhatsApp обновлен на pending для пользователя ${userId} и компании ${companyId}`);
          }).catch((error: Error) => {
            console.error(`[QR-DEBUG] Ошибка при обновлении статуса WhatsApp:`, error);
          });
          
          // Генерируем QR-код сразу в формате data:image/png;base64
          const qrCode = await qrcode.toDataURL(qr, {
            type: 'image/png',
            margin: 1,
            width: 300, // Increased size for better scanning
            color: {
              dark: '#000000',
              light: '#ffffff'
            }
          });
          
          console.log('[QR-DEBUG] QR-код сгенерирован, длина:', qrCode.length);
          
          // Отправляем QR-код через WebSocket с информацией об обновлении
          try {
            console.log('[QR-DEBUG] Попытка отправки QR-кода через WebSocket');
            io.emit(`user:qr:${userId}`, { 
              qr: qrCode,
              message: 'Новый QR-код сгенерирован. У вас есть 20-30 секунд до следующего обновления.',
              timestamp: new Date().toISOString()
            });
            console.log('[QR-DEBUG] QR-код успешно отправлен через WebSocket');
          } catch (error) {
            console.error('[QR-DEBUG] Ошибка при отправке QR-кода через WebSocket:', error);
            throw error;
          }

          return {client, qr: qrCode};
        } catch (err) {
          console.error('[QR-DEBUG] Ошибка при генерации QR-кода:', err);
          throw err;
        }
      };

      // Добавляем обработчик события 'qr'
      client.on('qr', qrHandler);

      // Добавляем обработчики других событий
      client.on('authenticated', () => {
        console.log('[QR-DEBUG] Клиент аутентифицирован для пользователя:', userId);
        qrStatus[userId] = 'scanned';
        emitQRStatus(userId, 'scanned', 'QR-код успешно отсканирован', io);
        
        // Получаем socketId пользователя
        const socketId = getSocketIdByUserId(io, userId);

        // Отправляем событие только этому пользователю
        // if (socketId) {
          io.emit(`user:${userId}:scanned`, {
            status: 'scanned',
            message: 'QR-код успешно отсканирован',
            timestamp: new Date().toISOString(),
          });
        // } else {
        //   console.error('[QR-DEBUG] Не найден socketId для userId:', userId);
        // }
      });

      client.on('message', async (message) => {
        await messageMonitor.handleMessage(message);
      });

      client.on('message_create', async (message) => {
        if (message.fromMe) {
          await messageMonitor.handleOutgoingMessage(message);
        }
      });

      client.on('ready', async () => {
        console.log('[QR-DEBUG] Клиент готов для пользователя:', userId);
        qrStatus[userId] = 'ready';
        emitQRStatus(userId, 'ready', 'WhatsApp клиент готов к работе', io);
        
        // Обновляем статус авторизации в БД
        await CompanySettings.findOneAndUpdate(
          {
            userId,
            _id: new Types.ObjectId(companyId),
            // phoneNumber: null
          },
          { 
            whatsappAuthorized: true,
            phoneNumber: client.info.wid._serialized.replace('@c.us', '').replace('+', '').replace(/\D/g, '')
           },
          { new: true }
        ).then(() => {
          console.log(`[QR-DEBUG] Статус WhatsApp обновлен на active для пользователя ${userId} и компании ${companyId}`);
        }).catch((error: Error) => {
          console.error(`[QR-DEBUG] Ошибка при обновлении статуса WhatsApp:`, error);
        });
        
        // Получаем socketId пользователя
        // const socketId = getSocketIdByUserId(io, userId);

        // Отправляем событие только этому пользователю
        // if (socketId) {
          io.emit(`user:${userId}:ready`, {
            status: 'ready',
            message: 'WhatsApp клиент готов к работе',
            timestamp: new Date().toISOString(),
            whatsappAuthorized: true,
            companyId
          });
        // } else {
        //   console.error('[QR-DEBUG] Не найден socketId для userId:', userId);
        // }
        resolve({client, qr: ""});
      });

      // Инициализируем клиент
      console.log('[QR-DEBUG] Начало инициализации клиента');
      client.initialize().catch(err => {
        console.error('[QR-DEBUG] Ошибка при инициализации клиента:', err);
        reject(err);
      });

      return {client, qr: ""}

    } catch (error) {
      console.error('[QR-DEBUG] Ошибка в generateUserQR:', error);
      reject(error);
    }
  });
};

// Функция для обработки сканирования QR-кода
export const handleQRScanned = async (userId: string, io: any): Promise<void> => {
  try {
    console.log(`[${new Date().toISOString()}] Обработка сканирования QR-кода для пользователя ${userId}`);
    
    if (!io) {
      throw new Error('WebSocket не инициализирован');
    }

    // Обновляем статус
    qrStatus[userId] = 'scanned';
    emitQRStatus(userId, 'scanned', 'QR-код успешно отсканирован', io);

    // Очищаем таймер перегенерации, если он есть
    if (qrTimers.has(userId)) {
      clearTimeout(qrTimers.get(userId));
      qrTimers.delete(userId);
    }

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Ошибка при обработке сканирования QR-кода:`, error);
    emitQRStatus(userId, 'error', 'Ошибка при обработке сканирования QR-кода', io);
  }
};


export const initWhatsappClients = async (io: any) => {
  try {
    const companies = await CompanySettings.find({ whatsappAuthorized: true });

    for (const company of companies) {
      console.log(company.userId?.toString())
      await generateUserQR(company.userId?.toString(), io, company._id.toString());
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Ошибка при инициализации WhatsApp клиента:`, error);
  }
}


// Функция для инициализации WhatsApp клиента
export const initWhatsAppClient = (io: any) => {
  // Обработчик для получения статуса сканирования от фронтенда
  io.on('connection', (socket: Socket) => {
    console.log(`[${new Date().toISOString()}] Новое WebSocket подключение:`, socket.id);

    socket.on('user:qr_scanned', (data: { userId: string }) => {
      const { userId } = data;
      console.log(`[${new Date().toISOString()}] Получено событие сканирования QR-кода для пользователя ${userId}`);
      handleQRScanned(userId, io);
    });

    socket.on('disconnect', () => {
      console.log(`[${new Date().toISOString()}] WebSocket отключен:`, socket.id);
    });
  });
};
