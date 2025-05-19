import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from './User';

export interface IInstagramAccount extends Document {
  userId: IUser['_id'];
  companyName: string;
  companyId: string;
  avgResponseTime: number;
  secondTouch: boolean;
  instagramUsername: string;
  accessToken: string;
  instagramUserId: string;
  instagramAccountId: string;
  createdAt: Date;
}

const instagramAccountSchema = new Schema<IInstagramAccount>({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  companyName: { 
    type: String, 
    required: true 
  },
  companyId: {
    type: String,
    required: true
  },
  avgResponseTime: { 
    type: Number, 
    required: true 
  },
  secondTouch: { 
    type: Boolean, 
    required: true, 
    default: false 
  },
  instagramUsername: { 
    type: String, 
    required: true 
  },
  accessToken: { 
    type: String, 
    required: true 
  },
  instagramUserId: {
    type: String,
    required: true
  },
  instagramAccountId: {
    type: String,
    required: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

export const InstagramAccountModel = mongoose.model<IInstagramAccount>('InstagramAccount', instagramAccountSchema); 