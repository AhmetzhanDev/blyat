import mongoose from 'mongoose';

export interface IWhatsappMessage {
  isEcho: boolean;
  text: string;
  whatsappChatId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const WhatsappMessageSchema = new mongoose.Schema<IWhatsappMessage>({
  isEcho: { type: Boolean, required: true },
  text: { type: String, required: true },
  whatsappChatId: { type: mongoose.Schema.Types.ObjectId, 
    // ref: 'WhatsappChat', 
    required: true },
}, { timestamps: true });

export const WhatsappMessage = mongoose.model<IWhatsappMessage>('WhatsappMessage', WhatsappMessageSchema);
