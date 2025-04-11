import express from 'express';
import { 
  sendPhoneNumber, 
  verifyCode, 
  createPassword,
  login, 
  verifyPhone, 
  requestPasswordReset
} from '../controllers/authController';
import { authMiddleware } from '../middlewares/authMiddleware';

const router = express.Router();

// Маршруты регистрации
router.post('/register/phone', sendPhoneNumber);      // Шаг 1: Отправка номера
router.post('/register/verify', verifyCode);          // Шаг 2: Проверка кода
router.post('/register/password', createPassword);    // Шаг 3: Создание пароля

// Маршруты авторизации
router.post('/login', login);
router.post('/verify-phone', verifyPhone);
router.post('/request-password-reset', requestPasswordReset);

export default router;