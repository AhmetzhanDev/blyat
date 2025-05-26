import express from 'express';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import { getUserQR, sendWhatsAppCode} from '../controllers/whatsappController';

import { Response } from 'express';
import { InstagramController } from '../instagram/instagramController';

const router = express.Router();

const instagramController = new InstagramController();

// Webhook routes
router.get('/webhook', instagramController.handleVerifyWebhook);
router.post('/webhook', instagramController.handleMessageWebhook);

// Authentication routes
router.get('/url', instagramController.redirectToInstagramAuth);
router.get('/callback' , instagramController.handleAuthCallback);
router.post('/callback', instagramController.handleAuthCallback);

// Account management routes
router.get('/accounts', authMiddleware, instagramController.getInstagramAccounts);
router.delete('/accounts/:accountId', authMiddleware, instagramController.deleteInstagramAccount);

export default router;