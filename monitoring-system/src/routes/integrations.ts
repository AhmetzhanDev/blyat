import express from 'express';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import { getUserQR, sendWhatsAppCode} from '../controllers/whatsappController';
import { TelegramService } from '../telegram/telegramClient';
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
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Verification code is required' });
    }
    
    const telegramService = TelegramService.getInstance();
    telegramService.setVerificationCode(code);
    
    return res.json({ message: 'Verification code submitted successfully' });
  } catch (error) {
    console.error('Error verifying Telegram code:', error);
    return res.status(500).json({ error: 'Failed to verify Telegram code' });
  }
});

export default router;