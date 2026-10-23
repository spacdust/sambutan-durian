import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import type { Server } from 'node:http';
import { createAdminSecurity, parseCookies, csrfTokenFromRequest } from './security.js';
import { createAdminApiRouter } from './api-router.js';
import { renderLoginPage } from './login-page.js';
import { applyCliNetworkConfig, getNetworkIPv4Addresses } from '../config/network.js';
import { appLogger } from '../config/logger.js';

dotenv.config();

let activeAdminServer: Server | null = null;

const listenOnAvailablePort = async (
    app: express.Express,
    startPort: number,
    maxTries = 20,
    host = '0.0.0.0'
): Promise<{ port: number; server: Server }> => {
    let port = startPort;
    for (let i = 0; i < maxTries; i++) {
        try {
            const server = await new Promise<Server>((resolve, reject) => {
                const s = app.listen(port, host, () => resolve(s));
                s.once('error', reject);
            });
            return { port, server };
        } catch (error: any) {
            if (error.code === 'EADDRINUSE') {
                port++;
            } else {
                throw error;
            }
        }
    }
    throw new Error(`Tidak menemukan port yang tersedia setelah mencoba port ${startPort}–${port}`);
};

export const startAdminServer = async (): Promise<number> => {
    const app = express();
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456789';
    const adminSecurity = createAdminSecurity({
        password: adminPassword,
        secureCookie: false,
    });

    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    }));

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Extract Session Cookie
    app.use((req, res, next) => {
        const cookies = parseCookies(req.headers.cookie);
        const sessionId = cookies[adminSecurity.cookieName];
        res.locals.adminSessionId = sessionId;
        next();
    });

    // Rate Limiting on Login
    const loginLimiter = rateLimit({
        windowMs: 60 * 1000,
        limit: 15,
        standardHeaders: true,
        legacyHeaders: false,
        message: { ok: false, error: 'Terlalu banyak percobaan masuk. Tunggu sebentar.' },
    });
    app.use('/admin/api/auth/login', loginLimiter);

    // CSRF Protection for state-changing API requests (skip login)
    app.use('/admin/api', (req, res, next) => {
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/auth/login') {
            return next();
        }
        const sessionId = res.locals.adminSessionId;
        if (!adminSecurity.isAuthenticated(sessionId)) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const token = csrfTokenFromRequest(req);
        if (!adminSecurity.verifyCsrf(sessionId, token)) {
            return res.status(403).json({ ok: false, error: 'Token CSRF tidak valid.' });
        }
        next();
    });

    // Mount Admin API Router
    app.use('/admin/api', createAdminApiRouter(adminSecurity));

    // Fallback Login SSR page
    app.get('/admin/login', (req, res) => {
        const sessionId = res.locals.adminSessionId;
        if (adminSecurity.isAuthenticated(sessionId)) {
            return res.redirect('/app');
        }
        res.type('html').send(renderLoginPage());
    });

    // Serve Frontend Vite SPA
    const adminUiDist = path.resolve('dist', 'admin-ui');
    if (fs.existsSync(adminUiDist)) {
        app.use('/app', express.static(adminUiDist));
        app.get(/^\/app(?:\/.*)?$/, (_req, res) => {
            res.sendFile(path.join(adminUiDist, 'index.html'));
        });
    }

    // Redirect Root and /admin to /app
    app.get('/', (_req, res) => res.redirect('/app'));
    app.get('/admin', (_req, res) => res.redirect('/app'));

    applyCliNetworkConfig();
    const requestedPort = Number(process.env.PORT || 3009);
    const host = process.env.HOST || '0.0.0.0';
    const { port, server } = await listenOnAvailablePort(app, requestedPort, 20, host);
    activeAdminServer = server;

    console.log(`\n🍈 Sambutan Durian — Web Admin aktif:`);
    console.log(`   👉 Local:   http://localhost:${port}/app`);
    if (host === '0.0.0.0') {
        const networkIps = getNetworkIPv4Addresses();
        for (const ip of networkIps) {
            console.log(`   👉 Network: http://${ip}:${port}/app`);
        }
    } else if (host !== '127.0.0.1') {
        console.log(`   👉 Network: http://${host}:${port}/app`);
    }
    console.log('');

    if (!fs.existsSync(adminUiDist)) {
        console.warn(`   ⚠️  Catatan: Folder '${adminUiDist}' belum ditemukan.`);
        console.warn(`      Jalankan 'npm run build:ui' agar Web Admin di /app dapat diakses.\n`);
    }

    return port;
};

export const stopAdminServer = async () => {
    const server = activeAdminServer;
    activeAdminServer = null;
    if (!server) return;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
};
