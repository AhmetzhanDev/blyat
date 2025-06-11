import mongoose from 'mongoose'

// Интерфейс для методов модели
interface ICompanySettingsMethods {
	generateVerificationCode(): number;
}

// Интерфейс для документа
export interface ICompanySettings extends mongoose.Document {
	userId: string;
	id?: string;
	nameCompany?: string;
	managerResponse?: number;
	working_hours_start?: string;
	working_hours_end?: string;
	telegramGroupId?: string;
	telegramInviteLink?: string;
	phoneNumber?: string;
	whatsappAuthorized: boolean;
	createdAt: Date;
	isRunning: boolean;
	messanger: string;
	accessToken?: string;
	instagramUserId?: string;
	verificationCode?: number;
	generateVerificationCode(): number;
}

// Основная схема настроек с массивом компаний
const companySettingsSchema = new mongoose.Schema({
	userId: {
		type: String,
		required: true,
		// unique: true
	},
	id: {
		type: String,
		required: false,
		// unique: true
	},
	nameCompany: {
		type: String,
		required: false,
	},
	managerResponse: {
		type: Number,
		required: false,
	},
	working_hours_start: {
		type: String,
		required: false,
	},
	working_hours_end: {
		type: String,
		required: false,
	},
	telegramGroupId: {
		type: String,
		required: false,
	},
	telegramInviteLink: {
		type: String,
		required: false,
	},
	phoneNumber: {
		type: String,
		required: false,
	},
	whatsappAuthorized: {
		type: Boolean,
		default: false,
	},
	createdAt: {
		type: Date,
		default: Date.now,
	},
	isRunning: {
		type: Boolean,
		default: false,
	},
	messanger: {
		// whatsapp | instagram
		type: String,
		default: 'whatsapp',
	},
	accessToken: {
		type: String,
		required: false,
	},
	instagramUserId: {
		type: String,
		required: false,
	},
	verificationCode: {
		type: Number,
		required: false
	}
})

// Add method to generate verification code
companySettingsSchema.methods.generateVerificationCode = function() {
	// Generate a random 6-digit number
	const code = Math.floor(100000 + Math.random() * 900000);
	this.verificationCode = code;
	return code;
};

export const CompanySettings = mongoose.model<ICompanySettings, mongoose.Model<ICompanySettings, {}, ICompanySettingsMethods>>(
	'CompanySettings',
	companySettingsSchema
)
