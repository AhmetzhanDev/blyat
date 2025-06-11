import express from 'express';
import { TelegramController } from '../controllers/telegramController';

const router = express.Router();
const telegramController = TelegramController.getInstance();

router.post('/initialize', (req, res) => telegramController.initializeClient(req, res));
router.post('/send-message', (req, res) => telegramController.sendMessage(req, res));
router.post('/disconnect', (req, res) => telegramController.disconnect(req, res));
router.get('/is-connected', (req, res) => telegramController.isConnected(req, res));
router.post('/make-bot-admin', (req, res) => telegramController.makeBotAdmin(req, res));
router.post('/create-groups', (req, res) => telegramController.createGroupsForCompanies(req, res));
router.post('/verify-group-code', (req, res) => telegramController.verifyGroupCode(req, res));
router.post('/generate-verification-code', (req, res) => telegramController.generateVerificationCode(req, res));

export default router; 