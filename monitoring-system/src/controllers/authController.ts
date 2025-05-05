import { Response } from 'express'
import { AuthRequest } from '../middlewares/authMiddleware'
import { UserModel } from '../models/User'
import jwt from 'jsonwebtoken'
import { sendVerificationCode } from '../whatsapp/adminClient'

// Шаг 1: Отправка номера телефона
export const sendPhoneNumber = async (
	req: AuthRequest,
	res: Response
): Promise<void> => {
	try {
		const { phoneNumber } = req.body

		if (!phoneNumber) {
			res.status(400).json({
				success: false,
				message: 'Номер телефона обязателен',
			})
			return
		}

		// Проверяем существование пользователя
		let user = await UserModel.findOne({ phoneNumber })

		if (!user) {
			// Создаем временного пользователя
			user = new UserModel({
				phoneNumber,
				isVerified: false,
			})
		}

		// Генерируем код подтверждения
		user.generateVerificationCode()
		await user.save()

		// Отправляем код через WhatsApp
		const whatsappSent = await sendVerificationCode(phoneNumber)

		if (!whatsappSent) {
			res.status(500).json({
				success: false,
				message: 'Ошибка при отправке кода через WhatsApp',
			})
			return
		}

		res.status(200).json({
			success: true,
			message: 'Код подтверждения отправлен',
			data: {
				userId: user._id,
				verificationCode: user.verificationCode, // Отправляем код на фронтенд
			},
		})
	} catch (error) {
		console.error('Ошибка при отправке номера телефона:', error)
		res.status(500).json({
			success: false,
			message: 'Внутренняя ошибка сервера',
		})
	}
}

// Шаг 2: Проверка кода
export const verifyCode = async (
	req: AuthRequest,
	res: Response
): Promise<void> => {
	try {
		const { userId, code } = req.body
		const user = await UserModel.findById(userId)

		if (!user) {
			res.status(400).json({ error: 'Пользователь не найден' })
			return
		}

		if (!user.verificationCode || !user.verificationCodeExpires) {
			res.status(400).json({ error: 'Код подтверждения не был отправлен' })
			return
		}

		if (user.verificationCode !== code) {
			res.status(400).json({ error: 'Неверный код подтверждения' })
			return
		}

		if (user.verificationCodeExpires < new Date()) {
			res.status(400).json({ error: 'Код подтверждения истек' })
			return
		}

		// Код верный, помечаем пользователя как готового к созданию пароля
		user.isVerified = true
		await user.save()

		res.json({
			success: true,
			message: 'Код подтвержден, теперь можно создать пароль',
		})
	} catch (error) {
		console.error('Ошибка подтверждения кода:', error)
		res.status(500).json({ error: 'Ошибка при подтверждении кода' })
	}
}

// Шаг 3: Создание пароля
export const createPassword = async (
	req: AuthRequest,
	res: Response
): Promise<void> => {
	try {
		const { userId, password } = req.body

		if (!userId) {
			res.status(400).json({ error: 'Необходимо указать ID пользователя' })
			return
		}

		if (!password) {
			res.status(400).json({ error: 'Необходимо указать пароль' })
			return
		}

		const user = await UserModel.findById(userId)

		if (!user) {
			res.status(400).json({ error: 'Пользователь не найден' })
			return
		}

		if (!user.isVerified) {
			res
				.status(400)
				.json({ error: 'Сначала необходимо подтвердить номер телефона' })
			return
		}

		user.password = password
		await user.hashPassword()
		await user.save()

		const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET!, {
			expiresIn: '30d',
		})

		res.json({
			success: true,
			message: 'Пароль создан',
			token,
		})
	} catch (error) {
		console.error('Ошибка создания пароля:', error)
		res.status(500).json({ error: 'Ошибка при создании пароля' })
	}
}

// Подтверждение номера
export const verifyPhone = async (
	req: AuthRequest,
	res: Response
): Promise<void> => {
	try {
		const { phoneNumber, code } = req.body
		const user = await UserModel.findOne({ phoneNumber })

		if (!user) {
			res.status(400).json({ error: 'Пользователь не найден' })
			return
		}

		if (!user.verificationCode || !user.verificationCodeExpires) {
			res.status(400).json({ error: 'Код подтверждения не был отправлен' })
			return
		}

		if (user.verificationCodeExpires < new Date()) {
			res.status(400).json({ error: 'Код подтверждения истек' })
			return
		}

		if (user.verificationCode !== code) {
			res.status(400).json({ error: 'Неверный код подтверждения' })
			return
		}

		user.isVerified = true
		user.verificationCode = undefined
		user.verificationCodeExpires = undefined
		await user.save()

		res.json({ message: 'Номер успешно подтвержден' })
	} catch (error) {
		console.error('Ошибка подтверждения номера:', error)
		res.status(500).json({ error: 'Ошибка при подтверждении номера' })
	}
}

// Вход
export const login = async (req: AuthRequest, res: Response): Promise<void> => {
	try {
		const { phoneNumber, password } = req.body
		console.log('Login attempt:', { phoneNumber })

		if (!phoneNumber || !password) {
			res
				.status(400)
				.json({ error: 'Необходимо указать номер телефона и пароль' })
			return
		}

		// Находим пользователя
		const user = await UserModel.findOne({ phoneNumber })
		console.log(
			'Found user for login:',
			user
				? {
						phoneNumber: user.phoneNumber,
						isVerified: user.isVerified,
						hasPassword: !!user.password,
				  }
				: 'not found'
		)

		if (!user) {
			res.status(401).json({ error: 'Неверный номер телефона или пароль' })
			return
		}

		// Проверяем, есть ли пароль у пользователя
		if (!user.password) {
			res
				.status(401)
				.json({ error: 'Пароль не установлен. Пожалуйста, создайте пароль' })
			return
		}

		// Проверяем пароль
		const isMatch = await user.comparePassword(password)
		console.log('Password match:', isMatch)

		if (!isMatch) {
			res.status(401).json({ error: 'Неверный номер телефона или пароль' })
			return
		}

		// Проверяем, подтвержден ли номер
		if (!user.isVerified) {
			console.log('User not verified:', {
				phoneNumber: user.phoneNumber,
				isVerified: user.isVerified,
			})
			res.status(401).json({ error: 'Номер телефона не подтвержден' })
			return
		}

		// Генерируем токен
		const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET!, {
			expiresIn: '30d',
		})

		console.log('Login successful:', {
			phoneNumber: user.phoneNumber,
			isVerified: user.isVerified,
		})

		res.json({
			success: true,
			token,
			user: {
				id: user._id,
				phoneNumber: user.phoneNumber,
			},
		})
	} catch (error) {
		console.error('Ошибка входа:', error)
		res.status(500).json({ error: 'Ошибка при входе в систему' })
	}
}

// Запрос на восстановление пароля
export const requestPasswordReset = async (
	req: AuthRequest,
	res: Response
): Promise<void> => {
	try {
		const { phoneNumber } = req.body
		console.log('=== Начало процесса сброса пароля ===')
		console.log('Получен номер телефона:', phoneNumber)

		if (!phoneNumber) {
			res.status(400).json({
				success: false,
				message: 'Номер телефона обязателен',
			})
			return
		}

		const user = await UserModel.findOne({ phoneNumber })
		console.log('Найден пользователь:', user ? 'да' : 'нет')

		if (!user) {
			res.status(404).json({
				success: false,
				message: 'Пользователь не найден',
			})
			return
		}

		// Генерируем новый код подтверждения
		console.log('Состояние до генерации кода:', {
			verificationCode: user.verificationCode,
			verificationCodeExpires: user.verificationCodeExpires,
		})

		user.generateVerificationCode()
		const verificationCode = user.verificationCode
		console.log('=== Информация о коде ===')
		console.log('Сгенерирован код в requestPasswordReset:', verificationCode)
		console.log('Код в объекте user:', user.verificationCode)
		console.log('Срок действия кода:', user.verificationCodeExpires)

		// Сохраняем код в базе перед отправкой
		console.log('Сохранение в базу данных...')
		await user.save()
		console.log('Код в объекте user после сохранения:', user.verificationCode)

		// Отправляем код через WhatsApp
		console.log('Отправка кода через WhatsApp...')
		const whatsappSent = await sendVerificationCode(
			phoneNumber,
			verificationCode // Передаем тот же код, что был сгенерирован
		)
		console.log('Результат отправки через WhatsApp:', whatsappSent)
		console.log('Код после отправки через WhatsApp:', verificationCode)

		if (!whatsappSent) {
			res.status(500).json({
				success: false,
				message: 'Ошибка при отправке кода через WhatsApp',
			})
			return
		}

		res.status(200).json({
			success: true,
			message: 'Код подтверждения отправлен',
			data: {
				userId: user._id,
				verificationCode: verificationCode, // Отправляем тот же код на фронтенд
			},
		})
		console.log('=== Конец процесса сброса пароля ===')
	} catch (error) {
		console.error('Ошибка при запросе сброса пароля:', error)
		res.status(500).json({
			success: false,
			message: 'Внутренняя ошибка сервера',
		})
	}
}

// Сброс пароля
export const resetPassword = async (
	req: AuthRequest,
	res: Response
): Promise<void> => {
	try {
		const { phoneNumber, code, newPassword } = req.body
		console.log('Reset password request:', { phoneNumber, code, newPassword })

		const user = await UserModel.findOne({ phoneNumber })
		console.log(
			'Found user:',
			user
				? {
						phoneNumber: user.phoneNumber,
						isVerified: user.isVerified,
						hasPassword: !!user.password,
				  }
				: 'not found'
		)

		if (!user) {
			res.status(404).json({ error: 'Пользователь не найден' })
			return
		}

		if (!user.verificationCode || !user.verificationCodeExpires) {
			res.status(400).json({ error: 'Код подтверждения не был отправлен' })
			return
		}

		if (user.verificationCodeExpires < new Date()) {
			res.status(400).json({ error: 'Код подтверждения истек' })
			return
		}

		if (user.verificationCode !== code) {
			res.status(400).json({ error: 'Неверный код подтверждения' })
			return
		}

		// Устанавливаем новый пароль и помечаем как верифицированного
		user.password = newPassword
		user.isVerified = true
		await user.hashPassword()
		user.verificationCode = undefined
		user.verificationCodeExpires = undefined
		await user.save()

		console.log('Password reset successful:', {
			phoneNumber: user.phoneNumber,
			isVerified: user.isVerified,
			hasPassword: !!user.password,
		})

		res.json({ message: 'Пароль успешно изменен' })
	} catch (error) {
		console.error('Ошибка сброса пароля:', error)
		res.status(500).json({ error: 'Ошибка при сбросе пароля' })
	}
}

// Проверка кода для сброса пароля
export const verifyResetCode = async (
	req: AuthRequest,
	res: Response
): Promise<void> => {
	try {
		console.log(`[${new Date().toISOString()}] 🔍 Проверка кода сброса пароля:`)
		console.log('Тело запроса:', req.body)

		const { phoneNumber, code } = req.body
		console.log('Полученные данные:', { phoneNumber, code })

		const user = await UserModel.findOne({ phoneNumber })
		console.log(
			'Найденный пользователь:',
			user
				? {
						phoneNumber: user.phoneNumber,
						hasVerificationCode: !!user.verificationCode,
						verificationCodeExpires: user.verificationCodeExpires,
				  }
				: 'не найден'
		)

		if (!user) {
			console.log('Пользователь не найден')
			res.status(400).json({ error: 'Пользователь не найден' })
			return
		}

		if (!user.verificationCode || !user.verificationCodeExpires) {
			console.log('Код подтверждения не был отправлен')
			res.status(400).json({ error: 'Код подтверждения не был отправлен' })
			return
		}

		if (user.verificationCode !== code) {
			console.log('Неверный код подтверждения')
			res.status(400).json({ error: 'Неверный код подтверждения' })
			return
		}

		if (user.verificationCodeExpires < new Date()) {
			console.log('Код подтверждения истек')
			res.status(400).json({ error: 'Код подтверждения истек' })
			return
		}

		console.log('Код подтвержден успешно')
		res.json({
			success: true,
			message: 'Код подтвержден',
			data: {
				userId: user._id,
			},
		})
	} catch (error) {
		console.error('Ошибка при проверке кода:', error)
		res.status(500).json({
			success: false,
			message: 'Внутренняя ошибка сервера',
		})
	}
}
