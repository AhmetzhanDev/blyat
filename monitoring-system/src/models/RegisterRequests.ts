import mongoose from 'mongoose';

export interface IRegisterRequest {
    phone: string
}

const RegisterRequestSchema = new mongoose.Schema<IRegisterRequest>({
//   isEcho: { type: Boolean, required: true },
//   text: { type: String, required: true },
//   instagramChatId: { type: mongoose.Schema.Types.ObjectId, 
//     required: true },
phone: {
    type: String
}
}, { timestamps: true });

export const RegisterRequest = mongoose.model<IRegisterRequest>('RegisterRequests', RegisterRequestSchema);
// export const WhatsAppAccountModel = mongoose.model<IWhatsAppAccount>('WhatsAppAccount', whatsAppAccountSchema);