export interface AntiBanDelayConfig {
    minDelaySeconds: number;
    maxDelaySeconds: number;
    typingSpeedMsPerChar: number;
}

export const DEFAULT_ANTI_BAN_CONFIG: AntiBanDelayConfig = {
    minDelaySeconds: 3,
    maxDelaySeconds: 5,
    typingSpeedMsPerChar: 8,
};

export const DEFAULT_SUBSEQUENT_TYPING_CONFIG: AntiBanDelayConfig = {
    minDelaySeconds: 1,
    maxDelaySeconds: 4,
    typingSpeedMsPerChar: 12,
};

export const calculateRandomDelayMs = (config?: Partial<AntiBanDelayConfig>): number => {
    const rawMin = Number(config?.minDelaySeconds);
    const rawMax = Number(config?.maxDelaySeconds);
    const minSec = Number.isFinite(rawMin) ? Math.max(0, Math.floor(rawMin)) : DEFAULT_ANTI_BAN_CONFIG.minDelaySeconds;
    const maxSec = Number.isFinite(rawMax) ? Math.max(minSec, Math.floor(rawMax)) : Math.max(minSec, DEFAULT_ANTI_BAN_CONFIG.maxDelaySeconds);
    const minMs = minSec * 1000;
    const maxMs = maxSec * 1000;
    if (minMs === maxMs) return minMs;
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
};

export const calculateTypingDurationMs = (textLength: number, config?: Partial<AntiBanDelayConfig>): number => {
    const speed = Number.isFinite(Number(config?.typingSpeedMsPerChar)) && Number(config?.typingSpeedMsPerChar) > 0
        ? Number(config?.typingSpeedMsPerChar)
        : DEFAULT_SUBSEQUENT_TYPING_CONFIG.typingSpeedMsPerChar;
    const minMs = Number.isFinite(Number(config?.minDelaySeconds))
        ? Math.max(650, Math.floor(Number(config?.minDelaySeconds) * 1000))
        : 1_200;
    const maxMs = Number.isFinite(Number(config?.maxDelaySeconds))
        ? Math.min(4_500, Math.max(minMs, Math.floor(Number(config?.maxDelaySeconds) * 1000)))
        : 4_500;
    const baseDuration = Math.max(0, textLength) * speed;
    return Math.min(maxMs, Math.max(minMs, Math.floor(baseDuration)));
};
