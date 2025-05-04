import express from 'express'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import cors from 'cors'
import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import authRoutes from './routes/auth'
import whatsappRoutes from './routes/whatsapp'
import integrationsRoutes from './routes/integrations'
import instagramRoutes from './routes/instagram'
import companyRoutes from './routes/company'
import { initAdminClient } from './whatsapp/adminClient'
import morgan from 'morgan'
import jwt from 'jsonwebtoken'
import { TelegramService } from './telegram/telegramClient'
import { initWhatsappClients } from './whatsapp/whatsappClient'
import { CompanySettings } from './models/CompanySettings'

import { initCron } from './whatsapp/closedChats'
import { initDailyReportCron } from './whatsapp/dailyReport'
import { MessageMonitor } from './whatsapp/messageMonitor'
import './checkEnv'

dotenv.config()
const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
	path: '/ws',
	cors: {
		origin: ['https://app.salestrack.kz', 'https://app.salestrack.kz'],
		methods: ['GET', 'POST'],
	},
})

// Настройки CORS
app.use(
	cors({
		origin: ['https://app.salestrack.kz', 'https://app.salestrack.kz'],
		credentials: true,
	})
)

// Логирование всех запросов
app.use(morgan('dev'))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use('/api/auth', authRoutes)
app.use('/api/whatsapp', whatsappRoutes)
app.use('/api/integrations', integrationsRoutes)
app.use('/api/company', companyRoutes)
app.use('/api/instagram', instagramRoutes)

interface JWTPayload {
	userId: string
}

// Middleware для аутентификации WebSocket
io.use((socket, next) => {
	const token = socket.handshake.auth.token

	if (!token) {
		return next(new Error('Токен не предоставлен'))
	}

	try {
		const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload
		socket.data.user = decoded
		next()
	} catch (error) {
		return next(new Error('Недействительный токен'))
	}
})

// WebSocket подключения
io.on('connection', (socket: Socket) => {
	const userId = socket.data.user?.id

	// Обработчик отключения
	socket.on('disconnect', () => {
		// Очищаем ресурсы при отключении
	})

	// Обработчик ошибок
	socket.on('error', error => {
		console.error('Ошибка WebSocket:', error)
	})
})

// Экспортируем io для использования в других модулях
export { io }

// Инициализируем подключение к MongoDB
mongoose
	.connect(process.env.MONGO_URI!, {
		serverSelectionTimeoutMS: 5000, // 5 секунд таймаут для выбора сервера
		socketTimeoutMS: 45000, // 45 секунд таймаут для сокета
		connectTimeoutMS: 10000, // 10 секунд таймаут для подключения
		maxPoolSize: 10, // максимальное количество соединений в пуле
		minPoolSize: 5, // минимальное количество соединений в пуле
		retryWrites: true, // повторные попытки записи
		retryReads: true, // повторные попытки чтения
		w: 'majority', // подтверждение записи большинством
	})
	.then(() => {
		console.log(`[${new Date().toISOString()}] ✅ Подключено к MongoDB`)
	})
	.catch(err => {
		console.error(
			`[${new Date().toISOString()}] ❌ Ошибка подключения к MongoDB:`,
			err
		)
		process.exit(1)
	})

// Добавляем обработчики событий MongoDB
mongoose.connection.on('connecting', () => {
	console.log(`[${new Date().toISOString()}] 🔄 Подключение к MongoDB...`)
})

mongoose.connection.on('connected', () => {
	console.log(`[${new Date().toISOString()}] ✅ Успешно подключено к MongoDB`)
})

mongoose.connection.on('error', err => {
	console.error(`[${new Date().toISOString()}] ❌ Ошибка MongoDB:`, err)
})

mongoose.connection.on('disconnected', () => {
	console.log(`[${new Date().toISOString()}] ⚠️ Отключено от MongoDB`)
})

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, async () => {
	console.log(
		`[${new Date().toISOString()}] 🚀 Сервер запущен на порту ${PORT}`
	)
	console.log(
		`[${new Date().toISOString()}] 🌐 API доступен по адресу: http://api.salestrack.kz${PORT}/api`
	)

	try {
		// Ждем подключения к MongoDB
		if (mongoose.connection.readyState !== 1) {
			console.log(
				`[${new Date().toISOString()}] ⏳ Ожидание подключения к MongoDB...`
			)
			await new Promise((resolve, reject) => {
				const timeout = setTimeout(() => {
					reject(new Error('Таймаут подключения к MongoDB'))
				}, 10000) // 10 секунд таймаут

				mongoose.connection.once('connected', () => {
					clearTimeout(timeout)
					resolve(true)
				})

				mongoose.connection.once('error', err => {
					clearTimeout(timeout)
					reject(err)
				})
			})
		}

		console.log(
			`[${new Date().toISOString()}] 📊 Статус MongoDB: ${
				mongoose.connection.readyState
			}`
		)

		await CompanySettings.updateMany(
			{},
			{ $set: { isRunning: false } },
			{ new: true }
		)

		// Инициализируем админский клиент WhatsApp
		console.log(
			`[${new Date().toISOString()}] 🔄 Инициализация WhatsApp админского клиента...`
		)
		await initAdminClient()
		console.log(
			`[${new Date().toISOString()}] ✅ Админский клиент WhatsApp готов к использованию`
		)

		// Инициализируем Telegram клиент
		const telegramService = TelegramService.getInstance()
		console.log(
			`[${new Date().toISOString()}] 🔄 Инициализация Telegram клиента...`
		)
		await telegramService.initialize()

		// Проверяем авторизацию Telegram
		const isTelegramAuthorized = await telegramService.isConnected()
		if (!isTelegramAuthorized) {
			console.log(
				`[${new Date().toISOString()}] ⚠️ Telegram клиент не авторизован. Ожидание кода подтверждения...`
			)
			return
		}
		console.log(
			`[${new Date().toISOString()}] ✅ Telegram клиент успешно авторизован`
		)

		console.log(
			`[${new Date().toISOString()}] 🔄 Инициализация WhatsApp клиентов...`
		)
		await initWhatsappClients(io)

		// Получаем экземпляр MessageMonitor
		console.log(
			`[${new Date().toISOString()}] 🔄 Получение экземпляра MessageMonitor...`
		)
		const messageMonitor = MessageMonitor.getInstance()
		console.log(
			`[${new Date().toISOString()}] ✅ MessageMonitor инициализирован`
		)

		// Инициализируем крон для закрытия чатов
		console.log(
			`[${new Date().toISOString()}] 🔄 Инициализация крон для закрытия чатов...`
		)
		initCron(messageMonitor)
		console.log(
			`[${new Date().toISOString()}] ✅ Крон для закрытия чатов инициализирован`
		)

		// Инициализируем крон для ежедневного отчета
		console.log(
			`[${new Date().toISOString()}] 🔄 Инициализация крон для ежедневного отчета...`
		)
		initDailyReportCron(messageMonitor)
		console.log(
			`[${new Date().toISOString()}] ✅ Крон для ежедневного отчета инициализирован`
		)
	} catch (error) {
		console.error(
			`[${new Date().toISOString()}] ❌ Ошибка при инициализации клиентов:`,
			error
		)
		process.exit(1)
	}
})
