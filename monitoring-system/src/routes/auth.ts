import express from 'express'
import {
	sendPhoneNumber,
	verifyCode,
	createPassword,
	login,
	verifyPhone,
	requestPasswordReset,
	resetPassword,
	verifyResetCode,
} from '../controllers/authController'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = express.Router()

// Middleware для логирования всех запросов к auth routes
router.use((req, res, next) => {
	console.log(
		`[${new Date().toISOString()}] 🔐 Auth Route: ${req.method} ${req.path}`
	)
	next()
})

// Маршруты регистрации
router.post('/register/phone', sendPhoneNumber) // Шаг 1: Отправка номера
router.post('/register/verify', verifyCode) // Шаг 2: Проверка кода
router.post('/register/password', createPassword) // Шаг 3: Создание пароля

// Маршруты авторизации
router.post('/login', login)
router.post('/verify-phone', verifyPhone)
router.post('/request-password-reset', requestPasswordReset)
router.post('/reset-password', resetPassword)

// Проверка кода для сброса пароля
router.post('/verify-reset-code', verifyResetCode)

export default router
