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
		if (!this.telegramService) {
			throw new Error('Telegram сервис не инициализирован')
		}

		const isConnected = await this.telegramService.isConnected()
		if (!isConnected) {
			await this.telegramService.initialize()
		}

		const company = await CompanySettings.findById(companyId)
		if (!company) {
			console.log(`КОМПАНИЯ ${companyId} НЕ НАЙДЕНА `)
			return
		}

		if (!company.telegramGroupId) {
			console.log(`У компании ${companyId} не указан telegramGroupId`)
			return
		}

		// Проверяем формат telegramGroupId
		let groupId = company.telegramGroupId.toString()
		if (!groupId.startsWith('-')) {
			groupId = `-${groupId}`
		}

		console.log(`Отправка сообщения в группу с ID: ${groupId}`)

		await this.telegramService.sendMessage(groupId, message)
		console.log(
			`[${new Date().toISOString()}] ✅ Уведомление отправлено в Telegram`
		)
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
					console.log(
						`[${currentTimestamp}] ⚠️ Время ответа истекло для ${message.to} (чат ${clientCleanPhoneNumber})`
					)

					if (company.telegramGroupId) {
						try {
							const reminderMessage = `⚠️ ВНИМАНИЕ! ⚠️\n\nВ WhatsApp-чате не ответили на сообщение в течение ${company.managerResponse} минут!\n\nСсылка на чат: https://wa.me/${clientCleanPhoneNumber}`

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
				console.log(
					`[${timestamp}] ⏳ Запущен таймер на ${company.managerResponse} минут для ${message.to} (чат ${message.from})`
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

	public async handleAdminMessage(message: Message): Promise<void> {
		try {
			const timestamp = new Date().toISOString()
			console.log(`[${timestamp}] 📱 Получено сообщение от: ${message.from}`)
			console.log(`[${timestamp}] 📝 Текст сообщения: "${message.body}"`)

			// Проверяем, является ли это исходящим сообщением
			if (message.fromMe) {
				console.log(`[${timestamp}] 👤 Получено исходящее сообщение`)
				return
			}

			// Проверяем, является ли это кодом подтверждения Telegram
			const isTelegramCode = message.body.match(/^\d{5}$/)
			if (isTelegramCode) {
				console.log(
					`[${timestamp}] 🔑 Обнаружен код подтверждения Telegram: ${message.body}`
				)
				console.log(`[${timestamp}] 🔑 Проверяем, ожидает ли Telegram код...`)

				// Проверяем состояние Telegram сервиса
				const isConnected = await this.telegramService.isConnected()
				console.log(
					`[${timestamp}] 🔑 Telegram сервис подключен: ${isConnected}`
				)

				if (!isConnected) {
					console.log(
						`[${timestamp}] 🔑 Пробуем инициализировать Telegram сервис...`
					)
					await this.telegramService.initialize()
				}

				console.log(`[${timestamp}] 🔑 Передаем код в Telegram сервис...`)
				this.telegramService.setVerificationCode(message.body)
				console.log(`[${timestamp}] 🔑 Код передан в Telegram сервис`)
				return
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
			})

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

		// Получаем все чаты за сегодня
		const today = new Date()
		today.setHours(0, 0, 0, 0)

		const chats = await WhatsappChat.find({
			companyId: company._id,
			createdAt: { $gte: today },
		})

		// Получаем все сообщения за сегодня
		const messages = await WhatsappMessage.find({
			whatsappChatId: { $in: chats.map(chat => chat._id) },
			createdAt: { $gte: today },
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
			for (let i = 0; i < chatMessages.length - 1; i++) {
				if (!chatMessages[i].isEcho && chatMessages[i + 1].isEcho) {
					const responseTime =
						chatMessages[i + 1].createdAt.getTime() -
						chatMessages[i].createdAt.getTime()
					responseTimes.push(responseTime)
				}
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
			`📊 <b>Ежедневный отчет от SalesTrack</b>\n\n` +
			`🗓 <b>Дата:</b> ${new Date().toLocaleDateString()}\n\n` +
			`🏢 <b>Компания:</b> ${company.nameCompany}\n\n` +
			`<b>Статистика за сегодня:</b>\n\n` +
			`✍️ <b>Диалогов начато:</b> ${startedChats}\n` +
			`✅ <b>Диалогов закрыто:</b> ${closedChats}\n` +
			`⚡️<b>Среднее время ответа:</b> ${Math.floor(
				avgResponseTime / 60
			)} мин. ${avgResponseTime % 60} сек.\n` +
			`⚠️ <b>Диалогов без ответа:</b> ${unansweredChats}\n` +
			`🕓 <b>Просроченных ответов (больше 2 мин):</b> ${overdueResponses}\n\n` +
			`📌 <b>Список непросмотренных чатов:</b>\n\n` +
			`${unviewedChats.map(chat => `https://wa.me/${chat.chatId}`).join('\n')}`

		console.log(
			`[${new Date().toISOString()}] ✅ Отчет сгенерирован для компании ${
				company.nameCompany
			}`
		)
		return report
	}
}
