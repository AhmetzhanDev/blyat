import axios from 'axios'
import { firstValueFrom } from 'rxjs'
import FormData from 'form-data'
import dotenv from 'dotenv'
import { TelegramService } from '../telegram/telegramClient'
import { MessageMonitor } from '../whatsapp/messageMonitor'
import { CompanySettings } from '../models/CompanySettings'
import { InstagramChat } from '../models/InstagramChat'
import { InstagramMessage } from '../models/InstagramMessage'
import { InstagramAccountModel, IInstagramAccount } from '../models/InstagramAccount'
import { Types } from 'mongoose'

dotenv.config()

export class InstagramService {
	private static instance: MessageMonitor
	private activeTimers: Map<string, NodeJS.Timeout>
	private telegramService: TelegramService

	private readonly appId = process.env.IG_APP_ID
	private readonly appSecret = process.env.IG_APP_SECRET
	private readonly redirectUri = process.env.IG_REDIRECT_URI
	private readonly apiUrl = 'https://graph.instagram.com/v22.0'
	private readonly apiUrl_TokenLive =
		'https://api.instagram.com/oauth/access_token'

	constructor() {
		this.activeTimers = new Map()
		this.telegramService = TelegramService.getInstance()
	}

	async exchangeCodeForToken(code: string, redirectUri: string) {
		// Validate inputs
		if (!code) {
			throw new Error('Authorization code is required')
		}
		if (!redirectUri) {
			throw new Error('Redirect URI is required')
		}
		if (!process.env.IG_APP_SECRET || !process.env.IG_APP_SECRET) {
			throw new Error('Instagram client credentials are not configured')
		}

		console.log(
			`[${new Date().toISOString()}] [Instagram] Initiating token exchange`
		)
		console.log(
			`[${new Date().toISOString()}] [Instagram] Using redirect URI:`,
			redirectUri
		)

		const formData = new FormData()
		formData.append('client_id', process.env.IG_CLIENT_ID!)
		formData.append('client_secret', process.env.IG_APP_SECRET!)
		formData.append('grant_type', 'authorization_code')
		formData.append('redirect_uri', redirectUri)
		formData.append('code', code)

		try {
			console.log(
				`[${new Date().toISOString()}] [Instagram] Sending token exchange request`
			)

			const response = await axios.post(this.apiUrl_TokenLive, formData, {
				headers: {
					...formData.getHeaders(),
				},
			})

			console.log(
				`[${new Date().toISOString()}] [Instagram] Token exchange response:`,
				response.data
			)

			if (!response.data) {
				throw new Error('Empty response from Instagram API')
			}

			if (!response.data.access_token) {
				throw new Error('No access token in Instagram response')
			}

			if (!response.data.user_id) {
				throw new Error('No user ID in Instagram response')
			}

			try {
				// Get Instagram Business Account ID
				const longLivedToken = await this.exchangeForLongLivedToken(
					response.data.access_token
				)
				const instagramAccountId = await this.getInstagramBusinessAccount(
					longLivedToken
				)

				return {
					access_token: longLivedToken,
					user_id: response.data.user_id,
					instagramAccountId,
				}
			} catch (businessError: any) {
				console.error(
					`[${new Date().toISOString()}] [Instagram] Business account setup error:`,
					businessError?.message || businessError
				)
				// Return basic token response if business account setup fails
				return {
					access_token: response.data.access_token,
					user_id: response.data.user_id,
				}
			}
		} catch (error: any) {
			console.error(
				`[${new Date().toISOString()}] [Instagram] Token exchange error:`,
				error?.response?.data || error?.message || error
			)

			// Enhance error message with API response details if available
			const errorMessage =
				error?.response?.data?.error_message ||
				error?.response?.data?.error?.message ||
				error?.message ||
				'Unknown error during token exchange'

			throw new Error(errorMessage)
		}
	}

	private async exchangeForLongLivedToken(
		shortLivedToken: string
	): Promise<string> {
		try {
			const response = await axios.get(
				'https://graph.instagram.com/access_token',
				{
					params: {
						grant_type: 'ig_exchange_token',
						client_secret: process.env.IG_APP_SECRET,
						access_token: shortLivedToken,
					},
				}
			)

			if (!response.data?.access_token) {
				throw new Error('Failed to get long-lived token')
			}

			return response.data.access_token
		} catch (error: any) {
			console.error(
				`[${new Date().toISOString()}] [Instagram] Long-lived token exchange error:`,
				error.response?.data || error.message
			)
			throw error
		}
	}

	private async getInstagramBusinessAccount(
		accessToken: string
	): Promise<string> {
		try {
			// Сначала получаем ID страницы Facebook
			const response = await axios.get(`${this.apiUrl}/me`, {
				params: {
					access_token: accessToken,
					fields: 'id,accounts{access_token,instagram_business_account{id}}'
				},
			})

			console.log(`[${new Date().toISOString()}] [Instagram] Facebook page response:`, response.data)

			if (!response.data?.accounts?.data?.[0]?.instagram_business_account?.id) {
				throw new Error('No Instagram business account found')
			}

			return response.data.accounts.data[0].instagram_business_account.id
		} catch (error: any) {
			console.error(
				`[${new Date().toISOString()}] [Instagram] Business account fetch error:`,
				error.response?.data || error.message
			)
			throw error
		}
	}

	async handleMessage(body: any) {
		console.log(`[${new Date().toISOString()}] [Instagram] Received webhook`)
		
		if (!body.entry) {
			return { status: 'success', message: 'No entries in webhook' }
		}

		for (const entry of body.entry) {
			if (!entry.messaging) continue

			for (const event of entry.messaging) {
				try {
					const senderId = event.sender.id
					const message = event.message

					if (!message || !message.text) continue

					console.log(
						`[${new Date().toISOString()}] [Instagram] New message from ${senderId}: ${message.text}`
					)

					// Find the Instagram account
					const instagramAccount = await InstagramAccountModel.findOne({
						instagramUserId: entry.id
					})

					if (!instagramAccount) {
						console.log(`[${new Date().toISOString()}] [Instagram] Account not found for user ${entry.id}`)
						continue
					}

					// Find or create chat
					let chat = await InstagramChat.findOne({
						chatId: senderId,
						companyId: instagramAccount.companyId
					})

					if (!chat) {
						// Get user info from Instagram
						const userInfo = await this.getUserInfo(senderId, instagramAccount.accessToken)
						
						chat = await InstagramChat.create({
							chatId: senderId,
							companyId: instagramAccount.companyId,
							isClosed: false,
							sendMessage: true,
							userName: userInfo.username,
							name: userInfo.name
						})
					}

					// Save message
					await InstagramMessage.create({
						isEcho: false,
						text: message.text,
						instagramChatId: chat._id
					})

					// Send to Telegram if configured
					if (instagramAccount.secondTouch) {
						const companySettings = await CompanySettings.findOne({
							id: instagramAccount.companyId
						})

						if (companySettings?.telegramGroupId) {
							// Convert to string and ensure it has a minus sign
							let groupId = companySettings.telegramGroupId.toString()
							if (!groupId.startsWith('-')) {
								groupId = `-${groupId}`
							}
							
							await this.telegramService.sendMessage(
								groupId,
								`📱 Instagram Message from ${chat.userName || senderId}:\n${message.text}`
							)
						}
					}

					// Send auto-response if configured
					if (instagramAccount.avgResponseTime > 0) {
						this.scheduleAutoResponse(chat._id, instagramAccount)
					}
				} catch (error) {
					console.error(
						`[${new Date().toISOString()}] [Instagram] Error processing message:`,
						error
					)
				}
			}
		}

		return { status: 'success' }
	}

	private async getUserInfo(userId: string, accessToken: string) {
		try {
			const response = await axios.get(`${this.apiUrl}/${userId}`, {
				params: {
					access_token: accessToken,
					fields: 'username,name'
				}
			})

			return {
				username: response.data.username,
				name: response.data.name
			}
		} catch (error) {
			console.error('Error fetching user info:', error)
			return {
				username: userId,
				name: userId
			}
		}
	}

	private scheduleAutoResponse(chatId: Types.ObjectId, account: IInstagramAccount) {
		const timerId = `instagram_${chatId.toString()}`
		
		// Clear existing timer if any
		if (this.activeTimers.has(timerId)) {
			clearTimeout(this.activeTimers.get(timerId))
		}

		// Schedule new auto-response
		const timer = setTimeout(async () => {
			try {
				const chat = await InstagramChat.findById(chatId)
				if (!chat || chat.isClosed) return

				// Send auto-response message
				await this.sendMessage(
					chat.chatId,
					account.accessToken,
					'Thank you for your message. Our team will get back to you shortly.'
				)

				// Save the auto-response message
				await InstagramMessage.create({
					isEcho: true,
					text: 'Thank you for your message. Our team will get back to you shortly.',
					instagramChatId: chatId
				})

				// Clear the timer
				this.activeTimers.delete(timerId)
			} catch (error) {
				console.error('Error sending auto-response:', error)
			}
		}, account.avgResponseTime * 1000)

		this.activeTimers.set(timerId, timer)
	}

	async sendMessage(recipientId: string, accessToken: string, message: string) {
		try {
			const response = await axios.post(
				`${this.apiUrl}/me/messages`,
				{
					recipient: { id: recipientId },
					message: { text: message }
				},
				{
					params: { access_token: accessToken }
				}
			)

			return response.data
		} catch (error) {
			console.error('Error sending message:', error)
			throw error
		}
	}

	async getUserMessages(
		instagramAccountId: string,
		accessToken: string,
		limit: number
	) {
		try {
			const url = `${this.apiUrl}${instagramAccountId}/messages`
			const response = await axios.get(url, {
				params: {
					access_token: accessToken,
					limit: limit,
				},
			})
			return response.data.data
		} catch (error: any) {
			console.error(
				`[${new Date().toISOString()}] [Instagram] Error fetching messages:`,
				error.response ? error.response.data : error.message
			)
			throw new Error('Failed to fetch user messages')
		}
	}
}
