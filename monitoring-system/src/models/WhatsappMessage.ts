import mongoose from 'mongoose';

const WhatsappMessageSchema = new mongoose.Schema({
  isEcho: { type: Boolean, required: true },
  text: { type: String, required: true },
  whatsappChatId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsappChat', required: true },
  isClosed: { type: Boolean, default: false },
}, { timestamps: true });

export const WhatsappMessage = mongoose.model('WhatsappMessage', WhatsappMessageSchema);
