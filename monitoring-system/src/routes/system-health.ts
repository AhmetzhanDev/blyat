import express from 'express';
import { SystemHealth } from '../system-health/system-health';

const router = express.Router();
const systemHealth = SystemHealth.getInstance();

// Получить общее состояние системы
router.get('/status', systemHealth.getSystemStatus);

// Получить статус конкретной компании
router.get('/company/:companyId', systemHealth.getCompanyStatus);

export default router; 