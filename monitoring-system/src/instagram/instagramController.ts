import { Request, Response } from 'express'
import dotenv from 'dotenv'
import { InstagramService } from './instagramService'
import { UserModel } from '../models/User'
import { InstagramAccountModel } from '../models/InstagramAccount'
import { CompanySettings } from '../models/CompanySettings'
import { AuthRequest } from '../middlewares/authMiddleware'

dotenv.config()

const instagramService = new InstagramService()

export class InstagramController {
	public redirectToInstagramAuth(req: Request, res: Response) {
		// @ts-ignore
		const userId = req.user?.id;

		if (!userId) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		const instagramAuthUrl = `https://api.instagram.com/oauth/authorize?client_id=${process.env.IG_CLIENT_ID}&redirect_uri=https://api.salestrack.kz/api/instagram/callback&scope=business_basic,business_manage_messages&response_type=code&state=${userId}`

		res.send({ url: instagramAuthUrl })
		return { url: instagramAuthUrl }
	}

	public async handleAuthCallback(req: Request, res: Response) {
		try {
			console.log(
				`[${new Date().toISOString()}] [Instagram] Processing callback...`
			)

			const code = req.method === 'GET' ? req.query.code : req.body.code;
			const userId = req.method === 'GET' ? req.query.userId : req.body.userId;
			const redirectUri = process.env.IG_REDIRECT_URI;

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

			// Get user's company settings
			const companySettings = await CompanySettings.findOne({ userId })
			if (!companySettings) {
				throw new Error('Company settings not found')
			}

			// Create or update Instagram account
			const instagramAccount = await InstagramAccountModel.findOneAndUpdate(
				{ userId },
				{
					userId,
					companyName: companySettings.nameCompany,
					companyId: companySettings.id,
					avgResponseTime: companySettings.managerResponse || 5,
					secondTouch: false,
					instagramUsername: companySettings.nameCompany,
					accessToken: result.access_token,
					instagramUserId: result.user_id,
					instagramAccountId: result.instagramAccountId,
				},
				{ upsert: true, new: true }
			)

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

			// Update company settings
			await CompanySettings.updateOne(
				{ userId },
				{
					instagramUserId: result.user_id,
					accessToken: result.access_token,
					messanger: 'instagram'
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
					account: instagramAccount
				},
			})
		} catch (error: any) {
			console.error(
				`[${new Date().toISOString()}] [Instagram] Callback processing error:`,
				error
			)

			const errorResponse = {
				success: false,
				error: 'Failed to process Instagram callback',
				details: error?.message || 'Unknown error occurred',
				type: error?.constructor?.name || 'UnknownError',
			}

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
		try {
			await instagramService.handleMessage(req.body)
			res.status(200).send('Webhook received')
		} catch (error) {
			console.error('Error handling webhook:', error)
			res.status(500).send('Error processing webhook')
		}
	}

	public handleVerifyWebhook(req: Request, res: Response) {
		const mode = req.query['hub.mode']
		const challenge = req.query['hub.challenge']
		const verifyToken = req.query['hub.verify_token']

		console.log('Webhook verify:', { mode, challenge, verifyToken, envToken: process.env.IG_VERIFY_TOKEN });

		if (mode === 'subscribe' && verifyToken === process.env.IG_VERIFY_TOKEN) {
			res.status(200).send(String(challenge));
		} else {
			res.status(403).send('Verification failed');
		}
	}

	public async getInstagramAccounts(req: AuthRequest, res: Response) {
		try {
			const userId = req.user?.id
			if (!userId) {
				return res.status(401).json({ message: 'Unauthorized' })
			}

			const accounts = await InstagramAccountModel.find({ userId })
			res.json(accounts)
		} catch (error) {
			console.error('Error fetching Instagram accounts:', error)
			res.status(500).json({ message: 'Error fetching accounts' })
		}
	}

	public async deleteInstagramAccount(req: AuthRequest, res: Response) {
		try {
			const userId = req.user?.id
			const { accountId } = req.params

			if (!userId) {
				return res.status(401).json({ message: 'Unauthorized' })
			}

			const account = await InstagramAccountModel.findOneAndDelete({
				_id: accountId,
				userId
			})

			if (!account) {
				return res.status(404).json({ message: 'Account not found' })
			}

			// Update user and company settings
			await UserModel.updateOne(
				{ _id: userId },
				{
					addedInstagram: false,
					instagramAccessToken: null,
					instagramUserId: null,
					instagramAccountId: null
				}
			)

			await CompanySettings.updateOne(
				{ userId },
				{
					instagramUserId: null,
					accessToken: null,
					messanger: 'whatsapp'
				}
			)

			res.json({ message: 'Account deleted successfully' })
		} catch (error) {
			console.error('Error deleting Instagram account:', error)
			res.status(500).json({ message: 'Error deleting account' })
		}
	}
}
