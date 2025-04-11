import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  phoneNumber: string;
  password?: string;
  isVerified: boolean;
  verificationCode?: string;
  verificationCodeExpires?: Date;
  whatsappAuthorized: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateVerificationCode(): void;
  hashPassword(): Promise<void>;
  updateWhatsAppAuthorization(authorized: boolean): Promise<void>;
}

const userSchema = new Schema<IUser>({
  phoneNumber: { 
    type: String, 
    required: true, 
    unique: true 
  },
  password: { 
    type: String,
    required: false
  },
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  verificationCode: {
    type: String,
    default: null
  },
  whatsappAuthorized: {
    type: Boolean,
    default: false,
    set: function(this: Document & IUser, v: boolean) {
      this.updatedAt = new Date();
      return v;
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  verificationCodeExpires: Date
});

// Метод для хеширования пароля
userSchema.methods.hashPassword = async function(): Promise<void> {
  if (!this.password) {
    throw new Error('Пароль не может быть пустым');
  }
  this.password = await bcrypt.hash(this.password, 10);
  this.updatedAt = new Date();
};

// Метод для проверки пароля
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  if (!this.password) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Метод для генерации кода подтверждения
userSchema.methods.generateVerificationCode = function(): void {
  this.verificationCode = Math.floor(1000 + Math.random() * 9000).toString();
  this.verificationCodeExpires = new Date(Date.now() + 5 * 60 * 1000); // 10 минут
  this.updatedAt = new Date();
};

// Метод для обновления статуса авторизации WhatsApp
userSchema.methods.updateWhatsAppAuthorization = async function(authorized: boolean): Promise<void> {
  this.whatsappAuthorized = authorized;
  this.updatedAt = new Date();
  await this.save();
};

export const UserModel = mongoose.model<IUser>('User', userSchema);