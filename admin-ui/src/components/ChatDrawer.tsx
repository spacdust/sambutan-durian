import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api, formatWibTime, formatWibDateTime, LeadDetail } from '../lib/api';
import {
  Send,
  Edit2,
  Trash2,
  Download,
  Bot,
  ShieldAlert,
  ShoppingBag,
  Save,
  CheckCheck,
  CheckCircle2,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { useToast } from './ui/toast';

interface ChatDrawerProps {
  jid: string | null;
  onClose: () => void;
  onRefreshList?: () => void;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({ jid, onClose, onRefreshList }) => {
  const { toast } = useToast();
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [manualMessage, setManualMessage] = useState('');
  const [sendingChat, setSendingChat] = useState(false);

  // Edit Customer State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPreferences, setEditPreferences] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);
  const isEditingProfileRef = useRef(isEditingProfile);
  const onRefreshListRef = useRef(onRefreshList);

  useEffect(() => {
    isEditingProfileRef.current = isEditingProfile;
  }, [isEditingProfile]);

  useEffect(() => {
    onRefreshListRef.current = onRefreshList;
  }, [onRefreshList]);

  const loadDetail = useCallback(async (targetJid: string, silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.leads.getDetail(targetJid);
      setDetail(res);
      if (!isEditingProfileRef.current) {
        setEditName(res.lead?.name || '');
        setEditPhone(res.lead?.phone || '');
        setEditAddress(res.lead?.address || '');
        setEditPreferences(res.lead?.preferences || '');
        setEditNotes(res.lead?.notes || '');
      }
    } catch (err) {
      console.error('Failed to load lead detail:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Real-time SSE subscription + smart polling fallback
  useEffect(() => {
    if (!jid) {
      setDetail(null);
      setIsLive(false);
      return;
    }

    setIsEditingProfile(false);
    isInitialLoadRef.current = true;
    loadDetail(jid, false);

    // 1. Setup Server-Sent Events (SSE) stream
    let es: EventSource | null = null;
    try {
      const streamUrl = api.leads.getStreamUrl(jid);
      es = new EventSource(streamUrl, { withCredentials: true });

      es.onopen = () => {
        setIsLive(true);
      };

      es.onerror = () => {
        setIsLive(false);
      };

      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'new_message' && payload.data) {
            const newMsg = payload.data;
            setDetail((prev) => {
              if (!prev) return prev;
              const exists = prev.transcript.some(
                (m) => String(m.id) === String(newMsg.id) || (m.created_at === newMsg.created_at && m.content === newMsg.content)
              );
              if (exists) return prev;
              return {
                ...prev,
                transcript: [...prev.transcript, newMsg],
              };
            });
            loadDetail(jid, true);
            onRefreshListRef.current?.();
          } else if (payload.type === 'chat_cleared') {
            setDetail((prev) => (prev ? { ...prev, transcript: [] } : prev));
            onRefreshListRef.current?.();
          } else if (payload.type === 'chat_updated') {
            loadDetail(jid, true);
            onRefreshListRef.current?.();
          }
        } catch (e) {
          console.error('Failed to parse SSE payload:', e);
        }
      };
    } catch (err) {
      console.error('Failed to initialize EventSource:', err);
      setIsLive(false);
    }

    // 2. Polling fallback every 2s for background sync
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadDetail(jid, true);
      }
    }, 2000);

    // 3. Tab focus auto-sync
    const handleFocus = () => {
      loadDetail(jid, true);
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      if (es) {
        es.close();
      }
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocus);
      setIsLive(false);
    };
  }, [jid, loadDetail]);

  // Smart auto-scroll: instant on first load of jid, smooth when new messages arrive
  const transcriptLength = detail?.transcript?.length || 0;
  useEffect(() => {
    if (transcriptLength > 0) {
      messagesEndRef.current?.scrollIntoView({
        behavior: isInitialLoadRef.current ? 'auto' : 'smooth',
      });
      isInitialLoadRef.current = false;
    }
  }, [transcriptLength]);

  if (!jid) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jid) return;
    try {
      setSavingProfile(true);
      await api.leads.update(jid, {
        name: editName,
        phone: editPhone,
        address: editAddress,
        preferences: editPreferences,
        notes: editNotes,
      });
      setIsEditingProfile(false);
      loadDetail(jid);
      if (onRefreshList) onRefreshList();
      toast.success('Profil pelanggan berhasil diperbarui.', 'Profil Tersimpan');
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan profil pelanggan', 'Gagal Menyimpan');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSendManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jid || !manualMessage.trim() || sendingChat) return;
    try {
      setSendingChat(true);
      await api.chat.sendManual(jid, manualMessage.trim());
      setManualMessage('');
      await loadDetail(jid);
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengirim pesan', 'Gagal Mengirim');
    } finally {
      setSendingChat(false);
    }
  };

  const toggleBot = async (enable: boolean) => {
    if (!jid) return;
    try {
      if (enable) {
        await api.chat.enableBot(jid);
        setDetail((prev) => (prev ? { ...prev, activeHandoff: undefined } : prev));
        toast.success('Chat berhasil dikembalikan ke Bot AI. Pesan akan dibalas otomatis.', 'Bot AI Aktif');
      } else {
        await api.chat.disableBot(jid, 'Diambil alih manual oleh admin CS');
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                activeHandoff: {
                  id: Date.now(),
                  reason: 'Diambil alih manual oleh admin CS',
                  created_at: new Date().toISOString(),
                },
              }
            : prev
        );
        toast.info('Chat berhasil diambil alih. Bot AI dinonaktifkan untuk pelanggan ini.', 'Chat Diambil Alih');
      }
      await loadDetail(jid, true);
      onRefreshListRef.current?.();
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengubah kontrol bot', 'Gagal Kontrol Bot');
    }
  };

  const handleClearHistory = async () => {
    if (!jid || !confirm('Yakin ingin menghapus riwayat pesan dan data untuk nomor ini? Data yang sudah dihapus tidak dapat dikembalikan.')) return;
    try {
      if (typeof api.leads.clearChat === 'function') {
        await api.leads.clearChat(jid);
      } else if (typeof api.leads.clearHistory === 'function') {
        await api.leads.clearHistory(jid);
      }
      toast.success('Riwayat pesan dan data berhasil dibersihkan.', 'Riwayat Dibersihkan');
      onClose();
      if (onRefreshList) onRefreshList();
    } catch (err: any) {
      toast.error(err.message || 'Gagal membersihkan riwayat', 'Gagal Membersihkan');
    }
  };

  const handleExportJson = () => {
    if (!detail) return;
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(detail, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `chat-${jid.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      toast.info('Riwayat chat berhasil diekspor.', 'Ekspor JSON');
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengekspor riwayat', 'Gagal');
    }
  };

  const isHandoff = Boolean(detail?.activeHandoff);
  const leadPhone = detail?.lead?.phone?.trim();
  const isLid = jid.endsWith('@lid');

  return (
    <Sheet open={Boolean(jid)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="p-0 sm:max-w-xl md:max-w-2xl flex flex-col h-full bg-background border-l shadow-2xl">

        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b flex flex-row items-center justify-between space-y-0 bg-card pr-12">
          <div>
            <div className="flex items-center gap-2">
              <SheetTitle className="text-base font-semibold text-foreground">
                {detail?.lead?.name || (isLid ? 'Pelanggan WhatsApp (LID)' : 'Pelanggan WhatsApp')}
              </SheetTitle>
              {detail?.lead?.greeted_at ? (
                <Badge variant="outline" className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/30">
                  🍈 Sudah Disapa
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[11px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-500/30">
                  ⏳ Belum Disapa
                </Badge>
              )}
              {isLive ? (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  title="Pesan baru akan langsung muncul seketika secara otomatis (real-time stream aktif)."
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  title="Sinkronisasi otomatis aktif."
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Auto-Sync
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
              {leadPhone ? (
                <span className="font-medium text-foreground">{leadPhone}</span>
              ) : isLid ? (
                <span title={`ID unik WhatsApp (LID): ${jid}`}>
                  LID: <span className="font-mono">{jid.replace('@lid', '')}</span>
                </span>
              ) : (
                <span className="font-mono">+{jid.replace('@s.whatsapp.net', '')}</span>
              )}
              <span>•</span>
              <span>{detail?.transcript?.length || 0} pesan tersimpan</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              title="Edit data pelanggan"
              onClick={() => setIsEditingProfile(!isEditingProfile)}
            >
              <Edit2 size={13} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs"
              title="Unduh data JSON"
              onClick={handleExportJson}
            >
              <Download size={13} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs text-destructive hover:text-destructive"
              title="Bersihkan riwayat chat"
              onClick={handleClearHistory}
            >
              <Trash2 size={13} />
            </Button>
          </div>
        </SheetHeader>

        {/* Content Body */}
        {loading && !detail ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Memuat riwayat percakapan…
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Edit Customer Profile Drawer Panel */}
            {isEditingProfile ? (
              <form onSubmit={handleSaveProfile} className="p-4 bg-muted/40 border-b space-y-3">
                <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                  Edit Data Pelanggan
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Input
                    className="h-8 text-xs"
                    placeholder="Nama Pelanggan"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <Input
                    className="h-8 text-xs"
                    placeholder="Nomor WhatsApp"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                </div>
                <Input
                  className="h-8 text-xs"
                  placeholder="Alamat Lengkap Pengiriman"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                />
                <Input
                  className="h-8 text-xs"
                  placeholder="Preferensi / Catatan Produk (misal: Durian Montong, Musang King)"
                  value={editPreferences}
                  onChange={(e) => setEditPreferences(e.target.value)}
                />
                <Textarea
                  className="min-h-[50px] text-xs"
                  rows={2}
                  placeholder="Catatan CS Internal…"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setIsEditingProfile(false)}>
                    Batal
                  </Button>
                  <Button type="submit" size="sm" className="h-7 text-xs" disabled={savingProfile}>
                    <Save size={12} /> {savingProfile ? 'Menyimpan…' : 'Simpan Profil'}
                  </Button>
                </div>
              </form>
            ) : (
              /* Status Bar */
              <div className="p-3 px-5 bg-card border-b flex justify-between items-center text-xs">
                <div>
                  <span className="text-muted-foreground">Status Sambutan: </span>
                  <strong className="text-foreground">
                    {detail?.lead?.greeted_at
                      ? `Sudah disapa pada ${formatWibDateTime(detail.lead.greeted_at)}`
                      : 'Belum disapa (akan otomatis dibalas 1x saat mengirim pesan)'}
                  </strong>
                </div>
              </div>
            )}

            {/* Chat Thread */}
            <div className="flex-1 p-5 overflow-y-auto flex flex-col gap-2.5 wa-chat-canvas">
              {(!detail?.transcript || detail.transcript.length === 0) ? (
                <div className="text-center text-muted-foreground text-xs my-auto py-12">
                  Belum ada riwayat pesan di database.
                  <div className="text-[11px] mt-1 text-muted-foreground/80">
                    Admin dapat mengirim pesan WhatsApp pertama ke customer menggunakan kolom di bawah.
                  </div>
                </div>
              ) : (
                detail.transcript.map((msg) => {
                  const isUser = msg.role === 'user' || msg.sender_type === 'customer' || msg.sender === 'user';
                  const isAdmin = msg.sender_type === 'admin';
                  return (
                    <div
                      key={msg.id}
                      className={`wa-bubble ${isUser ? 'wa-bubble-in' : 'wa-bubble-out'}`}
                      style={{
                        maxWidth: '82%',
                        alignSelf: isUser ? 'flex-start' : 'flex-end',
                      }}
                    >
                      {isAdmin && (
                        <div className="text-[10px] font-bold text-primary mb-0.5 uppercase tracking-wide">
                          Admin CS
                        </div>
                      )}
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
                      <div className="wa-bubble-meta flex items-center justify-end gap-1 mt-1 text-[10px] text-muted-foreground">
                        <span>{formatWibTime(msg.created_at)}</span>
                        {!isUser && <CheckCheck size={13} className="text-sky-500 ml-0.5" />}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Live Chat Composer (Balasan Admin ke WhatsApp) */}
            <form
              onSubmit={handleSendManual}
              className="p-3 bg-card border-t flex gap-2 items-center"
            >
              <Input
                className="h-10 text-sm"
                placeholder="Tulis balasan langsung ke WhatsApp customer…"
                value={manualMessage}
                onChange={(e) => setManualMessage(e.target.value)}
                disabled={sendingChat}
              />
              <Button
                type="submit"
                className="h-10 px-4 shrink-0 font-medium"
                disabled={sendingChat || !manualMessage.trim()}
              >
                <Send size={15} /> {sendingChat ? 'Mengirim…' : 'Kirim'}
              </Button>
            </form>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
