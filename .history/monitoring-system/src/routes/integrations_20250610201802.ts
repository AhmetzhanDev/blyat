import express from 'express';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import { getUserQR, sendWhatsAppCode} from '../controllers/whatsappController';
import { TelegramService } from '../telegram/TelegramService';
import { Response } from 'express';

const router = express.Router();

// WhatsApp маршруты
router.post('/whatsapp/accounts', authMiddleware,);
router.get('/whatsapp/accounts', authMiddleware, );
router.delete('/whatsapp/accounts/:accountId', authMiddleware, );
router.get('/whatsapp/containers/:accountId/status', authMiddleware, );
router.post('/whatsapp/containers/:accountId/stop', authMiddleware, );
router.get('/whatsapp/qr', authMiddleware, getUserQR);

// Telegram routes
router.post('/telegram/verify', authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { code, telegramGroupId, inviteLink } = req.body;
        const telegramService = TelegramService.getInstance();
        
        // Проверяем подключение
        const isConnected = await telegramService.isConnected();
        if (!isConnected) {
            return res.status(400).json({ 
                success: false, 
                message: 'Telegram клиент не подключен' 
            });
        }

        // Назначаем бота администратором
        await telegramService.makeBotAdmin(telegramGroupId);

        res.status(200).json({ 
            success: true, 
            message: 'Группа успешно верифицирована'
        });
    } catch (error) {
        console.error('Ошибка при верификации группы:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Ошибка при верификации группы',
            error: error instanceof Error ? error.message : 'Неизвестная ошибка'
        });
    }
});

export default router;