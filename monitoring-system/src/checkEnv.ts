import dotenv from 'dotenv'

dotenv.config()

const requiredEnvVars = [
	'TELEGRAM_API_ID',
	'TELEGRAM_API_HASH',
	'TELEGRAM_PHONE',
	'TELEGRAM_BOT_TOKEN',
	'TELEGRAM_BOT_USERNAME',
	'MONGO_URI',
	'JWT_SECRET',
	'OPENAI_API_KEY',
]

function checkEnvVars() {
	console.log('🔍 Проверка переменных окружения...')

	const missingVars = requiredEnvVars.filter(varName => !process.env[varName])

	if (missingVars.length > 0) {
		console.error('❌ Отсутствуют следующие переменные окружения:')
		missingVars.forEach(varName => console.error(`- ${varName}`))
		process.exit(1)
	}

	console.log('✅ Все необходимые переменные окружения установлены')
}

checkEnvVars()
