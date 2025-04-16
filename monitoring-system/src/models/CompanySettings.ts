import mongoose from 'mongoose';

// Схема для отдельной компании
const companySchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  nameCompany: {
    type: String,
    required: true
  },
  managerResponse: {
    type: Number,
    required: true
  },
  telegramGroupId: {
    type: Number,
    required: false
  },
  telegramInviteLink: {
    type: String,
    required: false
  },
  phoneNumber: {
    type: String,
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Основная схема настроек с массивом компаний
const companySettingsSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  companies: [companySchema],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const CompanySettings = mongoose.model('CompanySettings', companySettingsSchema); 