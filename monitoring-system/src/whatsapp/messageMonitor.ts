//
import { Client, Message } from 'whatsapp-web.js'
import { UserModel } from '../models/User'
import { CompanySettings } from '../models/CompanySettings'
import { TelegramService } from '../telegram/telegramClient'
import { WhatsappChat } from '../models/WhatsappChat'
import { WhatsappMessage } from '../models/WhatsappMessage'
import { Types } from 'mongoose'

export class MessageMonitor {
	private static instance: MessageMonitor
	private activeTimers: Map<string, NodeJS.Timeout>
	private telegramService: TelegramService

	private constructor() {
		console.log(`[${new Date().toISOString()}] 🔄 Инициализация MessageMonitor`)
		this.activeTimers = new Map()
		this.telegramService = TelegramService.getInstance()
		console.log(
			`[${new Date().toISOString()}] ✅ MessageMonitor инициализирован`
		)
	}

	public static getInstance(): MessageMonitor {
		if (!MessageMonitor.instance) {
			console.log(
				`[${new Date().toISOString()}] 🔄 Создание нового экземпляра MessageMonitor`
			)
			MessageMonitor.instance = new MessageMonitor()
		} else {
			console.log(
				`[${new Date().toISOString()}] ✅ Использование существующего экземпляра MessageMonitor`
			)
		}
		return MessageMonitor.instance
	}

	public async sendTelegramMessage(companyId: Types.ObjectId, message: string) {
		try {
			if (!this.telegramService) {
				console.error('Telegram сервис не инициализирован')
				throw new Error('Telegram сервис не инициализирован')
			}

			// Проверяем подключение и инициализируем при необходимости
			const isConnected = await this.telegramService.isConnected()
			if (!isConnected) {
				console.log('Telegram сервис не подключен, пробуем инициализировать...')
				await this.telegramService.initialize()
			}

			// Получаем информацию о компании
			const company = await CompanySettings.findById(companyId)
			if (!company) {
				console.error(`Компания ${companyId} не найдена`)
				throw new Error(`Компания ${companyId} не найдена`)
			}

			if (!company.telegramGroupId) {
				console.error(`У компании ${companyId} не указан telegramGroupId`)
				throw new Error(`У компании ${companyId} не указан telegramGroupId`)
			}

			// Проверяем формат telegramGroupId
			let groupId = company.telegramGroupId.toString()
			if (!groupId.startsWith('-')) {
				groupId = `-${groupId}`
			}

			console.log(`Отправка сообщения в группу с ID: ${groupId}`)

			// Добавляем временную метку к сообщению
			const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })
			const messageWithTimestamp = `${message}\n\n⏰ ${timestamp}`

			// Пробуем отправить сообщение с повторными попытками
			let retryCount = 0
			const maxRetries = 3
			let lastError = null

			while (retryCount < maxRetries) {
				try {
					await this.telegramService.sendMessage(groupId, messageWithTimestamp)
					console.log(`[${new Date().toISOString()}] ✅ Уведомление успешно отправлено в Telegram`)
					return
				} catch (error) {
					lastError = error
					retryCount++
					console.error(`Попытка ${retryCount}/${maxRetries} отправки сообщения не удалась:`, error)
					
					if (retryCount < maxRetries) {
						// Ждем перед следующей попыткой (увеличиваем время ожидания с каждой попыткой)
						await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
					}
				}
			}

			// Если все попытки не удались, выбрасываем последнюю ошибку
			throw lastError || new Error('Не удалось отправить сообщение после всех попыток')
		} catch (error) {
			console.error('Ошибка при отправке сообщения в Telegram:', error)
			throw error
		}
	}

	private isWithinWorkingHours(company: any): boolean {
		// Проверяем на null, undefined и пустую строку
		if (
			!company.working_hours_start ||
			!company.working_hours_end ||
			company.working_hours_start.trim() === '' ||
			company.working_hours_end.trim() === ''
		) {
			console.log(
				`[${new Date().toISOString()}] ⏰ Рабочее время не указано - работаем круглосуточно`
			)
			return true // Если время не указано или пустая строка, считаем что работаем всегда
		}

		const now = new Date()
		const utcHours = now.getUTCHours()
		const utcMinutes = now.getUTCMinutes()
		const currentTimeInMinutes = utcHours * 60 + utcMinutes

		// Конвертируем время начала и конца в минуты
		const [startHours, startMinutes] = company.working_hours_start
			.split(':')
			.map(Number)
		const [endHours, endMinutes] = company.working_hours_end
			.split(':')
			.map(Number)

		// Проверяем валидность времени
		if (
			isNaN(startHours) ||
			isNaN(startMinutes) ||
			isNaN(endHours) ||
			isNaN(endMinutes)
		) {
			console.log(
				`[${new Date().toISOString()}] ⚠️ Некорректный формат времени - работаем круглосуточно`
			)
			return true
		}

		// Конвертируем в UTC (вычитаем 5 часов для Алматы)
		const startTimeInMinutes = (startHours - 5) * 60 + startMinutes
		const endTimeInMinutes = (endHours - 5) * 60 + endMinutes

		// Проверяем, находится ли текущее время в диапазоне
		if (startTimeInMinutes <= endTimeInMinutes) {
			return (
				currentTimeInMinutes >= startTimeInMinutes &&
				currentTimeInMinutes <= endTimeInMinutes
			)
		} else {
			// Обработка случая, когда рабочий день переходит через полночь
			return (
				currentTimeInMinutes >= startTimeInMinutes ||
				currentTimeInMinutes <= endTimeInMinutes
			)
		}
	}

	public async handleMessage(message: Message): Promise<void> {
		try {
			const timestamp = new Date().toISOString()
			console.log(`[${timestamp}] 📱 Получено сообщение от: ${message.from}`)
			console.log(`[${timestamp}] 📝 Текст сообщения: "${message.body}"`)

			// Проверяем, является ли это исходящим сообщением
			if (message.fromMe) {
				console.log(`[${timestamp}] 👤 Получено исходящее сообщение`)
				return
			}

			// Пропускаем сообщения из групп (проверяем по формату ID чата)
			if (message.from.endsWith('@g.us')) {
				console.log(
					`[${timestamp}] 👥 Пропускаем сообщение из группы: ${message.from}`
				)
				return
			}

			if (message.from === 'status@broadcast') {
				console.log(`[${timestamp}] 📱 Получено статусное сообщение`)
				return
			}

			const clientCleanPhoneNumber = message.from
				.replace('@c.us', '')
				.replace('+', '')
				.replace(/\D/g, '')
			const cleanPhoneNumber = message.to
				.replace('@c.us', '')
				.replace('+', '')
				.replace(/\D/g, '')
			console.log(`[${timestamp}] 🔍 Ищем номер в базе: ${cleanPhoneNumber}`)

			// Находим компанию по номеру телефона
			const company = await CompanySettings.findOne({
				phoneNumber: cleanPhoneNumber,
			})
			if (!company) {
				console.log(
					`[${timestamp}] ❌ Компания не найдена для номера: ${cleanPhoneNumber}`
				)
				return
			}
			console.log(`[${timestamp}] ✅ Найдена компания:`, company)

			// Проверка на наличие чата в базе данных
			let chat = await WhatsappChat.findOne({ chatId: clientCleanPhoneNumber })

			console.log(chat)
			if (!chat) {
				console.log(
					`[${timestamp}] ❌ Чат с номером ${clientCleanPhoneNumber} не найден, создаем новый`
				)

				try {
					chat = new WhatsappChat({
						companyId: company._id,
						chatId: clientCleanPhoneNumber,
					})
					await chat.save()
					console.log(
						`[${timestamp}] 📝 Новый чат успешно сохранен для: ${clientCleanPhoneNumber}`
					)
				} catch (error) {
					console.error(
						`[${timestamp}] ❌ Ошибка при сохранении нового чата:`,
						error
					)
					return
				}
			} else {
				console.log(`[${timestamp}] ✅ Чат найден:`, chat)
			}

			// Сохраняем сообщение
			const whatsappMessage = new WhatsappMessage({
				isEcho: message.fromMe,
				text: message.body,
				whatsappChatId: chat._id,
				companyId: company._id,
				isClosed: false,
			})

			try {
				await whatsappMessage.save()
				console.log(`[${timestamp}] ✅ Сообщение сохранено:`, whatsappMessage)
			} catch (error) {
				console.error(
					`[${timestamp}] ❌ Ошибка при сохранении сообщения:`,
					error
				)
				return
			}

			// После сохранения сообщения, проверяем рабочее время
			const isWorkingHours = this.isWithinWorkingHours(company)
			console.log(
				`[${timestamp}] ⏰ Проверка рабочего времени: ${
					isWorkingHours ? 'рабочее время' : 'вне рабочего времени'
				}`
			)

			// Запускаем таймер только в рабочее время
			if (isWorkingHours) {
				// Логика с таймером остается
				if (this.activeTimers.has(message.to)) {
					console.log(
						`[${timestamp}] 🔄 Перезапускаем таймер для ${message.to}`
					)
					clearTimeout(this.activeTimers.get(message.to))
				}

				// Отключаем таймер при отправке ответа
				if (this.activeTimers.has(message.from)) {
					console.log(`[${timestamp}] 🛑 Отключаем таймер для ${message.from}`)
					clearTimeout(this.activeTimers.get(message.from))
					this.activeTimers.delete(message.from)
					console.log(`[${timestamp}] ✅ Таймер успешно отключен`)
				}

				// Запускаем новый таймер
				const timer = setTimeout(async () => {
					const currentTimestamp = new Date().toISOString()
					const responseTime = company?.managerResponse || 5
					console.log(
						`[${currentTimestamp}] ⚠️ Время ответа истекло для ${message.to} (чат ${clientCleanPhoneNumber})`
					)

					if (company.telegramGroupId) {
						try {
							const reminderMessage = `⚠️ ВНИМАНИЕ! ⚠️\n\nВ WhatsApp-чате не ответили на сообщение в течение ${responseTime} минут!\n\nСсылка на чат: https://wa.me/${clientCleanPhoneNumber}`

							if (!this.telegramService) {
								throw new Error('Telegram сервис не инициализирован')
							}

							const isConnected = await this.telegramService.isConnected()
							if (!isConnected) {
								await this.telegramService.initialize()
							}

							await this.telegramService.sendMessage(
								`-${company.telegramGroupId}`,
								reminderMessage
							)
							console.log(
								`[${currentTimestamp}] ✅ Уведомление отправлено в Telegram`
							)
						} catch (error) {
							console.error(
								`[${currentTimestamp}] ❌ Ошибка при отправке уведомления:`,
								error
							)
						}
					}
				}, (company?.managerResponse || 5) * 60 * 1000)

				this.activeTimers.set(message.from, timer)
				const responseTime = company?.managerResponse || 5 
				console.log(
					`[${timestamp}] ⏳ Запущен таймер на ${responseTime} минут для ${message.to} (чат ${message.from})`
				)
			} else {
				console.log(
					`[${timestamp}] ℹ️ Вне рабочего времени - таймер не запущен`
				)
			}
		} catch (error) {
			console.error(
				`[${new Date().toISOString()}] ❌ Ошибка при обработке сообщения:`,
				error
			)
		}
	}

	public async handleOutgoingMessage(message: Message): Promise<void> {
		try {
			const timestamp = new Date().toISOString()
			console.log(`[${timestamp}] 🚀 Начало обработки исходящего сообщения`)
			console.log(`[${timestamp}] 📤 Данные сообщения:`, {
				from: message.from,
				to: message.to,
				body: message.body,
				fromMe: message.fromMe,
				type: message.type,
				isForwarded: message.isForwarded,
				isStatus: message.isStatus,
				isGroupChat: message.to.endsWith('@g.us'),
			})

			// Пропускаем сообщения в группы (проверяем по формату ID чата)
			if (message.to.endsWith('@g.us')) {
				console.log(
					`[${timestamp}] 👥 Пропускаем сообщение в группу: ${message.to}`
				)
				return
			}

			// Очищаем номера телефонов
			const cleanPhoneNumber = message.from.replace(/\D/g, '')
			const clientCleanPhoneNumber = message.to.replace(/\D/g, '')
			console.log(`[${timestamp}] 🔍 Очищенные номера:`, {
				cleanPhoneNumber,
				clientCleanPhoneNumber,
			})

			// Находим компанию по номеру телефона
			console.log(
				`[${timestamp}] 🔍 Поиск компании по номеру: ${cleanPhoneNumber}`
			)
			const company = await CompanySettings.findOne({
				phoneNumber: cleanPhoneNumber,
			})

			if (!company) {
				console.log(
					`[${timestamp}] ❌ Компания не найдена для номера: ${cleanPhoneNumber}`
				)
				console.log(
					`[${timestamp}] 🔍 Доступные компании:`,
					await CompanySettings.find({}, 'phoneNumber')
				)
				return
			}
			console.log(`[${timestamp}] ✅ Найдена компания:`, {
				id: company._id,
				name: company.nameCompany,
				phoneNumber: company.phoneNumber,
			})

			// Проверка на наличие чата в базе данных
			console.log(
				`[${timestamp}] 🔍 Поиск чата для номера: ${clientCleanPhoneNumber}`
			)
			let chat = await WhatsappChat.findOne({ chatId: clientCleanPhoneNumber })
			console.log(
				`[${timestamp}] 🔍 Результат поиска чата:`,
				chat
					? {
							id: chat._id,
							chatId: chat.chatId,
							companyId: chat.companyId,
					  }
					: 'Чат не найден'
			)

			if (!chat) {
				console.log(
					`[${timestamp}] ❌ Чат с номером ${clientCleanPhoneNumber} не найден, создаем новый`
				)
				try {
					chat = new WhatsappChat({
						companyId: company._id,
						chatId: clientCleanPhoneNumber,
					})
					await chat.save()
					console.log(`[${timestamp}] 📝 Новый чат успешно сохранен:`, {
						id: chat._id,
						chatId: chat.chatId,
						companyId: chat.companyId,
					})
				} catch (error) {
					console.error(
						`[${timestamp}] ❌ Ошибка при сохранении нового чата:`,
						error
					)
					return
				}
			}

			// Сохраняем сообщение
			console.log(`[${timestamp}] 📝 Сохранение сообщения в базу данных`)
			const whatsappMessage = new WhatsappMessage({
				isEcho: true,
				text: message.body || '[Сообщение без текста]',
				whatsappChatId: chat._id,
				companyId: company._id,
				isClosed: false,
			})

			try {
				await whatsappMessage.save()
				console.log(`[${timestamp}] ✅ Сообщение успешно сохранено:`, {
					id: whatsappMessage._id,
					text: whatsappMessage.text,
					chatId: whatsappMessage.whatsappChatId,
					companyId: whatsappMessage.companyId,
				})
			} catch (error) {
				console.error(
					`[${timestamp}] ❌ Ошибка при сохранении сообщения:`,
					error
				)
				return
			}

			// После сохранения сообщения, проверяем рабочее время
			const isWorkingHours = this.isWithinWorkingHours(company)
			console.log(
				`[${timestamp}] ⏰ Проверка рабочего времени: ${
					isWorkingHours ? 'рабочее время' : 'вне рабочего времени'
				}`
			)

			// Отключаем таймер только в рабочее время
			if (isWorkingHours && this.activeTimers.has(message.to)) {
				console.log(`[${timestamp}] 🛑 Отключаем таймер для ${message.to}`)
				clearTimeout(this.activeTimers.get(message.to))
				this.activeTimers.delete(message.to)
				console.log(`[${timestamp}] ✅ Таймер успешно отключен`)
			}
		} catch (error) {
			console.error(
				`[${new Date().toISOString()}] ❌ Ошибка при обработке исходящего сообщения:`,
				error
			)
		}
	}

	public async generateDailyReport(companyId: Types.ObjectId): Promise<string> {
		console.log(
			`[${new Date().toISOString()}] 🔄 Генерация ежедневного отчета для компании ${companyId}`
		)

		const company = await CompanySettings.findById(companyId)
		if (!company) {
			throw new Error(`Компания с ID ${companyId} не найдена`)
		}

		// Формируем период отчёта: с 3:00 предыдущего дня до 3:00 текущего дня
		const now = new Date()
		const reportEnd = new Date(now)
		reportEnd.setHours(3, 0, 0, 0)
		if (now < reportEnd) {
			reportEnd.setDate(reportEnd.getDate() - 1)
		}
		const reportStart = new Date(reportEnd)
		reportStart.setDate(reportStart.getDate() - 1)

		// Получаем все чаты за период
		const chats = await WhatsappChat.find({
			companyId: company._id,
			createdAt: { $gte: reportStart, $lt: reportEnd },
		})

		// Получаем все сообщения за период
		const messages = await WhatsappMessage.find({
			whatsappChatId: { $in: chats.map(chat => chat._id) },
			createdAt: { $gte: reportStart, $lt: reportEnd },
		})

		// Статистика
		const startedChats = chats.length
		const closedChats = chats.filter(chat => chat.isClosed).length

		// Расчет среднего времени ответа
		const responseTimes: number[] = []
		for (const chat of chats) {
			const chatMessages = messages.filter(m =>
				m.whatsappChatId.equals(chat._id)
			)
			const firstClientMsg = chatMessages.find(m => !m.isEcho)
			const firstManagerMsg = chatMessages.find(
				m =>
					m.isEcho && firstClientMsg && m.createdAt > firstClientMsg.createdAt
			)
			if (firstClientMsg && firstManagerMsg) {
				const responseTime =
					firstManagerMsg.createdAt.getTime() -
					firstClientMsg.createdAt.getTime()
				console.log(
					`[${new Date().toISOString()}] ⏱️ Чат ${
						chat.chatId
					}: firstClientMsg=${firstClientMsg.createdAt.toISOString()}, firstManagerMsg=${firstManagerMsg.createdAt.toISOString()}, responseTime=${responseTime} мс (${Math.round(
						responseTime / 1000
					)} сек)`
				)
				responseTimes.push(responseTime)
			}
		}

		const avgResponseTime =
			responseTimes.length > 0
				? Math.round(
						responseTimes.reduce((a, b) => a + b, 0) /
							responseTimes.length /
							1000
				  )
				: 0

		// Диалоги без ответа (есть сообщения от клиента, но нет ответа менеджера)
		const unansweredChats = chats.filter(chat => {
			const chatMessages = messages.filter(m =>
				m.whatsappChatId.equals(chat._id)
			)
			return chatMessages.length > 0 && !chatMessages.some(m => m.isEcho)
		}).length

		// Просроченные ответы (время ответа больше 2 минут)
		const overdueResponses = responseTimes.filter(
			time => time > 2 * 60 * 1000
		).length

		// Непросмотренные чаты (sendMessage: false)
		const unviewedChats = chats.filter(chat => !chat.sendMessage)

		// Формируем отчет
		const report =
			`📊 Ежедневный отчет от SalesTrack\n\n` +
			`🗓 Дата: ${new Date().toLocaleDateString()}\n\n` +
			`🏢 Компания: ${company.nameCompany}\n\n` +
			`Статистика за сегодня:\n\n` +
			`✍️ Диалогов начато: ${startedChats}\n` +
			`✅ Диалогов закрыто: ${closedChats}\n` +
			`⚡️ Среднее время ответа: ${Math.floor(
				avgResponseTime / 60
			)} мин. ${avgResponseTime % 60} сек.\n` +
			`⚠️ Диалогов без ответа: ${unansweredChats}\n` +
			`🕓 Просроченных ответов (больше 2 мин): ${overdueResponses}\n\n` +
			`📌 Список непросмотренных чатов:\n\n` +
			`${Array.from(
				new Set(unviewedChats.map(chat => `https://wa.me/${chat.chatId}`))
			).join('\n')}`

		console.log(
			`[${new Date().toISOString()}] ✅ Отчет сгенерирован для компании ${
				company.nameCompany
			}`
		)
		return report
	}
}
