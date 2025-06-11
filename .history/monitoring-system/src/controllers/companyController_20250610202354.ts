import { Request, Response } from 'express'
import { CompanySettings } from '../models/CompanySettings'
import { WhatsappChat } from '../models/WhatsappChat'
import { WhatsappMessage } from '../models/WhatsappMessage'
import { v4 as uuidv4 } from 'uuid'
import { TelegramService } from '../telegram/TelegramService'
import { Types } from 'mongoose'
import { UserModel } from '../models/User'
import { NightlyReportManager } from '../whatsapp/nightlyReport'
import { sendCompanyCreationNotification, sendCompanyDeletionNotification } from '../OwnerTelegram/ownerTelegram'

export const saveCompanySettings = async (req: Request, res: Response) => {
	try {
		const {
			userId,
			nameCompany,
			managerResponse,
			idCompany,
			companyId,
			phoneNumber,
			working_hours_start,
			working_hours_end,
		} = req.body

		console.log('Попытка создания компании:', {
			userId,
			nameCompany,
			managerResponse,
			idCompany,
			phoneNumber,
			working_hours_start,
			working_hours_end,
		})

		if (
			!userId ||
			!nameCompany ||
			!managerResponse ||
			!idCompany ||
			!companyId ||
			!phoneNumber
		) {
			return res.status(400).json({
				success: false,
				message:
					'Данный номер уже зарегистрирован. Для подключения, используйте другой номер.',
			})
		}

		// Проверяем, не используется ли уже этот номер телефона
		const existingPhone = await CompanySettings.findOne({
			phoneNumber: phoneNumber,
			nameCompany: { $exists: true, $ne: null },
		})

		if (existingPhone) {
			console.log(
				'Найден дубликат номера телефона с названием компании:',
				phoneNumber
			)
			return res.status(400).json({
				success: false,
				message:
					'Данный номер уже зарегистрирован. Для подключения, используйте другой номер.',
			})
		}

		// Валидация времени ответа менеджера (0-30 минут)
		const responseTime = Number(managerResponse)
		if (isNaN(responseTime) || responseTime < 0 || responseTime > 30) {
			return res.status(400).json({
				success: false,
				message: 'Время ответа менеджера должно быть числом от 0 до 30 минут',
			})
		}

		// Ищем существующие настройки пользователя или создаем новые
		let settings = await CompanySettings.findOne({
			_id: new Types.ObjectId(companyId),
		})

		const newCompany = {
			id: idCompany,
			nameCompany,
			phoneNumber,
			managerResponse: responseTime,
			companyId,
			working_hours_start,
			working_hours_end,
			createdAt: new Date(),
		}

		if (settings) {
			// Добавляем новую компанию к существующим
			await CompanySettings.updateOne(
				{ _id: new Types.ObjectId(companyId) },
				{ ...newCompany }
			)
			console.log('Добавлена компания')
		} else {
			// Создаем новые настройки с первой компанией
			console.log('Компания не найдена')
		}

		// Создаем группы в Telegram для новых компаний
		const telegramService = TelegramService.getInstance()
		await telegramService.initialize()
		await telegramService.createGroupsForCompanies([{
			id: settings._id.toString(),
			nameCompany: settings.nameCompany
		}])

		// Получаем обновленные данные компании с Telegram ссылкой
		const updatedCompany = await CompanySettings.findOne({
			_id: new Types.ObjectId(companyId),
		})

		if (!updatedCompany) {
			throw new Error('Компания не найдена после создания')
		}

		// Получаем данные пользователя для уведомления
		const user = await UserModel.findById(userId)
		if (!user) {
			return res.status(400).json({
				success: false,
				message: 'Пользователь не найден',
			})
		}

		// Отправляем уведомление о создании компании
		await sendCompanyCreationNotification({
			companyName: nameCompany,
			userId: userId,
			phoneNumber: phoneNumber,
			companyId: companyId,
			telegramInviteLink: updatedCompany?.telegramInviteLink,	
			managerResponse: managerResponse,
			working_hours_start: working_hours_start,
			working_hours_end: working_hours_end,
		})

		res.status(201).json({
			success: true,
			message: 'Компания успешно добавлена',
			data: {
				...newCompany,
				telegramGroupId: updatedCompany.telegramGroupId,
				telegramInviteLink: updatedCompany.telegramInviteLink,
			},
		})
	} catch (error) {
		console.error('Ошибка при создании компании:', error)
		res.status(500).json({
			success: false,
			message: 'Произошла ошибка при создании компании',
		})
	}
}

export const getCompanySettings = async (req: Request, res: Response) => {
	try {
		const { userId } = req.params

		const user = await UserModel.findOne({ _id: userId })
		if (!user) {
			return res.status(404).json({
				success: false,
				message: 'Пользователь не найден',
			})
		}

		const settings = await CompanySettings.find({
			userId,
			phoneNumber: { $ne: null },
			...(userId === '67ff69552f9a43dc41bb3094' && !user.addedInstagram
				? { messanger: { $ne: 'instagram' } }
				: {}),
		})

		if (!settings || settings.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Компании не найдены',
			})
		}

		res.status(200).json({
			success: true,
			data: settings,
		})
	} catch (error) {
		console.error('Ошибка при получении настроек компании:', error)
		res.status(500).json({
			success: false,
			message: 'Произошла ошибка при получении настроек компании',
		})
	}
}

export const updateCompanySettings = async (req: Request, res: Response) => {
	try {
		const { userId, companyId } = req.params
		const {
			nameCompany,
			managerResponse,
			working_hours_start,
			working_hours_end,
		} = req.body

		console.log('Попытка обновления компании:', {
			userId,
			companyId,
			nameCompany,
			managerResponse,
			working_hours_start,
			working_hours_end,
		})

		if (!nameCompany || !managerResponse) {
			return res.status(400).json({
				success: false,
				message:
					'Необходимо указать название компании и время ответа менеджера',
			})
		}

		// Валидация времени ответа менеджера (0-30 минут)
		const responseTime = Number(managerResponse)
		if (isNaN(responseTime) || responseTime < 0 || responseTime > 30) {
			return res.status(400).json({
				success: false,
				message: 'Время ответа менеджера должно быть числом от 0 до 30 минут',
			})
		}

		const settings = await CompanySettings.findOne({
			_id: new Types.ObjectId(companyId),
		})
		console.log('Найденные настройки пользователя:', settings)

		if (!settings) {
			console.log('Настройки пользователя не найдены для userId:', userId)
			return res.status(404).json({
				success: false,
				message: 'Настройки пользователя не найдены',
			})
		}
		if (!settings.telegramInviteLink) {
			console.log('stfu')
			const telegramService = TelegramService.getInstance()
			await telegramService.initialize()
			await telegramService.createGroupsForCompanies([{
				id: settings._id.toString(),
				nameCompany: settings.nameCompany
			}])
		}

		await CompanySettings.updateOne(
			{ _id: new Types.ObjectId(companyId) },
			{
				$set: {
					nameCompany,
					managerResponse,
					working_hours_start,
					working_hours_end,
				},
			}
		)

		// Обновляем крон для компании
		const updatedSettings = await CompanySettings.findOne({
			_id: new Types.ObjectId(companyId),
		})
		if (updatedSettings) {
			const manager = NightlyReportManager.getInstance()
			await manager.updateCompanyCron(updatedSettings)
			console.log(
				`[${new Date().toISOString()}] ✅ Крон обновлен для компании ${
					updatedSettings.nameCompany
				}`
			)
		}

		res.status(200).json({
			success: true,
			message: 'Данные компании успешно обновлены',
			data: {
				...settings,
				nameCompany,
				managerResponse,
				working_hours_start,
				working_hours_end,
			},
		})
	} catch (error) {
		console.error('Ошибка при обновлении данных компании:', error)
		res.status(500).json({
			success: false,
			message: 'Произошла ошибка при обновлении данных компании',
		})
	}
}

export const deleteCompanySettings = async (req: Request, res: Response) => {
	try {
		const { userId, companyId } = req.params

		console.log('Попытка удаления компании:', {
			userId,
			companyId,
		})

		const settings = await CompanySettings.findOne({
			userId,
			_id: new Types.ObjectId(companyId),
		})
		console.log('Найденные настройки пользователя:', settings)

		if (!settings) {
			console.log('Настройки пользователя не найдены для userId:', userId)
			return res.status(404).json({
				success: false,
				message: 'Настройки пользователя не найдены',
			})
		}

		// Получаем данные пользователя для уведомления
		const user = await UserModel.findById(userId)
		if (!user) {
			return res.status(400).json({
				success: false,
				message: 'Пользователь не найден',
			})
		}

		// Отправляем уведомление об удалении компании
		await sendCompanyDeletionNotification({
			companyName: settings.nameCompany ?? 'Не указано',
			userId: userId,
			phoneNumber: settings.phoneNumber ?? 'Не указан',
			companyId: companyId,
		})

		// Удаляем все чаты компании
		const deletedChats = await WhatsappChat.deleteMany({
			companyId: new Types.ObjectId(companyId),
		})
		console.log(`Удалено чатов: ${deletedChats.deletedCount}`)

		// Удаляем все сообщения компании
		const deletedMessages = await WhatsappMessage.deleteMany({
			companyId: new Types.ObjectId(companyId),
		})
		console.log(`Удалено сообщений: ${deletedMessages.deletedCount}`)

		// Удаляем саму компанию
		await CompanySettings.deleteOne({
			userId,
			_id: new Types.ObjectId(companyId),
		})

		return res.status(200).json({
			success: true,
			message: 'Компания и все связанные данные успешно удалены',
			deletedChats: deletedChats.deletedCount,
			deletedMessages: deletedMessages.deletedCount,
		})
	} catch (error) {
		console.error('Ошибка при удалении компании:', error)
		res.status(500).json({
			success: false,
			message: 'Произошла ошибка при удалении компании',
		})
	}
}

export const getData = async (req: Request, res: Response) => {
	try {
		const { userId } = req.params

		if (!userId) {
			return res.status(400).json({
				success: false,
				message: 'Необходимо указать userId',
			})
		}

		const user = await UserModel.findOne({ _id: userId })
		if (!user) {
			return res.status(404).json({
				success: false,
				message: 'Пользователь не найден',
			})
		}

		const settings = await CompanySettings.find({
			userId,
			phoneNumber: { $ne: null },
			...(userId === '67ff69552f9a43dc41bb3094' && !user.addedInstagram
				? { messanger: { $ne: 'instagram' } }
				: {}),
		})

		if (!settings || settings.length === 0) {
			return res.status(404).json({
				success: false,
				message: 'Компании не найдены',
			})
		}

		res.status(200).json({
			userId: userId,
			companies: settings,
		})
	} catch (error) {
		console.error('Ошибка при получении данных:', error)
		res.status(500).json({
			success: false,
			message: 'Произошла ошибка при получении данных',
		})
	}
}

export const getTelegramLink = async (req: Request, res: Response) => {
	try {
		const { userId, companyId } = req.params
		const settings = await CompanySettings.findOne({
			userId,
			_id: new Types.ObjectId(companyId),
		})

		if (!settings) {
			return res
				.status(404)
				.json({ success: false, message: 'Настройки не найдены' })
		}
		console.log('TELEGRAMMAMAMAMMAM', settings)
		res
			.status(200)
			.json({ success: true, telegramInviteLink: settings.telegramInviteLink })
	} catch (error) {
		res.status(500).json({ success: false, message: 'Ошибка сервера' })
	}
}
