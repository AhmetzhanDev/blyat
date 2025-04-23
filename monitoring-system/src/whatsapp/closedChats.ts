import { WhatsappMessage } from "../models/WhatsappMessage";
import { WhatsappChat } from "../models/WhatsappChat"
import { OpenAI } from "openai"
import { UserModel } from "../models/User";
import { CompanySettings } from "../models/CompanySettings";
import { MessageMonitor } from "./messageMonitor";
import { CronJob } from "cron/dist";

export const initCron = (messageMonitor: MessageMonitor) => {
    new CronJob('10 12 * * *', async () => {
        await getNotClosedChats();
    })

    new CronJob('0 10 * * *', async () => {
        await sendNotClosedChatsMessage(messageMonitor);
    }).start()

    console.log("Крон инициализирован")
}

const sendNotClosedChatsMessage = async (messageMonitor: MessageMonitor) => {
    const companies = await CompanySettings.find({});

    console.log(companies)

    for (const company of companies) {
        const chats = await WhatsappChat.find({ isClosed: false, sendMessage: true, companyId: company._id });

        let message = `Список чатов с не закрытыми сделками:\n\n`;

        let i = 1
        for (const chat of chats) {
            message += `${i}) https://wa.me/${chat.chatId}\n`;
            i++
        }

        console.log(company)
        console.log(message)

        await messageMonitor.sendTelegramMessage(company._id, message);
    }
}

const getNotClosedChats = async () => {
    const chats = await WhatsappChat.find({ isClosed: false });

    console.log(chats)

    for (const chat of chats) {
        const messages = await WhatsappMessage.find({ whatsappChatId: chat._id, createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }}).sort({ createdAt: -1 }).limit(10);

        const response = await getGptResponse(messages);

        console.log("GPT response:", response)

        if (response === "true") {
            await WhatsappChat.updateOne({ _id: chat._id }, { isClosed: true });
        } else {
            await WhatsappChat.updateOne({ _id: chat._id }, { sendMessage: true });
        }
    }
}


const getGptResponse = async (messages: any[]) => {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const stream = await openai.beta.threads.createAndRun({
        assistant_id: "asst_hfqBBefvNBiC89R1TuCreQXk",
        thread: {
            messages: [
            { role: "user", content: messages.map(m => `${m.isEcho ? "Менеджер" : "Клиент"}: "${m.text}"`).join("\n\n") },
            ],
        },
        stream: true
    })

    for await (const event of stream) {
        if (event.event === "thread.message.completed") {
            // console.log(event.data.content[0])
            // console.log((event.data.content[0] as any).text?.value)
            return (event.data.content[0] as any).text?.value.toString().toLowerCase()
        }
    }
}