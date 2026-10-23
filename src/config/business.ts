import fs from 'fs';
import path from 'path';

export interface BusinessConfig {
    businessName: string;
    csName: string;
    productType: 'physical' | 'digital';
    welcomeMessage: string;
    enableGreeting: boolean;
    adminPhone?: string;
}

const DEFAULT_CONFIG: BusinessConfig = {
    businessName: 'Sambutan Durian',
    csName: 'Admin Durian',
    productType: 'physical',
    welcomeMessage: 'Halo kak! Selamat datang di Sambutan Durian 🍈 Ada yang bisa kami bantu seputar pesanan durian hari ini?',
    enableGreeting: true,
    adminPhone: '',
};

export const getBusinessConfig = (): BusinessConfig => {
    const configPath = path.resolve('business.config.json');
    if (fs.existsSync(configPath)) {
        try {
            const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            return {
                ...DEFAULT_CONFIG,
                ...fileConfig,
            };
        } catch {
            // fallback
        }
    }
    return DEFAULT_CONFIG;
};

export const updateBusinessConfig = (updates: Partial<BusinessConfig>): BusinessConfig => {
    const configPath = path.resolve('business.config.json');
    const current = getBusinessConfig();
    const updated = { ...current, ...updates };
    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
};
