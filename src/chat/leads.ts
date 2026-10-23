import { pool } from '../config/db.js';
import { chatEvents } from './history.js';

export interface Lead {
    jid: string;
    name?: string;
    phone?: string;
    address?: string;
    preferences?: string;
    status?: string;
    notes?: string;
}

export const upsertLead = async (lead: Lead) => {
    if (lead.jid.endsWith('@s.whatsapp.net')) {
        lead.phone = lead.jid.replace(/@s\.whatsapp\.net$/, '');
    } else if (lead.jid.endsWith('@lid')) {
        lead.phone = lead.phone || lead.jid.replace(/@lid$/, '');
    }
    const fields: string[] = [];
    const values: any[] = [lead.jid];
    let idx = 2;

    if (lead.name) { fields.push(`name = $${idx++}`); values.push(lead.name); }
    if (lead.phone) { fields.push(`phone = $${idx++}`); values.push(lead.phone); }
    if (lead.address) { fields.push(`address = $${idx++}`); values.push(lead.address); }
    if (lead.preferences) { fields.push(`preferences = $${idx++}`); values.push(lead.preferences); }
    if (lead.status) { fields.push(`status = $${idx++}`); values.push(lead.status); }
    if (lead.notes) { fields.push(`notes = $${idx++}`); values.push(lead.notes); }

    fields.push('updated_at = NOW()');

    const colNames = ['jid'];
    const insertPlaceholders = ['$1'];
    let j = 2;
    if (lead.name) { colNames.push('name'); insertPlaceholders.push(`$${j++}`); }
    if (lead.phone) { colNames.push('phone'); insertPlaceholders.push(`$${j++}`); }
    if (lead.address) { colNames.push('address'); insertPlaceholders.push(`$${j++}`); }
    if (lead.preferences) { colNames.push('preferences'); insertPlaceholders.push(`$${j++}`); }
    if (lead.status) { colNames.push('status'); insertPlaceholders.push(`$${j++}`); }
    if (lead.notes) { colNames.push('notes'); insertPlaceholders.push(`$${j++}`); }

    const sql = `INSERT INTO leads (${colNames.join(', ')}) VALUES (${insertPlaceholders.join(', ')})
        ON CONFLICT (jid) DO UPDATE SET ${fields.join(', ')}`;

    await pool.query(sql, values);
    try {
        chatEvents.emit('update', { jid: lead.jid });
    } catch {}
};

export const getLead = async (jid: string): Promise<Lead | null> => {
    const { rows } = await pool.query('SELECT * FROM leads WHERE jid = $1', [jid]);
    return rows[0] || null;
};

export const hasCustomerBeenGreeted = async (jid: string): Promise<boolean> => {
    try {
        // 1. Check if leads table records greeted_at
        const lead = await pool.query('SELECT greeted_at FROM leads WHERE jid = $1', [jid]);
        if (lead.rows[0]?.greeted_at) return true;

        // 2. Check if an assistant/bot message has already been recorded in chat_history
        const history = await pool.query('SELECT 1 FROM chat_history WHERE jid = $1 AND role = $2 LIMIT 1', [jid, 'assistant']);
        return Boolean(history.rows.length > 0);
    } catch {
        return false;
    }
};

export const markCustomerGreeted = async (jid: string): Promise<void> => {
    try {
        await pool.query('UPDATE leads SET greeted_at = CURRENT_TIMESTAMP WHERE jid = $1', [jid]);
    } catch {}
};
