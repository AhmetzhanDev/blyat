import mongoose from 'mongoose';

export interface IInstagramChat extends Document {
  chatId: string;
  companyId: mongoose.Types.ObjectId;
  isClosed: boolean;
  sendMessage: boolean;
  userName: string;
  name: string;
}

const InstagramChatSchema = new mongoose.Schema<IInstagramChat>({
  chatId: {
    type: String,
    required: true,
    // unique: true, // Уникальный идентификатор чата
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
  },
  userName: {
    type: String,
    required: false
  },
  name: {
      type: String,
      required: false
  }
}, { timestamps: true }); // автоматом добавит createdAt и updatedAt

export const InstagramChat = mongoose.model<IInstagramChat>('InstagramChat', InstagramChatSchema);

