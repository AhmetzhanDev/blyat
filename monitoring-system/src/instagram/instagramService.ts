import axios from 'axios'
import { firstValueFrom } from 'rxjs'
import FormData from 'form-data'
import dotenv from 'dotenv'
import { TelegramService } from '../telegram/telegramClient'
import { MessageMonitor } from '../whatsapp/messageMonitor'
import { CompanySettings } from '../models/CompanySettings'
import { InstagramChat } from '../models/InstagramChat'
import { InstagramMessage } from '../models/InstagramMessage'

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

	async exchangeCodeForToken(code: string, redirectUri?: string) {
		try {
			console.log(
				`[${new Date().toISOString()}] [Instagram] Начало обмена кода на токен`
			)
			console.log(
				`[${new Date().toISOString()}] [Instagram] Используется redirect URI:`,
				redirectUri || process.env.IG_REDIRECT_URI
			)

			const { access_token, user_id } = await this.sendFormData(
				code,
				redirectUri
			)
			console.log(
				`[${new Date().toISOString()}] [Instagram] Получены access_token и user_id`
			)

			// Получаем ID пользователя и список страниц
			console.log(
				`[${new Date().toISOString()}] [Instagram] Получение информации о бизнес-аккаунте`
			)
			const userUrl = `${this.apiUrl}/me?access_token=${access_token}`
			console.log(
				`[${new Date().toISOString()}] [Instagram] URL запроса:`,
				userUrl
			)

			const userResponse = await axios.get(userUrl)
			console.log(
				`[${new Date().toISOString()}] [Instagram] Ответ от API:`,
				userResponse?.data
			)

			if (!userResponse || !userResponse.data) {
				throw new Error('No connected Instagram business accounts')
			}

			const page = userResponse.data
			const pageAccessToken = page.access_token
			const pageId = page.id

			// Получаем Instagram Business ID
			console.log(
				`[${new Date().toISOString()}] [Instagram] Получение Instagram Business ID`
			)
			const igUrl = `${this.apiUrl}/${user_id}?fields=instagram_business_account&access_token=${access_token}`
			console.log(
				`[${new Date().toISOString()}] [Instagram] URL запроса:`,
				igUrl
			)

			const igResponse = await axios.get(igUrl)
			console.log(
				`[${new Date().toISOString()}] [Instagram] Ответ от API:`,
				igResponse?.data
			)

			if (
				!igResponse ||
				!igResponse.data ||
				!igResponse.data.instagram_business_account
			) {
				throw new Error('Failed to retrieve Instagram Business Account ID')
			}

			const instagramAccountId = igResponse.data.instagram_business_account.id
			console.log(
				`[${new Date().toISOString()}] [Instagram] Успешно получен Instagram Account ID:`,
				instagramAccountId
			)

			return {
				access_token,
				user_id,
				instagramAccountId,
				message: 'User authenticated and saved successfully',
			}
		} catch (error: any) {
			console.error(
				`[${new Date().toISOString()}] [Instagram] Ошибка аутентификации:`,
				error
			)
			console.error(
				`[${new Date().toISOString()}] [Instagram] Ответ об ошибке:`,
				error.response?.data
			)
			throw new Error(`Authentication failed: ${error.message}`)
		}
	}

	async sendFormData(code: string, redirectUri?: string) {
		console.log(
			`[${new Date().toISOString()}] [Instagram] Отправка данных формы`
		)
		console.log(
			`[${new Date().toISOString()}] [Instagram] Используется redirect URI:`,
			redirectUri || process.env.IG_REDIRECT_URI
		)

		const formData = new FormData()
		formData.append('client_id', this.appId!)
		formData.append('client_secret', this.appSecret!)
		formData.append('grant_type', 'authorization_code')
		formData.append('redirect_uri', redirectUri || this.redirectUri!)
		formData.append('code', code)

		try {
			const response = await axios.post(this.apiUrl_TokenLive, formData, {
				headers: {
					...formData.getHeaders(),
				},
			})

			if (
				!response.data ||
				!response.data.access_token ||
				!response.data.user_id
			) {
				throw new Error('Invalid response from Instagram API')
			}

			return {
				access_token: response.data.access_token,
				user_id: response.data.user_id,
			}
		} catch (error: any) {
			console.error(
				`[${new Date().toISOString()}] [Instagram] Ошибка отправки данных формы:`,
				error
			)
			console.error(
				`[${new Date().toISOString()}] [Instagram] Ответ об ошибке:`,
				error.response?.data
			)
			throw new Error(`Failed to exchange code for token: ${error.message}`)
		}
	}

	async handleMessage(body: any) {
		console.log(`[${new Date().toISOString()}] [Instagram] Получен webhook`)
		if (body.entry) {
			body.entry.forEach((entry: any) => {
				entry.messaging?.forEach(async (event: any) => {
					console.log(
						`[${new Date().toISOString()}] [Instagram] Новое сообщение от ${
							event.sender.id
						}: ${event.message.text}`
					)
					// Обработка сообщения
				})
			})
		}
		return { status: 'success' }
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
				`[${new Date().toISOString()}] [Instagram] Ошибка получения сообщений:`,
				error.response ? error.response.data : error.message
			)
			throw new Error('Failed to fetch user messages')
		}
	}
}
