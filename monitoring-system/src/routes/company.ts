import express from 'express';
import { 
  saveCompanySettings, 
  getCompanySettings, 
  updateCompanySettings,
  deleteCompanySettings,
  getData,
  getTelegramLink
} from '../controllers/companyController';

const router = express.Router();

// Создание новой компании
router.post('/settings', saveCompanySettings);

// Получение всех компаний пользователя
router.get('/settings/:userId', getCompanySettings);

// Обновление данных компании
router.put('/settings/:userId/:companyId', updateCompanySettings);

// Удаление компании
// router.delete('/settings/:userId/:companyId', deleteCompanySettings);

// Получение данных компаний для фронтенда
router.get('/getData/:userId', getData);

// Получение ссылки на Telegram для конкретной компании
router.get('/telegram-link/:userId/:companyId', getTelegramLink);

export default router; 