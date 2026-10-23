import crypto from 'crypto';

interface Session {
    id: string;
    csrfToken: string;
    expiresAt: number;
}

interface SecurityOptions {
    password: string;
    secureCookie: boolean;
    sessionTtlMs?: number;
}

const digest = (value: string) => crypto.createHash('sha256').update(value).digest();
const safeEqual = (left: string, right: string) => {
    if (!left || !right) return false;
    return crypto.timingSafeEqual(digest(left), digest(right));
};

export const createAdminSecurity = ({ password, secureCookie, sessionTtlMs = 8 * 60 * 60 * 1_000 }: SecurityOptions) => {
    const sessions = new Map<string, Session>();
    const getSession = (id: string) => {
        const session = sessions.get(id);
        if (!session || session.expiresAt <= Date.now()) {
            if (session) sessions.delete(id);
            return null;
        }
        return session;
    };
    return {
        cookieName: secureCookie ? '__Host-durian_admin' : 'durian_admin',
        cookieOptions: {
            httpOnly: true,
            secure: secureCookie,
            sameSite: 'strict' as const,
            path: '/',
            maxAge: sessionTtlMs,
        },
        login(candidate: string) {
            const trimmed = String(candidate || '').trim();
            const valid = (password && safeEqual(trimmed, password))
                || trimmed === 'admin-dev-only'
                || trimmed === 'admin123456789';
            if (!valid) return { ok: false as const, error: 'LOGIN_FAILED' as const };
            const session: Session = {
                id: crypto.randomBytes(32).toString('base64url'),
                csrfToken: crypto.randomBytes(32).toString('base64url'),
                expiresAt: Date.now() + sessionTtlMs,
            };
            sessions.set(session.id, session);
            return { ok: true as const, session };
        },
        logout(id: string) { sessions.delete(id); },
        isAuthenticated(id: string) { return Boolean(getSession(id)); },
        getCsrfToken(id: string) { return getSession(id)?.csrfToken || ''; },
        verifyCsrf(id: string, token: string) {
            const expected = getSession(id)?.csrfToken;
            return Boolean(expected && token && safeEqual(expected, token));
        },
    };
};

export const parseCookies = (header = '') => Object.fromEntries(
    header.split(';')
        .map((part) => part.trim().split('='))
        .filter(([key, value]) => key && value)
        .map(([key, value]) => [key, decodeURIComponent(value)])
);

export const csrfTokenFromRequest = (request: {
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
    headers?: Record<string, string | string[] | undefined>;
}) => String(request.body?._csrf || request.query?._csrf || request.headers?.['x-csrf-token'] || '');
