import { Request, Response } from 'express';
import { CompanySettings } from '../models/CompanySettings';
import { v4 as uuidv4 } from 'uuid';
import { TelegramService } from '../telegram/telegramClient';

export const saveCompanySettings = async (req: Request, res: Response) => {
  try {
    const { userId, nameCompany, managerResponse, idCompany } = req.body;

    console.log('Попытка создания компании:', {
      userId,
      nameCompany,
      managerResponse,
      idCompany
    });

    if (!userId || !nameCompany || !managerResponse || !idCompany) {
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

    // Создаем новую компанию с переданным ID
    const newCompany = {
      id: idCompany,
      nameCompany,
      phoneNumber: req.body.phoneNumber,
      managerResponse: responseTime,
      createdAt: new Date()
    };

    console.log('Создана новая компания:', newCompany);

    // Ищем существующие настройки пользователя или создаем новые
    let settings = await CompanySettings.findOne({ userId });
    
    if (settings) {
      // Добавляем новую компанию к существующим
      settings.companies.push(newCompany);
      console.log('Добавлена компания к существующим настройкам');
    } else {
      // Создаем новые настройки с первой компанией
      settings = new CompanySettings({
        userId,
        companies: [newCompany]
      });
      console.log('Созданы новые настройки с первой компанией');
    }

    await settings.save();
    console.log('Настройки успешно сохранены');

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

    const settings = await CompanySettings.findOne({ userId });

    if (!settings || settings.companies.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Компании не найдены'
      });
    }

    res.status(200).json({
      success: true,
      data: settings.companies
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

    const settings = await CompanySettings.findOne({ userId });
    console.log('Найденные настройки пользователя:', settings);

    if (!settings) {
      console.log('Настройки пользователя не найдены для userId:', userId);
      return res.status(404).json({
        success: false,
        message: 'Настройки пользователя не найдены'
      });
    }

    // Находим компанию для обновления
    const companyIndex = settings.companies.findIndex(company => {
      console.log('Сравниваем:', {
        companyId,
        companyIdInDB: company.id,
        match: company.id === companyId
      });
      return company.id === companyId;
    });

    console.log('Индекс найденной компании:', companyIndex);

    if (companyIndex === -1) {
      console.log('Компания не найдена для companyId:', companyId);
      return res.status(404).json({
        success: false,
        message: 'Компания не найдена'
      });
    }

    // Обновляем данные компании
    settings.companies[companyIndex].nameCompany = nameCompany;
    settings.companies[companyIndex].managerResponse = responseTime;

    await settings.save();
    console.log('Компания успешно обновлена');

    res.status(200).json({
      success: true,
      message: 'Данные компании успешно обновлены',
      data: settings.companies[companyIndex]
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

    const settings = await CompanySettings.findOne({ userId });
    console.log('Найденные настройки пользователя:', settings);

    if (!settings) {
      console.log('Настройки пользователя не найдены для userId:', userId);
      return res.status(404).json({
        success: false,
        message: 'Настройки пользователя не найдены'
      });
    }

    // Если это последняя компания, удаляем весь документ
    if (settings.companies.length === 1) {
      console.log('Удаление последней компании, удаляем весь документ');
      await CompanySettings.deleteOne({ userId });
      return res.status(200).json({
        success: true,
        message: 'Последняя компания успешно удалена'
      });
    }

    // Находим индекс компании для удаления
    const companyIndex = settings.companies.findIndex(company => {
      console.log('Сравниваем:', {
        companyId,
        companyIdInDB: company.id,
        match: company.id === companyId
      });
      return company.id === companyId;
    });

    console.log('Индекс найденной компании:', companyIndex);

    if (companyIndex === -1) {
      console.log('Компания не найдена для companyId:', companyId);
      return res.status(404).json({
        success: false,
        message: 'Компания не найдена'
      });
    }

    // Удаляем компанию из массива
    settings.companies.splice(companyIndex, 1);
    await settings.save();
    console.log('Компания успешно удалена');

    res.status(200).json({
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

    const settings = await CompanySettings.findOne({ userId });

    if (!settings || settings.companies.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Компании не найдены'
      });
    }

    res.status(200).json({
      userId: settings.userId,
      companies: settings.companies
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
    const { userId, companyName } = req.params;
    const settings = await CompanySettings.findOne({ userId });
    
    if (!settings) {
      return res.status(404).json({ success: false, message: 'Настройки не найдены' });
    }

    const company = settings.companies.find(c => c.nameCompany === companyName);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Компания не найдена' });
    }

    res.status(200).json({ success: true, telegramInviteLink: company.telegramInviteLink });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Ошибка сервера' });
  }
}; 
