import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient, type QueryResult as PgQueryResult } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export type QueryResult = { rows: any[]; rowCount: number };
export type Database = {
    query: (sql: string, params?: any[]) => Promise<QueryResult>;
    transaction: <T>(work: (database: Database) => Promise<T>) => Promise<T>;
    end: () => Promise<void>;
};

export const DB_DRIVER = (process.env.DB_DRIVER || 'sqlite').toLowerCase();

const parseJsonColumns = (row: any) => {
    if (!row || typeof row !== 'object') return row;
    for (const key of ['data', 'options', 'customer_data', 'metadata']) {
        if (typeof row[key] === 'string') {
            try {
                row[key] = JSON.parse(row[key]);
            } catch {
                // Keep original string
            }
        }
    }
    // Normalize SQLite timestamps (YYYY-MM-DD HH:MM:SS) to ISO UTC
    for (const key of Object.keys(row)) {
        if (typeof row[key] === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(row[key])) {
            row[key] = row[key].replace(' ', 'T') + 'Z';
        }
    }
    return row;
};

export const toSqliteSql = (sql: string) => sql
    .replace(/TRUNCATE TABLE\s+(\w+)/gi, 'DELETE FROM $1')
    .replace(/::\s*[a-z_][a-z0-9_]*(?:\[\])?/gi, '')
    .replace(/\$(\d+)/g, '?$1')
    .replace(/NOW\(\)/gi, 'CURRENT_TIMESTAMP');

const sqliteDatabase = (db: DatabaseSync): Database => {
    type TransactionContext = { active: boolean; savepoint: number; connection: Database };
    const transactionContext = new AsyncLocalStorage<TransactionContext>();
    let queue = Promise.resolve();
    let closing = false;

    const serialize = async <T>(work: () => Promise<T>): Promise<T> => {
        const previous = queue;
        let release!: () => void;
        queue = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        try {
            return await work();
        } finally {
            release();
        }
    };

    const executeQuery = async (sql: string, params: any[] = []): Promise<QueryResult> => {
        const translated = toSqliteSql(sql).trim();
        if (translated.includes(';') && params.length === 0) {
            db.exec(translated);
            return { rows: [], rowCount: 0 };
        }

        const statement = db.prepare(translated);
        if (/^\s*(select|pragma)\b/i.test(translated) || /\breturning\b/i.test(translated)) {
            const rows = statement.all(...params).map(parseJsonColumns);
            return { rows, rowCount: rows.length };
        }

        const result = statement.run(...params);
        return { rows: [], rowCount: Number(result.changes || 0) };
    };

    const database: Database = {
        async query(sql: string, params: any[] = []) {
            if (closing) throw new Error('Database is closing.');
            const current = transactionContext.getStore();
            if (current?.active) {
                return executeQuery(sql, params);
            }
            return serialize(() => executeQuery(sql, params));
        },
        async transaction<T>(work: (transaction: Database) => Promise<T>) {
            if (closing) throw new Error('Database is closing.');
            return serialize(async () => {
                const current = transactionContext.getStore();
                if (current?.active) {
                    const savepoint = `sp_${current.savepoint + 1}`;
                    db.exec(`SAVEPOINT ${savepoint}`);
                    try {
                        const result = await transactionContext.run(
                            { active: true, savepoint: current.savepoint + 1, connection: current.connection },
                            () => work(current.connection),
                        );
                        db.exec(`RELEASE SAVEPOINT ${savepoint}`);
                        return result;
                    } catch (error) {
                        db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
                        throw error;
                    }
                }

                db.exec('BEGIN IMMEDIATE');
                try {
                    const result = await transactionContext.run(
                        { active: true, savepoint: 0, connection: database },
                        () => work(database),
                    );
                    db.exec('COMMIT');
                    return result;
                } catch (error) {
                    db.exec('ROLLBACK');
                    throw error;
                }
            });
        },
        async end() {
            closing = true;
            await serialize(async () => {
                try {
                    db.close();
                } catch {}
            });
        },
    };

    return database;
};

const postgresDatabase = (pgPool: Pool): Database => {
    return {
        async query(sql: string, params: any[] = []) {
            const result = await pgPool.query(sql, params);
            return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
        },
        async transaction<T>(work: (transaction: Database) => Promise<T>) {
            const client = await pgPool.connect();
            try {
                await client.query('BEGIN');
                const scopedDb: Database = {
                    query: async (sql, params) => {
                        const res = await client.query(sql, params);
                        return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
                    },
                    transaction: async (nestedWork) => nestedWork(scopedDb),
                    end: async () => {},
                };
                const result = await work(scopedDb);
                await client.query('COMMIT');
                return result;
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        },
        async end() {
            await pgPool.end();
        },
    };
};

let activeDatabase: Database | null = null;
let rawPgPool: Pool | null = null;

export const connectDB = async (): Promise<Database> => {
    if (activeDatabase) return activeDatabase;

    if (DB_DRIVER === 'postgres') {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('DATABASE_URL wajib diisi jika DB_DRIVER=postgres');
        }
        rawPgPool = new Pool({ connectionString });
        await rawPgPool.query('SELECT 1');
        activeDatabase = postgresDatabase(rawPgPool);
        console.log('📦 Database terhubung ke PostgreSQL.');
    } else {
        const sqliteFile = path.resolve(process.env.SQLITE_PATH || 'data/durian.db');
        fs.mkdirSync(path.dirname(sqliteFile), { recursive: true });
        const sqliteSync = new DatabaseSync(sqliteFile);
        sqliteSync.exec('PRAGMA journal_mode = WAL;');
        sqliteSync.exec('PRAGMA busy_timeout = 5000;');
        sqliteSync.exec('PRAGMA synchronous = NORMAL;');
        activeDatabase = sqliteDatabase(sqliteSync);
        console.log(`📦 Database terhubung ke SQLite: ${sqliteFile}`);
    }

    return activeDatabase;
};

export const pool: Database = {
    async query(sql: string, params: any[] = []) {
        if (!activeDatabase) await connectDB();
        return activeDatabase!.query(sql, params);
    },
    async transaction<T>(work: (database: Database) => Promise<T>) {
        if (!activeDatabase) await connectDB();
        return activeDatabase!.transaction(work);
    },
    async end() {
        if (activeDatabase) {
            await activeDatabase.end();
            activeDatabase = null;
        }
    },
};
