import fs from 'fs';
import path from 'path';

export interface BusinessConfig {
    businessName: string;
    csName: string;
    productType: 'physical' | 'digital';
    welcomeMessage: string;
    enableGreeting: boolean;
    adminPhone?: string;
    enableOffHoursGreeting?: boolean;
    offHoursStart?: string;
    offHoursEnd?: string;
    offHoursMessage?: string;
}

const DEFAULT_CONFIG: BusinessConfig = {
    businessName: 'Sambutan Durian',
    csName: 'Admin Durian',
    productType: 'physical',
    welcomeMessage: 'Halo kak! Selamat datang di Sambutan Durian 🍈 Ada yang bisa kami bantu seputar pesanan durian hari ini?',
    enableGreeting: true,
    adminPhone: '',
    enableOffHoursGreeting: false,
    offHoursStart: '21:00',
    offHoursEnd: '08:00',
    offHoursMessage: 'Halo kak {{nama}}! Terima kasih sudah menghubungi Sambutan Durian 🍈 Saat ini kami sedang di luar jam kerja (toko tutup). Pesan kakak sudah kami terima dan akan segera kami balas saat jam operasional kembali aktif. Terima kasih atas pengertiannya! 🙏',
};

export const isCurrentTimeWithinOffHours = (
    startStr = '21:00',
    endStr = '08:00',
    timeZone = 'Asia/Jakarta'
): boolean => {
    try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
        });
        const parts = formatter.formatToParts(now);
        const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0');
        const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0');
        const currentMinutes = hour * 60 + minute;

        const [startHour, startMin] = (startStr || '21:00').split(':').map(Number);
        const [endHour, endMin] = (endStr || '08:00').split(':').map(Number);
        const startMinutes = (startHour || 0) * 60 + (startMin || 0);
        const endMinutes = (endHour || 0) * 60 + (endMin || 0);

        if (startMinutes === endMinutes) {
            return false;
        }

        if (startMinutes < endMinutes) {
            return currentMinutes >= startMinutes && currentMinutes < endMinutes;
        } else {
            // Midnight crossover e.g. 21:00 to 08:00
            return currentMinutes >= startMinutes || currentMinutes < endMinutes;
        }
    } catch {
        return false;
    }
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
