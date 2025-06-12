import { Request, Response } from 'express';
import { CompanySettings } from '../models/CompanySettings';
import { InstagramAccountModel, IInstagramAccount } from '../models/InstagramAccount';
import { TelegramService } from '../telegram/telegramClient';
import { io } from '../server';
import os from 'os';

interface WhatsAppSession {
    id: string;
    companyId: string;
    status: string;
    lastActive: Date;
}

interface SystemMetrics {
    memory: {
        total: number;
        free: number;
        used: number;
        usagePercentage: number;
    };
    cpu: {
        loadAverage: number[];
        cores: number;
    };
    uptime: number;
    connections: {
        total: number;
        active: number;
    };
}

export class SystemHealth {
    private static instance: SystemHealth;
    private telegramService: TelegramService;

    private constructor() {
        this.telegramService = TelegramService.getInstance();
    }

    public static getInstance(): SystemHealth {
        if (!SystemHealth.instance) {
            SystemHealth.instance = new SystemHealth();
        }
        return SystemHealth.instance;
    }

    private getSystemMetrics(): SystemMetrics {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const memoryUsagePercentage = (usedMemory / totalMemory) * 100;

        return {
            memory: {
                total: totalMemory,
                free: freeMemory,
                used: usedMemory,
                usagePercentage: Math.round(memoryUsagePercentage * 100) / 100
            },
            cpu: {
                loadAverage: os.loadavg(),
                cores: os.cpus().length
            },
            uptime: os.uptime(),
            connections: {
                total: io.engine.clientsCount,
                active: io.sockets.sockets.size
            }
        };
    }

    public getSystemStatus = async (req: Request, res: Response) => {
        try {
            const [whatsappStatus, instagramStatus, telegramStatus] = await Promise.all([
                this.getWhatsAppStatus(),
                this.getInstagramStatus(),
                this.getTelegramStatus()
            ]);

            const systemMetrics = this.getSystemMetrics();

            res.json({
                success: true,
                data: {
                    whatsapp: whatsappStatus,
                    instagram: instagramStatus,
                    telegram: telegramStatus,
                    system: {
                        metrics: systemMetrics,
                        environment: process.env.NODE_ENV || 'development',
                        nodeVersion: process.version,
                        platform: process.platform,
                        arch: process.arch
                    },
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            console.error('Error getting system status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get system status',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    public getCompanyStatus = async (req: Request, res: Response) => {
        try {
            const { companyId } = req.params;
            if (!companyId) {
                return res.status(400).json({
                    success: false,
                    message: 'Company ID is required'
                });
            }

            const [companySettings, instagramAccount] = await Promise.all([
                CompanySettings.findOne({ companyId }),
                InstagramAccountModel.findOne({ companyId })
            ]);

            const systemMetrics = this.getSystemMetrics();

            res.json({
                success: true,
                data: {
                    companyId,
                    whatsapp: null, // Will be implemented later
                    instagram: instagramAccount ? {
                        isActive: true,
                        username: instagramAccount.instagramUsername,
                        lastActive: instagramAccount.createdAt
                    } : null,
                    telegram: companySettings?.telegramGroupId ? {
                        isActive: true,
                        groupId: companySettings.telegramGroupId,
                        inviteLink: companySettings.telegramInviteLink
                    } : null,
                    system: {
                        metrics: systemMetrics,
                        environment: process.env.NODE_ENV || 'development'
                    },
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            console.error('Error getting company status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get company status',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async getWhatsAppStatus() {
        // Placeholder for WhatsApp status
        return {
            isActive: false,
            message: 'WhatsApp status not implemented yet'
        };
    }

    private async getInstagramStatus() {
        try {
            const accounts = await InstagramAccountModel.find();
            return {
                isActive: accounts.length > 0,
                totalAccounts: accounts.length,
                accounts: accounts.map(account => ({
                    username: account.instagramUsername,
                    lastActive: account.createdAt
                }))
            };
        } catch (error) {
            console.error('Error getting Instagram status:', error);
            return {
                isActive: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    private async getTelegramStatus() {
        try {
            const settings = await CompanySettings.find({ telegramGroupId: { $exists: true } });
            return {
                isActive: settings.length > 0,
                totalConfigured: settings.length,
                details: settings.map(setting => ({
                    companyId: setting.id,
                    groupConfigured: !!setting.telegramGroupId,
                    inviteLink: setting.telegramInviteLink
                }))
            };
        } catch (error) {
            console.error('Error getting Telegram status:', error);
            return {
                isActive: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
}
