import { Request, Response } from 'express'
import dotenv from 'dotenv'
import { InstagramService } from './instagramService'
import { UserModel } from '../models/User'
dotenv.config()

const instagramService = new InstagramService()

export class InstagramController {
	public redirectToInstagramAuth(req: Request, res: Response) {
		const instagramAuthUrl = `https://api.instagram.com/oauth/authorize?client_id=${process.env.IG_CLIENT_ID}&redirect_uri=${process.env.IG_REDIRECT_URI}&scope=business_basic,business_manage_messages&response_type=code`

		res.send({ url: instagramAuthUrl })
		return { url: instagramAuthUrl }
	}

	public async handleAuthCallback(req: Request, res: Response) {
		try {
			console.log(
				`[${new Date().toISOString()}] [Instagram] Обработка callback...`
			)

			const { code, userId, redirectUri } = req.body
			console.log(
				`[${new Date().toISOString()}] [Instagram] Получены данные:`,
				{ code, userId, redirectUri }
			)

			if (!code) {
				console.log(
					`[${new Date().toISOString()}] [Instagram] Ошибка: отсутствует код авторизации`
				)
				return res.status(400).json({
					success: false,
					error: 'Authorization code is missing',
				})
			}

			if (!userId) {
				console.log(
					`[${new Date().toISOString()}] [Instagram] Ошибка: отсутствует ID пользователя`
				)
				return res.status(400).json({
					success: false,
					error: 'User ID is missing',
				})
			}

			// Обмен на access_token и сохранение данных пользователя
			console.log(
				`[${new Date().toISOString()}] [Instagram] Обмен кода на токен...`
			)
			const result = await instagramService.exchangeCodeForToken(
				code,
				redirectUri
			)

			if (
				!result ||
				typeof result !== 'object' ||
				!result.access_token ||
				!result.user_id
			) {
				console.log(
					`[${new Date().toISOString()}] [Instagram] Ошибка: неверный ответ от Instagram API`
				)
				throw new Error('Invalid response from Instagram API')
			}

			// Обновляем статус пользователя
			console.log(
				`[${new Date().toISOString()}] [Instagram] Обновление данных пользователя...`
			)
			await UserModel.updateOne(
				{ _id: userId },
				{
					addedInstagram: true,
					instagramAccessToken: result.access_token,
					instagramUserId: result.user_id,
					instagramAccountId: result.instagramAccountId,
				}
			)

			console.log(
				`[${new Date().toISOString()}] [Instagram] Успешное подключение Instagram`
			)
			return res.status(200).json({
				success: true,
				message: 'Instagram successfully connected',
				data: {
					instagramAccountId: result.instagramAccountId,
				},
			})
		} catch (error: any) {
			console.error(
				`[${new Date().toISOString()}] [Instagram] Ошибка обработки callback:`,
				error
			)
			return res.status(500).json({
				success: false,
				error: 'Failed to process Instagram callback',
				details: error.message,
			})
		}
	}

	public async handleMessageWebhook(req: Request, res: Response) {
		// Обрабатываем полученные сообщения
		await instagramService.handleMessage(req.body)

		// res.sendStatus(200).send('Webhook received');
		return 'Webhook received'
	}

	public handleVerifyWebhook(
		req: Request,
		res: Response
		// @Query('hub.mode') mode: string,
		// @Query('hub.challenge') challenge: string,
		// @Query('hub.verify_token') verifyToken: string,
	) {
		const mode = req.query['hub.mode']
		const challenge = req.query['hub.challenge']
		const verifyToken = req.query['hub.verify_token']

		console.log('GOT ', verifyToken)
		console.log('Ned ', process.env.IG_VERIFY_TOKEN)
		console.log(challenge, verifyToken === process.env.IG_VERIFY_TOKEN)
		if (verifyToken === process.env.IG_VERIFY_TOKEN) {
			res.send(challenge)
			return challenge // Возвращаем challenge для подтверждения
		}
		return 'Invalid verification token'
	}
}
