import { Router } from 'express';
import { handleIncomingMessage, handleOutgoingMessage } from '../controllers/whatsappMessageController';

const router = Router();

router.post('/incoming', handleIncomingMessage);
router.post('/outgoing', handleOutgoingMessage);

export default router; 