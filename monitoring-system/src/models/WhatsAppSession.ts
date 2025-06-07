import { Client, LocalAuth } from 'whatsapp-web.js'
import qrcode from 'qrcode'
import path from 'path'
import { io } from '../server'
import { sendVerificationCode } from '../whatsapp/adminClient'
import { WhatsAppAccountModel } from './WhatsAppAccount'
import { MessageMonitor } from '../whatsapp/messageMonitor'
import { CompanySettings } from '../models/CompanySettings'

const activeClients = new Map<string, Client>()

// Глобальная переменная для хранения статуса QR-кода
let qrStatus: { [userId: string]: 'pending' | 'scanned' | 'ready' | 'error' } =
	{}

// Функция для обновления статуса в базе данных
const updateSessionStatus = async (userId: string, status: string, message?: string) => {
	try {
		await WhatsAppAccountModel.findOneAndUpdate(
			{ userId },
			{ 
				$set: { 
					sessionStatus: status,
					lastStatusUpdate: new Date(),
					statusMessage: message
				}
			},
			{ upsert: true }
		)
	} catch (error) {
		console.error('Ошибка при обновлении статуса сессии:', error)
	}
}

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
			await updateSessionStatus(userId, 'pending', 'QR-код сгенерирован')
			emitQRStatus(userId, 'pending', 'QR-код сгенерирован')

			io.emit(`user:qr:${userId}`, { qr: qrCode })
		} catch (err) {
			console.error('Ошибка при генерации QR-кода:', err)
			await updateSessionStatus(userId, 'error', 'Ошибка при генерации QR-кода')
			emitQRStatus(userId, 'error', 'Ошибка при генерации QR-кода')
		}
	})

	client.on('ready', async () => {
		qrStatus[userId] = 'ready'
		await updateSessionStatus(userId, 'ready', 'WhatsApp клиент готов к работе')
		emitQRStatus(userId, 'ready', 'WhatsApp клиент готов к работе')

		io.emit(`user:ready:${userId}`, {
			success: true,
			message: 'WhatsApp клиент готов к работе',
			timestamp: new Date().toISOString(),
		})
	})

	client.on('authenticated', async () => {
		qrStatus[userId] = 'scanned'
		await updateSessionStatus(userId, 'scanned', 'QR-код успешно отсканирован')
		emitQRStatus(userId, 'scanned', 'QR-код успешно отсканирован')

		io.emit(`whatsapp:qr_scanned:${userId}`, {
			success: true,
			message: 'QR-код успешно отсканирован',
			timestamp: new Date().toISOString(),
		})
	})

	client.on('auth_failure', async (msg: string) => {
		console.error(`[${new Date().toISOString()}] ❌ Ошибка аутентификации для пользователя ${userId}:`, msg)
		qrStatus[userId] = 'error'
		await updateSessionStatus(userId, 'error', 'Ошибка аутентификации: ' + msg)
		emitQRStatus(userId, 'error', 'Ошибка аутентификации: ' + msg)

		// Отправка уведомления в Telegram-группу
		try {
			const companies = await CompanySettings.find({ userId })
			if (!companies || companies.length === 0) {
				console.error(`[${new Date().toISOString()}] ❌ Не найдены компании для пользователя ${userId}`)
				return
			}

			const messageMonitor = MessageMonitor.getInstance()
			let notificationSent = false

			for (const company of companies) {
				if (company.telegramGroupId) {
					try {
						const errorMessage = `❗️ ВНИМАНИЕ! ❗️\n\nОшибка авторизации WhatsApp!\n\nПричина: ${msg}\n\nНеобходимо переподключить сессию через QR-код.\n\n⏰ Время: ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}`
						
						await messageMonitor.sendTelegramMessage(company._id, errorMessage)
						notificationSent = true
						console.log(`[${new Date().toISOString()}] ✅ Уведомление об ошибке отправлено в Telegram для компании ${company.nameCompany}`)
					} catch (err) {
						console.error(`[${new Date().toISOString()}] ❌ Ошибка при отправке уведомления в Telegram для компании ${company.nameCompany}:`, err)
					}
				}
			}

			if (!notificationSent) {
				console.error(`[${new Date().toISOString()}] ❌ Не удалось отправить уведомление ни в одну Telegram-группу`)
			}
		} catch (err) {
			console.error(`[${new Date().toISOString()}] ❌ Ошибка при отправке уведомлений в Telegram:`, err)
		}
	})

	client.on('disconnected', async (reason: string) => {
		console.log(`[${new Date().toISOString()}] ⚠️ Клиент отключен для пользователя ${userId}:`, reason)
		
		// Удаляем клиент из активных клиентов
		activeClients.delete(userId)
		
		// Обновляем статус в базе данных
		await updateSessionStatus(userId, 'error', 'Клиент отключен: ' + reason)
		emitQRStatus(userId, 'error', 'Клиент отключен: ' + reason)
		
		// Отправляем событие через сокет
		io.emit(`whatsapp:disconnected:${userId}`, {
			success: false,
			message: 'Клиент отключен: ' + reason,
			timestamp: new Date().toISOString(),
		})
		
		// Отправка уведомления в Telegram-группу
		try {
			const companies = await CompanySettings.find({ userId })
			if (!companies || companies.length === 0) {
				console.error(`[${new Date().toISOString()}] ❌ Не найдены компании для пользователя ${userId}`)
				return
			}

			const messageMonitor = MessageMonitor.getInstance()
			let notificationSent = false

			for (const company of companies) {
				if (company.telegramGroupId) {
					try {
						const disconnectMessage = `❗️ ВНИМАНИЕ! ❗️\n\nСессия WhatsApp потеряна!\n\nПричина: ${reason}\n\nНеобходимо обновить подключение через QR-код.\n\n⏰ Время: ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}`
						
						await messageMonitor.sendTelegramMessage(company._id, disconnectMessage)
						notificationSent = true
						console.log(`[${new Date().toISOString()}] ✅ Уведомление об отключении отправлено в Telegram для компании ${company.nameCompany}`)
					} catch (err) {
						console.error(`[${new Date().toISOString()}] ❌ Ошибка при отправке уведомления в Telegram для компании ${company.nameCompany}:`, err)
					}
				}
			}

			if (!notificationSent) {
				console.error(`[${new Date().toISOString()}] ❌ Не удалось отправить уведомление ни в одну Telegram-группу`)
			}
		} catch (err) {
			console.error(`[${new Date().toISOString()}] ❌ Ошибка при отправке уведомлений в Telegram:`, err)
		}
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
export const getQRStatus = async (userId: string) => {
	try {
		// Сначала проверяем в базе данных
		const account = await WhatsAppAccountModel.findOne({ userId })
		if (account?.sessionStatus) {
			return account.sessionStatus
		}
		// Если в базе нет, возвращаем из памяти
		return qrStatus[userId] || 'pending'
	} catch (error) {
		console.error('Ошибка при получении статуса QR-кода:', error)
	return qrStatus[userId] || 'pending'
	}
}

// Экспорт функций
export { generateUserQR, sendVerificationCode }