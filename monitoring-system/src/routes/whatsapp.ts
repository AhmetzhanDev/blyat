import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import { 
  createWhatsAppAccount, 
  getContainerStatus, 
  stopContainer, 
  getWhatsAppAccounts,
  deleteWhatsAppAccount,
  getUserQR,
  handleQRScanned,
  getQRCodeStatus
} from '../controllers/whatsappController';
import { qrStatus } from '../whatsapp/whatsappClient';

const router = Router();

// Общие маршруты
router.post('/accounts', authMiddleware, createWhatsAppAccount);
router.get('/accounts/:accountId/status', authMiddleware, getContainerStatus);
router.post('/accounts/:accountId/stop', authMiddleware, stopContainer);
router.get('/accounts', authMiddleware, getWhatsAppAccounts);
router.delete('/accounts/:accountId', authMiddleware, deleteWhatsAppAccount);

// Маршруты для QR-кода
router.post('/qr', authMiddleware, getUserQR);
router.post('/qr/scanned', authMiddleware, handleQRScanned);
router.get('/qr/status', authMiddleware, getQRCodeStatus);

// Маршрут для проверки статуса WhatsApp
router.get('/status/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const status = qrStatus[userId] || 'pending';
    
    res.json({
      success: true,
      userId,
      status,
      message: status === 'ready' ? 'WhatsApp клиент готов к работе' : 'WhatsApp клиент не готов',

    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении статуса'
    });
  }
});

export default router; 
