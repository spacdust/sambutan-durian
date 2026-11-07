import { pool } from '../config/db.js';
import { chatEvents } from './history.js';
import { getBusinessConfig } from '../config/business.js';
export const resolveContactJids = async (rawJid, sock) => {
    let cleanPhone;
    let phoneJid;
    let lidJid;
    // Normalize any device suffix (e.g. 6281910500376:0@s.whatsapp.net -> 6281910500376@s.whatsapp.net)
    const jid = (rawJid || '').replace(/:\d+@/, '@');
    if (jid.endsWith('@s.whatsapp.net')) {
        cleanPhone = jid.replace(/@s\.whatsapp\.net$/, '').replace(/:\d+$/, '');
        phoneJid = `${cleanPhone}@s.whatsapp.net`;
        // Try to get LID mapping
        if (sock?.signalRepository?.lidMapping?.getLIDForPN) {
            try {
                const lid = await sock.signalRepository.lidMapping.getLIDForPN(cleanPhone);
                if (lid)
                    lidJid = lid.includes('@') ? lid.replace(/:\d+@/, '@') : `${lid}@lid`;
            }
            catch { }
        }
        if (!lidJid) {
            try {
                const { rows } = await pool.query("SELECT data FROM auth_keys WHERE id LIKE '%lid-mapping-' || $1 AND id NOT LIKE '%_reverse' LIMIT 1", [cleanPhone]);
                if (rows[0]?.data) {
                    const raw = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
                    if (raw) {
                        const str = String(raw).replace(/:\d+@/, '@');
                        lidJid = str.includes('@') ? str : `${str}@lid`;
                    }
                }
            }
            catch { }
        }
        if (!lidJid) {
            try {
                const { rows } = await pool.query("SELECT lid FROM existing_contacts WHERE (phone = $1 OR id = $1 OR phone LIKE $1 || ':%') AND lid IS NOT NULL LIMIT 1", [cleanPhone]);
                if (rows[0]?.lid)
                    lidJid = rows[0].lid.replace(/:\d+@/, '@');
            }
            catch { }
        }
    }
    else if (jid.endsWith('@lid')) {
        const lidUser = jid.replace(/@lid$/, '').replace(/:\d+$/, '');
        lidJid = `${lidUser}@lid`;
        // Try to get Phone mapping
        if (sock?.signalRepository?.lidMapping?.getPNForLID) {
            try {
                const pn = await sock.signalRepository.lidMapping.getPNForLID(jid);
                if (pn) {
                    cleanPhone = pn.replace(/@.*$/, '').replace(/:\d+$/, '');
                    phoneJid = `${cleanPhone}@s.whatsapp.net`;
                }
            }
            catch { }
        }
        if (!cleanPhone) {
            try {
                const { rows } = await pool.query("SELECT data FROM auth_keys WHERE id LIKE '%lid-mapping-' || $1 || '_reverse' LIMIT 1", [lidUser]);
                if (rows[0]?.data) {
                    const raw = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
                    if (raw) {
                        cleanPhone = String(raw).replace(/@.*$/, '').replace(/:\d+$/, '');
                        phoneJid = `${cleanPhone}@s.whatsapp.net`;
                    }
                }
            }
            catch { }
        }
        if (!cleanPhone) {
            try {
                const { rows } = await pool.query("SELECT phone FROM existing_contacts WHERE (lid = $1 OR id = $2) AND phone IS NOT NULL LIMIT 1", [lidJid, lidUser]);
                if (rows[0]?.phone) {
                    cleanPhone = rows[0].phone.replace(/:\d+$/, '');
                    phoneJid = `${cleanPhone}@s.whatsapp.net`;
                }
            }
            catch { }
        }
        if (!cleanPhone) {
            try {
                const { rows } = await pool.query("SELECT phone FROM leads WHERE (jid = $1 OR jid = $2) AND phone IS NOT NULL AND phone != $3 LIMIT 1", [rawJid, lidJid, lidUser]);
                if (rows[0]?.phone) {
                    cleanPhone = rows[0].phone.replace(/:\d+$/, '');
                    phoneJid = `${cleanPhone}@s.whatsapp.net`;
                }
            }
            catch { }
        }
        if (!cleanPhone) {
            cleanPhone = lidUser;
        }
    }
    else {
        cleanPhone = jid.replace(/@.*$/, '').replace(/:\d+$/, '');
        phoneJid = `${cleanPhone}@s.whatsapp.net`;
    }
    if (cleanPhone) {
        cleanPhone = cleanPhone.replace(/:\d+$/, '');
    }
    const candidateJids = Array.from(new Set([
        rawJid,
        jid,
        phoneJid,
        lidJid,
        cleanPhone && !cleanPhone.includes('@') ? `${cleanPhone}@s.whatsapp.net` : '',
        cleanPhone && !cleanPhone.includes('@') ? `${cleanPhone}:0@s.whatsapp.net` : '',
    ].filter(Boolean)));
    return { cleanPhone, phoneJid, lidJid, candidateJids };
};
export const recordExistingContact = async (data) => {
    const rawPhone = data.phone ? data.phone.replace(/:\d+$/, '') : undefined;
    const rawId = (data.id || rawPhone || data.jid || data.lid);
    const id = rawId ? rawId.replace(/:\d+$/, '').replace(/:\d+@/, '@') : undefined;
    if (!id)
        return;
    try {
        await pool.query(`INSERT INTO existing_contacts (id, phone, jid, lid, name, source)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO UPDATE SET
                 phone = COALESCE(existing_contacts.phone, EXCLUDED.phone),
                 jid = COALESCE(existing_contacts.jid, EXCLUDED.jid),
                 lid = COALESCE(existing_contacts.lid, EXCLUDED.lid),
                 name = COALESCE(existing_contacts.name, EXCLUDED.name),
                 source = CASE 
                     WHEN EXCLUDED.source IN ('history_sync_chat', 'greeted', 'quoted_old_chat') THEN EXCLUDED.source 
                     ELSE existing_contacts.source 
                 END`, [id, rawPhone || null, data.jid ? data.jid.replace(/:\d+@/, '@') : null, data.lid ? data.lid.replace(/:\d+@/, '@') : null, data.name || null, data.source || 'history_sync']);
    }
    catch { }
};
export const upsertLead = async (lead) => {
    if (!lead.phone || lead.phone === lead.jid.replace(/@lid$/, '') || lead.phone.includes(':')) {
        const info = await resolveContactJids(lead.jid);
        if (info.cleanPhone && !info.cleanPhone.includes('@')) {
            lead.phone = info.cleanPhone.replace(/:\d+$/, '');
        }
    }
    // If this contact is already an existing contact in WhatsApp Business, ensure it is not marked as a fresh un-greeted lead
    if (!lead.greeted_at) {
        const info = await resolveContactJids(lead.jid);
        const searchPhone = (lead.phone || info.cleanPhone || '').replace(/:\d+$/, '');
        const existing = await pool.query(`SELECT source FROM existing_contacts 
             WHERE (id = $1 
                OR jid = $1 
                OR lid = $1 
                OR ($2 != '' AND (phone = $2 OR id = $2 OR phone LIKE $2 || ':%' OR id LIKE $2 || ':%'))
                OR ($3 != '' AND (jid = $3 OR id = $3))
                OR ($4 != '' AND (lid = $4 OR id = $4)))
               AND source IN ('history_sync_chat', 'history_sync_msg', 'greeted', 'quoted_old_chat')
             LIMIT 1`, [lead.jid, searchPhone, info.phoneJid || '', info.lidJid || '']);
        if (existing.rows.length > 0) {
            const bizConfig = getBusinessConfig();
            const ignoreCtwa = bizConfig.ignoreCtwaGreeting ?? true;
            let markExisting = true;
            if (ignoreCtwa && existing.rows[0].source !== 'greeted' && existing.rows[0].source !== 'quoted_old_chat') {
                // If ignoreCtwaGreeting is enabled, check if this contact only has salam_otomatis (or no bot/admin greeting yet)
                const candidateJids = info.candidateJids;
                const hasBotOrAdmin = await pool.query(`SELECT 1 FROM chat_history 
                     WHERE jid IN (${candidateJids.map((_, i) => `$${i + 1}`).join(',')}) 
                       AND role = 'assistant' 
                       AND sender_type IN ('bot', 'admin') 
                     LIMIT 1`, candidateJids);
                if (hasBotOrAdmin.rows.length === 0) {
                    markExisting = false;
                }
            }
            if (markExisting) {
                lead.status = 'existing';
                lead.greeted_at = new Date().toISOString();
            }
        }
    }
    const fields = [];
    const values = [lead.jid];
    let idx = 2;
    if (lead.name) {
        fields.push(`name = $${idx++}`);
        values.push(lead.name);
    }
    if (lead.phone) {
        fields.push(`phone = $${idx++}`);
        values.push(lead.phone);
    }
    if (lead.address) {
        fields.push(`address = $${idx++}`);
        values.push(lead.address);
    }
    if (lead.preferences) {
        fields.push(`preferences = $${idx++}`);
        values.push(lead.preferences);
    }
    if (lead.status) {
        fields.push(`status = $${idx++}`);
        values.push(lead.status);
    }
    if (lead.notes) {
        fields.push(`notes = $${idx++}`);
        values.push(lead.notes);
    }
    if (lead.greeted_at) {
        fields.push(`greeted_at = $${idx++}`);
        values.push(lead.greeted_at);
    }
    fields.push('updated_at = NOW()');
    const colNames = ['jid'];
    const insertPlaceholders = ['$1'];
    let j = 2;
    if (lead.name) {
        colNames.push('name');
        insertPlaceholders.push(`$${j++}`);
    }
    if (lead.phone) {
        colNames.push('phone');
        insertPlaceholders.push(`$${j++}`);
    }
    if (lead.address) {
        colNames.push('address');
        insertPlaceholders.push(`$${j++}`);
    }
    if (lead.preferences) {
        colNames.push('preferences');
        insertPlaceholders.push(`$${j++}`);
    }
    if (lead.status) {
        colNames.push('status');
        insertPlaceholders.push(`$${j++}`);
    }
    if (lead.notes) {
        colNames.push('notes');
        insertPlaceholders.push(`$${j++}`);
    }
    if (lead.greeted_at) {
        colNames.push('greeted_at');
        insertPlaceholders.push(`$${j++}`);
    }
    const sql = `INSERT INTO leads (${colNames.join(', ')}) VALUES (${insertPlaceholders.join(', ')})
        ON CONFLICT (jid) DO UPDATE SET ${fields.join(', ')}`;
    await pool.query(sql, values);
    try {
        chatEvents.emit('update', { jid: lead.jid });
    }
    catch { }
};
export const getLead = async (jid) => {
    const { rows } = await pool.query('SELECT * FROM leads WHERE jid = $1', [jid]);
    return rows[0] || null;
};
export const shouldCustomerBeGreeted = async (jid, sock) => {
    try {
        const { cleanPhone, phoneJid, lidJid, candidateJids } = await resolveContactJids(jid, sock);
        const bizConfig = getBusinessConfig();
        const ignoreCtwa = bizConfig.ignoreCtwaGreeting ?? true;
        // 1. Check if Sambutan Durian bot has EVER sent a greeting to any candidate JIDs
        // Buffer rule: Bot only sends maximum 1 greeting!
        for (const cJid of candidateJids) {
            const botHistory = await pool.query("SELECT 1 FROM chat_history WHERE jid = $1 AND sender_type = 'bot' LIMIT 1", [cJid]);
            if (botHistory.rows.length > 0)
                return false;
        }
        // 2. Check if a human CS has already manually replied
        // Human replies (sender_type = 'admin') take precedence; automated greetings ('salam_otomatis') do NOT block.
        for (const cJid of candidateJids) {
            const humanReply = await pool.query("SELECT 1 FROM chat_history WHERE jid = $1 AND role = 'assistant' AND sender_type = 'admin' LIMIT 1", [cJid]);
            if (humanReply.rows.length > 0)
                return false;
        }
        // 3. Buffer check for Salam Otomatis Iklan:
        // When ignoreCtwa is true, we allow at most 1 salam_otomatis (greeting #1) + 1 bot greeting (greeting #2).
        // If there are already 2 or more salam_otomatis, buffer is exceeded.
        // If ignoreCtwa is false, any prior salam_otomatis blocks further greetings.
        let salamOtomatisCount = 0;
        for (const cJid of candidateJids) {
            const res = await pool.query("SELECT COUNT(*) as count FROM chat_history WHERE jid = $1 AND sender_type = 'salam_otomatis'", [cJid]);
            salamOtomatisCount += Number(res.rows[0]?.count || 0);
        }
        if (!ignoreCtwa && salamOtomatisCount > 0) {
            return false;
        }
        if (ignoreCtwa && salamOtomatisCount >= 2) {
            return false;
        }
        // 4. Check if number/JID has prior conversation history on WhatsApp before bot was run
        // Only real WhatsApp phone history ('history_sync_chat', 'history_sync_msg', 'quoted_old_chat', 'greeted') blocks greetings.
        // NOTE: 'history_sync_contact' (address book without chat history) DOES NOT block greeting.
        const existingCheck = await pool.query(`SELECT source FROM existing_contacts 
             WHERE (id = $1 
                OR jid = $1 
                OR lid = $1 
                OR ($2 != '' AND (phone = $2 OR id = $2 OR phone LIKE $2 || ':%' OR id LIKE $2 || ':%'))
                OR ($3 != '' AND (jid = $3 OR id = $3))
                OR ($4 != '' AND (lid = $4 OR id = $4)))
               AND source IN ('history_sync_chat', 'history_sync_msg', 'quoted_old_chat', 'greeted')
             LIMIT 1`, [jid, cleanPhone || '', phoneJid || '', lidJid || '']);
        if (existingCheck.rows.length > 0) {
            const source = existingCheck.rows[0].source;
            if (source === 'greeted' || source === 'quoted_old_chat') {
                return false;
            }
            if (!ignoreCtwa) {
                return false;
            }
        }
        // 5. Check if lead is marked as already greeted or status = 'existing'
        const leadCheck = await pool.query(`SELECT status, greeted_at FROM leads 
             WHERE jid = $1 
                OR ($2 != '' AND jid = $2)
                OR ($3 != '' AND jid = $3)
                OR ($4 != '' AND (phone = $4 OR phone LIKE $4 || ':%'))
             LIMIT 1`, [jid, phoneJid || '', lidJid || '', cleanPhone || '']);
        const lead = leadCheck.rows[0];
        if (lead) {
            if (lead.greeted_at)
                return false;
            if (lead.status === 'existing' && !ignoreCtwa)
                return false;
        }
        // 6. Check if customer sent messages in an older session (more than 15 minutes ago)
        // If there are customer messages older than 15 minutes that were never replied to, this is an old contact / conversation from earlier days.
        const now = Date.now();
        for (const cJid of candidateJids) {
            const userMessages = await pool.query("SELECT created_at FROM chat_history WHERE jid = $1 AND role = 'user'", [cJid]);
            const hasOldSessionMessage = userMessages.rows.some((row) => {
                if (!row.created_at)
                    return false;
                const msgTime = new Date(row.created_at).getTime();
                if (Number.isNaN(msgTime))
                    return false;
                return (now - msgTime) > (15 * 60 * 1000);
            });
            if (hasOldSessionMessage) {
                return false;
            }
        }
        // Passed all exclusion criteria:
        // 1. Nomor baru yang baru chat dan belum pernah dibalas
        // 2. Nomor baru yang baru chat + pesan salam otomatis (buffer maksimal 2 chat sambutan)
        return true;
    }
    catch {
        return false;
    }
};
export const hasCustomerBeenGreeted = async (jid, sock) => {
    return !(await shouldCustomerBeGreeted(jid, sock));
};
export const markCustomerGreeted = async (jid, sock) => {
    try {
        const { cleanPhone, phoneJid, lidJid, candidateJids } = await resolveContactJids(jid, sock);
        for (const cJid of candidateJids) {
            await pool.query("UPDATE leads SET greeted_at = CURRENT_TIMESTAMP, status = 'existing' WHERE jid = $1", [cJid]);
        }
        if (cleanPhone) {
            await pool.query("UPDATE leads SET greeted_at = CURRENT_TIMESTAMP, status = 'existing' WHERE phone = $1 OR phone LIKE $1 || ':%'", [cleanPhone]);
            await recordExistingContact({
                id: cleanPhone,
                phone: cleanPhone,
                jid: phoneJid,
                lid: lidJid,
                source: 'greeted'
            });
        }
        if (lidJid) {
            await recordExistingContact({
                id: lidJid,
                phone: cleanPhone,
                jid: phoneJid,
                lid: lidJid,
                source: 'greeted'
            });
        }
    }
    catch { }
};
export const deleteLeadCompletely = async (jid) => {
    try {
        const { cleanPhone, candidateJids } = await resolveContactJids(jid);
        // 1. Delete from leads table (removes from UI table list)
        for (const cJid of candidateJids) {
            await pool.query('DELETE FROM leads WHERE jid = $1', [cJid]);
        }
        if (cleanPhone && cleanPhone !== jid) {
            await pool.query("DELETE FROM leads WHERE phone = $1 OR phone LIKE $1 || ':%'", [cleanPhone]);
        }
        // 2. Delete from chat_history table (clears transcript)
        for (const cJid of candidateJids) {
            await pool.query('DELETE FROM chat_history WHERE jid = $1', [cJid]);
        }
        // NOTE: We do NOT delete from existing_contacts here!
        // Deleting from the bot dashboard does NOT delete the chat on WhatsApp Business phone.
        // As long as the chat still exists in WhatsApp Business, keeping existing_contacts intact
        // ensures the bot will NOT send automated greetings to an existing chat.
        // 3. Emit deletion events so active UI instantly updates
        for (const cJid of candidateJids) {
            try {
                chatEvents.emit('chat_cleared', { jid: cJid });
                chatEvents.emit('delete', { jid: cJid });
                chatEvents.emit('lead_deleted', { jid: cJid });
                chatEvents.emit('update', { jid: cJid });
            }
            catch { }
        }
    }
    catch (err) {
        throw err;
    }
};
export const resetCustomerGreeting = async (jid) => {
    try {
        const { cleanPhone, candidateJids } = await resolveContactJids(jid);
        for (const cJid of candidateJids) {
            await pool.query("UPDATE leads SET greeted_at = NULL, status = 'new' WHERE jid = $1", [cJid]);
            await pool.query('DELETE FROM existing_contacts WHERE id = $1 OR jid = $1 OR lid = $1', [cJid]);
            await pool.query('DELETE FROM chat_history WHERE jid = $1', [cJid]);
        }
        if (cleanPhone) {
            await pool.query("UPDATE leads SET greeted_at = NULL, status = 'new' WHERE phone = $1 OR phone LIKE $1 || ':%'", [cleanPhone]);
            await pool.query("DELETE FROM existing_contacts WHERE phone = $1 OR id = $1 OR phone LIKE $1 || ':%' OR id LIKE $1 || ':%'", [cleanPhone]);
        }
        for (const cJid of candidateJids) {
            try {
                chatEvents.emit('chat_cleared', { jid: cJid });
                chatEvents.emit('update', { jid: cJid });
            }
            catch { }
        }
    }
    catch (err) {
        throw err;
    }
};
export const syncExistingContactsFromAuth = async () => {
    // No-op: do not auto-block all historical keys, let history_sync handle real phone chats
};
