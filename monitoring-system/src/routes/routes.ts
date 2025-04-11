import { Router } from 'express';
import { TelegramController } from './controllers/telegramController';

const router = Router();
const telegramController = new TelegramController();
const telegramRouter = Router();

telegramRouter.post('/initialize', telegramController.initializeClient.bind(telegramController));
telegramRouter.post('/create-groups', telegramController.createGroups.bind(telegramController));
telegramRouter.post('/disconnect', telegramController.disconnectClient.bind(telegramController));

// Добавляем маршруты Telegram к основному роутеру
router.use('/telegram', telegramRouter);

export default router; 