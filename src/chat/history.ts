import { EventEmitter } from 'node:events';
import { pool, type Database } from '../config/db.js';

export const chatEvents = new EventEmitter();
chatEvents.setMaxListeners(100);

export interface ChatMessage {
    id?: number;
    role: 'user' | 'assistant';
    content: string;
    sender_type?: 'customer' | 'bot' | 'admin';
    created_at?: string;
}

const MAX_HISTORY = 50;

export const saveMessageTo = async (
    database: Database,
    jid: string,
    role: 'user' | 'assistant',
    content: string,
    senderType: 'customer' | 'bot' | 'admin' = role === 'user' ? 'customer' : 'bot',
    providerMessageId?: string,
) => {
    const result = await database.query(
        `INSERT INTO chat_history (jid, role, content, sender_type, provider_message_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (provider_message_id) DO NOTHING
         RETURNING id, jid, role, content, sender_type, created_at`,
        [jid, role, content, senderType, providerMessageId || null],
    );
    const row = result?.rows?.[0];
    if (row) {
        chatEvents.emit('message', { jid, message: row });
    } else if (!providerMessageId) {
        chatEvents.emit('message', {
            jid,
            message: {
                id: Date.now(),
                jid,
                role,
                content,
                sender_type: senderType,
                created_at: new Date().toISOString(),
            },
        });
    }
};

export const saveMessage = async (
    jid: string,
    role: 'user' | 'assistant',
    content: string,
    senderType: 'customer' | 'bot' | 'admin' = role === 'user' ? 'customer' : 'bot',
    providerMessageId?: string
) => saveMessageTo(pool, jid, role, content, senderType, providerMessageId);

export const getChatHistory = async (jid: string): Promise<ChatMessage[]> => {
    const { rows } = await pool.query(
        'SELECT role, content FROM chat_history WHERE jid = $1 ORDER BY created_at DESC, id DESC LIMIT $2',
        [jid, MAX_HISTORY]
    );
    return rows.reverse();
};

export const getFullChatHistory = async (jid: string, limit = 200) => {
    const { rows } = await pool.query(
        'SELECT id, role, content, sender_type, created_at FROM chat_history WHERE jid = $1 ORDER BY created_at DESC, id DESC LIMIT $2',
        [jid, limit]
    );
    return rows.reverse();
};

export const clearChatHistory = async (jid: string) => {
    await pool.query('DELETE FROM chat_history WHERE jid = $1', [jid]);
    chatEvents.emit('clear', { jid });
};
