import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import { pool } from '../config/db.js';
const namespace = (sessionId, id) => sessionId === 'legacy' ? id : `wa:${sessionId}:${id}`;
const sessionAliases = new Map();
const resolveSessionId = (sessionId) => sessionAliases.get(sessionId) || sessionId;
export const aliasAuthState = (fromSessionId, toSessionId) => {
    sessionAliases.set(fromSessionId, toSessionId);
};
export const clearAuthAlias = (sessionId) => {
    sessionAliases.delete(sessionId);
};
export const clearAuthState = async (sessionId) => {
    if (sessionId === 'legacy')
        await pool.query("DELETE FROM auth_keys WHERE id NOT LIKE 'wa:%'");
    else
        await pool.query('DELETE FROM auth_keys WHERE id LIKE $1', [`wa:${sessionId}:%`]);
};
export const renameAuthState = async (fromSessionId, toSessionId) => {
    const fromPrefix = fromSessionId === 'legacy' ? '' : `wa:${fromSessionId}:`;
    const toPrefix = toSessionId === 'legacy' ? '' : `wa:${toSessionId}:`;
    await pool.transaction(async (transaction) => {
        const rows = await transaction.query(fromSessionId === 'legacy' ? "SELECT id, data FROM auth_keys WHERE id NOT LIKE 'wa:%'" : 'SELECT id, data FROM auth_keys WHERE id LIKE $1', [fromSessionId === 'legacy' ? undefined : `${fromPrefix}%`].filter((value) => value !== undefined));
        for (const row of rows.rows) {
            const id = fromSessionId === 'legacy' ? row.id : String(row.id).slice(fromPrefix.length);
            await transaction.query('INSERT INTO auth_keys (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [`${toPrefix}${id}`, JSON.stringify(row.data)]);
        }
        await transaction.query(fromSessionId === 'legacy' ? "DELETE FROM auth_keys WHERE id NOT LIKE 'wa:%'" : 'DELETE FROM auth_keys WHERE id LIKE $1', [fromSessionId === 'legacy' ? undefined : `${fromPrefix}%`].filter((value) => value !== undefined));
    });
};
export const hasAuthState = async (sessionId) => {
    const result = await pool.query('SELECT data FROM auth_keys WHERE id = $1', [namespace(sessionId, 'creds')]);
    const data = result.rows[0]?.data;
    return Boolean(data?.me?.id);
};
export const claimLegacyAuthState = async (sessionId) => {
    if (await hasAuthState(sessionId))
        return true;
    const legacy = await pool.query("SELECT data FROM auth_keys WHERE id = 'creds'");
    const me = String(legacy.rows[0]?.data?.me?.id || '').split(':')[0].split('@')[0];
    if (!me || me !== sessionId)
        return false;
    await pool.transaction(async (transaction) => {
        const keys = await transaction.query("SELECT id, data FROM auth_keys WHERE id NOT LIKE 'wa:%'");
        for (const row of keys.rows) {
            await transaction.query('INSERT INTO auth_keys (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [namespace(sessionId, row.id), JSON.stringify(row.data)]);
        }
        await transaction.query("DELETE FROM auth_keys WHERE id NOT LIKE 'wa:%'");
    });
    return true;
};
export const usePostgresAuthState = async (sessionId = 'legacy') => {
    const writeData = async (data, id) => {
        const json = JSON.stringify(data, BufferJSON.replacer);
        await pool.query('INSERT INTO auth_keys (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [namespace(resolveSessionId(sessionId), id), json]);
    };
    const readData = async (id) => {
        const { rows } = await pool.query('SELECT data FROM auth_keys WHERE id = $1', [namespace(resolveSessionId(sessionId), id)]);
        if (rows.length > 0) {
            const raw = rows[0].data;
            if (typeof raw === 'string') {
                return JSON.parse(raw, BufferJSON.reviver);
            }
            return JSON.parse(JSON.stringify(raw), BufferJSON.reviver);
        }
        return null;
    };
    const removeData = async (id) => {
        await pool.query('DELETE FROM auth_keys WHERE id = $1', [namespace(resolveSessionId(sessionId), id)]);
    };
    let creds = await readData('creds');
    if (!creds) {
        creds = initAuthCreds();
        await writeData(creds, 'creds');
    }
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category of Object.keys(data)) {
                        const items = data[category];
                        if (items && typeof items === 'object') {
                            for (const id of Object.keys(items)) {
                                const value = items[id];
                                if (value) {
                                    tasks.push(writeData(value, `${category}-${id}`));
                                }
                                else {
                                    tasks.push(removeData(`${category}-${id}`));
                                }
                            }
                        }
                    }
                    await Promise.all(tasks);
                },
            },
        },
        saveCreds: () => writeData(creds, 'creds'),
    };
};
