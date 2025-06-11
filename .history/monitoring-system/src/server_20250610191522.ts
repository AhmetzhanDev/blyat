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
import telegramRoutes from './routes/routes'
import { initAdminClient } from './whatsapp/adminClient'
import morgan from 'morgan'
import jwt from 'jsonwebtoken'
import { TelegramService } from './telegram/TelegramService'
import { initWhatsappClients } from './whatsapp/whatsappClient'
import { CompanySettings } from './models/CompanySettings'
import { initCron } from './whatsapp/closedChats'
import { initDailyReportCron } from './whatsapp/dailyReport'
import { MessageMonitor } from './whatsapp/messageMonitor'
import { initNightlyReportCron } from './whatsapp/nightlyReport'

// Загружаем переменные окружения
dotenv.config()

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
	path: '/ws',
	cors: {
		// origin: ['https://app.salestrack.kz', 'https://app.salestrack.kz'],
		origin: ['http://localhost:3000', 'http://localhost:3000'],
		methods: ['GET', 'POST'],
	},
})

// Настройки CORS
app.use(
	cors({
		origin: ['http://localhost:3000', 'http://localhost:3000'],
		credentials: true,
	})
)

// Логирование всех запросов
app.use(morgan('dev'))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Добавляем расширенное логирование
app.use((req, res, next) => {
	console.log(`[${new Date().toISOString()}] 📥 Входящий запрос:`)
	console.log(`URL: ${req.url}`)
	console.log(`Method: ${req.method}`)
	console.log(`Headers:`, req.headers)
	console.log(`Body:`, req.body)
	next()
})

app.use('/api/auth', authRoutes)
app.use('/api/whatsapp', whatsappRoutes)
app.use('/api/integrations', integrationsRoutes)
app.use('/api/company', companyRoutes)
app.use('/api/instagram', instagramRoutes)
app.use('/api/telegram', telegramRoutes) 

// Проверяем регистрацию маршрутов
console.log(`[${new Date().toISOString()}] 🔍 Проверка регистрации маршрутов:`)
const routes = [
	{ path: '/api/auth', routes: authRoutes },
	{ path: '/api/whatsapp', routes: whatsappRoutes },
	{ path: '/api/integrations', routes: integrationsRoutes },
	{ path: '/api/company', routes: companyRoutes },
	{ path: '/api/instagram', routes: instagramRoutes },
]

routes.forEach(route => {
	console.log(`[${new Date().toISOString()}] ${route.path}: ✅ Зарегистрирован`)
	// Выводим все подмаршруты
	const stack = route.routes.stack
	stack.forEach(layer => {
		if (layer.route) {
			const methods = Object.keys((layer.route as any).methods)
				.join(',')
				.toUpperCase()

			console.log(`  ${methods} ${route.path}${layer.route.path}`)
		}
	})
})

// Add route logging
app.use((req, res, next) => {
	console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`)
	next()
})

// Обработчик для несуществующих маршрутов
app.use((req, res) => {
	console.log(
		`[${new Date().toISOString()}] ❌ Маршрут не найден: ${req.method} ${
			req.url
		}`
	)
	res.status(404).json({
		success: false,
		message: 'Маршрут не найден',
		path: req.url,
		method: req.method,
	})
})

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

// Проверяем наличие всех необходимых переменных окружения
const requiredEnvVars = [
	'MONGO_URI',
	'TELEGRAM_BOT_TOKEN',
	'TELEGRAM_API_ID',
	'TELEGRAM_API_HASH',
	'TELEGRAM_PHONE',
]

console.log(`[${new Date().toISOString()}] 🔍 Проверка переменных окружения:`)
for (const envVar of requiredEnvVars) {
	const value = process.env[envVar]
	console.log(
		`[${new Date().toISOString()}] ${envVar}: ${
			value ? '✅ Установлено' : '❌ Отсутствует'
		}`
	)
	if (!value) {
		console.error(
			`[${new Date().toISOString()}] ❌ Отсутствует обязательная переменная окружения: ${envVar}`
		)
		process.exit(1)
	}
}

console.log(
	`[${new Date().toISOString()}] ✅ Все необходимые переменные окружения присутствуют`
)

// Инициализируем подключение к MongoDB
mongoose
	.connect(process.env.MONGO_URI!, {
		serverSelectionTimeoutMS: 5000,
		socketTimeoutMS: 45000,
		connectTimeoutMS: 10000,
		maxPoolSize: 10,
		minPoolSize: 5,
		retryWrites: true,
		retryReads: true,
		w: 'majority',
	})
	.then(async () => {
		console.log(`[${new Date().toISOString()}] ✅ Подключено к MongoDB`)
		console.log(
			`[${new Date().toISOString()}] 📊 Статус MongoDB:`,
			mongoose.connection.readyState
		)

		// Инициализация WhatsApp клиентов после подключения к MongoDB
		await initWhatsappClients(io).catch(error => {
			console.error(
				`[${new Date().toISOString()}] ❌ Ошибка при инициализации WhatsApp клиентов:`,
				error
			)
		})

		// Инициализация Telegram сервиса
		console.log(`[${new Date().toISOString()}] Инициализация Telegram сервиса...`)
		const telegramService = TelegramService.getInstance();
		await telegramService.initialize().catch(error => {
			console.error(
				`[${new Date().toISOString()}] ❌ Ошибка при инициализации Telegram сервиса:`,
				error
			)
		})
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
		`[${new Date().toISOString()}] 🌐 API доступен по адресу: https://api.salestrack.kz/api`
	)
	console.log(`[${new Date().toISOString()}] 🔍 Проверка переменных окружения для продакшена:`)
	console.log(`NODE_ENV: ${process.env.NODE_ENV}`)
	console.log(`PORT: ${PORT}`)
	console.log(
		`MONGO_URI: ${process.env.MONGO_URI ? '✅ Установлено' : '❌ Отсутствует'}`
	)
	console.log(
		`JWT_SECRET: ${
			process.env.JWT_SECRET ? '✅ Установлено' : '❌ Отсутствует'
		}`
	)

	try {

		// Инициализируем TelegramService
		const telegramService = TelegramService.getInstance()
		console.log(
			`[${new Date().toISOString()}] 🔄 Инициализация TelegramService...`
		)
		await telegramService.initialize()

		// Проверяем авторизацию
		const isConnected = await telegramService.isConnected()
		if (!isConnected) {
			console.log(
				`[${new Date().toISOString()}] ⚠️ TelegramService не авторизован`
			)
			return
		}
		console.log(
			`[${new Date().toISOString()}] ✅ TelegramService успешно инициализирован`
		)

		// Инициализируем админский клиент WhatsApp
		console.log(
			`[${new Date().toISOString()}] 🔄 Инициализация админского клиента WhatsApp...`
		)
		await initAdminClient()
		console.log(
			`[${new Date().toISOString()}] ✅ Админский клиент WhatsApp инициализирован`
		)

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

		// Инициализируем крон для ночного отчета
		console.log(
			`[${new Date().toISOString()}] 🔄 Инициализация крон для ночного отчета...`
		)
		initNightlyReportCron(messageMonitor)
		console.log(
			`[${new Date().toISOString()}] ✅ Крон для ночного отчета инициализирован`
		)
	} catch (error) {
		console.error('Ошибка при запуске сервера:', error);
		process.exit(1);
	}
})
