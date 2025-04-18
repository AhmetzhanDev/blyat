import { Request, Response } from 'express';
import { CompanySettings } from '../models/CompanySettings';
import { v4 as uuidv4 } from 'uuid';
import { TelegramService } from '../telegram/telegramClient';
import { Types } from 'mongoose';

export const saveCompanySettings = async (req: Request, res: Response) => {
  try {
    const { userId, nameCompany, managerResponse, idCompany, companyId } = req.body;

    console.log('Попытка создания компании:', {
      userId,
      nameCompany,
      managerResponse,
      idCompany
    });

    if (!userId || !nameCompany || !managerResponse || !idCompany || !companyId) {
      return res.status(400).json({
        success: false,
        message: 'Необходимо указать userId, название компании, время ответа менеджера и id компании'
      });
    }

    // Валидация времени ответа менеджера (0-30 минут)
    const responseTime = Number(managerResponse);
    if (isNaN(responseTime) || responseTime < 0 || responseTime > 30) {
      return res.status(400).json({
        success: false,
        message: 'Время ответа менеджера должно быть числом от 0 до 30 минут'
      });
    }

    // Ищем существующие настройки пользователя или создаем новые
    let settings = await CompanySettings.findOne({ _id: new Types.ObjectId(companyId) });

    const newCompany = {
      id: idCompany,
      nameCompany,
      phoneNumber: settings?.phoneNumber || '',
      managerResponse: responseTime,
      companyId,
      createdAt: new Date()
    };
    
    if (settings) {
      // Добавляем новую компанию к существующим
      await CompanySettings.updateOne(
        { _id: new Types.ObjectId(companyId) },
        { ...newCompany }
      )
      console.log('Добавлена компания');
    } else {
      // Создаем новые настройки с первой компанией
      console.log("Компания не найдена")
    }

    // Создаем группы в Telegram для новых компаний
    const telegramService = TelegramService.getInstance();
    await telegramService.initialize();
    await telegramService.createGroupsForCompanies([newCompany]);

    res.status(201).json({
      success: true,
      message: 'Компания успешно добавлена',
      data: newCompany
    });
  } catch (error) {
    console.error('Ошибка при сохранении настроек компании:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при сохранении настроек компании'
    });
  }
};

export const getCompanySettings = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const settings = await CompanySettings.find({ userId, phoneNumber: {$ne: null} });

    if (!settings || settings.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Компании не найдены'
      });
    }

    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Ошибка при получении настроек компании:', error);
    res.status(500).json({
      success: false,
      message: 'Произошла ошибка при получении настроек компании'
    });
  }
};

export const updateCompanySettings = async (req: Request, res: Response) => {
  try {
    const { userId, companyId } = req.params;
    const { nameCompany, managerResponse } = req.body;

    console.log('Попытка обновления компании:', {
      userId,
      companyId,
      nameCompany,
      managerResponse
    });

    if (!nameCompany || !managerResponse) {
      return res.status(400).json({
        success: false,
        message: 'Необходимо указать название компании и время ответа менеджера'
      });
    }

    // Валидация времени ответа менеджера (0-30 минут)
    const responseTime = Number(managerResponse);
    if (isNaN(responseTime) || responseTime < 0 || responseTime > 30) {
      return res.status(400).json({
        success: false,
        message: 'Время ответа менеджера должно быть числом от 0 до 30 минут'
      });
    }

    const settings = await CompanySettings.findOne({ _id: new Types.ObjectId(companyId) });
    console.log('Найденные настройки пользователя:', settings);

    if (!settings) {
      console.log('Настройки пользователя не найдены для userId:', userId);
      return res.status(404).json({
        success: false,
        message: 'Настройки пользователя не найдены'
      });
    }

    if (!settings.telegramInviteLink) {
      const telegramService = TelegramService.getInstance();
      await telegramService.initialize();
      await telegramService.createGroupsForCompanies([settings]);
    }

    await CompanySettings.updateOne(
      { _id: new Types.ObjectId(companyId) },
      { $set: { nameCompany, managerResponse } }
    );

    res.status(200).json({
      success: true,
      message: 'Данные компании успешно обновлены',
      data: {...settings, nameCompany, managerResponse}
    });
  } catch (error) {
    console.error('Ошибка при обновлении данных компании:', error);
    res.status(500).json({
      success: false,
      message: 'Произошла ошибка при обновлении данных компании'
    });
  }
};

export const deleteCompanySettings = async (req: Request, res: Response) => {
  try {
    const { userId, companyId } = req.params;
    
    console.log('Попытка удаления компании:', {
      userId,
      companyId
    });

    const settings = await CompanySettings.findOne({ userId, _id: new Types.ObjectId(companyId) });
    console.log('Найденные настройки пользователя:', settings);

    if (!settings) {
      console.log('Настройки пользователя не найдены для userId:', userId);
      return res.status(404).json({
        success: false,
        message: 'Настройки пользователя не найдены'
      });
    }

    console.log('Удаление последней компании, удаляем весь документ');
    await CompanySettings.deleteOne({ userId, _id: new Types.ObjectId(companyId) });
    return res.status(200).json({
      success: true,
      message: 'Компания успешно удалена'
    });
  
  } catch (error) {
    console.error('Ошибка при удалении компании:', error);
    res.status(500).json({
      success: false,
      message: 'Произошла ошибка при удалении компании'
    });
  }
};

export const getData = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Необходимо указать userId'
      });
    }

    const settings = await CompanySettings.find({ userId, phoneNumber: {$ne: null} });

    if (!settings || settings.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Компании не найдены'
      });
    }

    res.status(200).json({
      userId: userId,
      companies: settings
    });
  } catch (error) {
    console.error('Ошибка при получении данных:', error);
    res.status(500).json({
      success: false,
      message: 'Произошла ошибка при получении данных'
    });
  }
};

export const getTelegramLink = async (req: Request, res: Response) => {
  try {
    const { userId, companyId } = req.params;
    const settings = await CompanySettings.findOne({ userId, _id: new Types.ObjectId(companyId) });
    
    if (!settings) {
      return res.status(404).json({ success: false, message: 'Настройки не найдены' });
    }

    res.status(200).json({ success: true, telegramInviteLink: settings.telegramInviteLink });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
}; 
