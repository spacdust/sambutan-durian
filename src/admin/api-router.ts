import express, { type Request, type Response, type Router } from 'express';
import QRCode from 'qrcode';
import { pool } from '../config/db.js';
import { getBusinessConfig, updateBusinessConfig } from '../config/business.js';
import { getFullChatHistory, saveMessage, chatEvents } from '../chat/history.js';
import { getLead, upsertLead, deleteLeadCompletely } from '../chat/leads.js';
import { globalWhatsAppManager } from '../whatsapp/whatsapp-manager.js';
import { getWaSessionStatus, isWaSessionStaleConnecting, setWaSessionStatus, removeWaSessionStatus } from '../whatsapp/status.js';
import { clearAuthState } from '../whatsapp/auth.js';
import {
    enqueueManualWhatsAppMessage,
    startWhatsAppConnection,
    stopWhatsAppSession,
    adoptPendingWhatsAppSession
} from '../whatsapp/connection.js';
import { disableBotRuntime, enableBotRuntime, getBotRuntimeControl } from '../whatsapp/bot-runtime-control.js';
import type { createAdminSecurity } from './security.js';

export const createAdminApiRouter = (adminSecurity: ReturnType<typeof createAdminSecurity>): Router => {
    const router = express.Router();

    // 1. Auth: Login
    router.post('/auth/login', (req: Request, res: Response) => {
        const password = String(req.body.password || '');
        const login = adminSecurity.login(password);
        if (!login.ok || !login.session) {
            return res.status(401).json({ ok: false, error: 'Password tidak valid.' });
        }
        res.cookie(adminSecurity.cookieName, login.session.id, adminSecurity.cookieOptions);
        return res.json({
            ok: true,
            csrfToken: login.session.csrfToken,
            sessionId: login.session.id,
        });
    });

    // 2. Auth: Me
    router.get('/auth/me', (req: Request, res: Response) => {
        const sessionId = res.locals.adminSessionId || '';
        const isAuthenticated = adminSecurity.isAuthenticated(sessionId);
        const config = getBusinessConfig();
        return res.json({
            authenticated: isAuthenticated,
            csrfToken: isAuthenticated ? adminSecurity.getCsrfToken(sessionId) : '',
            businessName: config.businessName,
            csName: config.csName,
        });
    });

    // 3. Auth: Logout
    router.post('/auth/logout', (req: Request, res: Response) => {
        const sessionId = res.locals.adminSessionId || '';
        adminSecurity.logout(sessionId);
        res.clearCookie(adminSecurity.cookieName, adminSecurity.cookieOptions);
        return res.json({ ok: true });
    });

    // 4. Dashboard Summary
    router.get('/dashboard', async (_req: Request, res: Response) => {
        try {
            const leadsCountResult = await pool.query('SELECT COUNT(*) AS count FROM leads');
            const totalContacts = Number(leadsCountResult.rows[0]?.count || 0);

            const botRuntime = await getBotRuntimeControl();
            const waNumbers = globalWhatsAppManager.getSessions().map((session) => {
                const live = getWaSessionStatus(session.phone);
                return {
                    ...session,
                    status: live.state === 'open' ? 'online' : (live.state === 'connecting' ? 'connecting' : 'disconnected'),
                };
            });

            const recentLeadsQuery = await pool.query(
                'SELECT * FROM leads ORDER BY updated_at DESC LIMIT 5'
            );

            return res.json({
                leadsCount: totalContacts,
                totalContacts,
                botEnabled: botRuntime.enabled,
                autoFollowUpEnabled: false,
                whatsappNumbers: waNumbers,
                recentLeads: recentLeadsQuery.rows,
            });
        } catch (err: any) {
            return res.status(500).json({ error: err.message || 'Gagal memuat dashboard' });
        }
    });

    // 5. Dashboard Realtime SSE Stream
    router.get('/dashboard/stream', (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        const sendEvent = (type: string, data: any) => {
            res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
        };

        const onChatMessage = (payload: any) => sendEvent('new_message', payload);
        const onChatUpdate = (payload: any) => sendEvent('activity_updated', payload);

        chatEvents.on('message', onChatMessage);
        chatEvents.on('update', onChatUpdate);

        const keepAlive = setInterval(() => {
            res.write(': keep-alive\n\n');
        }, 15000);

        req.on('close', () => {
            clearInterval(keepAlive);
            chatEvents.off('message', onChatMessage);
            chatEvents.off('update', onChatUpdate);
        });
    });

    // 6. Bot Runtime Toggle
    router.post('/bot-runtime/toggle', async (req: Request, res: Response) => {
        try {
            const enable = Boolean(req.body.enable);
            const control = enable ? await enableBotRuntime() : await disableBotRuntime();
            return res.json({ ok: true, enabled: control.enabled });
        } catch (err: any) {
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

    router.post('/auto-follow-up/toggle', async (req: Request, res: Response) => {
        return res.json({ ok: true, enabled: Boolean(req.body.enable) });
    });

    // 7. Leads List
    router.get('/leads', async (req: Request, res: Response) => {
        try {
            const page = Math.max(1, Number(req.query.page) || 1);
            const limit = 20;
            const offset = (page - 1) * limit;
            const search = String(req.query.search || '').trim();

            let where = '';
            const params: any[] = [];
            if (search) {
                where = 'WHERE name LIKE $1 OR phone LIKE $1 OR jid LIKE $1';
                params.push(`%${search}%`);
            }

            const countQuery = await pool.query(`SELECT COUNT(*) AS total FROM leads ${where}`, params);
            const total = Number(countQuery.rows[0]?.total || 0);

            const listQuery = await pool.query(
                `SELECT * FROM leads ${where} ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}`,
                params
            );

            const botRuntime = await getBotRuntimeControl();

            return res.json({
                leads: listQuery.rows,
                botEnabled: botRuntime.enabled,
                botActivatedAt: botRuntime.activatedAt,
                autoFollowUpEnabled: false,
                pagination: {
                    page,
                    total,
                    totalPages: Math.ceil(total / limit) || 1,
                },
            });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    // 8. Lead Detail & Transcript
    router.get('/leads/:jid', async (req: Request, res: Response) => {
        try {
            const jid = decodeURIComponent(String(req.params.jid || ''));
            const lead = await getLead(jid);
            if (!lead) {
                return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
            }
            const transcript = await getFullChatHistory(jid);
            return res.json({
                lead,
                transcript,
            });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    // 9. Lead Transcript SSE Stream
    router.get('/leads/:jid/stream', (req: Request, res: Response) => {
        const jid = decodeURIComponent(String(req.params.jid || ''));
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        const onChatMessage = (payload: any) => {
            if (payload.jid === jid) {
                res.write(`data: ${JSON.stringify({ type: 'message', message: payload.message })}\n\n`);
            }
        };

        chatEvents.on('message', onChatMessage);

        const keepAlive = setInterval(() => {
            res.write(': keep-alive\n\n');
        }, 15000);

        req.on('close', () => {
            clearInterval(keepAlive);
            chatEvents.off('message', onChatMessage);
        });
    });

    // 10. Manual WhatsApp Message Send
    router.post('/chat/send', async (req: Request, res: Response) => {
        try {
            const jid = String(req.body.jid || '').trim();
            const message = String(req.body.message || '').trim();
            if (!jid || !message) {
                return res.status(400).json({ error: 'JID dan pesan wajib diisi.' });
            }

            await enqueueManualWhatsAppMessage(jid, message);
            return res.json({ ok: true, message: 'Pesan berhasil dikirim via WhatsApp.' });
        } catch (err: any) {
            return res.status(500).json({ error: err.message || 'Gagal mengirim pesan.' });
        }
    });

    // 11. Customer Update / Delete / Clear
    router.post('/customer/update', async (req: Request, res: Response) => {
        try {
            const { jid, name, phone, preferences, address, notes } = req.body;
            if (!jid) return res.status(400).json({ error: 'JID wajib diisi' });
            await upsertLead({ jid, name, phone, preferences, address, notes });
            return res.json({ ok: true });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.post('/customer/delete', async (req: Request, res: Response) => {
        try {
            const jid = String(req.body.jid || '').trim();
            if (!jid) return res.status(400).json({ error: 'JID wajib diisi' });
            await deleteLeadCompletely(jid);
            return res.json({ ok: true });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.post('/customer/clear', async (req: Request, res: Response) => {
        try {
            const jid = String(req.body.jid || '').trim();
            if (jid) {
                await deleteLeadCompletely(jid);
            }
            return res.json({ ok: true });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    // 12. WhatsApp Status
    router.get('/whatsapp/status', async (_req: Request, res: Response) => {
        try {
            const numbers = globalWhatsAppManager.getSessions();
            const config = globalWhatsAppManager.getConfig();
            const result = numbers.map((n) => {
                const status = getWaSessionStatus(n.phone);
                const isOnline = status.state === 'open';
                return {
                    id: n.id,
                    phone: n.phone,
                    csName: n.csNameOverride || 'CS',
                    status: isOnline ? 'online' : (status.state === 'connecting' ? 'connecting' : 'disconnected'),
                    state: status.state,
                    dailyLimit: n.dailyLimit,
                    todayLeadCount: n.todayLeadCount,
                    todayMessageCount: n.todayMessageCount,
                    lastUpdate: status.lastUpdate,
                    detail: status.detail,
                    reconnectCount: status.reconnectCount,
                    connectedAt: status.connectedAt,
                    disconnectedAt: status.disconnectedAt,
                };
            });
            return res.json({ numbers: result, config });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    // 13. WhatsApp Pending Status (QR / Pairing)
    router.get('/whatsapp/qr/pending', async (_req: Request, res: Response) => {
        try {
            const wa = getWaSessionStatus('pending');
            let qrDataUrl = '';
            if (wa.qr) {
                try {
                    qrDataUrl = await QRCode.toDataURL(wa.qr, { margin: 1, width: 260 });
                } catch {
                    qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(wa.qr)}`;
                }
            }
            return res.json({
                state: wa.state,
                detail: wa.detail,
                phone: wa.phone || null,
                qrDataUrl,
            });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    // 14. Refresh Pending QR
    router.post('/whatsapp/qr/pending/refresh', async (_req: Request, res: Response) => {
        try {
            await stopWhatsAppSession('pending', true);
            await clearAuthState('pending');
            removeWaSessionStatus('pending');
            await startWhatsAppConnection('pending');

            let attempts = 0;
            let wa = getWaSessionStatus('pending');
            while (attempts < 25 && !wa.qr && wa.state !== 'open') {
                await new Promise((r) => setTimeout(r, 200));
                wa = getWaSessionStatus('pending');
                attempts++;
            }

            let qrDataUrl = '';
            if (wa.qr) {
                try {
                    qrDataUrl = await QRCode.toDataURL(wa.qr, { margin: 1, width: 260 });
                } catch {
                    qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(wa.qr)}`;
                }
            }
            return res.json({
                ok: true,
                state: wa.state,
                detail: wa.detail,
                phone: wa.phone || null,
                qrDataUrl,
            });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    // 14b. Pairing Code for Pending Session
    router.post('/whatsapp/qr/pending/pairing-code', async (req: Request, res: Response) => {
        try {
            const phone = String(req.body.phone || '').replace(/\D/g, '');
            if (!phone || phone.length < 9) {
                return res.status(400).json({ error: 'Nomor WhatsApp tidak valid. Masukkan nomor lengkap dengan kode negara (contoh: 6281234567890).' });
            }
            await stopWhatsAppSession('pending', true);
            await clearAuthState('pending');
            removeWaSessionStatus('pending');
            const sock = await startWhatsAppConnection('pending');

            // Wait briefly for socket to establish connection
            let attempts = 0;
            while (attempts < 20 && (!sock.ws || (sock.ws as any).readyState !== 1)) {
                await new Promise((r) => setTimeout(r, 200));
                attempts++;
            }

            const rawCode = await sock.requestPairingCode(phone);
            const formattedCode = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;
            setWaSessionStatus('pending', {
                state: 'connecting',
                detail: 'Menunggu konfirmasi di HP...',
                phone,
                qr: undefined,
                qrUrl: undefined,
            });
            return res.json({ ok: true, code: formattedCode });
        } catch (err: any) {
            return res.status(500).json({ error: err.message || 'Gagal meminta kode pairing.' });
        }
    });

    // 15. Add Connected WhatsApp Number
    router.post('/whatsapp/numbers/add', async (req: Request, res: Response) => {
        try {
            const pendingStatus = getWaSessionStatus('pending');
            let phone = String(req.body.phone || pendingStatus.phone || '').trim().replace(/\D/g, '');
            if (!phone) {
                try {
                    const credsRes = await pool.query("SELECT data FROM auth_keys WHERE id = 'wa:pending:creds'");
                    const meId = credsRes.rows[0]?.data?.me?.id;
                    if (meId) {
                        phone = String(meId).split(':')[0].split('@')[0];
                    }
                } catch {}
            }
            const id = String(req.body.id || `CS Line ${phone.slice(-4) || '1'}`).trim();
            const csName = String(req.body.csName || '').trim();
            const dailyLimit = Number(req.body.dailyLimit) || 300;

            if (!phone) {
                return res.status(400).json({ error: 'Nomor WhatsApp belum terdeteksi. Silakan masukkan nomor atau hubungkan WhatsApp terlebih dahulu.' });
            }

            if (pendingStatus.state !== 'open') {
                return res.status(400).json({
                    error: 'WhatsApp belum berhasil terhubung di HP. Pastikan Anda telah memasukkan kode pairing atau scan QR di WhatsApp HP sampai muncul status terhubung di aplikasi.'
                });
            }

            await adoptPendingWhatsAppSession(phone, id, csName, dailyLimit);
            return res.json({ ok: true, phone, id, csName });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    // 16. Update WhatsApp Number
    router.post('/whatsapp/numbers/update', async (req: Request, res: Response) => {
        try {
            const phone = String(req.body.phone || '').trim();
            const csName = req.body.csName;
            const dailyLimit = req.body.dailyLimit;
            if (!phone) return res.status(400).json({ error: 'Nomor HP wajib diisi' });

            const updates: any = {};
            if (csName !== undefined) updates.csNameOverride = String(csName).trim();
            if (dailyLimit !== undefined && Number.isFinite(Number(dailyLimit))) updates.dailyLimit = Number(dailyLimit);

            globalWhatsAppManager.updateSession(phone, updates);
            return res.json({ ok: true, phone });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    // 17. Delete WhatsApp Number
    router.post('/whatsapp/numbers/delete', async (req: Request, res: Response) => {
        try {
            const phone = String(req.body.phone || '').trim();
            await stopWhatsAppSession(phone, true);
            globalWhatsAppManager.removeSession(phone);
            return res.json({ ok: true, phone });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    // 18. Save WhatsApp Config
    router.post('/whatsapp/config', async (req: Request, res: Response) => {
        try {
            globalWhatsAppManager.updateConfig(req.body);
            return res.json({ ok: true, config: globalWhatsAppManager.getConfig() });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    // 19. Clear WhatsApp Auth
    router.post('/whatsapp/auth/clear', async (req: Request, res: Response) => {
        try {
            const phone = req.body.phone ? String(req.body.phone).trim() : null;
            if (phone) {
                globalWhatsAppManager.setSessionStatus(phone, 'disconnected');
                await stopWhatsAppSession(phone, true);
                return res.json({ ok: true, message: `Sesi WhatsApp untuk ${phone} berhasil di-reset.` });
            }
            await pool.query('DELETE FROM auth_keys');
            return res.json({ ok: true, message: 'Semua sesi WhatsApp berhasil di-reset.' });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    // 20. System Settings & Business Config
    router.get('/settings', (_req: Request, res: Response) => {
        const config = getBusinessConfig();
        return res.json({
            businessName: config.businessName,
            csName: config.csName,
            welcomeMessage: config.welcomeMessage,
            enableGreeting: config.enableGreeting ?? true,
            adminPhone: config.adminPhone || '',
        });
    });

    router.post('/settings', (req: Request, res: Response) => {
        try {
            const { businessName, csName, welcomeMessage, enableGreeting, adminPhone, password } = req.body;
            const updates: any = {};
            if (businessName) updates.businessName = String(businessName).trim();
            if (csName) updates.csName = String(csName).trim();
            if (welcomeMessage !== undefined) updates.welcomeMessage = String(welcomeMessage).trim();
            if (enableGreeting !== undefined) updates.enableGreeting = Boolean(enableGreeting);
            if (adminPhone !== undefined) updates.adminPhone = String(adminPhone).trim();

            updateBusinessConfig(updates);

            if (password && String(password).trim().length >= 6) {
                process.env.ADMIN_PASSWORD = String(password).trim();
            }

            return res.json({ ok: true });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    });

    router.get('/settings/health', (_req: Request, res: Response) => {
        return res.json({
            database: 'connected',
            whatsappState: 'running',
        });
    });

    return router;
};
