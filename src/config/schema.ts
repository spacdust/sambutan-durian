import { DB_DRIVER, pool, type Database } from './db.js';

export const initSchema = async (database: Database = pool) => {
    if (DB_DRIVER === 'postgres') {
        await database.query(`
            CREATE TABLE IF NOT EXISTS auth_keys (
                id TEXT PRIMARY KEY,
                data JSONB NOT NULL
            );

            CREATE TABLE IF NOT EXISTS leads (
                jid TEXT PRIMARY KEY,
                name TEXT,
                phone TEXT,
                address TEXT,
                preferences TEXT,
                status TEXT NOT NULL DEFAULT 'new',
                notes TEXT,
                greeted_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS chat_history (
                id SERIAL PRIMARY KEY,
                jid TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                sender_type TEXT DEFAULT 'customer',
                content TEXT NOT NULL,
                provider_message_id TEXT UNIQUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_chat_history_jid ON chat_history(jid);
            CREATE INDEX IF NOT EXISTS idx_chat_history_jid_created ON chat_history(jid, created_at DESC);

            CREATE TABLE IF NOT EXISTS whatsapp_config (
                id INTEGER PRIMARY KEY DEFAULT 1,
                rotation_mode TEXT DEFAULT 'round_robin',
                min_delay_seconds INTEGER DEFAULT 3,
                max_delay_seconds INTEGER DEFAULT 5,
                max_concurrency INTEGER DEFAULT 3,
                enable_sticky_assignment BOOLEAN DEFAULT TRUE,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS bot_runtime_control (
                id INTEGER PRIMARY KEY DEFAULT 1,
                enabled BOOLEAN DEFAULT TRUE,
                activation_id TEXT,
                activated_at TIMESTAMP WITH TIME ZONE,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            INSERT INTO bot_runtime_control (id, enabled) VALUES (1, TRUE) ON CONFLICT (id) DO NOTHING;
            INSERT INTO whatsapp_config (id, rotation_mode) VALUES (1, 'round_robin') ON CONFLICT (id) DO NOTHING;
        `);
    } else {
        await database.query(`
            CREATE TABLE IF NOT EXISTS auth_keys (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS leads (
                jid TEXT PRIMARY KEY,
                name TEXT,
                phone TEXT,
                address TEXT,
                preferences TEXT,
                status TEXT NOT NULL DEFAULT 'new',
                notes TEXT,
                greeted_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                jid TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                sender_type TEXT DEFAULT 'customer',
                content TEXT NOT NULL,
                provider_message_id TEXT UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_chat_history_jid ON chat_history(jid);
            CREATE INDEX IF NOT EXISTS idx_chat_history_jid_created ON chat_history(jid, created_at DESC);

            CREATE TABLE IF NOT EXISTS whatsapp_config (
                id INTEGER PRIMARY KEY DEFAULT 1,
                rotation_mode TEXT DEFAULT 'round_robin',
                min_delay_seconds INTEGER DEFAULT 3,
                max_delay_seconds INTEGER DEFAULT 5,
                max_concurrency INTEGER DEFAULT 3,
                enable_sticky_assignment BOOLEAN DEFAULT 1,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS bot_runtime_control (
                id INTEGER PRIMARY KEY DEFAULT 1,
                enabled INTEGER DEFAULT 1,
                activation_id TEXT,
                activated_at TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            INSERT OR IGNORE INTO bot_runtime_control (id, enabled) VALUES (1, 1);
            INSERT OR IGNORE INTO whatsapp_config (id, rotation_mode) VALUES (1, 'round_robin');
        `);
    }

    // Ensure greeted_at column exists on leads table
    try {
        if (DB_DRIVER === 'postgres') {
            await database.query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS greeted_at TIMESTAMP WITH TIME ZONE');
        } else {
            const { rows } = await database.query('PRAGMA table_info(leads)');
            if (!rows.some((r: any) => r.name === 'greeted_at')) {
                await database.query('ALTER TABLE leads ADD COLUMN greeted_at TEXT');
            }
        }
    } catch {}
};
