import { WhatsappMessage } from '../models/WhatsappMessage'
import { WhatsappChat } from '../models/WhatsappChat'
import { OpenAI } from 'openai'
import { UserModel } from '../models/User'
import { CompanySettings } from '../models/CompanySettings'
import { MessageMonitor } from './messageMonitor'
import { CronJob } from 'cron/dist'

//Получает последние 10 сообщений за последние 24 часа
export const initCron = (messageMonitor: MessageMonitor) => {
	new CronJob('0 19 * * *', async () => {
		await getNotClosedChats()
	}).start()

	//Отправляет сообщение о не закрытых чатах в группу Telegram компании

	new CronJob('0 10 * * *', async () => {
		await sendNotClosedChatsMessage(messageMonitor)
	}).start()

	console.log('Крон инициализирован')
}

const sendNotClosedChatsMessage = async (messageMonitor: MessageMonitor) => {
	// Добавляем логирование для отладки
	console.log('Начало отправки сообщений о не закрытых чатах')

	// Получаем только активные компании с telegramGroupId
	const companies = await CompanySettings.find({
		telegramGroupId: { $exists: true, $ne: null },
	}).select('_id nameCompany telegramGroupId')

	console.log(
		'Найдены компании:',
		companies.map(c => ({
			id: c._id,
			name: c.nameCompany,
			telegramGroupId: c.telegramGroupId,
		}))
	)

	for (const company of companies) {
		if (!company.telegramGroupId) {
			console.log(
				`У компании ${
					company.nameCompany || 'Unknown'
				} не указан telegramGroupId, пропускаем`
			)
			continue
		}

		const chats = await WhatsappChat.find({
			isClosed: false,
			sendMessage: true,
			companyId: company._id,
		})

		if (chats.length === 0) {
			console.log(
				`Нет не закрытых чатов для компании ${company.nameCompany || 'Unknown'}`
			)
			continue
		}

		let message = `Список чатов с не закрытыми сделками:\n\n`

		let i = 1
		for (const chat of chats) {
			message += `${i}) https://wa.me/${chat.chatId}\n`
			i++
		}

		try {
			// Отправляем сообщение перед обновлением статуса
			await messageMonitor.sendTelegramMessage(company._id, message)
			console.log(
				`Сообщение о не закрытых чатах отправлено для компании ${
					company.nameCompany || 'Unknown'
				}`
			)

			// Обновляем статус после успешной отправки
			await WhatsappChat.updateMany(
				{ isClosed: false, sendMessage: true, companyId: company._id },
				{ sendMessage: false }
			)
		} catch (error) {
			console.error(
				`Ошибка при отправке сообщения для компании ${
					company.nameCompany || 'Unknown'
				}:`,
				error
			)
		}
	}
}

const getNotClosedChats = async () => {
	const chats = await WhatsappChat.find({ isClosed: false })

	console.log(chats)

	for (const chat of chats) {
		try {
			const messages = await WhatsappMessage.find({
				whatsappChatId: chat._id,
				createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
			})
				.sort({ createdAt: -1 })
				.limit(10)

			const response = await getGptResponse(messages)

			console.log('GPT response:', response)

			if (response === 'true') {
				await WhatsappChat.updateOne({ _id: chat._id }, { isClosed: true })
			} else {
				await WhatsappChat.updateOne({ _id: chat._id }, { sendMessage: true })
			}
		} catch (error) {
			console.log(error)
		}
	}

	console.log('Закрытие чатов завершено')
}

const getGptResponse = async (messages: any[]) => {
	const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

	const stream = await openai.beta.threads.createAndRun({
		assistant_id: 'asst_hfqBBefvNBiC89R1TuCreQXk',
		thread: {
			messages: [
				{
					role: 'user',
					content: messages
						.map(m => `${m.isEcho ? 'Менеджер' : 'Клиент'}: "${m.text}"`)
						.join('\n\n'),
				},
			],
		},
		stream: true,
	})

	for await (const event of stream) {
		if (event.event === 'thread.message.completed') {
			// console.log(event.data.content[0])
			// console.log((event.data.content[0] as any).text?.value)
			return (event.data.content[0] as any).text?.value.toString().toLowerCase()
		}
	}
}
