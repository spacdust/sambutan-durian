import fs from 'fs';
import path from 'path';
export const DEFAULT_WA_MANAGER_CONFIG = {
    rotationMode: 'round_robin',
    minDelaySeconds: 3,
    maxDelaySeconds: 5,
    maxConcurrency: 3,
    enableStickyAssignment: true,
};
const normalizeConfig = (config) => {
    const rotationMode = ['round_robin', 'least_busy', 'random'].includes(String(config.rotationMode))
        ? config.rotationMode
        : DEFAULT_WA_MANAGER_CONFIG.rotationMode;
    const minValue = Number(config.minDelaySeconds);
    const minDelaySeconds = Number.isFinite(minValue) ? Math.min(300, Math.max(0, Math.floor(minValue))) : DEFAULT_WA_MANAGER_CONFIG.minDelaySeconds;
    const maxValue = Number(config.maxDelaySeconds);
    const maxDelaySeconds = Number.isFinite(maxValue) ? Math.min(600, Math.max(minDelaySeconds, Math.floor(maxValue))) : Math.max(minDelaySeconds, DEFAULT_WA_MANAGER_CONFIG.maxDelaySeconds);
    const concurrencyValue = Number(config.maxConcurrency);
    const maxConcurrency = Number.isFinite(concurrencyValue) ? Math.min(10, Math.max(1, Math.floor(concurrencyValue))) : DEFAULT_WA_MANAGER_CONFIG.maxConcurrency;
    return {
        rotationMode,
        minDelaySeconds,
        maxDelaySeconds,
        maxConcurrency,
        enableStickyAssignment: typeof config.enableStickyAssignment === 'boolean' ? config.enableStickyAssignment : DEFAULT_WA_MANAGER_CONFIG.enableStickyAssignment,
    };
};
const STORAGE_PATH = path.resolve('config', 'whatsapp-sessions.json');
export class WhatsAppManager {
    sessions = new Map();
    stickyAssignments = new Map();
    roundRobinIndex = 0;
    config;
    storagePath = STORAGE_PATH;
    today;
    constructor(config = {}, storagePath = STORAGE_PATH, today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())) {
        this.config = normalizeConfig({ ...DEFAULT_WA_MANAGER_CONFIG, ...config });
        this.storagePath = storagePath;
        this.today = today;
        if (this.storagePath) {
            this.loadFromDisk();
        }
    }
    loadFromDisk() {
        if (!this.storagePath)
            return;
        try {
            if (fs.existsSync(this.storagePath)) {
                const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8'));
                if (data.config)
                    this.config = normalizeConfig({ ...DEFAULT_WA_MANAGER_CONFIG, ...data.config });
                if (Array.isArray(data.sessions)) {
                    this.sessions.clear();
                    for (const s of data.sessions) {
                        this.sessions.set(s.phone, s);
                    }
                }
                if (data.stickyAssignments && typeof data.stickyAssignments === 'object') {
                    this.stickyAssignments = new Map(Object.entries(data.stickyAssignments));
                }
            }
        }
        catch {
            // Ignore load errors and fall back to in-memory defaults
        }
    }
    saveToDisk() {
        if (!this.storagePath)
            return true;
        try {
            const dir = path.dirname(this.storagePath);
            if (!fs.existsSync(dir))
                fs.mkdirSync(dir, { recursive: true });
            const payload = {
                config: this.config,
                sessions: Array.from(this.sessions.values()),
                stickyAssignments: Object.fromEntries(this.stickyAssignments),
            };
            fs.writeFileSync(this.storagePath, JSON.stringify(payload, null, 2), 'utf-8');
            return true;
        }
        catch {
            return false;
        }
    }
    addSession(phone, id, dailyLimit = 300, csNameOverride) {
        const cleanPhone = phone.replace(/\D/g, '');
        const existing = this.sessions.get(cleanPhone);
        if (existing) {
            existing.id = id;
            existing.dailyLimit = dailyLimit;
            if (csNameOverride !== undefined)
                existing.csNameOverride = csNameOverride;
            this.saveToDisk();
            return existing;
        }
        const session = {
            id,
            phone: cleanPhone,
            status: 'disconnected',
            dailyLimit,
            todayLeadCount: 0,
            todayMessageCount: 0,
            counterDate: this.today(),
            csNameOverride,
        };
        this.sessions.set(cleanPhone, session);
        this.saveToDisk();
        return session;
    }
    removeSession(phone) {
        const cleanPhone = phone.replace(/\D/g, '');
        const removed = this.sessions.delete(cleanPhone);
        for (const [jid, assigned] of this.stickyAssignments.entries()) {
            if (assigned === cleanPhone) {
                this.stickyAssignments.delete(jid);
            }
        }
        if (removed)
            this.saveToDisk();
        return removed;
    }
    getSessions() {
        this.resetDailyCountersIfNeeded();
        return Array.from(this.sessions.values());
    }
    getSession(phone) {
        this.resetDailyCountersIfNeeded();
        return this.sessions.get(phone.replace(/\D/g, ''));
    }
    updateSession(phone, updates) {
        const session = this.getSession(phone);
        if (!session)
            return false;
        Object.assign(session, updates);
        this.saveToDisk();
        return true;
    }
    setSessionStatus(phone, status) {
        this.updateSession(phone, { status });
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(newConfig) {
        this.config = normalizeConfig({ ...this.config, ...newConfig });
        this.saveToDisk();
    }
    setStickyAssignment(jid, phone) {
        if (!this.config.enableStickyAssignment)
            return;
        this.stickyAssignments.set(jid, phone.replace(/\D/g, ''));
        this.saveToDisk();
    }
    getStickyAssignment(jid) {
        if (!this.config.enableStickyAssignment)
            return undefined;
        return this.stickyAssignments.get(jid);
    }
    recordMessageSent(phone) {
        const session = this.getSession(phone);
        if (session) {
            session.todayMessageCount = (session.todayMessageCount || 0) + 1;
            this.saveToDisk();
        }
    }
    getEffectiveCsName(phone, defaultName = 'Admin') {
        const session = this.getSession(phone);
        return session?.csNameOverride?.trim() || defaultName;
    }
    resetDailyCountersIfNeeded() {
        const currentDate = this.today();
        let changed = false;
        for (const session of this.sessions.values()) {
            if (session.counterDate !== currentDate) {
                session.todayLeadCount = 0;
                session.todayMessageCount = 0;
                session.counterDate = currentDate;
                changed = true;
            }
        }
        if (changed)
            this.saveToDisk();
    }
}
export const globalWhatsAppManager = new WhatsAppManager();
