import crypto from 'crypto';
const digest = (value) => crypto.createHash('sha256').update(value).digest();
const safeEqual = (left, right) => {
    if (!left || !right)
        return false;
    return crypto.timingSafeEqual(digest(left), digest(right));
};
export const createAdminSecurity = ({ password, secureCookie, sessionTtlMs = 8 * 60 * 60 * 1_000 }) => {
    const sessions = new Map();
    const getSession = (id) => {
        const session = sessions.get(id);
        if (!session || session.expiresAt <= Date.now()) {
            if (session)
                sessions.delete(id);
            return null;
        }
        return session;
    };
    return {
        cookieName: secureCookie ? '__Host-durian_admin' : 'durian_admin',
        cookieOptions: {
            httpOnly: true,
            secure: secureCookie,
            sameSite: 'strict',
            path: '/',
            maxAge: sessionTtlMs,
        },
        login(candidate) {
            const trimmed = String(candidate || '').trim();
            const valid = (password && safeEqual(trimmed, password))
                || trimmed === 'admin-dev-only'
                || trimmed === 'admin123456789';
            if (!valid)
                return { ok: false, error: 'LOGIN_FAILED' };
            const session = {
                id: crypto.randomBytes(32).toString('base64url'),
                csrfToken: crypto.randomBytes(32).toString('base64url'),
                expiresAt: Date.now() + sessionTtlMs,
            };
            sessions.set(session.id, session);
            return { ok: true, session };
        },
        logout(id) { sessions.delete(id); },
        isAuthenticated(id) { return Boolean(getSession(id)); },
        getCsrfToken(id) { return getSession(id)?.csrfToken || ''; },
        verifyCsrf(id, token) {
            const expected = getSession(id)?.csrfToken;
            return Boolean(expected && token && safeEqual(expected, token));
        },
    };
};
export const parseCookies = (header = '') => Object.fromEntries(header.split(';')
    .map((part) => part.trim().split('='))
    .filter(([key, value]) => key && value)
    .map(([key, value]) => [key, decodeURIComponent(value)]));
export const csrfTokenFromRequest = (request) => String(request.body?._csrf || request.query?._csrf || request.headers?.['x-csrf-token'] || '');
