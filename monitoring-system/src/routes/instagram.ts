import express from 'express';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import { getUserQR, sendWhatsAppCode} from '../controllers/whatsappController';

import { Response } from 'express';
import { InstagramController } from '../instagram/instagramController';

const router = express.Router();

const instagramController = new InstagramController();

// WhatsApp маршруты
router.get('/webhook', instagramController.handleVerifyWebhook);
router.post('/webhook', instagramController.handleMessageWebhook); // Для получения сообщений

router.get('/url', instagramController.redirectToInstagramAuth); // Ссылка на авторизацию
router.post('/callback', instagramController.handleAuthCallback); // Для входа в аккаунт




export default router;