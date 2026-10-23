import { acquireInstanceLock } from './config/instance-lock.js';
import { connectDB, pool } from './config/db.js';
import { initSchema } from './config/schema.js';
import {
    startConfiguredWhatsAppConnections,
    stopWhatsAppConnection,
    checkWhatsAppCredentialsExist
} from './whatsapp/connection.js';
import { startAdminServer, stopAdminServer } from './admin/server.js';
import { appLogger } from './config/logger.js';
import { applyCliNetworkConfig } from './config/network.js';
import { enableBotRuntime } from './whatsapp/bot-runtime-control.js';

let releaseInstanceLock: (() => void) | null = null;
let shutdownPromise: Promise<void> | null = null;

const shutdown = (signal: string) => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
        appLogger.info({ component: 'bootstrap', signal }, 'application.stopping');
        await Promise.allSettled([stopWhatsAppConnection(), stopAdminServer()]);
        await pool.end();
        releaseInstanceLock?.();
    })();
    return shutdownPromise;
};

const init = async () => {
    applyCliNetworkConfig();
    process.env.NODE_ENV = import.meta.url.includes('/dist/') || import.meta.url.includes('\\dist\\')
        ? 'production'
        : 'development';

    releaseInstanceLock = acquireInstanceLock();

    console.log('\n======================================================');
    console.log('  🍈 SAMBUTAN DURIAN — WhatsApp Engine & Web Admin');
    console.log('======================================================\n');
    appLogger.info({ component: 'bootstrap', environment: process.env.NODE_ENV }, 'application.starting');

    // 1. Hubungkan ke Database & buat tabel
    await connectDB();
    await initSchema();
    await enableBotRuntime();

    // 2. Mulai Web Admin Server
    await startAdminServer();

    // 3. Mulai WhatsApp Client jika kredensial sudah ada
    const hasCreds = await checkWhatsAppCredentialsExist();
    if (hasCreds) {
        startConfiguredWhatsAppConnections().catch((err) => {
            appLogger.error({ component: 'whatsapp', err }, 'whatsapp.auto_start_failed');
        });
    }
};

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => shutdown(signal).then(() => process.exit(0)).catch((error) => {
        appLogger.error({ component: 'bootstrap', err: error }, 'application.shutdown_failed');
        process.exit(1);
    }));
}

init().catch((error) => {
    appLogger.error({ component: 'bootstrap', err: error }, 'application.start_failed');
    return shutdown('startup-error').finally(() => { process.exitCode = 1; });
});
