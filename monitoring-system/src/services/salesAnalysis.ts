import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function analyzeSales(chatMessages: string[]) {
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: `Вот переписка клиента:\n${chatMessages.join('\n')}\nПроизошла ли продажа? Ответь "Да" или "Нет".` }],
    max_tokens: 5,
  });

  return response.choices[0].message.content?.trim();
}