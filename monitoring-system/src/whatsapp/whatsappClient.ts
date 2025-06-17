import { Client, LocalAuth } from 'whatsapp-web.js'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { io } from '../server'
import qrcode from 'qrcode'
import { Socket } from 'socket.io'
import { UserModel } from '../models/User'
import { MessageMonitor } from './messageMonitor'
import { CompanySettings } from '../models/CompanySettings'
import { Types } from 'mongoose'
import { initCron } from './closedChats'
import { initDailyReportCron } from './dailyReport'
import { WhatsAppAccountModel } from '../models/WhatsAppAccount'

// Глобальная переменная для хранения таймеров QR-кодов
const qrTimers = new Map<string, NodeJS.Timeout>()

// Глобальная переменная для хранения статуса QR-кода
export const qrStatus: {
	[userId: string]: 'pending' | 'scanned' | 'ready' | 'error'
} = {}

const messageMonitor = MessageMonitor.getInstance()

// Путь к директории сессий
const sessionsDir = path.join(process.cwd(), '.wwebjs_auth')

// Функция для проверки существующих сессий
const checkSessions = (): string[] => {
	if (fs.existsSync(sessionsDir)) {
		const sessions = fs.readdirSync(sessionsDir)
		console.log(`[${new Date().toISOString()}] 📂 Найденные сессии:`, sessions)
		return sessions
	}
	console.log(`[${new Date().toISOString()}] ⚠️ Директория сессий пуста`)
	return []
}

// Получение или создание клиента
export const getOrCreateClient = (companyId: string): Client => {
	console.log(
		`[${new Date().toISOString()}] 🔄 Создание/получение клиента для компании ${companyId}`
	)

	// Проверяем наличие сессии для этой компании
	const sessionPath = path.join(sessionsDir, `session-company-${companyId}`)
	const hasSession = fs.existsSync(sessionPath)
	console.log(
		`[${new Date().toISOString()}] 🔍 Проверка сессии для компании ${companyId}:`,
		hasSession ? 'найдена' : 'не найдена'
	)

	// Создаем директорию для сессий только если она не существует
	if (!fs.existsSync(sessionsDir)) {
		fs.mkdirSync(sessionsDir, { recursive: true })
		console.log(
			`[${new Date().toISOString()}] 📁 Создана директория для сессий: ${sessionsDir}`
		)
	}

	// Если это админский клиент, используем существующую сессию
	const clientId =
		companyId === 'admin' ? 'admin' : `session-company-${companyId}`
	console.log(
		`[${new Date().toISOString()}] 🔑 Используем clientId: ${clientId}`
	)

	const client = new Client({
		authStrategy: new LocalAuth({
			clientId: clientId,
			dataPath: sessionsDir,
		}),
		puppeteer: {
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
				'--disable-site-isolation-trials',
			],
		},
	})

	// Добавляем обработчик аутентификации
	client.on('authenticated', () => {
		console.log(
			`[${new Date().toISOString()}] ✅ Клиент аутентифицирован для ${clientId}`
		)
		console.log(
			`[${new Date().toISOString()}] 📁 Путь к сессии:`,
			path.join(sessionsDir, clientId)
		)
	})

	// Функция для добавления обработчиков сообщений
	const addMessageHandlers = () => {
		console.log(
			`[${new Date().toISOString()}] 🔄 Добавление обработчиков сообщений для компании ${companyId}`
		)

		// Удаляем старые обработчики, если они есть
		client.removeAllListeners('message')
		client.removeAllListeners('message_create')

		// Добавляем обработчики сообщений
		client.on('message', async message => {
			console.log(`[${new Date().toISOString()}] 📥 Входящее сообщение:`, {
				from: message.from,
				to: message.to,
				body: message.body,
				fromMe: message.fromMe,
				type: message.type,
				isForwarded: message.isForwarded,
				isStatus: message.isStatus,
				hasMedia: message.hasMedia,
				timestamp: message.timestamp,
			})
			try {
				await messageMonitor.handleMessage(message)
			} catch (error) {
				console.error(
					`[${new Date().toISOString()}] ❌ Ошибка при обработке входящего сообщения:`,
					error
				)
			}
		})

		client.on('message_create', async message => {
			console.log(`[${new Date().toISOString()}] 📤 Создание сообщения:`, {
				from: message.from,
				to: message.to,
				body: message.body,
				fromMe: message.fromMe,
				type: message.type,
				isForwarded: message.isForwarded,
				isStatus: message.isStatus,
				hasMedia: message.hasMedia,
				timestamp: message.timestamp,
			})

			try {
				// Проверяем все возможные признаки исходящего сообщения
				console.log(
					`[${new Date().toISOString()}] 🔍 Проверка условий для исходящего сообщения:`,
					{
						fromMe: message.fromMe,
						isForwarded: message.isForwarded,
						isStatus: message.isStatus,
						hasTo: !!message.to,
						messageType: message.type,
					}
				)

				if (
					message.fromMe ||
					message.isForwarded ||
					message.isStatus ||
					message.to
				) {
					console.log(
						`[${new Date().toISOString()}] 👤 Определено как исходящее сообщение`
					)
					await messageMonitor.handleOutgoingMessage(message)
				} else {
					console.log(
						`[${new Date().toISOString()}] ⚠️ Сообщение не определено как исходящее`
					)
				}
			} catch (error) {
				console.error(
					`[${new Date().toISOString()}] ❌ Ошибка при обработке исходящего сообщения:`,
					error
				)
			}
		})
	}

	// Добавляем обработчики при создании клиента
	addMessageHandlers()

	// Добавляем обработчик переподключения
	client.on('disconnected', () => {
		console.log(
			`[${new Date().toISOString()}] ⚠️ Клиент отключен, попытка переподключения...`
		)
	})

	client.on('ready', () => {
		console.log(`[${new Date().toISOString()}] ✅ Клиент готов к работе`)
		console.log(`[${new Date().toISOString()}] 📱 Информация о клиенте:`, {
			wid: client.info?.wid,
			platform: client.info?.platform,
			pushname: client.info?.pushname,
		})
		addMessageHandlers() // Переподключаем обработчики при готовности клиента
	})

	// Добавляем обработчик ошибок
	client.on('auth_failure', error => {
		console.error(
			`[${new Date().toISOString()}] ❌ Ошибка аутентификации:`,
			error
		)
	})

	client.on('change_state', state => {
		console.log(
			`[${new Date().toISOString()}] 🔄 Изменение состояния клиента:`,
			state
		)
	})

	return client
}

// Экспорт функций
// export { sendVerificationCode } // УДАЛЕНО: админская сессия отключена

// Функция для отправки статуса через WebSocket
const emitQRStatus = (
	userId: string,
	status: string,
	message?: string,
	io?: any
) => {
	if (!io) {
		console.error('[QR-DEBUG] WebSocket не инициализирован в emitQRStatus')
		return
	}

	try {
		console.log('[QR-DEBUG] Отправка статуса через WebSocket:', {
			userId,
			status,
			message,
			timestamp: new Date().toISOString(),
		})

		io.emit(`whatsapp:qr_status:${userId}`, {
			status,
			message,
		})
	} catch (error) {
		console.error(
			'[QR-DEBUG] Ошибка при отправке статуса через WebSocket:',
			error
		)
	}
}

// Функция для получения socketId по userId
const getSocketIdByUserId = (io: any, userId: string): string | null => {
	const sockets = io.sockets.sockets
	for (const [socketId, socket] of sockets) {
		if (socket.data.user?.id === userId) {
			return socketId
		}
	}
	return null
}

// Функция для генерации QR-кода пользователя
export const generateUserQR = async (
	userId: string,
	io: any,
	companyId: string
): Promise<{ client: Client | undefined; qr: string }> => {
	return new Promise(async (resolve, reject) => {
		console.log(
			`[${new Date().toISOString()}] 🔄 Начало generateUserQR для пользователя ${userId} и компании ${companyId}`
		)

		const settings = await CompanySettings.findOne({
			userId,
			_id: new Types.ObjectId(companyId),
			whatsappAuthorized: true,
			isRunning: true,
		})

		if (settings) {
			console.log(
				`[${new Date().toISOString()}] ✅ Найдены настройки компании, клиент уже авторизован`
			)
			io.emit(`user:${userId}:ready`, {
				status: 'ready',
				message: 'WhatsApp клиент готов к работе',
				timestamp: new Date().toISOString(),
				whatsappAuthorized: true,
				companyId,
			})
			return
		}

		try {
			console.log(
				`[${new Date().toISOString()}] 🔄 Создание нового клиента для компании ${companyId}`
			)
			const client = getOrCreateClient(companyId)

			// Добавляем обработчики сообщений сразу после создания клиента
			console.log(
				`[${new Date().toISOString()}] 🔄 Добавление обработчиков сообщений для нового клиента`
			)
			client.on('message', async message => {
				console.log(`[${new Date().toISOString()}] 📥 Входящее сообщение:`, {
					from: message.from,
					to: message.to,
					body: message.body,
					fromMe: message.fromMe,
					type: message.type,
					isForwarded: message.isForwarded,
					isStatus: message.isStatus,
					hasMedia: message.hasMedia,
					timestamp: message.timestamp,
				})
				try {
					await messageMonitor.handleMessage(message)
				} catch (error) {
					console.error(
						`[${new Date().toISOString()}] ❌ Ошибка при обработке входящего сообщения:`,
						error
					)
				}
			})

			// Clear any existing QR timer for this user
			if (qrTimers.has(userId)) {
				clearTimeout(qrTimers.get(userId))
				qrTimers.delete(userId)
			}

			// Set a longer timeout (5 minutes instead of default)
			const qrTimeout = setTimeout(() => {
				console.log('[QR-DEBUG] QR код устарел. Перезапуск клиента...')
				client.destroy().then(() => {
					emitQRStatus(
						userId,
						'error',
						'QR код устарел. Пожалуйста, обновите страницу для получения нового кода.',
						io
					)
				})
			}, 300000) // 5 minutes in milliseconds

			qrTimers.set(userId, qrTimeout)

			await CompanySettings.findOneAndUpdate(
				{
					userId,
					_id: new Types.ObjectId(companyId),
				},
				{ isRunning: true },
				{ new: true }
			)

			qrStatus[userId] = 'pending'
			emitQRStatus(
				userId,
				'pending',
				'Генерация QR-кода. У вас есть 5 минут на сканирование. QR-код будет обновляться каждые 20-30 секунд.',
				io
			)

			// Добавляем обработчик события 'qr' до инициализации
			const qrHandler = async (qr: string) => {
				console.log('[QR-DEBUG] Получено событие QR для пользователя:', userId)
				try {
					console.log('[QR-DEBUG] Начало генерации QR-кода в формате base64')

					await CompanySettings.findOneAndUpdate(
						{
							userId,
							_id: new Types.ObjectId(companyId),
							phoneNumber: null,
						},
						{ whatsappAuthorized: false },
						{ new: true }
					)
						.then(() => {
							console.log(
								`[QR-DEBUG] Статус WhatsApp обновлен на pending для пользователя ${userId} и компании ${companyId}`
							)
						})
						.catch((error: Error) => {
							console.error(
								`[QR-DEBUG] Ошибка при обновлении статуса WhatsApp:`,
								error
							)
						})

					// Генерируем QR-код сразу в формате data:image/png;base64
					const qrCode = await qrcode.toDataURL(qr, {
						type: 'image/png',
						margin: 1,
						width: 300, // Increased size for better scanning
						color: {
							dark: '#000000',
							light: '#ffffff',
						},
					})

					console.log('[QR-DEBUG] QR-код сгенерирован, длина:', qrCode.length)

					// Отправляем QR-код через WebSocket с информацией об обновлении
					try {
						console.log('[QR-DEBUG] Попытка отправки QR-кода через WebSocket')
						io.emit(`user:qr:${userId}`, {
							qr: qrCode,
							message:
								'Новый QR-код сгенерирован. У вас есть 20-30 секунд до следующего обновления.',
							timestamp: new Date().toISOString(),
						})
						console.log('[QR-DEBUG] QR-код успешно отправлен через WebSocket')
					} catch (error) {
						console.error(
							'[QR-DEBUG] Ошибка при отправке QR-кода через WebSocket:',
							error
						)
						throw error
					}

					return { client, qr: qrCode }
				} catch (err) {
					console.error('[QR-DEBUG] Ошибка при генерации QR-кода:', err)
					throw err
				}
			}

			// Добавляем обработчик события 'qr'
			client.on('qr', qrHandler)

			// Добавляем обработчики других событий
			client.on('authenticated', () => {
				console.log(
					'[QR-DEBUG] Клиент аутентифицирован для пользователя:',
					userId
				)
				qrStatus[userId] = 'scanned'
				emitQRStatus(userId, 'scanned', 'QR-код успешно отсканирован', io)

				// Получаем socketId пользователя
				const socketId = getSocketIdByUserId(io, userId)

				// Отправляем событие только этому пользователю
				// if (socketId) {
				io.emit(`user:${userId}:scanned`, {
					status: 'scanned',
					message: 'QR-код успешно отсканирован',
					timestamp: new Date().toISOString(),
				})
				// } else {
				//   console.error('[QR-DEBUG] Не найден socketId для userId:', userId);
				// }
			})

			client.on('ready', async () => {
				console.log('[QR-DEBUG] Клиент готов для пользователя:', userId)
				qrStatus[userId] = 'ready'
				emitQRStatus(userId, 'ready', 'WhatsApp клиент готов к работе', io)

				// Обновляем статус авторизации в БД
				await CompanySettings.findOneAndUpdate(
					{
						userId,
						_id: new Types.ObjectId(companyId),
						// phoneNumber: null
					},
					{
						whatsappAuthorized: true,
						phoneNumber: client.info.wid._serialized
							.replace('@c.us', '')
							.replace('+', '')
							.replace(/\D/g, ''),
					},
					{ new: true }
				)
					.then(() => {
						console.log(
							`[QR-DEBUG] Статус WhatsApp обновлен на active для пользователя ${userId} и компании ${companyId}`
						)
					})
					.catch((error: Error) => {
						console.error(
							`[QR-DEBUG] Ошибка при обновлении статуса WhatsApp:`,
							error
						)
					})

				// Получаем socketId пользователя
				// const socketId = getSocketIdByUserId(io, userId);

				// Отправляем событие только этому пользователю
				// if (socketId) {
				io.emit(`user:${userId}:ready`, {
					status: 'ready',
					message: 'WhatsApp клиент готов к работе',
					timestamp: new Date().toISOString(),
					whatsappAuthorized: true,
					companyId,
					phoneNumber: client.info.wid._serialized
						.replace('@c.us', '')
						.replace('+', '')
						.replace(/\D/g, ''),
				})
				// } else {
				//   console.error('[QR-DEBUG] Не найден socketId для userId:', userId);
				// }
				resolve({ client, qr: '' })
			})

			// Инициализируем клиент
			console.log('[QR-DEBUG] Начало инициализации клиента')
			client.initialize().catch(err => {
				console.error('[QR-DEBUG] Ошибка при инициализации клиента:', err)
				reject(err)
			})

			return { client, qr: '' }
		} catch (error) {
			console.error('[QR-DEBUG] Ошибка в generateUserQR:', error)
			reject(error)
		}
	})
}

// Функция для обработки сканирования QR-кода
export const handleQRScanned = async (
	userId: string,
	io: any
): Promise<void> => {
	try {
		console.log(
			`[${new Date().toISOString()}] Обработка сканирования QR-кода для пользователя ${userId}`
		)

		if (!io) {
			throw new Error('WebSocket не инициализирован')
		}

		// Обновляем статус
		qrStatus[userId] = 'scanned'
		emitQRStatus(userId, 'scanned', 'QR-код успешно отсканирован', io)

		// Очищаем таймер перегенерации, если он есть
		if (qrTimers.has(userId)) {
			clearTimeout(qrTimers.get(userId))
			qrTimers.delete(userId)
		}
	} catch (error) {
		console.error(
			`[${new Date().toISOString()}] Ошибка при обработке сканирования QR-кода:`,
			error
		)
		emitQRStatus(
			userId,
			'error',
			'Ошибка при обработке сканирования QR-кода',
			io
		)
	}
}

export const initWhatsappClients = async (io: any) => {
	try {
		console.log(
			`[${new Date().toISOString()}] 🔄 Начало инициализации существующих WhatsApp клиентов`
		)

		// Проверяем наличие сессий перед инициализацией
		const sessions = checkSessions()
		console.log(
			`[${new Date().toISOString()}] 📊 Найдено ${sessions.length} сессий:`,
			sessions
		)

		const companies = await CompanySettings.find({ whatsappAuthorized: true })
		console.log(
			`[${new Date().toISOString()}] 📊 Найдено ${
				companies.length
			} авторизованных компаний`
		)

		for (const company of companies) {
			console.log(
				`[${new Date().toISOString()}] 🔄 Инициализация клиента для компании ${
					company._id
				}`
			)
			const client = getOrCreateClient(company._id.toString())

			// Добавляем обработчики сообщений
			console.log(
				`[${new Date().toISOString()}] 🔄 Добавление обработчиков сообщений для компании ${
					company._id
				}`
			)

			// Удаляем старые обработчики, если они есть
			client.removeAllListeners('message')
			client.removeAllListeners('message_create')

			// Добавляем обработчик входящих сообщений
			client.on('message', async message => {
				console.log(
					`[${new Date().toISOString()}] 📥 Входящее сообщение для компании ${
						company._id
					}:`,
					{
						from: message.from,
						to: message.to,
						body: message.body,
						fromMe: message.fromMe,
						type: message.type,
						isForwarded: message.isForwarded,
						isStatus: message.isStatus,
						hasMedia: message.hasMedia,
						timestamp: message.timestamp,
					}
				)
				try {
					await messageMonitor.handleMessage(message)
				} catch (error) {
					console.error(
						`[${new Date().toISOString()}] ❌ Ошибка при обработке входящего сообщения:`,
						error
					)
				}
			})

			// Добавляем обработчик исходящих сообщений
			client.on('message_create', async message => {
				console.log(
					`[${new Date().toISOString()}] 📤 Создание сообщения для компании ${
						company._id
					}:`,
					{
						from: message.from,
						to: message.to,
						body: message.body,
						fromMe: message.fromMe,
						type: message.type,
						isForwarded: message.isForwarded,
						isStatus: message.isStatus,
						hasMedia: message.hasMedia,
						timestamp: message.timestamp,
					}
				)

				try {
					// Проверяем все возможные признаки исходящего сообщения
					console.log(
						`[${new Date().toISOString()}] 🔍 Проверка условий для исходящего сообщения:`,
						{
							fromMe: message.fromMe,
							isForwarded: message.isForwarded,
							isStatus: message.isStatus,
							hasTo: !!message.to,
							messageType: message.type,
						}
					)

					if (
						message.fromMe ||
						message.isForwarded ||
						message.isStatus ||
						message.to
					) {
						console.log(
							`[${new Date().toISOString()}] 👤 Определено как исходящее сообщение`
						)
						await messageMonitor.handleOutgoingMessage(message)
					} else {
						console.log(
							`[${new Date().toISOString()}] ⚠️ Сообщение не определено как исходящее`
						)
					}
				} catch (error) {
					console.error(
						`[${new Date().toISOString()}] ❌ Ошибка при обработке исходящего сообщения:`,
						error
					)
				}
			})

			// Добавляем обработчик состояния клиента
			client.on('change_state', state => {
				console.log(
					`[${new Date().toISOString()}] 🔄 Изменение состояния клиента для компании ${
						company._id
					}:`,
					state
				)
			})

			// Добавляем обработчик готовности
			client.on('ready', () => {
				console.log(
					`[${new Date().toISOString()}] ✅ Клиент готов к работе для компании ${
						company._id
					}`
				)
				console.log(`[${new Date().toISOString()}] 📱 Информация о клиенте:`, {
					wid: client.info?.wid,
					platform: client.info?.platform,
					pushname: client.info?.pushname,
				})
			})

			// Добавляем обработчик аутентификации
			client.on('authenticated', () => {
				console.log(
					`[${new Date().toISOString()}] ✅ Клиент аутентифицирован для компании ${
						company._id
					}`
				)
				console.log(
					`[${new Date().toISOString()}] 📁 Путь к сессии:`,
					path.join(sessionsDir, `session-company-${company._id}`)
				)
			})

			// Добавляем обработчик ошибок аутентификации
			client.on('auth_failure', error => {
				console.error(
					`[${new Date().toISOString()}] ❌ Ошибка аутентификации для компании ${
						company._id
					}:`,
					error
				)
			})

			// Инициализируем клиент
			console.log(
				`[${new Date().toISOString()}] 🔄 Начало инициализации клиента для компании ${
					company._id
				}`
			)
			try {
				await client.initialize()
				console.log(
					`[${new Date().toISOString()}] ✅ Клиент успешно инициализирован для компании ${
						company._id
					}`
				)
			} catch (error) {
				console.error(
					`[${new Date().toISOString()}] ❌ Ошибка при инициализации клиента для компании ${
						company._id
					}:`,
					error
				)
			}
		}
	} catch (error) {
		console.error(
			`[${new Date().toISOString()}] ❌ Ошибка при инициализации WhatsApp клиентов:`,
			error
		)
	}
}

// Функция для инициализации WhatsApp клиента
export const initWhatsAppClient = (io: any) => {
	// Обработчик для получения статуса сканирования от фронтенда
	io.on('connection', (socket: Socket) => {
		console.log(
			`[${new Date().toISOString()}] Новое WebSocket подключение:`,
			socket.id
		)

		socket.on('user:qr_scanned', (data: { userId: string }) => {
			const { userId } = data
			console.log(
				`[${new Date().toISOString()}] Получено событие сканирования QR-кода для пользователя ${userId}`
			)
			handleQRScanned(userId, io)
		})

		socket.on('disconnect', () => {
			console.log(
				`[${new Date().toISOString()}] WebSocket отключен:`,
				socket.id
			)
		})
	})
}
