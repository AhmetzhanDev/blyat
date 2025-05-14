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
				`[${new Date().toISOString()}] [Instagram] Processing callback...`
			)

			const { code, userId } = req.body
			const redirectUri = process.env.IG_REDIRECT_URI

			console.log(`[${new Date().toISOString()}] [Instagram] Received data:`, {
				code,
				userId,
				redirectUri,
			})

			if (!code) {
				console.log(
					`[${new Date().toISOString()}] [Instagram] Error: missing authorization code`
				)
				return res.status(400).json({
					success: false,
					error: 'Authorization code is missing',
				})
			}

			if (!userId) {
				console.log(
					`[${new Date().toISOString()}] [Instagram] Error: missing user ID`
				)
				return res.status(400).json({
					success: false,
					error: 'User ID is missing',
				})
			}

			if (!redirectUri) {
				console.log(
					`[${new Date().toISOString()}] [Instagram] Error: missing redirect URI in environment`
				)
				return res.status(500).json({
					success: false,
					error: 'Instagram configuration error',
					details: 'Missing redirect URI configuration',
				})
			}

			// Exchange code for token
			console.log(
				`[${new Date().toISOString()}] [Instagram] Exchanging code for token...`
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
					`[${new Date().toISOString()}] [Instagram] Error: invalid response from Instagram API`,
					result
				)
				throw new Error('Invalid response from Instagram API')
			}

			// Update user status
			console.log(
				`[${new Date().toISOString()}] [Instagram] Updating user data...`
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
				`[${new Date().toISOString()}] [Instagram] Instagram successfully connected`
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
				`[${new Date().toISOString()}] [Instagram] Callback processing error:`,
				error
			)

			// Enhanced error response with safe error handling
			const errorResponse = {
				success: false,
				error: 'Failed to process Instagram callback',
				details: error?.message || 'Unknown error occurred',
				type: error?.constructor?.name || 'UnknownError',
			}

			// Safely handle axios error responses
			if (error?.response?.data) {
				errorResponse.details =
					typeof error.response.data === 'string'
						? error.response.data
						: JSON.stringify(error.response.data)
			}

			return res.status(500).json(errorResponse)
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
