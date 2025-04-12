import { Request, Response } from 'express';
import { WhatsAppAccountModel } from '../models/WhatsAppAccount';
import { CompanySettings } from '../models/CompanySettings';
import { MessageMonitor } from '../services/messageMonitor';

const messageMonitor = MessageMonitor.getInstance();

export const handleIncomingMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, body, companyId } = req.body;
    const startTime = new Date();

    console.log(`[${startTime.toISOString()}] 📱 Получено сообщение: "${body}" от: ${from}`);

    if (!from || !body || !companyId) {
      console.log(`[${new Date().toISOString()}] ❌ Ошибка: отсутствуют обязательные поля`);
      console.log(`[${new Date().toISOString()}] 📝 Данные запроса:`, { from, body, companyId });
      res.status(400).json({ error: 'Необходимо указать from, body и companyId' });
      return;
    }

    // Находим аккаунт WhatsApp
    console.log(`[${new Date().toISOString()}] 🔍 Поиск аккаунта WhatsApp для номера: ${from}`);
    const account = await WhatsAppAccountModel.findOne({ phoneNumber: from });
    if (!account) {
      console.log(`[${new Date().toISOString()}] ❌ Ошибка: аккаунт WhatsApp не найден для номера ${from}`);
      res.status(404).json({ error: 'Аккаунт WhatsApp не найден' });
      return;
    }
    console.log(`[${new Date().toISOString()}] ✅ Аккаунт WhatsApp найден:`, account.companyName);

    // Находим компанию
    console.log(`[${new Date().toISOString()}] 🔍 Поиск компании с ID: ${companyId}`);
    const companySettings = await CompanySettings.findOne({ 'companies.id': companyId });
    if (!companySettings) {
      console.log(`[${new Date().toISOString()}] ❌ Ошибка: компания не найдена с ID ${companyId}`);
      res.status(404).json({ error: 'Компания не найдена' });
      return;
    }
    console.log(`[${new Date().toISOString()}] ✅ Компания найдена:`, companySettings.companies.find(c => c.id === companyId)?.nameCompany);

    // Запускаем мониторинг ответа
    console.log(`[${new Date().toISOString()}] 🚀 Запуск мониторинга для сообщения от ${from}`);
    await messageMonitor.startMonitoring(from, body, companyId);
    console.log(`[${new Date().toISOString()}] ✅ Мониторинг успешно запущен для сообщения от ${from}`);

    const endTime = new Date();
    const processingTime = endTime.getTime() - startTime.getTime();
    console.log(`[${endTime.toISOString()}] ⏱️ Обработка входящего сообщения завершена. Время обработки: ${processingTime}мс`);

    res.status(200).json({ 
      message: 'Сообщение получено, мониторинг запущен',
      details: {
        from,
        companyId,
        processingTime: `${processingTime}мс`
      }
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Критическая ошибка при обработке входящего сообщения:`, error);
    console.error(`[${new Date().toISOString()}] 📝 Данные запроса:`, req.body);
    res.status(500).json({ 
      error: 'Внутренняя ошибка сервера',
      details: error instanceof Error ? error.message : 'Неизвестная ошибка'
    });
  }
};

export const handleOutgoingMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { to, companyId } = req.body;
    const startTime = new Date();

    console.log(`[${startTime.toISOString()}] 📱 Начало обработки исходящего сообщения для ${to}`);

    if (!to || !companyId) {
      console.log(`[${new Date().toISOString()}] ❌ Ошибка: отсутствуют обязательные поля`);
      console.log(`[${new Date().toISOString()}] 📝 Данные запроса:`, { to, companyId });
      res.status(400).json({ error: 'Необходимо указать to и companyId' });
      return;
    }

    // Останавливаем мониторинг, так как ответ был отправлен
    console.log(`[${new Date().toISOString()}] 🛑 Остановка мониторинга для сообщения к ${to}`);
    messageMonitor.stopMonitoring(to, companyId);
    console.log(`[${new Date().toISOString()}] ✅ Мониторинг успешно остановлен для сообщения к ${to}`);

    const endTime = new Date();
    const processingTime = endTime.getTime() - startTime.getTime();
    console.log(`[${new Date().toISOString()}] ⏱️ Обработка исходящего сообщения завершена. Время обработки: ${processingTime}мс`);

    res.status(200).json({ 
      message: 'Мониторинг остановлен',
      details: {
        to,
        companyId,
        processingTime: `${processingTime}мс`
      }
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Критическая ошибка при обработке исходящего сообщения:`, error);
    console.error(`[${new Date().toISOString()}] 📝 Данные запроса:`, req.body);
    res.status(500).json({ 
      error: 'Внутренняя ошибка сервера',
      details: error instanceof Error ? error.message : 'Неизвестная ошибка'
    });
  }
}; 