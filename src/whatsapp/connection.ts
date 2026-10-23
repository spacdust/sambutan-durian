import makeWASocket, {
    Browsers,
    DisconnectReason,
    fetchLatestBaileysVersion,
    fetchLatestWaWebVersion,
    makeCacheableSignalKeyStore,
    normalizeMessageContent,
    isJidGroup,
    isJidBroadcast,
    isJidNewsletter,
    type WASocket,
    type WAMessage,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import { aliasAuthState, claimLegacyAuthState, clearAuthAlias, clearAuthState, hasAuthState, renameAuthState, usePostgresAuthState } from './auth.js';
import { getWaSessionStatus, removeWaSessionStatus, setWaSessionStatus } from './status.js';
import { globalWhatsAppManager } from './whatsapp-manager.js';
import { calculateRandomDelayMs, calculateTypingDurationMs } from './anti-ban-delay.js';
import { PerNumberQueue } from './per-number-queue.js';
import { appLogger } from '../config/logger.js';
import { upsertLead, hasCustomerBeenGreeted, markCustomerGreeted } from '../chat/leads.js';
import { saveMessage, getChatHistory } from '../chat/history.js';
import { getBotRuntimeControl } from './bot-runtime-control.js';
import { getBusinessConfig } from '../config/business.js';

const logger = pino({ level: 'silent' });

const installLibsignalConsoleFilter = () => {
    const blocked = new Set(['Closing session:', 'Opening session:', 'Session already closed', 'Session already open']);
    for (const level of ['info', 'warn'] as const) {
        const original = console[level];
        if ((original as any).__durianSignalFilter) continue;
        const filtered = (...args: unknown[]) => {
            if (!blocked.has(String(args[0] || ''))) original(...args);
        };
        Object.defineProperty(filtered, '__durianSignalFilter', { value: true });
        console[level] = filtered;
    }
};

const activeSockets = new Map<string, WASocket>();
const sessionAliases = new Map<string, string>();
const startingSessions = new Set<string>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const generations = new Map<string, number>();
const perNumberOutboundQueue = new PerNumberQueue();
const greetingInProgress = new Set<string>();

export const selectOutboundSessionId = (jid: string, onlineSessionIds: string[]) => {
    const sticky = globalWhatsAppManager.getStickyAssignment(jid);
    if (sticky && onlineSessionIds.includes(sticky)) return sticky;
    const online = globalWhatsAppManager.getSessions().filter((s) => s.status === 'online' && onlineSessionIds.includes(s.phone));
    if (online.length > 0) return online[0].phone;
    return onlineSessionIds[0] || null;
};

export const enqueueManualWhatsAppMessage = async (jid: string, text: string, dedupeKey = `manual:${Date.now()}`) => {
    const onlineSessionIds = [...activeSockets.keys()].filter((id) => id !== 'pending');
    if (!onlineSessionIds.length) {
        throw new Error('Belum ada WhatsApp yang terhubung. Hubungkan nomor WhatsApp terlebih dahulu.');
    }

    const selectedId = selectOutboundSessionId(jid, onlineSessionIds);
    if (!selectedId || !activeSockets.has(selectedId)) {
        throw new Error('Tidak ada jalur WhatsApp yang aktif saat ini.');
    }

    const socket = activeSockets.get(selectedId)!;
    const delayMs = calculateRandomDelayMs(globalWhatsAppManager.getConfig());
    const typingDurationMs = calculateTypingDurationMs(text.length);

    await perNumberOutboundQueue.enqueue(
        selectedId,
        delayMs,
        async () => {
            try {
                if (typeof (socket as any).sendPresenceUpdate === 'function') {
                    await (socket as any).sendPresenceUpdate('composing', jid);
                    await new Promise((resolve) => setTimeout(resolve, Math.min(1500, typingDurationMs)));
                    await (socket as any).sendPresenceUpdate('paused', jid);
                }
            } catch {}

            const sent = await socket.sendMessage(jid, { text });
            await saveMessage(jid, 'assistant', text, 'admin', sent?.key?.id || undefined);
            globalWhatsAppManager.recordMessageSent(selectedId);
            return sent;
        }
    );
};

export const startWhatsAppConnection = async (sessionId = 'legacy'): Promise<WASocket> => {
    installLibsignalConsoleFilter();
    const existing = activeSockets.get(sessionId);
    if (existing) return existing;

    if (startingSessions.has(sessionId)) {
        let attempts = 0;
        while (attempts < 20) {
            await new Promise((r) => setTimeout(r, 250));
            if (activeSockets.has(sessionId)) return activeSockets.get(sessionId)!;
            attempts++;
        }
    }

    startingSessions.add(sessionId);
    const myGen = (generations.get(sessionId) || 0) + 1;
    generations.set(sessionId, myGen);

    try {
        setWaSessionStatus(sessionId, { state: 'connecting', detail: 'Menghubungkan ke WhatsApp...' });

        const { state, saveCreds } = await usePostgresAuthState(sessionId);
        
        let waVersion: [number, number, number] = [2, 3000, 1051318246];
        try {
            const fetched = await fetchLatestWaWebVersion({});
            if (fetched?.version) waVersion = fetched.version;
        } catch {
            try {
                const fetched = await fetchLatestBaileysVersion();
                if (fetched?.version) waVersion = fetched.version;
            } catch {}
        }

        const sock = makeWASocket({
            version: waVersion,
            logger,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            browser: Browsers.macOS('Chrome'),
            markOnlineOnConnect: true,
            getMessage: async () => undefined,
            connectTimeoutMs: 60_000,
            defaultQueryTimeoutMs: 60_000,
            keepAliveIntervalMs: 30_000,
            retryRequestDelayMs: 250,
        });

        activeSockets.set(sessionId, sock);

        const scheduleReconnect = (targetSessionId: string, delayMs: number, reason: string) => {
            const timer = reconnectTimers.get(targetSessionId);
            if (timer) clearTimeout(timer);
            const runtimeId = sessionAliases.get(targetSessionId) || targetSessionId;
            reconnectTimers.set(targetSessionId, setTimeout(() => {
                reconnectTimers.delete(targetSessionId);
                appLogger.info({ component: 'whatsapp', sessionId: runtimeId, reason }, 'whatsapp.reconnecting');
                startWhatsAppConnection(targetSessionId).catch((err) => {
                    appLogger.error({ component: 'whatsapp', sessionId: runtimeId, err }, 'whatsapp.reconnect_failed');
                });
            }, delayMs));
        };

        sock.ev.on('creds.update', async (update) => {
            await saveCreds();
            const meId = (sock.user?.id || (sock as any).authState?.creds?.me?.id || update?.me?.id) as string | undefined;
            if (meId) {
                const phone = meId.split(':')[0].split('@')[0];
                if (phone) {
                    activeSockets.set(phone, sock);
                    sessionAliases.set(sessionId, phone);
                    const currentStatus = getWaSessionStatus(sessionId);
                    setWaSessionStatus(sessionId, {
                        ...currentStatus,
                        phone,
                    });
                    const runtimeSessionId = sessionAliases.get(sessionId) || sessionId;
                    if (runtimeSessionId !== sessionId) {
                        const runtimeStatus = getWaSessionStatus(runtimeSessionId);
                        setWaSessionStatus(runtimeSessionId, {
                            ...runtimeStatus,
                            phone,
                        });
                    }
                    appLogger.info({ component: 'whatsapp', sessionId, phone }, 'whatsapp.creds_phone_detected');
                }
            }
        });

        sock.ev.on('connection.update', async (update) => {
            const runtimeSessionId = sessionAliases.get(sessionId) || sessionId;
            const currentActive = activeSockets.get(sessionId) || activeSockets.get(runtimeSessionId);
            if (myGen !== generations.get(sessionId) || (currentActive && currentActive !== sock)) return;

            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                // If this socket was created for pairing code and is waiting for user confirmation, do not overwrite with QR
                const credsAny = (sock as any).authState?.creds;
                if (credsAny?.pairingCode && !credsAny?.registered) {
                    return;
                }

                let qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qr)}`;
                try {
                    qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 260 });
                } catch {}
                setWaSessionStatus(runtimeSessionId, { state: 'qr', detail: 'Scan QR di web admin', qr, qrUrl: qrDataUrl });
                appLogger.info({ component: 'whatsapp', sessionId: runtimeSessionId }, 'whatsapp.qr_ready');
                qrcodeTerminal.generate(qr, { small: true });
            }

            if (connection === 'close') {
                activeSockets.delete(sessionId);
                activeSockets.delete(runtimeSessionId);

                const boom = lastDisconnect?.error as Boom | undefined;
                const statusCode = boom?.output?.statusCode;
                const loggedOut = statusCode === DisconnectReason.loggedOut;
                const replaced = statusCode === DisconnectReason.connectionReplaced || statusCode === 440;

                appLogger.info({ component: 'whatsapp', sessionId: runtimeSessionId, statusCode }, 'whatsapp.connection_closed');

                if (statusCode === 408) {
                    setWaSessionStatus(runtimeSessionId, { state: 'qr', detail: 'QR expired, klik refresh untuk coba lagi' });
                    scheduleReconnect(sessionId, 1000, 'QR expired');
                    return;
                }

                if (statusCode === 515) {
                    // WhatsApp protocol restartRequired: occurs during pairing completion to switch to authenticated stream
                    setWaSessionStatus(runtimeSessionId, { state: 'connecting', detail: 'Menyelesaikan penautan WhatsApp...' });
                    scheduleReconnect(sessionId, 1500, 'restart stream');
                    return;
                }

                if (loggedOut) {
                    setWaSessionStatus(runtimeSessionId, { state: 'logged_out', detail: 'Logged out' });
                    await clearAuthState(runtimeSessionId);
                    if (sessionId !== runtimeSessionId) await clearAuthState(sessionId);
                    scheduleReconnect(runtimeSessionId, 2000, 'logged out');
                    return;
                }

                if (replaced) {
                    setWaSessionStatus(runtimeSessionId, { state: 'close', detail: 'Session diganti perangkat lain' });
                    scheduleReconnect(runtimeSessionId, 8000, 'conflict replaced');
                    return;
                }

                setWaSessionStatus(runtimeSessionId, {
                    state: 'close',
                    detail: `Terputus (${statusCode ?? 'unknown'})`,
                });
                if (runtimeSessionId !== 'legacy') globalWhatsAppManager.setSessionStatus(runtimeSessionId, 'disconnected');
                scheduleReconnect(runtimeSessionId, 3000, `close ${statusCode ?? 'unknown'}`);
            } else if (connection === 'open') {
                const meId = sock.user?.id || '';
                const phone = meId.split(':')[0].split('@')[0];

                if (phone) {
                    activeSockets.set(phone, sock);
                }

                if (sessionId === 'pending') {
                    if (phone) {
                        sessionAliases.set('pending', phone);
                        aliasAuthState('pending', phone);
                        await renameAuthState('pending', phone);
                    }
                    setWaSessionStatus(sessionId, { state: 'open', detail: 'Nomor terbaca. Simpan nomor di web admin.', phone, qr: undefined, qrUrl: undefined });
                    appLogger.info({ component: 'whatsapp', sessionId, phone }, 'whatsapp.pending_phone_detected');
                }
                setWaSessionStatus(runtimeSessionId, { state: 'open', detail: 'Terhubung', phone, qr: undefined, qrUrl: undefined });
                if (runtimeSessionId !== 'legacy') globalWhatsAppManager.updateSession(runtimeSessionId, { phone, status: 'online' });
                appLogger.info({ component: 'whatsapp', sessionId: runtimeSessionId, phone }, 'whatsapp.connection_open');

                // Explicitly send presence available so WhatsApp forwards incoming messages
                try {
                    await sock.sendPresenceUpdate('available');
                } catch (presenceErr) {
                    appLogger.warn({ component: 'whatsapp', sessionId: runtimeSessionId, err: presenceErr }, 'whatsapp.presence_available_failed');
                }
            } else if (connection === 'connecting') {
                setWaSessionStatus(runtimeSessionId, { state: 'connecting', detail: 'Menghubungkan...' });
            }
        });

        // Handle Inbound & Outbound Messages
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            const runtimeSessionId = sessionAliases.get(sessionId) || sessionId;
            const currentActive = activeSockets.get(sessionId) || activeSockets.get(runtimeSessionId);
            if (myGen !== generations.get(sessionId) || (currentActive && currentActive !== sock)) return;

            appLogger.info({
                component: 'whatsapp',
                sessionId: runtimeSessionId,
                type,
                count: messages?.length || 0,
            }, 'whatsapp.messages_upsert_event');

            for (const msg of messages) {
                if (!msg.message) continue;
                const jid = msg.key.remoteJid;
                if (!jid) continue;

                // Ignore broadcast / status / group / newsletter
                if (
                    isJidBroadcast(jid) ||
                    isJidGroup(jid) ||
                    (typeof isJidNewsletter === 'function' && isJidNewsletter(jid)) ||
                    jid === 'status@broadcast' ||
                    jid.endsWith('@broadcast') ||
                    jid.endsWith('@g.us') ||
                    jid.endsWith('@newsletter')
                ) {
                    continue;
                }

                // Check user direct message (standard JID or LID)
                const isUserMessage = jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid');
                if (!isUserMessage) {
                    continue;
                }

                // Unpack message content
                const rawContent = normalizeMessageContent(msg.message);
                if (!rawContent) continue;

                // Extract message text
                const text = (
                    rawContent.conversation
                    || rawContent.extendedTextMessage?.text
                    || rawContent.imageMessage?.caption
                    || rawContent.videoMessage?.caption
                    || rawContent.buttonsResponseMessage?.selectedDisplayText
                    || rawContent.listResponseMessage?.title
                    || rawContent.templateButtonReplyMessage?.selectedId
                    || ''
                ).trim();

                const hasMedia = Boolean(
                    rawContent.imageMessage ||
                    rawContent.videoMessage ||
                    rawContent.audioMessage ||
                    rawContent.documentMessage ||
                    rawContent.stickerMessage
                );

                // Handle messages sent from our own device (e.g. manual reply from phone)
                if (msg.key.fromMe) {
                    if (text || hasMedia) {
                        await saveMessage(jid, 'assistant', text || '[Media]', 'admin', msg.key.id || undefined);
                        await markCustomerGreeted(jid);
                    }
                    continue;
                }

                if (!text && !hasMedia) continue;

                // Read receipt
                if (msg.key.id && typeof sock.readMessages === 'function') {
                    try {
                        await sock.readMessages([msg.key]);
                    } catch {}
                }

                // Sticky session assignment
                if (runtimeSessionId !== 'legacy' && runtimeSessionId !== 'pending') {
                    globalWhatsAppManager.setStickyAssignment(jid, runtimeSessionId);
                }

                // Save lead & history
                const customerPhone = jid.replace('@s.whatsapp.net', '').replace('@lid', '');
                const pushName = msg.pushName || '';
                await upsertLead({ jid, phone: customerPhone, name: pushName || undefined });
                await saveMessage(jid, 'user', text || '[Media]', 'customer', msg.key.id || undefined);
                appLogger.info({ component: 'whatsapp', jid, text: text.slice(0, 50), from: pushName }, 'whatsapp.message_received');

                // Filter for auto-greeting: only recent messages (within 10 minutes)
                const msgTimestamp = typeof msg.messageTimestamp === 'number'
                    ? msg.messageTimestamp
                    : Number(msg.messageTimestamp || 0);
                const nowSec = Math.floor(Date.now() / 1000);
                const isRecent = msgTimestamp > 0 ? (nowSec - msgTimestamp < 600) : true;

                if (!isRecent) {
                    appLogger.info({ component: 'whatsapp', jid, msgTimestamp, nowSec }, 'whatsapp.greeting_skipped_not_recent');
                    continue;
                }

                // Check Sambutan Durian auto-greeting (Hanya untuk pesan pertama kali masuk)
                const botControl = await getBotRuntimeControl();
                const bizConfig = getBusinessConfig();

                if (botControl.enabled && bizConfig.enableGreeting && bizConfig.welcomeMessage) {
                    if (!greetingInProgress.has(jid)) {
                        greetingInProgress.add(jid);
                        try {
                            const alreadyGreeted = await hasCustomerBeenGreeted(jid);
                            if (!alreadyGreeted) {
                                let welcomeText = bizConfig.welcomeMessage;
                                if (pushName) {
                                    welcomeText = welcomeText.replace(/{{nama}}|{nama}|{{name}}|{name}/gi, pushName);
                                } else {
                                    welcomeText = welcomeText.replace(/{{nama}}|{nama}|{{name}}|{name}/gi, 'kak');
                                }

                                const delayMs = calculateRandomDelayMs(globalWhatsAppManager.getConfig());
                                await perNumberOutboundQueue.enqueue(
                                    runtimeSessionId,
                                    delayMs,
                                    async () => {
                                        try {
                                            if (typeof (sock as any).sendPresenceUpdate === 'function') {
                                                await (sock as any).sendPresenceUpdate('composing', jid);
                                                await new Promise((r) => setTimeout(r, 1200));
                                                await (sock as any).sendPresenceUpdate('paused', jid);
                                            }
                                        } catch {}

                                        const sent = await sock.sendMessage(jid, { text: welcomeText });
                                        await saveMessage(jid, 'assistant', welcomeText, 'bot', sent?.key?.id || undefined);
                                        await markCustomerGreeted(jid);

                                        if (runtimeSessionId !== 'legacy' && runtimeSessionId !== 'pending') {
                                            globalWhatsAppManager.recordMessageSent(runtimeSessionId);
                                        }
                                        appLogger.info({ component: 'whatsapp', jid, welcomeText: welcomeText.slice(0, 50) }, 'whatsapp.auto_greeting_sent');
                                    }
                                );
                            } else {
                                appLogger.info({ component: 'whatsapp', jid }, 'whatsapp.greeting_skipped_already_greeted');
                            }
                        } catch (err) {
                            appLogger.error({ component: 'whatsapp', jid, err }, 'whatsapp.auto_greeting_failed');
                        } finally {
                            greetingInProgress.delete(jid);
                        }
                    }
                }
            }
        });

        return sock;
    } finally {
        startingSessions.delete(sessionId);
    }
};

export const stopWhatsAppSession = async (sessionId: string, clearAuth = false) => {
    const timer = reconnectTimers.get(sessionId);
    if (timer) {
        clearTimeout(timer);
        reconnectTimers.delete(sessionId);
    }
    const runtimeSessionId = sessionAliases.get(sessionId) || sessionId;
    const socket = activeSockets.get(runtimeSessionId) || activeSockets.get(sessionId);
    activeSockets.delete(sessionId);
    activeSockets.delete(runtimeSessionId);

    if (socket) {
        try {
            socket.end(new Error('Session stopped by user'));
        } catch {}
    }
    removeWaSessionStatus(sessionId);
    removeWaSessionStatus(runtimeSessionId);
    if (clearAuth) {
        await clearAuthState(runtimeSessionId);
    }
};

export const stopWhatsAppConnection = async () => {
    for (const id of activeSockets.keys()) {
        await stopWhatsAppSession(id, false);
    }
};

export const adoptPendingWhatsAppSession = async (phone: string, csLabel: string, csName?: string, dailyLimit = 300) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const pendingSocket = activeSockets.get('pending');

    await renameAuthState('pending', cleanPhone);
    sessionAliases.set('pending', cleanPhone);

    if (pendingSocket) {
        activeSockets.delete('pending');
        activeSockets.set(cleanPhone, pendingSocket);
        aliasAuthState('pending', cleanPhone);
    }

    globalWhatsAppManager.addSession(cleanPhone, csLabel, dailyLimit, csName);
    globalWhatsAppManager.updateSession(cleanPhone, { status: 'online' });
    setWaSessionStatus(cleanPhone, { state: 'open', detail: 'Terhubung', phone: cleanPhone });
    removeWaSessionStatus('pending');

    if (!pendingSocket) {
        await startWhatsAppConnection(cleanPhone);
    }
    return true;
};

export const checkWhatsAppCredentialsExist = async () => {
    try {
        const checks = [
            hasAuthState('legacy'),
            ...globalWhatsAppManager.getSessions().map((s) => hasAuthState(s.phone)),
        ];
        return (await Promise.all(checks)).some(Boolean);
    } catch {
        return false;
    }
};

export const startConfiguredWhatsAppConnections = async () => {
    const sessions = globalWhatsAppManager.getSessions();
    if (!sessions.length) {
        if (await hasAuthState('legacy')) {
            await startWhatsAppConnection('legacy');
        }
        return;
    }
    const ready: string[] = [];
    for (const session of sessions) {
        if (await claimLegacyAuthState(session.phone) || await hasAuthState(session.phone)) {
            ready.push(session.phone);
        }
    }
    await Promise.allSettled(ready.map((phone) => startWhatsAppConnection(phone)));
};
