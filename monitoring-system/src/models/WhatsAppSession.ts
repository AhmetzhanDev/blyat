import { Client, LocalAuth } from 'whatsapp-web.js'
import qrcode from 'qrcode'
import path from 'path'
import { io } from '../server'
import { sendVerificationCode } from '../whatsapp/adminClient'

const activeClients = new Map<string, Client>()

// Глобальная переменная для хранения статуса QR-кода
let qrStatus: { [userId: string]: 'pending' | 'scanned' | 'ready' | 'error' } =
	{}

// Получение или создание клиента
export const getOrCreateClient = (userId: string): Client => {
	if (activeClients.has(userId)) {
		return activeClients.get(userId)!
	}

	const client = new Client({
		authStrategy: new LocalAuth({
			clientId: userId,
			dataPath: path.join(process.cwd(), '.wwebjs_auth', `session-${userId}`),
		}),
	})

	client.on('qr', async (qr: string) => {
		try {
			const qrCode = await qrcode.toDataURL(qr)
			qrStatus[userId] = 'pending'
			emitQRStatus(userId, 'pending', 'QR-код сгенерирован')

			io.emit(`user:qr:${userId}`, { qr: qrCode })
		} catch (err) {
			console.error('Ошибка при генерации QR-кода:', err)
			emitQRStatus(userId, 'error', 'Ошибка при генерации QR-кода')
		}
	})

	client.on('ready', () => {
		qrStatus[userId] = 'ready'
		emitQRStatus(userId, 'ready', 'WhatsApp клиент готов к работе')

		io.emit(`user:ready:${userId}`, {
			success: true,
			message: 'WhatsApp клиент готов к работе',
			timestamp: new Date().toISOString(),
		})
	})

	client.on('authenticated', () => {
		qrStatus[userId] = 'scanned'
		emitQRStatus(userId, 'scanned', 'QR-код успешно отсканирован')

		io.emit(`whatsapp:qr_scanned:${userId}`, {
			success: true,
			message: 'QR-код успешно отсканирован',
			timestamp: new Date().toISOString(),
		})
	})

	client.on('auth_failure', (msg: string) => {
		console.error(`Ошибка аутентификации для пользователя ${userId}:`, msg)
		qrStatus[userId] = 'error'
		emitQRStatus(userId, 'error', 'Ошибка аутентификации: ' + msg)
	})

	client.on('disconnected', (reason: string) => {
		console.log(`Клиент отключен для пользователя ${userId}:`, reason)
		emitQRStatus(userId, 'error', 'Клиент отключен: ' + reason)
	})

	activeClients.set(userId, client)
	return client
}

// Добавим функцию для отправки статуса через WebSocket
const emitQRStatus = (userId: string, status: string, message?: string) => {
	io.emit(`whatsapp:qr_status:${userId}`, {
		status,
		message: message || `Статус QR-кода: ${status}`,
		timestamp: new Date().toISOString(),
	})
}

// Функция для генерации QR-кода пользователя
const generateUserQR = async (userId: string): Promise<string> => {
	try {
		console.log('Начало генерации QR-кода для пользователя:', userId)
		const client = getOrCreateClient(userId)

		// Инициализируем статус QR-кода
		qrStatus[userId] = 'pending'

		// Отправляем начальный статус на фронтенд
		emitQRStatus(userId, 'pending', 'QR-код сгенерирован')

		return new Promise((resolve, reject) => {
			client.on('qr', async (qr: string) => {
				try {
					console.log('Получен QR-код в generateUserQR:', qr)
					const qrCode = await qrcode.toDataURL(qr)
					console.log('QR-код преобразован в DataURL в generateUserQR')
					resolve(qrCode)
				} catch (err) {
					console.error('Ошибка при генерации QR-кода в generateUserQR:', err)
					reject(err)
				}
			})

			client.initialize().catch(err => {
				console.error('Ошибка при инициализации клиента:', err)
				reject(err)
			})
		})
	} catch (error) {
		console.error(
			`Ошибка при генерации QR-кода для пользователя ${userId}:`,
			error
		)
		throw error
	}
}

// Функция для получения текущего статуса QR-кода
export const getQRStatus = (userId: string) => {
	return qrStatus[userId] || 'pending'
}

// Экспорт функций
export { generateUserQR, sendVerificationCode }
