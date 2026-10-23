import { randomUUID } from 'node:crypto';
import { DB_DRIVER, pool, type Database } from '../config/db.js';

export type BotRuntimeControl = {
    enabled: boolean;
    activationId: string | null;
    activatedAt: string | null;
    updatedAt: string;
};

const enabledValue = (value: unknown) => value === true || value === 1 || value === '1' || value === 'true';

const mapControl = (row: any): BotRuntimeControl => ({
    enabled: enabledValue(row?.enabled),
    activationId: row?.activation_id || null,
    activatedAt: row?.activated_at || null,
    updatedAt: row?.updated_at || new Date(0).toISOString(),
});

export const getBotRuntimeControl = async (database: Database = pool): Promise<BotRuntimeControl> => {
    const result = await database.query('SELECT enabled, activation_id, activated_at, updated_at FROM bot_runtime_control WHERE id = 1');
    return mapControl(result.rows[0]);
};

export const enableBotRuntime = async (database: Database = pool, now = new Date()): Promise<BotRuntimeControl> => {
    const timestamp = now.toISOString();
    const activationId = randomUUID();
    const enabled = DB_DRIVER === 'postgres' ? true : 1;
    const result = await database.query(
        `UPDATE bot_runtime_control SET enabled = $1, activation_id = $2, activated_at = $3, updated_at = $4
         WHERE id = 1 RETURNING enabled, activation_id, activated_at, updated_at`,
        [enabled, activationId, timestamp, timestamp],
    );
    return mapControl(result.rows[0]);
};

export const disableBotRuntime = async (database: Database = pool, now = new Date()): Promise<BotRuntimeControl> => {
    const timestamp = now.toISOString();
    const disabled = DB_DRIVER === 'postgres' ? false : 0;
    const result = await database.query(
        `UPDATE bot_runtime_control SET enabled = $1, activation_id = NULL, activated_at = NULL, updated_at = $2
         WHERE id = 1 RETURNING enabled, activation_id, activated_at, updated_at`,
        [disabled, timestamp],
    );
    return mapControl(result.rows[0]);
};

export const resetBotRuntimeForStartup = (database: Database = pool) => disableBotRuntime(database);
