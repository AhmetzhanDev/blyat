import express from 'express';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import { getUserQR, sendWhatsAppCode} from '../controllers/whatsappController';

import { Response } from 'express';

const router = express.Router();

// WhatsApp маршруты
router.post('/whatsapp/accounts', authMiddleware,);
router.get('/whatsapp/accounts', authMiddleware, );
router.delete('/whatsapp/accounts/:accountId', authMiddleware, );
router.get('/whatsapp/containers/:accountId/status', authMiddleware, );
router.post('/whatsapp/containers/:accountId/stop', authMiddleware, );
router.get('/whatsapp/qr', authMiddleware, getUserQR);



export default router;