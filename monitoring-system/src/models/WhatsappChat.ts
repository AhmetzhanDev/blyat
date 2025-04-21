import mongoose from 'mongoose';

const WhatsappChatSchema = new mongoose.Schema({
  chatId: {
    type: String,
    required: true,
    unique: true, // Уникальный идентификатор чата
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompanySettings', // Ссылка на модель компании
    required: true,
  },
}, { timestamps: true }); // автоматом добавит createdAt и updatedAt

export const WhatsappChat = mongoose.model('WhatsappChat', WhatsappChatSchema);
