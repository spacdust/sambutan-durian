let status = {
    state: 'unknown',
    lastUpdate: new Date().toISOString(),
    detail: 'Belum inisialisasi',
};
const sessionStatuses = new Map();
export const setWaStatus = (next) => {
    status = {
        ...status,
        ...next,
        lastUpdate: new Date().toISOString(),
    };
};
export const getWaStatus = () => ({ ...status });
export const setWaSessionStatus = (sessionId, next) => {
    const current = sessionStatuses.get(sessionId) || { state: 'unknown', lastUpdate: new Date().toISOString() };
    const now = new Date().toISOString();
    const reconnectCount = next.state === 'connecting' && current.state !== 'connecting' ? (current.reconnectCount || 0) + 1 : current.reconnectCount;
    sessionStatuses.set(sessionId, {
        ...current,
        ...next,
        ...(reconnectCount === undefined ? {} : { reconnectCount }),
        ...(next.state === 'open' ? { connectedAt: now } : {}),
        ...(next.state === 'close' || next.state === 'error' ? { disconnectedAt: now } : {}),
        ...(next.state === 'error' && next.detail ? { lastError: next.detail } : {}),
        lastUpdate: now,
    });
    const values = [...sessionStatuses.values()];
    const aggregate = values.find((item) => item.state === 'open')
        || values.find((item) => item.state === 'qr')
        || values.find((item) => item.state === 'connecting')
        || values[0];
    if (aggregate)
        setWaStatus(aggregate);
};
export const getWaSessionStatus = (sessionId) => ({
    ...(sessionStatuses.get(sessionId) || { state: 'unknown', lastUpdate: new Date().toISOString(), detail: 'Belum dimulai' })
});
export const getWaSessionStatuses = () => Object.fromEntries([...sessionStatuses].map(([id, value]) => [id, { ...value }]));
export const removeWaSessionStatus = (sessionId) => sessionStatuses.delete(sessionId);
export const isWaSessionStaleConnecting = (value, maxAgeMs = 60_000) => value.state === 'connecting' && Date.now() - Date.parse(value.lastUpdate) > maxAgeMs;
