//authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: string;
  };
}


export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    console.log(`[${new Date().toISOString()}] [authMiddleware] Проверка авторизации...`);

    if (!process.env.JWT_SECRET) {
      console.error(`[${new Date().toISOString()}] [authMiddleware] JWT_SECRET не установлен`);
      res.status(500).json({ message: 'Внутренняя ошибка сервера' });
      return;
    }

    const authHeader = req.headers.authorization;
    console.log(`[${new Date().toISOString()}] Заголовок Authorization:`, authHeader);

    const token = authHeader?.split(' ')[1];
    if (!token) {
      console.warn(`[${new Date().toISOString()}] [authMiddleware] Токен отсутствует`);
      res.status(401).json({ message: 'Требуется авторизация' });
      return;
    }

    console.log(`[${new Date().toISOString()}] Токен получен:`, token);

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as { userId: string };
    console.log(`[${new Date().toISOString()}] [authMiddleware] Токен успешно декодирован:`, decoded);

    if (!decoded.userId) {
      console.error(`[${new Date().toISOString()}] [authMiddleware] Ошибка: userId отсутствует в токене`);
      res.status(401).json({ message: 'Неверный токен' });
      return;
    }

    req.user = { id: decoded.userId };
    console.log(`[${new Date().toISOString()}] [authMiddleware] req.user:`, req.user);

    next();
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [authMiddleware] Ошибка верификации токена:`, error);
    res.status(401).json({ message: 'Неверный токен' });
  }
};