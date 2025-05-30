import axios from 'axios'

const bot_token = "8120018877:AAHO2lD0yI--wSei68woTGtXo6yaNCcLGZk";
const chat_id = [1080160662, 263582171, 5030626318]
// 1080160662 b1bas
// 263582171 kebila
// 5030626318 serik_shanmanov


export const sendTelegramMessage = async (message: string) => {
    try {
        // Отправляем сообщение каждому ID из массива
        const sendPromises = chat_id.map(id => 
            axios.post(
                `https://api.telegram.org/bot${bot_token}/sendMessage`,
                {
                    chat_id: id,
                    text: message,
                    parse_mode: 'HTML'
                }
            )
        )

        // Ждем завершения всех отправок
        const results = await Promise.allSettled(sendPromises)
        
        // Проверяем результаты отправки
        const errors = results
            .map((result, index) => {
                if (result.status === 'rejected') {
                    return `Ошибка отправки для ID ${chat_id[index]}: ${result.reason}`
                }
                return null
            })
            .filter(Boolean)

        if (errors.length > 0) {
            console.error('Ошибки при отправке сообщений:', errors)
            throw new Error(errors.join('\n'))
        }

        return results.map((result, index) => ({
            chat_id: chat_id[index],
            status: result.status,
            data: result.status === 'fulfilled' ? result.value.data : null
        }))
    } catch (error) {
        console.error('Error sending Telegram messages:', error)
        throw error
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

