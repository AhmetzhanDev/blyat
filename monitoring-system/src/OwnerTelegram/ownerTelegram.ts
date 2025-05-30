import axios from 'axios'

const bot_token = "8120018877:AAHO2lD0yI--wSei68woTGtXo6yaNCcLGZk";
const chat_id = "1080160662";


// Функция для отправки сообщения в Telegram
const sendTelegramMessage = async (message: string): Promise<void> => {
    try {
        const url = `https://api.telegram.org/bot${bot_token}/sendMessage`
        await axios.post(url, {
            chat_id: chat_id,
            text: message,
            parse_mode: 'HTML'
        })
    } catch (error) {
        console.error('Ошибка при отправке сообщения в Telegram:', error)
    }
}

// Уведомление о регистрации нового пользователя
export const sendRegistrationNotification = async (userData: { 
    email: string, 
    name?: string,
    phone?: string 
}): Promise<void> => {
    const message = `
🆕 <b>Новая регистрация</b>

👤 Пользователь: ${userData.name || 'Не указано'}
📧 Email: ${userData.email}
📱 Телефон: ${userData.phone || 'Не указано'}
⏰ Время: ${new Date().toLocaleString()}
    `
    await sendTelegramMessage(message)
}

// Уведомление о создании новой компании
export const sendCompanyCreationNotification = async (companyData: {
    companyName: string,
    userId: string,
    userEmail: string
}): Promise<void> => {
    const message = `
🏢 <b>Создана новая компания</b>

📋 Название компании: ${companyData.companyName}
👤 Владелец: ${companyData.userEmail}
🆔 ID пользователя: ${companyData.userId}
⏰ Время: ${new Date().toLocaleString()}
    `
    await sendTelegramMessage(message)
}

// Уведомление об удалении компании
export const sendCompanyDeletionNotification = async (companyData: {
    companyName: string,
    userId: string,
    userEmail: string
}): Promise<void> => {
    const message = `
🗑 <b>Удалена компания</b>

📋 Название компании: ${companyData.companyName}
👤 Владелец: ${companyData.userEmail}
🆔 ID пользователя: ${companyData.userId}
⏰ Время: ${new Date().toLocaleString()}
    `
    await sendTelegramMessage(message)
}

