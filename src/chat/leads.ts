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
    greeted_at?: string;
}

export interface ResolvedContactInfo {
    cleanPhone?: string;
    phoneJid?: string;
    lidJid?: string;
    candidateJids: string[];
}

export const resolveContactJids = async (jid: string, sock?: any): Promise<ResolvedContactInfo> => {
    let cleanPhone: string | undefined;
    let phoneJid: string | undefined;
    let lidJid: string | undefined;

    if (jid.endsWith('@s.whatsapp.net')) {
        cleanPhone = jid.replace(/@s\.whatsapp\.net$/, '');
        phoneJid = jid;

        // Try to get LID mapping
        if (sock?.signalRepository?.lidMapping?.getLIDForPN) {
            try {
                const lid = await sock.signalRepository.lidMapping.getLIDForPN(cleanPhone);
                if (lid) lidJid = lid.includes('@') ? lid : `${lid}@lid`;
            } catch {}
        }
        if (!lidJid) {
            try {
                const { rows } = await pool.query(
                    "SELECT data FROM auth_keys WHERE id LIKE '%lid-mapping-' || $1 AND id NOT LIKE '%_reverse' LIMIT 1",
                    [cleanPhone]
                );
                if (rows[0]?.data) {
                    const raw = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
                    if (raw) lidJid = String(raw).includes('@') ? String(raw) : `${raw}@lid`;
                }
            } catch {}
        }
        if (!lidJid) {
            try {
                const { rows } = await pool.query(
                    "SELECT lid FROM existing_contacts WHERE phone = $1 AND lid IS NOT NULL LIMIT 1",
                    [cleanPhone]
                );
                if (rows[0]?.lid) lidJid = rows[0].lid;
            } catch {}
        }
    } else if (jid.endsWith('@lid')) {
        const lidUser = jid.replace(/@lid$/, '');
        lidJid = jid;

        // Try to get Phone mapping
        if (sock?.signalRepository?.lidMapping?.getPNForLID) {
            try {
                const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
                if (pn) {
                    cleanPhone = pn.replace(/@.*$/, '');
                    phoneJid = `${cleanPhone}@s.whatsapp.net`;
                }
            } catch {}
        }
        if (!cleanPhone) {
            try {
                const { rows } = await pool.query(
                    "SELECT data FROM auth_keys WHERE id LIKE '%lid-mapping-' || $1 || '_reverse' LIMIT 1",
                    [lidUser]
                );
                if (rows[0]?.data) {
                    const raw = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
                    if (raw) {
                        cleanPhone = String(raw).replace(/@.*$/, '');
                        phoneJid = `${cleanPhone}@s.whatsapp.net`;
                    }
                }
            } catch {}
        }
        if (!cleanPhone) {
            try {
                const { rows } = await pool.query(
                    "SELECT phone FROM existing_contacts WHERE (lid = $1 OR id = $2) AND phone IS NOT NULL LIMIT 1",
                    [jid, lidUser]
                );
                if (rows[0]?.phone) {
                    cleanPhone = rows[0].phone;
                    phoneJid = `${cleanPhone}@s.whatsapp.net`;
                }
            } catch {}
        }
        if (!cleanPhone) {
            try {
                const { rows } = await pool.query(
                    "SELECT phone FROM leads WHERE jid = $1 AND phone IS NOT NULL AND phone != $2 LIMIT 1",
                    [jid, lidUser]
                );
                if (rows[0]?.phone) {
                    cleanPhone = rows[0].phone;
                    phoneJid = `${cleanPhone}@s.whatsapp.net`;
                }
            } catch {}
        }
        if (!cleanPhone) {
            cleanPhone = lidUser;
        }
    } else {
        cleanPhone = jid.replace(/@.*$/, '');
        phoneJid = `${cleanPhone}@s.whatsapp.net`;
    }

    const candidateJids = Array.from(new Set([jid, phoneJid, lidJid].filter(Boolean))) as string[];
    return { cleanPhone, phoneJid, lidJid, candidateJids };
};

export const recordExistingContact = async (data: {
    jid?: string;
    phone?: string;
    lid?: string;
    name?: string;
    source?: string;
}): Promise<void> => {
    const id = data.phone || data.jid || data.lid;
    if (!id) return;
    try {
        await pool.query(
            `INSERT INTO existing_contacts (id, phone, jid, lid, name, source)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO UPDATE SET
                 phone = COALESCE(existing_contacts.phone, EXCLUDED.phone),
                 jid = COALESCE(existing_contacts.jid, EXCLUDED.jid),
                 lid = COALESCE(existing_contacts.lid, EXCLUDED.lid),
                 name = COALESCE(existing_contacts.name, EXCLUDED.name)`,
            [id, data.phone || null, data.jid || null, data.lid || null, data.name || null, data.source || 'history_sync']
        );
    } catch {}
};

export const upsertLead = async (lead: Lead) => {
    if (!lead.phone || lead.phone === lead.jid.replace(/@lid$/, '')) {
        const info = await resolveContactJids(lead.jid);
        if (info.cleanPhone && !info.cleanPhone.includes('@')) {
            lead.phone = info.cleanPhone;
        }
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
    if (lead.greeted_at) { fields.push(`greeted_at = $${idx++}`); values.push(lead.greeted_at); }

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
    if (lead.greeted_at) { colNames.push('greeted_at'); insertPlaceholders.push(`$${j++}`); }

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

export const shouldCustomerBeGreeted = async (jid: string, sock?: any): Promise<boolean> => {
    try {
        const { cleanPhone, phoneJid, lidJid, candidateJids } = await resolveContactJids(jid, sock);

        // 1. Check if number/JID is in existing_contacts (synced from WhatsApp phone history or previous conversations)
        const existingCheck = await pool.query(
            `SELECT 1 FROM existing_contacts 
             WHERE id = $1 
                OR jid = $1 
                OR lid = $1 
                OR ($2 != '' AND (phone = $2 OR id = $2))
                OR ($3 != '' AND (jid = $3 OR id = $3))
                OR ($4 != '' AND (lid = $4 OR id = $4))
             LIMIT 1`,
            [jid, cleanPhone || '', phoneJid || '', lidJid || '']
        );
        if (existingCheck.rows.length > 0) {
            return false;
        }

        // 2. Check if lead is marked as already greeted or status = 'existing'
        const leadCheck = await pool.query(
            `SELECT status, greeted_at FROM leads 
             WHERE jid = $1 
                OR ($2 != '' AND jid = $2)
                OR ($3 != '' AND jid = $3)
                OR ($4 != '' AND phone = $4)
             LIMIT 1`,
            [jid, phoneJid || '', lidJid || '', cleanPhone || '']
        );
        const lead = leadCheck.rows[0];
        if (lead) {
            if (lead.greeted_at) return false;
            if (lead.status === 'existing') return false;
        }

        // 3. Check if Sambutan Durian bot has EVER sent a greeting to any of the candidate JIDs
        for (const cJid of candidateJids) {
            const botHistory = await pool.query(
                "SELECT 1 FROM chat_history WHERE jid = $1 AND sender_type = 'bot' LIMIT 1",
                [cJid]
            );
            if (botHistory.rows.length > 0) return false;
        }

        // 4. Check if a human CS has already manually replied
        // Only actual human replies count (sender_type = 'admin'), excluding automated greetings (sender_type = 'salam_otomatis')
        for (const cJid of candidateJids) {
            const humanReply = await pool.query(
                "SELECT 1 FROM chat_history WHERE jid = $1 AND role = 'assistant' AND sender_type = 'admin' LIMIT 1",
                [cJid]
            );
            if (humanReply.rows.length > 0) return false;
        }

        // 5. Check customer message count across candidate JIDs:
        // Must be the first incoming message from customer (count <= 1)
        let totalUserMsgCount = 0;
        for (const cJid of candidateJids) {
            const userMsgCountRes = await pool.query(
                "SELECT COUNT(*) AS count FROM chat_history WHERE jid = $1 AND role = 'user'",
                [cJid]
            );
            totalUserMsgCount += Number(userMsgCountRes.rows[0]?.count || 0);
        }
        if (totalUserMsgCount > 1) {
            // Customer has sent multiple messages in the past -> do not greet
            return false;
        }

        // Passed all exclusion criteria:
        // 1. Nomor baru yang baru chat dan belum pernah dibalas (totalUserMsgCount <= 1, no bot/human reply, no existing history).
        // 2. Nomor baru yang baru chat + pesan salam otomatis (sender_type = 'salam_otomatis').
        return true;
    } catch {
        return false;
    }
};

export const hasCustomerBeenGreeted = async (jid: string, sock?: any): Promise<boolean> => {
    return !(await shouldCustomerBeGreeted(jid, sock));
};

export const markCustomerGreeted = async (jid: string, sock?: any): Promise<void> => {
    try {
        const { cleanPhone, phoneJid, lidJid, candidateJids } = await resolveContactJids(jid, sock);
        for (const cJid of candidateJids) {
            await pool.query('UPDATE leads SET greeted_at = CURRENT_TIMESTAMP WHERE jid = $1', [cJid]);
        }
        if (cleanPhone) {
            await pool.query('UPDATE leads SET greeted_at = CURRENT_TIMESTAMP WHERE phone = $1', [cleanPhone]);
            await recordExistingContact({
                phone: cleanPhone,
                jid: phoneJid,
                lid: lidJid,
                source: 'greeted'
            });
        }
    } catch {}
};

export const deleteLeadCompletely = async (jid: string): Promise<void> => {
    try {
        const { cleanPhone, candidateJids } = await resolveContactJids(jid);

        // 1. Delete from leads table
        for (const cJid of candidateJids) {
            await pool.query('DELETE FROM leads WHERE jid = $1', [cJid]);
        }
        if (cleanPhone && cleanPhone !== jid) {
            await pool.query('DELETE FROM leads WHERE phone = $1', [cleanPhone]);
        }

        // 2. Delete from chat_history table
        for (const cJid of candidateJids) {
            await pool.query('DELETE FROM chat_history WHERE jid = $1', [cJid]);
        }

        // 3. Emit deletion events so active UI instantly updates
        for (const cJid of candidateJids) {
            try {
                chatEvents.emit('chat_cleared', { jid: cJid });
                chatEvents.emit('delete', { jid: cJid });
                chatEvents.emit('lead_deleted', { jid: cJid });
                chatEvents.emit('update', { jid: cJid });
            } catch {}
        }
    } catch (err) {
        throw err;
    }
};
