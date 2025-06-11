import { Client, LocalAuth } from 'whatsapp-web.js'
import qrcode from 'qrcode'
import qrcodeTerminal from 'qrcode-terminal'
import path from 'path'
import fs from 'fs'
import { io } from '../server'
import { UserModel } from '../models/User'
import { WhatsAppAccountModel } from '../models/WhatsAppAccount'
import { CompanySettings } from '../models/CompanySettings'
import { TelegramService } from '../telegram/TelegramService'
import { MessageMonitor } from './messageMonitor'

const ADMIN_ID = 'admin'
const SESSION_DIR = path.join(process.cwd(), '.wwebjs_auth', 'Default')
const SESSION_SUBDIRS = [
	'Local Storage',
	'Service Worker',
	'Session Storage',
	'Web Storage',
	'IndexedDB',
	'Cache',
	'GPUCache',
	'Code Cache',
]
let adminClient: Client | null = null
let isClientReady = false

const telegramService = TelegramService.getInstance()
const messageMonitor = MessageMonitor.getInstance()
const activeTimers = new Map<string, NodeJS.Timeout>()

interface SessionData {
	WABrowserId?: string
	WASecretBundle?: string
	WAToken1?: string
	WAToken2?: string
}

// Проверка существующей сессии
const checkExistingSession = (): boolean => {
	try {
		if (fs.existsSync(SESSION_DIR)) {
			// Проверяем наличие всех необходимых поддиректорий
			const hasAllSubdirs = SESSION_SUBDIRS.every(subdir =>
				fs.existsSync(path.join(SESSION_DIR, subdir))
			)

			if (!hasAllSubdirs) {
				console.log('Отсутствуют некоторые поддиректории сессии')
				return false
			}

			// Проверяем наличие файлов в Local Storage
			const localStorageDir = path.join(SESSION_DIR, 'Local Storage')
			if (fs.existsSync(localStorageDir)) {
				const files = fs.readdirSync(localStorageDir)
				const hasRequiredFiles = files.some(
					file =>
						file.includes('leveldb') ||
						file.includes('000003.log') ||
						file.includes('CURRENT') ||
						file.includes('LOCK') ||
						file.includes('LOG')
				)
				return hasRequiredFiles
			}
			return false
		}
		return false
	} catch (error) {
		console.error('Ошибка при проверке сессии:', error)
		return false
	}
}

// Сохранение сессии
const saveSession = async (sessionData: any): Promise<void> => {
	try {
		// Создаем основную директорию сессии
		if (!fs.existsSync(SESSION_DIR)) {
			fs.mkdirSync(SESSION_DIR, { recursive: true })
		}

		// Создаем все необходимые поддиректории
		for (const subdir of SESSION_SUBDIRS) {
			const subdirPath = path.join(SESSION_DIR, subdir)
			if (!fs.existsSync(subdirPath)) {
				fs.mkdirSync(subdirPath, { recursive: true })
			}
		}

		// Сохраняем данные сессии в соответствующие директории
		if (sessionData.localStorage) {
			const localStorageDir = path.join(SESSION_DIR, 'Local Storage')
			for (const [key, value] of Object.entries(sessionData.localStorage)) {
				const filePath = path.join(localStorageDir, key)
				fs.writeFileSync(filePath, value as string)
			}
		}

		if (sessionData.serviceWorker) {
			const serviceWorkerDir = path.join(SESSION_DIR, 'Service Worker')
			for (const [key, value] of Object.entries(sessionData.serviceWorker)) {
				const filePath = path.join(serviceWorkerDir, key)
				fs.writeFileSync(filePath, value as string)
			}
		}

		// Аналогично для других типов хранилищ
		console.log('Сессия успешно сохранена во все необходимые директории')
	} catch (error) {
		console.error('Ошибка при сохранении сессии:', error)
	}
}

// Отправка кода пользователю через WhatsApp
export const sendVerificationCode = async (
	phoneNumber: string,
	code?: string
): Promise<boolean> => {
	try {
		console.log('=== Начало отправки кода через WhatsApp ===')
		console.log('Полученные параметры:', { phoneNumber, code })
		console.log('Статус клиента:', isClientReady)
		console.log(
			'Текущий админский клиент:',
			adminClient ? 'существует' : 'не существует'
		)

		// Проверяем валидность номера телефона
		const formattedNumber = phoneNumber.replace(/\D/g, '')
		console.log('Форматированный номер:', formattedNumber)
		if (formattedNumber.length < 10 || formattedNumber.length > 15) {
			console.log('Неверный формат номера телефона:', phoneNumber)
			return false
		}

		// Если клиент не готов, пробуем переподключиться
		if (!isClientReady || !adminClient) {
			console.log('Попытка переподключения клиента...')
			await initAdminClient()

			// Ждем некоторое время для инициализации
			await new Promise(resolve => setTimeout(resolve, 30000))

			if (!isClientReady || !adminClient) {
				console.log('Не удалось переподключить клиент')
				return false
			}
		}

		// Проверяем состояние сессии
		const sessionState = await adminClient?.getState()
		console.log('Состояние сессии WhatsApp:', sessionState)

		if (sessionState !== 'CONNECTED') {
			console.log('Сессия не активна, пробуем переподключиться...')
			await initAdminClient()
			await new Promise(resolve => setTimeout(resolve, 30000))

			const newSessionState = await adminClient?.getState()
			if (newSessionState !== 'CONNECTED') {
				console.log('Не удалось восстановить сессию')
				return false
			}
		}

		// Находим пользователя в базе только для проверки его существования
		const user = await UserModel.findOne({ phoneNumber })
		console.log('Проверка пользователя в базе:', user ? 'найден' : 'не найден')
		if (!user) {
			console.log(
				'Пользователь не найден в базе данных для номера:',
				phoneNumber
			)
			return false
		}

		// Проверяем, что код был передан
		if (!code) {
			console.log('Код подтверждения не передан')
			return false
		}
		console.log('Используем код для отправки:', code)

		// Проверяем, что код в базе совпадает с переданным
		if (user.verificationCode !== code) {
			console.log('Код в базе не совпадает с переданным:', {
				databaseCode: user.verificationCode,
				passedCode: code,
			})
			return false
		}

		// Форматируем номер телефона для WhatsApp
		const whatsappNumber = formattedNumber.endsWith('@c.us')
			? formattedNumber
			: `${formattedNumber}@c.us`
		console.log('Форматированный номер для WhatsApp:', whatsappNumber)

		console.log(`Попытка отправить код: ${code} на номер: ${whatsappNumber}`)

		// Функция для отправки сообщения с повторными попытками
		const sendMessageWithRetry = async (retries = 3): Promise<boolean> => {
			for (let attempt = 1; attempt <= retries; attempt++) {
				try {
					if (!adminClient) {
						console.log('Админский клиент не существует')
						return false
					}

					console.log(`Попытка ${attempt}/${retries} отправки сообщения...`)
					await adminClient.sendMessage(
						whatsappNumber,
						`Ваш код подтверждения: ${code}`
					)
					console.log(
						`Код успешно отправлен: ${code} на номер: ${whatsappNumber}`
					)

					io.emit('admin:verification_code', {
						code: code,
						timestamp: Date.now(),
						recipient: whatsappNumber,
					})

					return true
				} catch (error: any) {
					console.error(
						`Ошибка при отправке кода (попытка ${attempt}/${retries}):`,
						error
					)
					console.error('Детали ошибки:', error.message)

					// Если ошибка связана с сессией, пробуем переподключиться
					if (
						error.message.includes('Session closed') ||
						error.message.includes('Connection closed')
					) {
						console.log('Обнаружена ошибка сессии, пробуем переподключиться...')
						await initAdminClient()
						await new Promise(resolve => setTimeout(resolve, 30000))

						// Проверяем состояние сессии после переподключения
						const newSessionState = await adminClient?.getState()
						if (newSessionState !== 'CONNECTED') {
							console.log(
								'Не удалось восстановить сессию после переподключения'
							)
							continue
						}
					}

					// Ждем перед следующей попыткой
					if (attempt < retries) {
						await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
					}
				}
			}
			return false
		}

		const result = await sendMessageWithRetry()
		console.log('=== Результат отправки кода ===')
		console.log('Успешно отправлено:', result)
		return result
	} catch (error: any) {
		console.error('Ошибка при отправке кода:', error)
		console.error('Детали ошибки:', error.message)
		return false
	}
}

// Инициализация админского клиента
export const initAdminClient = async (): Promise<void> => {
	try {
		console.log('Начало инициализации админского клиента')

		// Проверяем наличие существующей сессии
		const hasExistingSession = checkExistingSession()
		console.log('Наличие существующей сессии:', hasExistingSession)

		// Если клиент уже существует и готов, не инициализируем заново
		if (adminClient && isClientReady) {
			console.log('Админский клиент уже инициализирован и готов к работе')
			return
		}

		// Создаем директорию для сессии только если её нет
		if (!fs.existsSync(SESSION_DIR)) {
			fs.mkdirSync(SESSION_DIR, { recursive: true })
			console.log('Создана директория для админской сессии:', SESSION_DIR)
		}

		adminClient = new Client({
			authStrategy: new LocalAuth({
				clientId: ADMIN_ID,
				dataPath: path.join(process.cwd(), '.wwebjs_auth'),
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

		console.log('client:', adminClient)

		adminClient.on('qr', async (qr: string) => {
			try {
				console.log('Получен QR-код для админа')

				// Выводим QR-код в консоль только если нет существующей сессии
				if (!hasExistingSession) {
					console.log('\n=== АДМИНСКИЙ QR-КОД ===')
					console.log(
						'Отсканируйте этот QR-код для подключения админского аккаунта'
					)
					qrcodeTerminal.generate(qr, { small: true })
					console.log('========================\n')
				}
			} catch (error: any) {
				console.error('Ошибка при генерации админского QR-кода:', error)
			}
		})

		adminClient.on('ready', () => {
			console.log('Админский клиент готов к использованию')
			isClientReady = true
			io.emit('admin:ready', {
				status: 'ready',
				timestamp: Date.now(),
			})
		})

		adminClient.on('authenticated', () => {
			console.log('Админский клиент успешно аутентифицирован')

			// Проверяем наличие всех необходимых директорий и файлов сессии
			if (fs.existsSync(SESSION_DIR)) {
				try {
					const hasAllSubdirs = SESSION_SUBDIRS.every(subdir =>
						fs.existsSync(path.join(SESSION_DIR, subdir))
					)

					if (hasAllSubdirs) {
						console.log('Все директории сессии успешно созданы')

						// Проверяем наличие файлов в Local Storage
						const localStorageDir = path.join(SESSION_DIR, 'Local Storage')
						if (fs.existsSync(localStorageDir)) {
							const files = fs.readdirSync(localStorageDir)
							const hasRequiredFiles = files.some(
								file =>
									file.includes('leveldb') ||
									file.includes('000003.log') ||
									file.includes('CURRENT') ||
									file.includes('LOCK') ||
									file.includes('LOG')
							)

							if (hasRequiredFiles) {
								console.log('Сессия админа успешно сохранена')
							} else {
								console.error('В Local Storage отсутствуют необходимые файлы')
							}
						}
					} else {
						console.error('Отсутствуют некоторые директории сессии')
					}
				} catch (error) {
					console.error('Ошибка при проверке директорий сессии:', error)
				}
			}
		})

		adminClient.on('auth_failure', msg => {
			console.error('Ошибка аутентификации админского клиента:', msg)
			// При ошибке аутентификации удаляем все директории сессии
			if (fs.existsSync(SESSION_DIR)) {
				try {
					// Удаляем все поддиректории
					for (const subdir of SESSION_SUBDIRS) {
						const subdirPath = path.join(SESSION_DIR, subdir)
						if (fs.existsSync(subdirPath)) {
							fs.rmSync(subdirPath, { recursive: true, force: true })
						}
					}
					console.log(
						'Все директории сессии удалены из-за ошибки аутентификации'
					)
				} catch (error) {
					console.error('Ошибка при удалении директорий сессии:', error)
				}
			}
		})

		adminClient.on('disconnected', reason => {
			console.log('Админский клиент отключен:', reason)
			isClientReady = false

			// Сохраняем сессию только при нормальном отключении
			if (reason === 'LOGOUT') {
				console.log('Нормальное отключение, сессия сохранена')
			} else {
				// При неожиданном отключении удаляем все директории сессии
				if (fs.existsSync(SESSION_DIR)) {
					try {
						// Удаляем все поддиректории
						for (const subdir of SESSION_SUBDIRS) {
							const subdirPath = path.join(SESSION_DIR, subdir)
							if (fs.existsSync(subdirPath)) {
								fs.rmSync(subdirPath, { recursive: true, force: true })
							}
						}
						console.log(
							'Все директории сессии удалены из-за неожиданного отключения'
						)
					} catch (error) {
						console.error('Ошибка при удалении директорий сессии:', error)
					}
				}
			}
		})

		adminClient.on('message', async message => {
			await messageMonitor.handleAdminMessage(message)
		})

		// Исходящие
		// adminClient.on('message_create', async (message) => {
		//   if (message.fromMe) {
		//     await messageMonitor.handleOutgoingMessage(message);
		//   }
		// });

		// Инициализируем клиент
		console.log('Инициализация админского клиента...')
		await adminClient.initialize()
		console.log('Админский клиент инициализирован')

		// Проверяем состояние сессии после инициализации
		if (checkExistingSession()) {
			console.log('Сессия успешно восстановлена')
		} else {
			console.log('Ожидание сканирования QR-кода для создания новой сессии')
		}
	} catch (error) {
		console.error('Ошибка при инициализации админского клиента:', error)
		throw error
	}
}

// Добавляем функцию для автоматической инициализации админского клиента
export const initializeAdminClient = async (): Promise<void> => {
	try {
		console.log(
			'[ADMIN] Начало автоматической инициализации админского клиента'
		)

		// Проверяем наличие существующей сессии
		const hasExistingSession = checkExistingSession()
		console.log('[ADMIN] Наличие существующей сессии:', hasExistingSession)

		// Если клиент уже существует и готов, не инициализируем заново
		if (adminClient && isClientReady) {
			console.log(
				'[ADMIN] Админский клиент уже инициализирован и готов к работе'
			)
			return
		}

		// Если клиент существует, но не готов, уничтожаем его
		if (adminClient) {
			console.log('[ADMIN] Уничтожаем существующий клиент...')
			await adminClient.destroy()
			adminClient = null
			isClientReady = false
		}

		// Создаем директорию для сессии только если её нет
		if (!fs.existsSync(SESSION_DIR)) {
			fs.mkdirSync(SESSION_DIR, { recursive: true })
			console.log(
				'[ADMIN] Создана директория для админской сессии:',
				SESSION_DIR
			)
		}

		// Создаем новый клиент
		console.log('[ADMIN] Создаем новый клиент')
		adminClient = new Client({
			authStrategy: new LocalAuth({
				clientId: ADMIN_ID,
				dataPath: path.join(process.cwd(), '.wwebjs_auth'),
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

		// Добавляем обработчики событий
		adminClient.on('qr', async (qr: string) => {
			try {
				console.log('[ADMIN] Получен QR-код для админа')
				console.log('\n=== АДМИНСКИЙ QR-КОД ===')
				console.log(
					'Отсканируйте этот QR-код для подключения админского аккаунта'
				)
				qrcodeTerminal.generate(qr, { small: true })
				console.log('========================\n')

				// Отправляем QR-код через сокет
				io.emit('admin:qr', { qr })
			} catch (error: any) {
				console.error('[ADMIN] Ошибка при генерации админского QR-кода:', error)
			}
		})

		adminClient.on('ready', () => {
			console.log('[ADMIN] Админский клиент готов к использованию')
			isClientReady = true
			io.emit('admin:ready', {
				status: 'ready',
				timestamp: Date.now(),
			})
		})

		// Инициализируем клиент с повторными попытками
		let attempts = 0
		const maxAttempts = 3

		while (attempts < maxAttempts) {
			try {
				attempts++
				console.log(
					`[ADMIN] Попытка инициализации клиента ${attempts}/${maxAttempts}...`
				)
				await adminClient.initialize()
				console.log('[ADMIN] Админский клиент успешно инициализирован')
				break
			} catch (error) {
				console.error(
					`[ADMIN] Ошибка при инициализации клиента (попытка ${attempts}/${maxAttempts}):`,
					error
				)
				if (attempts === maxAttempts) {
					throw error
				}
				// Ждем перед следующей попыткой
				await new Promise(resolve => setTimeout(resolve, 5000))
			}
		}
	} catch (error) {
		console.error(
			'[ADMIN] Критическая ошибка при инициализации админского клиента:',
			error
		)
		throw error
	}
}
