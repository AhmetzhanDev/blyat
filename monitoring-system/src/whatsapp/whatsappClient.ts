import { Client, LocalAuth } from 'whatsapp-web.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { io } from '../server';
import { sendVerificationCode } from './adminClient';
import qrcode from 'qrcode';
import { Socket } from 'socket.io';
import { UserModel } from '../models/User';

// Глобальная переменная для хранения таймеров QR-кодов
const qrTimers = new Map<string, NodeJS.Timeout>();

// Создаем директорию для сессий в домашней директории
const sessionsDir = path.join(os.homedir(), '.whatsapp-sessions');
fs.mkdirSync(sessionsDir, { recursive: true });
console.log('Создана директория для сессий:', sessionsDir);

// Создаем директорию для .wwebjs_auth
const wwebjsDir = path.join(process.cwd(), '.wwebjs_auth');
fs.mkdirSync(wwebjsDir, { recursive: true });
console.log('Создана директория .wwebjs_auth:', wwebjsDir);

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

// Глобальная переменная для хранения статуса QR-кода
export let qrStatus: { [userId: string]: 'pending' | 'scanned' | 'ready' | 'error' } = {};

// Получение или создание клиента
export const getOrCreateClient = (userId: string): Client => {
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: userId,
      dataPath: path.join(process.cwd(), '.wwebjs_auth', `session-${userId}`)
    }),
    puppeteer: {
      headless: true,
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
      executablePath: process.platform === 'darwin' 
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : undefined,
      ignoreDefaultArgs: ['--disable-extensions'],
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false
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
export const generateUserQR = async (userId: string, io: any): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      console.log('[QR-DEBUG] Начало generateUserQR для пользователя:', userId);
      
      if (!io) {
        throw new Error('WebSocket не инициализирован');
      }
      
      const client = getOrCreateClient(userId);
      qrStatus[userId] = 'pending';
      emitQRStatus(userId, 'pending', 'Генерация QR-кода', io);
      
      // Добавляем обработчик события 'qr' до инициализации
      const qrHandler = async (qr: string) => {
        console.log('[QR-DEBUG] Получено событие QR для пользователя:', userId);
        try {
          console.log('[QR-DEBUG] Начало генерации QR-кода в формате base64');
          
          // Генерируем QR-код сразу в формате data:image/png;base64
          const qrCode = await qrcode.toDataURL(qr, {
            type: 'image/png',
            margin: 1,
            width: 200,
            color: {
              dark: '#000000',
              light: '#ffffff'
            }
          });
          
          console.log('[QR-DEBUG] QR-код сгенерирован, длина:', qrCode.length);
          
          // Отправляем QR-код через WebSocket
          try {
            console.log('[QR-DEBUG] Попытка отправки QR-кода через WebSocket');
            io.emit(`user:qr:${userId}`, { 
              qr: qrCode,
              timestamp: new Date().toISOString()
            });
            console.log('[QR-DEBUG] QR-код успешно отправлен через WebSocket');
          } catch (error) {
            console.error('[QR-DEBUG] Ошибка при отправке QR-кода через WebSocket:', error);
            throw error;
          }

          resolve(qrCode);
        } catch (err) {
          console.error('[QR-DEBUG] Ошибка при генерации QR-кода:', err);
          reject(err);
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
        if (socketId) {
          io.to(socketId).emit(`user:${userId}:scanned`, {
            status: 'scanned',
            message: 'QR-код успешно отсканирован',
            timestamp: new Date().toISOString(),
          });
        } else {
          console.error('[QR-DEBUG] Не найден socketId для userId:', userId);
        }
      });

      client.on('ready', () => {
        console.log('[QR-DEBUG] Клиент готов для пользователя:', userId);
        qrStatus[userId] = 'ready';
        emitQRStatus(userId, 'ready', 'WhatsApp клиент готов к работе', io);
        
        // Обновляем статус авторизации в БД
        UserModel.findByIdAndUpdate(
          userId,
          { whatsappAuthorized: true },
          { new: true }
        ).then(() => {
          console.log(`[QR-DEBUG] Статус WhatsApp обновлен на ready для пользователя ${userId}`);
        }).catch((error: Error) => {
          console.error(`[QR-DEBUG] Ошибка при обновлении статуса WhatsApp:`, error);
        });
        
        // Получаем socketId пользователя
        const socketId = getSocketIdByUserId(io, userId);

        // Отправляем событие только этому пользователю
        if (socketId) {
          io.to(socketId).emit(`user:${userId}:ready`, {
            status: 'ready',
            message: 'WhatsApp клиент готов к работе',
            timestamp: new Date().toISOString(),
            whatsappAuthorized: true
          });
        } else {
          console.error('[QR-DEBUG] Не найден socketId для userId:', userId);
        }
      });

      // Инициализируем клиент
      console.log('[QR-DEBUG] Начало инициализации клиента');
      client.initialize().catch(err => {
        console.error('[QR-DEBUG] Ошибка при инициализации клиента:', err);
        reject(err);
      });

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
