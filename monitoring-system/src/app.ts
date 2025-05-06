import express from 'express'
import whatsappRoutes from './routes/whatsappRoutes'
import authRoutes from './routes/auth'
import cors from 'cors'

const app = express()

// Добавляем логирование всех запросов
app.use((req, res, next) => {
	console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`)
	console.log('Headers:', req.headers)
	console.log('Body:', req.body)
	next()
})

// Настраиваем CORS
app.use(
	cors({
		origin: ['https://app.salestrack.kz', 'https://app.salestrack.kz'],
		credentials: true,
	})
)

app.use(express.json())
app.use('/api/whatsapp', whatsappRoutes)
app.use('/api/auth', authRoutes)

// Обработка ошибок
app.use(
	(
		err: any,
		req: express.Request,
		res: express.Response,
		next: express.NextFunction
	) => {
		console.error('Error:', err)
		res.status(500).json({
			success: false,
			message: 'Внутренняя ошибка сервера',
			error: process.env.NODE_ENV === 'development' ? err.message : undefined,
		})
	}
)

export default app
