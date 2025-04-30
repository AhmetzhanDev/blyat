import mongoose from 'mongoose';

export interface IInstagramMessage {
  isEcho: boolean;
  text: string;
  instagramChatId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const InstagramMessageSchema = new mongoose.Schema<IInstagramMessage>({
  isEcho: { type: Boolean, required: true },
  text: { type: String, required: true },
  instagramChatId: { type: mongoose.Schema.Types.ObjectId, 
    required: true },
}, { timestamps: true });

export const InstagramMessage = mongoose.model<IInstagramMessage>('InstagramMessage', InstagramMessageSchema);
