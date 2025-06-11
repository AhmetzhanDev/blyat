import { Router } from 'express';
import { TelegramController } from '../controllers/telegramController';

const router = Router();
const telegramController = new TelegramController();
const telegramRouter = Router();

telegramRouter.post('/initialize', telegramController.initializeClient.bind(telegramController));
telegramRouter.post('/create-groups', telegramController.createGroups.bind(telegramController));
telegramRouter.post('/verify-group', telegramController.verifyGroupCode.bind(telegramController));
telegramRouter.post('/generate-code', telegramController.generateVerificationCode.bind(telegramController));
telegramRouter.post('/disconnect', telegramController.disconnectClient.bind(telegramController));
telegramRouter.post('/make-bot-admin', telegramController.makeBotAdmin.bind(telegramController));

router.use('/', telegramRouter);

export default router; 