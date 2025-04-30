import mongoose from 'mongoose';

// Основная схема настроек с массивом компаний
const companySettingsSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    // unique: true
  },
  id: {
    type: String,
    required: false,
    // unique: true
  },
  nameCompany: {
    type: String,
    required: false
  },
  managerResponse: {
    type: Number,
    required: false
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
  whatsappAuthorized: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isRunning: {
    type: Boolean,
    default: false
  },
  messanger: { // whatsapp | instagram
    type: String,
    default: 'whatsapp'
  },
  accessToken: {
    type: String,
    required: false
  },
  instagramUserId: {
    type: String,
    required: false
  }
});

export const CompanySettings = mongoose.model('CompanySettings', companySettingsSchema); 