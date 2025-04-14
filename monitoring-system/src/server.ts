import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cors from 'cors';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import authRoutes from './routes/auth';
import whatsappRoutes from './routes/whatsapp';
import integrationsRoutes from './routes/integrations';
import companyRoutes from './routes/company';
import { initAdminClient } from './whatsapp/adminClient';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import { TelegramService } from './telegram/telegramClient';

dotenv.config();
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  path: "/ws",
  cors: {
    origin: ["http://api.salestrack.kz"],
    methods: ['GET', 'POST']
  }
});

// Настройки CORS
app.use(cors({
  origin: ['app.salestrack.kz', 'api.salestrack.kz'],
  credentials: true
}));

// Логирование всех запросов
app.use(morgan('dev'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/company', companyRoutes);

interface JWTPayload {
  userId: string;
}

// Middleware для аутентификации WebSocket
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Токен не предоставлен'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    socket.data.user = decoded;
    next();
  } catch (error) {
    return next(new Error('Недействительный токен'));
  }
});

// WebSocket подключения
io.on('connection', (socket: Socket) => {
  const userId = socket.data.user?.id;
  
  // Обработчик отключения
  socket.on('disconnect', () => {
    // Очищаем ресурсы при отключении
  });

  // Обработчик ошибок
  socket.on('error', (error) => {
    console.error('Ошибка WebSocket:', error);
  });
});

// Экспортируем io для использования в других модулях
export { io };

// Инициализируем подключение к MongoDB
mongoose.connect(process.env.MONGO_URI!)
  .then(() => {
    console.log('Подключено к MongoDB');
  })
  .catch(err => {
    console.error('Ошибка подключения к MongoDB:', err);
  });

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, async () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`API доступен по адресу: http://api.salestrack.kz${PORT}/api`);
  
  // Инициализируем админский клиент при запуске сервера
  try {
    await initAdminClient();
    console.log('Админский клиент готов к использованию');
    
    // Инициализация Telegram после WhatsApp
    const telegramService = TelegramService.getInstance();
    console.log('Ожидание кода подтверждения Telegram...');
    await telegramService.initialize();
    console.log('Telegram клиент готов к использованию');
  } catch (error) {
    console.error('Ошибка при инициализации клиентов:', error);
  }
});