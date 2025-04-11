export interface WhatsAppData {
  id: string;
  ManagerResponse: number;
  nameCompany: string;
}

export interface QRResponse {
  success: boolean;
  message: string;
  data?: {
    status: 'pending' | 'ready' | 'error';
    qrCode?: string;
  };
}

export type ConnectionStatus = 'disconnected' | 'waiting' | 'scanning' | 'connected' | 'error'; 