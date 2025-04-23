import mongoose from 'mongoose';

export interface IWhatsappChat extends Document {
  chatId: string;
  companyId: mongoose.Types.ObjectId;
  isClosed: boolean;
  sendMessage: boolean;
}

const WhatsappChatSchema = new mongoose.Schema<IWhatsappChat>({
  chatId: {
    type: String,
    required: true,
    unique: true, // Уникальный идентификатор чата
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    // ref: 'CompanySettings', // Ссылка на модель компании
    required: true,
  },
  isClosed: {
    type: Boolean,
    default: false
  },
  sendMessage: {
    type: Boolean,
    default: false
  }
}, { timestamps: true }); // автоматом добавит createdAt и updatedAt

export const WhatsappChat = mongoose.model<IWhatsappChat>('WhatsappChat', WhatsappChatSchema);

