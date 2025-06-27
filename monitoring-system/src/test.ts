import {OpenAI} from "openai";
import dotenv from "dotenv";

dotenv.config();

const getGptResponse = async (messages: any[]) => {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const stream = await openai.beta.threads.createAndRun({
        assistant_id: "asst_sY7UAv24Ulcl2tjgcZ7xEruY",
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
            console.log((event.data.content[0] as any).text?.value)
            return (event.data.content[0] as any).text?.value.toString().toLowerCase()
        }
    }
}

getGptResponse([{isEcho: true, text: "Привет"}])