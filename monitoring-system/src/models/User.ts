import mongoose, { Document, Schema, Types } from 'mongoose'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

export interface IUser extends Document {
	_id: Types.ObjectId
	phoneNumber: string
	password?: string
	isVerified: boolean
	verificationCode?: string
	verificationCodeExpires?: Date
	whatsappAuthorized: boolean
	addedInstagram: boolean
	createdAt: Date
	updatedAt: Date
	comparePassword(candidatePassword: string): Promise<boolean>
	generateVerificationCode(): void
	hashPassword(): Promise<void>
	updateWhatsAppAuthorization(authorized: boolean): Promise<void>
}

const userSchema = new Schema<IUser>({
	phoneNumber: {
		type: String,
		required: true,
		unique: true,
	},
	password: {
		type: String,
		required: false,
	},
	isVerified: {
		type: Boolean,
		default: false,
	},
	verificationCode: {
		type: String,
		default: null,
	},
	whatsappAuthorized: {
		type: Boolean,
		default: false,
		set: function (this: Document & IUser, v: boolean) {
			this.updatedAt = new Date()
			return v
		},
	},
	addedInstagram: {
		type: Boolean,
		required: false,
	},
	createdAt: {
		type: Date,
		default: Date.now,
	},
	updatedAt: {
		type: Date,
		default: Date.now,
	},
	verificationCodeExpires: Date,
})

// Метод для хеширования пароля
userSchema.methods.hashPassword = async function (): Promise<void> {
	if (!this.password) {
		throw new Error('Пароль не может быть пустым')
	}
	this.password = await bcrypt.hash(this.password, 10)
	this.updatedAt = new Date()
}

// Метод для проверки пароля
userSchema.methods.comparePassword = async function (
	candidatePassword: string
): Promise<boolean> {
	if (!this.password) {
		return false
	}
	return bcrypt.compare(candidatePassword, this.password)
}

// Метод для генерации кода подтверждения
userSchema.methods.generateVerificationCode = function (): void {
	console.log('=== ГЕНЕРАЦИЯ КОДА В USER MODEL ===')
	console.log('Текущий код:', this.verificationCode)
	const min = 1000
	const max = 9999
	const range = max - min + 1
	const randomBytes = crypto.randomBytes(4)
	const randomNumber = randomBytes.readUInt32BE(0)
	const newCode = (min + (randomNumber % range)).toString()
	console.log('Новый код:', newCode)
	this.verificationCode = newCode
	this.verificationCodeExpires = new Date(Date.now() + 5 * 60 * 1000) // 5 минут
	this.updatedAt = new Date()
	console.log('=== КОНЕЦ ГЕНЕРАЦИИ КОДА ===')
}

// Метод для обновления статуса авторизации WhatsApp
userSchema.methods.updateWhatsAppAuthorization = async function (
	authorized: boolean
): Promise<void> {
	this.whatsappAuthorized = authorized
	this.updatedAt = new Date()
	await this.save()
}

export const UserModel = mongoose.model<IUser>('User', userSchema)
