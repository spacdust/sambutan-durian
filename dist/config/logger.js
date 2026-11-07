import pino from 'pino';
const REDACTED = '[REDACTED]';
const LOG_LEVELS = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);
const SENSITIVE_KEYS = /^(?:authorization|cookie|set-cookie|password|passwd|secret|token|api[-_]?key|session|sessionid|csrf|phone)$/i;
const CONTENT_KEYS = /^(?:payload|conversation|prompt|response)$/i;
const sanitizeString = (value) => value
    .replace(/\bBearer\s+[^\s,;]+/gi, `Bearer ${REDACTED}`)
    .replace(/\b(?:sk|pk)-[A-Za-z0-9_-]{8,}\b/g, REDACTED);
const sanitizeError = (error) => ({
    type: error.name || 'Error',
    message: sanitizeString(error.message),
    ...(typeof error.code === 'string' || typeof error.code === 'number' ? { code: error.code } : {}),
});
const sanitizeValue = (value, seen) => {
    if (typeof value === 'string')
        return sanitizeString(value);
    if (value === null || typeof value !== 'object')
        return value;
    if (value instanceof Error)
        return sanitizeError(value);
    if (seen.has(value))
        return '[Circular]';
    seen.add(value);
    if (Array.isArray(value))
        return value.map((item) => sanitizeValue(item, seen));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
        if (SENSITIVE_KEYS.test(key) || CONTENT_KEYS.test(key))
            return [key, REDACTED];
        return [key, sanitizeValue(item, seen)];
    }));
};
const sanitizeRecord = (value) => sanitizeValue(value, new WeakSet());
export const resolveLogLevel = (configured, environment = process.env.NODE_ENV) => {
    const normalized = configured?.trim().toLowerCase();
    if (normalized && LOG_LEVELS.has(normalized))
        return normalized;
    return environment === 'development' ? 'debug' : 'info';
};
export const createAppLogger = ({ destination, level } = {}) => pino({
    level: level || resolveLogLevel(process.env.LOG_LEVEL),
    base: { service: 'durian-bot' },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: { err: (value) => value },
    hooks: {
        logMethod(args, method) {
            const values = [...args];
            const eventIndex = typeof values.at(-1) === 'string' ? values.length - 1 : -1;
            const event = eventIndex >= 0 ? sanitizeString(String(values[eventIndex])) : undefined;
            if (eventIndex >= 0)
                values.splice(eventIndex, 1);
            const first = values[0];
            const fields = first && typeof first === 'object' ? sanitizeRecord(first) : {};
            method.apply(this, [{ ...fields, ...(event ? { event } : {}) }]);
        },
    },
}, destination);
export const appLogger = createAppLogger();
