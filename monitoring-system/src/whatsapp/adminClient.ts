// АДМИНСКАЯ СЕССИЯ ОТКЛЮЧЕНА - ПЕРЕМЕЩЕНО В SC-API
// import { Client, LocalAuth } from 'whatsapp-web.js'
// import qrcode from 'qrcode'
// import qrcodeTerminal from 'qrcode-terminal'
// import path from 'path'
// import fs from 'fs'
// import { io } from '../server'
// import { UserModel } from '../models/User'
// import { WhatsAppAccountModel } from '../models/WhatsAppAccount'
// import { CompanySettings } from '../models/CompanySettings'
// import { TelegramService } from '../telegram/telegramClient'
// import { MessageMonitor } from './messageMonitor'

// const ADMIN_ID = 'admin'
// const SESSION_DIR = path.join(process.cwd(), '.wwebjs_auth', 'Default')
// const SESSION_SUBDIRS = [
// 	'Local Storage',
// 	'Service Worker',
// 	'Session Storage',
// 	'Web Storage',
// 	'IndexedDB',
// 	'Cache',
// 	'GPUCache',
// 	'Code Cache',
// ]
// let adminClient: Client | null = null
// let isClientReady = false

// const telegramService = TelegramService.getInstance()
// const messageMonitor = MessageMonitor.getInstance()
// const activeTimers = new Map<string, NodeJS.Timeout>()

// interface SessionData {
// 	WABrowserId?: string
// 	WASecretBundle?: string
// 	WAToken1?: string
// 	WAToken2?: string
// }

// // Проверка существующей сессии
// const checkExistingSession = (): boolean => {
// 	try {
// 		if (fs.existsSync(SESSION_DIR)) {
// 			// Проверяем наличие всех необходимых поддиректорий
// 			const hasAllSubdirs = SESSION_SUBDIRS.every(subdir =>
// 				fs.existsSync(path.join(SESSION_DIR, subdir))
// 			)

// 			if (!hasAllSubdirs) {
// 				console.log('Отсутствуют некоторые поддиректории сессии')
// 				return false
// 			}

// 			// Проверяем наличие файлов в Local Storage
// 			const localStorageDir = path.join(SESSION_DIR, 'Local Storage')
// 			if (fs.existsSync(localStorageDir)) {
// 				const files = fs.readdirSync(localStorageDir)
// 				const hasRequiredFiles = files.some(
// 					file =>
// 						file.includes('leveldb') ||
// 						file.includes('000003.log') ||
// 						file.includes('CURRENT') ||
// 						file.includes('LOCK') ||
// 						file.includes('LOG')
// 				)
// 				return hasRequiredFiles
// 			}
// 			return false
// 		}
// 		return false
// 	} catch (error) {
// 		console.error('Ошибка при проверке сессии:', error)
// 		return false
// 	}
// }

// // Сохранение сессии
// const saveSession = async (sessionData: any): Promise<void> => {
// 	try {
// 		// Создаем основную директорию сессии
// 		if (!fs.existsSync(SESSION_DIR)) {
// 			fs.mkdirSync(SESSION_DIR, { recursive: true })
// 		}

// 		// Создаем все необходимые поддиректории
// 		for (const subdir of SESSION_SUBDIRS) {
// 			const subdirPath = path.join(SESSION_DIR, subdir)
// 			if (!fs.existsSync(subdirPath)) {
// 				fs.mkdirSync(subdirPath, { recursive: true })
// 			}
// 		}

// 		// Сохраняем данные сессии в соответствующие директории
// 		if (sessionData.localStorage) {
// 			const localStorageDir = path.join(SESSION_DIR, 'Local Storage')
// 			for (const [key, value] of Object.entries(sessionData.localStorage)) {
// 				const filePath = path.join(localStorageDir, key)
// 				fs.writeFileSync(filePath, value as string)
// 			}
// 		}

// 		if (sessionData.serviceWorker) {
// 			const serviceWorkerDir = path.join(SESSION_DIR, 'Service Worker')
// 			for (const [key, value] of Object.entries(sessionData.serviceWorker)) {
// 				const filePath = path.join(serviceWorkerDir, key)
// 				fs.writeFileSync(filePath, value as string)
// 			}
// 		}

// 		// Аналогично для других типов хранилищ
// 		console.log('Сессия успешно сохранена во все необходимые директории')
// 	} catch (error) {
// 		console.error('Ошибка при сохранении сессии:', error)
// 	}
// }

// // Инициализация админского клиента
// export const initAdminClient = async (): Promise<void> => {
// 	try {
// 		console.log('Начало инициализации админского клиента')

// 		// Проверяем наличие существующей сессии
// 		const hasExistingSession = checkExistingSession()
// 		console.log('Наличие существующей сессии:', hasExistingSession)

// 		// Если клиент уже существует и готов, не инициализируем заново
// 		if (adminClient && isClientReady) {
// 			console.log('Админский клиент уже инициализирован и готов к работе')
// 			return
// 		}

// 		// Создаем директорию для сессии только если её нет
// 		if (!fs.existsSync(SESSION_DIR)) {
// 			fs.mkdirSync(SESSION_DIR, { recursive: true })
// 			console.log('Создана директория для админской сессии:', SESSION_DIR)
// 		}

// 		adminClient = new Client({
// 			authStrategy: new LocalAuth({
// 				clientId: ADMIN_ID,
// 				dataPath: path.join(process.cwd(), '.wwebjs_auth'),
// 			}),
// 			puppeteer: {
// 				args: [
// 					'--no-sandbox',
// 					'--disable-setuid-sandbox',
// 					'--disable-dev-shm-usage',
// 					'--disable-accelerated-2d-canvas',
// 					'--no-first-run',
// 					'--no-zygote',
// 					'--disable-gpu',
// 					'--disable-extensions',
// 					'--disable-software-rasterizer',
// 					'--disable-features=site-per-process',
// 					'--disable-features=IsolateOrigins',
// 					'--disable-site-isolation-trials',
// 				],
// 			},
// 		})

// 		console.log('client:', adminClient)

// 		adminClient.on('qr', async (qr: string) => {
// 			try {
// 				console.log('Получен QR-код для админа')

// 				// Выводим QR-код в консоль только если нет существующей сессии
// 				if (!hasExistingSession) {
// 					console.log('\n=== АДМИНСКИЙ QR-КОД ===')
// 					console.log(
// 						'Отсканируйте этот QR-код для подключения админского аккаунта'
// 					)
// 					qrcodeTerminal.generate(qr, { small: true })
// 					console.log('========================\n')
// 				}
// 			} catch (error: any) {
// 				console.error('Ошибка при генерации админского QR-кода:', error)
// 			}
// 		})

// 		adminClient.on('ready', () => {
// 			console.log('Админский клиент готов к использованию')
// 			isClientReady = true
// 			io.emit('admin:ready', {
// 				status: 'ready',
// 				timestamp: Date.now(),
// 			})
// 		})

// 		adminClient.on('authenticated', () => {
// 			console.log('Админский клиент успешно аутентифицирован')

// 			// Проверяем наличие всех необходимых директорий и файлов сессии
// 			if (fs.existsSync(SESSION_DIR)) {
// 				try {
// 					const hasAllSubdirs = SESSION_SUBDIRS.every(subdir =>
// 						fs.existsSync(path.join(SESSION_DIR, subdir))
// 					)

// 					if (hasAllSubdirs) {
// 						console.log('Все директории сессии успешно созданы')

// 						// Проверяем наличие файлов в Local Storage
// 						const localStorageDir = path.join(SESSION_DIR, 'Local Storage')
// 						if (fs.existsSync(localStorageDir)) {
// 							const files = fs.readdirSync(localStorageDir)
// 							const hasRequiredFiles = files.some(
// 								file =>
// 									file.includes('leveldb') ||
// 									file.includes('000003.log') ||
// 									file.includes('CURRENT') ||
// 									file.includes('LOCK') ||
// 									file.includes('LOG')
// 							)

// 							if (hasRequiredFiles) {
// 								console.log('Сессия админа успешно сохранена')
// 							} else {
// 								console.error('В Local Storage отсутствуют необходимые файлы')
// 							}
// 						}
// 					} else {
// 						console.error('Отсутствуют некоторые директории сессии')
// 					}
// 				} catch (error) {
// 					console.error('Ошибка при проверке директорий сессии:', error)
// 				}
// 			}
// 		})

// 		adminClient.on('auth_failure', msg => {
// 			console.error('Ошибка аутентификации админского клиента:', msg)
// 			// При ошибке аутентификации удаляем все директории сессии
// 			if (fs.existsSync(SESSION_DIR)) {
// 				try {
// 					// Удаляем все поддиректории
// 					for (const subdir of SESSION_SUBDIRS) {
// 						const subdirPath = path.join(SESSION_DIR, subdir)
// 						if (fs.existsSync(subdirPath)) {
// 							fs.rmSync(subdirPath, { recursive: true, force: true })
// 						}
// 					}
// 					console.log(
// 						'Все директории сессии удалены из-за ошибки аутентификации'
// 					)
// 				} catch (error) {
// 					console.error('Ошибка при удалении директорий сессии:', error)
// 				}
// 			}
// 		})

// 		adminClient.on('disconnected', reason => {
// 			console.log('Админский клиент отключен:', reason)
// 			isClientReady = false

// 			// Сохраняем сессию только при нормальном отключении
// 			if (reason === 'LOGOUT') {
// 				console.log('Нормальное отключение, сессия сохранена')
// 			} else {
// 				// При неожиданном отключении удаляем все директории сессии
// 				if (fs.existsSync(SESSION_DIR)) {
// 					try {
// 						// Удаляем все поддиректории
// 						for (const subdir of SESSION_SUBDIRS) {
// 							const subdirPath = path.join(SESSION_DIR, subdir)
// 							if (fs.existsSync(subdirPath)) {
// 								fs.rmSync(subdirPath, { recursive: true, force: true })
// 							}
// 						}
// 						console.log(
// 							'Все директории сессии удалены из-за неожиданного отключения'
// 						)
// 					} catch (error) {
// 						console.error('Ошибка при удалении директорий сессии:', error)
// 					}
// 				}
// 			}
// 		})

// 		adminClient.on('message', async message => {
// 			await messageMonitor.handleAdminMessage(message)
// 		})

// 		// Исходящие
// 		// adminClient.on('message_create', async (message) => {
// 		//   if (message.fromMe) {
// 		//     await messageMonitor.handleOutgoingMessage(message);
// 		//   }
// 		// });

// 		// Инициализируем клиент
// 		console.log('Инициализация админского клиента...')
// 		await adminClient.initialize()
// 		console.log('Админский клиент инициализирован')

// 		// Проверяем состояние сессии после инициализации
// 		if (checkExistingSession()) {
// 			console.log('Сессия успешно восстановлена')
// 		} else {
// 			console.log('Ожидание сканирования QR-кода для создания новой сессии')
// 		}
// 	} catch (error) {
// 		console.error('Ошибка при инициализации админского клиента:', error)
// 		throw error
// 	}
// }

// // Добавляем функцию для автоматической инициализации админского клиента
// export const initializeAdminClient = async (): Promise<void> => {
// 	try {
// 		console.log(
// 			'[ADMIN] Начало автоматической инициализации админского клиента'
// 		)

// 		// Проверяем наличие существующей сессии
// 		const hasExistingSession = checkExistingSession()
// 		console.log('[ADMIN] Наличие существующей сессии:', hasExistingSession)

// 		// Если клиент уже существует и готов, не инициализируем заново
// 		if (adminClient && isClientReady) {
// 			console.log(
// 				'[ADMIN] Админский клиент уже инициализирован и готов к работе'
// 			)
// 			return
// 		}

// 		// Если клиент существует, но не готов, уничтожаем его
// 		if (adminClient) {
// 			console.log('[ADMIN] Уничтожаем существующий клиент...')
// 			await adminClient.destroy()
// 			adminClient = null
// 			isClientReady = false
// 		}

// 		// Создаем директорию для сессии только если её нет
// 		if (!fs.existsSync(SESSION_DIR)) {
// 			fs.mkdirSync(SESSION_DIR, { recursive: true })
// 			console.log(
// 				'[ADMIN] Создана директория для админской сессии:',
// 				SESSION_DIR
// 			)
// 		}

// 		// Создаем новый клиент
// 		console.log('[ADMIN] Создаем новый клиент')
// 		adminClient = new Client({
// 			authStrategy: new LocalAuth({
// 				clientId: ADMIN_ID,
// 				dataPath: path.join(process.cwd(), '.wwebjs_auth'),
// 			}),
// 			puppeteer: {
// 				args: [
// 					'--no-sandbox',
// 					'--disable-setuid-sandbox',
// 					'--disable-dev-shm-usage',
// 					'--disable-accelerated-2d-canvas',
// 					'--no-first-run',
// 					'--no-zygote',
// 					'--disable-gpu',
// 					'--disable-extensions',
// 					'--disable-software-rasterizer',
// 					'--disable-features=site-per-process',
// 					'--disable-features=IsolateOrigins',
// 					'--disable-site-isolation-trials',
// 				],
// 			},
// 		})

// 		adminClient.on('qr', async (qr: string) => {
// 			try {
// 				console.log('[ADMIN] Получен QR-код для админа')

// 				// Выводим QR-код в консоль только если нет существующей сессии
// 				if (!hasExistingSession) {
// 					console.log('\n=== АДМИНСКИЙ QR-КОД ===')
// 					console.log(
// 						'Отсканируйте этот QR-код для подключения админского аккаунта'
// 					)
// 					qrcodeTerminal.generate(qr, { small: true })
// 					console.log('========================\n')
// 				}
// 			} catch (error: any) {
// 				console.error('[ADMIN] Ошибка при генерации админского QR-кода:', error)
// 			}
// 		})

// 		adminClient.on('ready', () => {
// 			console.log('[ADMIN] Админский клиент готов к использованию')
// 			isClientReady = true
// 			io.emit('admin:ready', {
// 				status: 'ready',
// 				timestamp: Date.now(),
// 			})
// 		})

// 		adminClient.on('authenticated', () => {
// 			console.log('[ADMIN] Админский клиент успешно аутентифицирован')
// 		})

// 		adminClient.on('auth_failure', msg => {
// 			console.error('[ADMIN] Ошибка аутентификации админского клиента:', msg)
// 		})

// 		adminClient.on('disconnected', reason => {
// 			console.log('[ADMIN] Админский клиент отключен:', reason)
// 			isClientReady = false
// 		})

// 		adminClient.on('message', async message => {
// 			await messageMonitor.handleAdminMessage(message)
// 		})

// 		// Инициализируем клиент
// 		console.log('[ADMIN] Инициализация админского клиента...')
// 		await adminClient.initialize()
// 		console.log('[ADMIN] Админский клиент инициализирован')
// 	} catch (error) {
// 		console.error('[ADMIN] Ошибка при инициализации админского клиента:', error)
// 		throw error
// 	}
// }

// // Функция для отправки кода подтверждения в Telegram
// export const sendVerificationCode = async (code: string): Promise<void> => {
// 	try {
// 		console.log('[ADMIN] Отправка кода подтверждения в Telegram:', code)
// 		telegramService.setVerificationCode(code)
// 		console.log('[ADMIN] Код подтверждения отправлен в Telegram')
// 	} catch (error) {
// 		console.error('[ADMIN] Ошибка при отправке кода подтверждения:', error)
// 		throw error
// 	}
// }

// // Функция для получения статуса админского клиента
// export const getAdminClientStatus = (): { isReady: boolean; isConnected: boolean } => {
// 	return {
// 		isReady: isClientReady,
// 		isConnected: adminClient ? true : false,
// 	}
// }

// // Функция для уничтожения админского клиента
// export const destroyAdminClient = async (): Promise<void> => {
// 	try {
// 		if (adminClient) {
// 			console.log('[ADMIN] Уничтожение админского клиента...')
// 			await adminClient.destroy()
// 			adminClient = null
// 			isClientReady = false
// 			console.log('[ADMIN] Админский клиент уничтожен')
// 		}
// 	} catch (error) {
// 		console.error('[ADMIN] Ошибка при уничтожении админского клиента:', error)
// 		throw error
// 	}
// }
