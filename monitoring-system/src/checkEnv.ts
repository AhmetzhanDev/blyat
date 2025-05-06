import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

// Загружаем .env файл
dotenv.config()

// Проверяем обязательные переменные окружения
const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET', 'PORT', 'NODE_ENV']

const missingVars = requiredEnvVars.filter(varName => !process.env[varName])

if (missingVars.length > 0) {
	console.error('Отсутствуют обязательные переменные окружения:', missingVars)
	process.exit(1)
}

// Проверяем значения
console.log('Проверка переменных окружения:')
console.log('NODE_ENV:', process.env.NODE_ENV)
console.log('PORT:', process.env.PORT)
console.log(
	'MONGO_URI:',
	process.env.MONGO_URI ? '✅ Установлено' : '❌ Отсутствует'
)
console.log(
	'JWT_SECRET:',
	process.env.JWT_SECRET ? '✅ Установлено' : '❌ Отсутствует'
)

export {}
