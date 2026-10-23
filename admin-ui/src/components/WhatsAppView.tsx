import React, { useEffect, useState } from 'react';
import { api, WhatsAppConfig } from '../lib/api';
import { QrCode, Plus, Trash2, Smartphone, RefreshCw, Settings2, Edit2, RotateCcw, Save, CheckCircle2, Check } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { useToast } from './ui/toast';

export const WhatsAppView: React.FC = () => {
  const { toast } = useToast();
  const [numbers, setNumbers] = useState<any[]>([]);
  const [config, setConfig] = useState<WhatsAppConfig>({
    rotationMode: 'round_robin',
    minDelaySeconds: 3,
    maxDelaySeconds: 5,
    maxConcurrency: 3,
    enableStickyAssignment: true,
  });
  const configLoadedRef = React.useRef(false);
  const [isConfigDirty, setIsConfigDirty] = useState(false);
  const [loading, setLoading] = useState(true);

  // Add Number & Live QR Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingQrData, setPendingQrData] = useState<{
    state: string;
    detail?: string;
    phone?: string | null;
    qrDataUrl: string;
  } | null>(null);
  const [loadingPendingQr, setLoadingPendingQr] = useState(false);
  const [csLabel, setCsLabel] = useState('CS Line 1');
  const [csNameOverride, setCsNameOverride] = useState('Admin Durian');
  const [dailyLimit, setDailyLimit] = useState(300);
  const [savingNewNumber, setSavingNewNumber] = useState(false);
  const [connectMethod, setConnectMethod] = useState<'qr' | 'code'>('qr');
  const [pairingPhone, setPairingPhone] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [loadingPairingCode, setLoadingPairingCode] = useState(false);
  const [inputPhone, setInputPhone] = useState('');

  // Edit Session Modal
  const [editingSession, setEditingSession] = useState<any | null>(null);
  const [editCsName, setEditCsName] = useState('');
  const [editDailyLimit, setEditDailyLimit] = useState(300);
  const [savingEdit, setSavingEdit] = useState(false);

  // Save config state
  const [savingConfig, setSavingConfig] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await api.whatsapp.getStatus();
      setNumbers(res.numbers || []);
      if (res.config && !configLoadedRef.current) {
        setConfig(res.config);
        configLoadedRef.current = true;
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(async () => {
      try {
        const res = await api.whatsapp.getStatus();
        setNumbers(res.numbers || []);
      } catch (err) {
        console.error(err);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const openAddModal = async () => {
    setShowAddModal(true);
    setCsLabel(`CS Line ${numbers.length + 1}`);
    setCsNameOverride('Admin Durian');
    setDailyLimit(300);
    setConnectMethod('qr');
    setPairingCode('');
    setPairingPhone('');
    setInputPhone('');
    await handleRefreshPendingQr();
  };

  const handleRefreshPendingQr = async () => {
    try {
      setLoadingPendingQr(true);
      const res = await api.whatsapp.refreshPendingQr();
      setPendingQrData(res);
      if (res?.phone) {
        setInputPhone(res.phone);
      }
    } catch (err: any) {
      toast.error(err.message || String(err), 'Gagal Memuat QR Code');
    } finally {
      setLoadingPendingQr(false);
    }
  };

  const handleRequestPairingCode = async () => {
    if (!pairingPhone.trim()) return;
    try {
      setLoadingPairingCode(true);
      const cleanInput = pairingPhone.trim().replace(/\D/g, '');
      const res = await api.whatsapp.requestPairingCode(cleanInput);
      setPairingCode(res.code);
      setInputPhone(cleanInput);
      toast.success('Kode penautan siap! Masukkan kode ini di WhatsApp HP Anda.', 'Kode Berhasil Dibuat');
    } catch (err: any) {
      toast.error(err.message || String(err), 'Gagal Meminta Kode');
    } finally {
      setLoadingPairingCode(false);
    }
  };

  useEffect(() => {
    let timer: any = null;
    if (showAddModal) {
      // Immediate check once
      api.whatsapp.getPendingQr().then((res) => {
        setPendingQrData(res);
        if (res?.phone) {
          setInputPhone((prev) => prev || res.phone);
        }
      }).catch(() => {});

      timer = setInterval(async () => {
        try {
          const res = await api.whatsapp.getPendingQr();
          setPendingQrData(res);
          if (res?.phone) {
            setInputPhone((prev) => prev || res.phone);
          }
          if (res.state === 'open') {
            clearInterval(timer);
          }
        } catch (err) {
          console.error(err);
        }
      }, 3000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [showAddModal]);

  const handleSaveNewNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    const phoneToSave = (inputPhone || pendingQrData?.phone || pairingPhone || '').replace(/\D/g, '');
    if (!phoneToSave || phoneToSave.length < 9) {
      toast.warning('Harap masukkan nomor WhatsApp yang valid (contoh: 6281234567890).', 'Nomor Diperlukan');
      return;
    }
    try {
      setSavingNewNumber(true);
      await api.whatsapp.addNumber({
        phone: phoneToSave,
        id: csLabel,
        csName: csNameOverride || 'Admin Durian',
        dailyLimit,
      });
      setShowAddModal(false);
      setPendingQrData(null);
      setInputPhone('');
      toast.success('Nomor WhatsApp CS berhasil ditambahkan dan aktif!', 'Nomor Ditambahkan');
      fetchStatus();
    } catch (err: any) {
      toast.error(err.message || String(err), 'Gagal Menambahkan Nomor');
    } finally {
      setSavingNewNumber(false);
    }
  };

  const handleDeleteNumber = async (phone: string) => {
    if (!confirm(`Hapus nomor +${phone} dari sistem rotasi CS?`)) return;
    try {
      await api.whatsapp.deleteNumber(phone);
      toast.success('Nomor berhasil dihapus dari sistem rotasi CS.', 'Nomor Dihapus');
      fetchStatus();
    } catch (err: any) {
      toast.error(err.message || String(err), 'Gagal Menghapus Nomor');
    }
  };

  const handleClearAuth = async (phone: string) => {
    if (!confirm(`Hapus kredensial sesi +${phone} dan scan ulang QR?`)) return;
    try {
      await api.whatsapp.clearAuth(phone);
      toast.success('Sesi WhatsApp dibersihkan. Silakan scan ulang QR.', 'Sesi Direset');
      fetchStatus();
    } catch (err: any) {
      toast.error(err.message || String(err), 'Gagal Mereset Sesi');
    }
  };

  const handleSaveSessionEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession) return;
    try {
      setSavingEdit(true);
      await api.whatsapp.updateNumber(editingSession.phone, {
        csName: editCsName.trim() || 'Siska',
        dailyLimit: editDailyLimit,
      });
      setEditingSession(null);
      toast.success('Pengaturan sesi WhatsApp berhasil diperbarui.', 'Sesi Diperbarui');
      fetchStatus();
    } catch (err: any) {
      toast.error(err.message || String(err), 'Gagal Memperbarui Sesi');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingConfig(true);
      const minDelaySeconds = Math.max(1, Math.floor(Number(config.minDelaySeconds) || 3));
      const maxDelaySeconds = Math.max(minDelaySeconds, Math.floor(Number(config.maxDelaySeconds) || 5));
      const maxConcurrency = Math.max(1, Math.min(10, Math.floor(Number(config.maxConcurrency) || 3)));
      const payload = {
        ...config,
        minDelaySeconds,
        maxDelaySeconds,
        maxConcurrency,
      };
      const res = await api.whatsapp.saveConfig(payload);
      if (res?.config) setConfig(res.config);
      setIsConfigDirty(false);
      toast.success('Pengaturan distribusi & anti-ban WhatsApp berhasil disimpan ke database!', 'Pengaturan Tersimpan');
    } catch (err: any) {
      toast.error(err.message || String(err), 'Gagal Menyimpan Konfigurasi');
    } finally {
      setSavingConfig(false);
    }
  };

  const effectivePhone = (inputPhone || pendingQrData?.phone || pairingPhone || '').replace(/\D/g, '');
  const isPendingConnected = pendingQrData?.state === 'open' || Boolean(pendingQrData?.phone);
  const canSave = Boolean(effectivePhone && effectivePhone.length >= 9);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Manajemen Perangkat WhatsApp</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Kelola multi-nomor WhatsApp Baileys, rotasi CS, kuota pesan harian, dan pencegahan banned.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={fetchStatus}>
            <RefreshCw size={14} className="mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={openAddModal}>
            <Plus size={14} className="mr-1" /> Tambah Nomor Baru
          </Button>
        </div>
      </div>

      {/* Numbers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && numbers.length === 0 ? (
          <div className="col-span-full p-12 text-center text-sm text-muted-foreground">
            Memuat status nomor WhatsApp…
          </div>
        ) : numbers.length === 0 ? (
          <Card className="col-span-full text-center p-8">
            <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
              <Smartphone size={28} />
            </div>
            <h3 className="text-base font-semibold text-foreground">Belum Ada Nomor WhatsApp Terdaftar</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-5">
              Scan QR Code untuk menghubungkan akun WhatsApp CS Anda ke Sambutan Durian agar dapat mulai menerima dan membalas pesan pelanggan.
            </p>
            <Button onClick={openAddModal}>
              <QrCode size={16} className="mr-1.5" /> Hubungkan Nomor WhatsApp (Scan QR)
            </Button>
          </Card>
        ) : (
          numbers.map((num) => {
            const isOnline = num.status === 'online' || num.state === 'open';
            const isConnecting = num.status === 'connecting' || num.state === 'connecting';
            const displayName = (!num.csName || num.csName === '[object Object]') ? 'Admin Durian' : num.csName;
            return (
              <Card key={num.phone} className="flex flex-col justify-between">
                <CardHeader className="flex flex-row items-start justify-between pb-3 space-y-0">
                  <div>
                    <CardTitle className="text-base">{displayName}</CardTitle>
                    <div className="text-xs font-mono text-muted-foreground mt-0.5">
                      +{num.phone}
                    </div>
                  </div>
                  <Badge variant={isOnline ? 'success' : isConnecting ? 'warning' : 'destructive'}>
                    {isOnline ? '● Terhubung' : isConnecting ? '⏳ Menunggu QR' : '○ Terputus'}
                  </Badge>
                </CardHeader>

                <CardContent className="space-y-4">
                  {isConnecting && num.qrDataUrl && (
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border text-center">
                      <img src={num.qrDataUrl} alt="WhatsApp QR Code" className="w-44 h-44 mx-auto block" />
                      <div className="text-[11px] text-muted-foreground mt-2">
                        Buka WA &gt; Perangkat Tertaut &gt; Tautkan Perangkat
                      </div>
                    </div>
                  )}

                  <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Customer Hari Ini:</span>
                      <span className="font-semibold text-foreground">{num.todayLeadCount || 0} customer</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pesan Terkirim:</span>
                      <span className="font-semibold text-foreground">
                        {num.todayMessageCount || 0} / {num.dailyLimit || 300} limit
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs cursor-pointer"
                      onClick={() => {
                        setEditingSession(num);
                        setEditCsName(displayName);
                        setEditDailyLimit(num.dailyLimit || 300);
                      }}
                    >
                      <Edit2 size={12} className="mr-1" /> Edit Sesi
                    </Button>
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs"
                        title="Reset Sesi & Scan Ulang"
                        onClick={() => handleClearAuth(num.phone)}
                      >
                        <RotateCcw size={12} />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs text-destructive hover:text-destructive"
                        title="Hapus Nomor"
                        onClick={() => handleDeleteNumber(num.phone)}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Distribution & Anti-Ban Settings */}
      <Card className="max-w-3xl">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="flex items-center gap-2">
            <Settings2 size={18} className="text-primary" />
            <CardTitle>Pengaturan Distribusi & Keamanan (Anti-Banned)</CardTitle>
          </div>
          {isConfigDirty && (
            <Badge variant="warning">● Ada perubahan belum disimpan</Badge>
          )}
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Metode Rotasi CS
                </label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={config.rotationMode}
                  onChange={(e) => {
                    setIsConfigDirty(true);
                    setConfig({ ...config, rotationMode: e.target.value as any });
                  }}
                >
                  <option value="round_robin">Round Robin (Bagi Merata Bergiliran)</option>
                  <option value="least_loaded">Least Loaded (Prioritaskan Beban Terendah)</option>
                  <option value="priority">Priority (Utamakan CS Utama)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Max Konkurensi Paralel
                </label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={config.maxConcurrency}
                  onChange={(e) => {
                    setIsConfigDirty(true);
                    setConfig({ ...config, maxConcurrency: Number(e.target.value) });
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Jeda Minimum Balasan (detik)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={config.minDelaySeconds}
                  onChange={(e) => {
                    setIsConfigDirty(true);
                    setConfig({ ...config, minDelaySeconds: Number(e.target.value) });
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Jeda Maksimum Balasan (detik)
                </label>
                <Input
                  type="number"
                  min={2}
                  max={60}
                  value={config.maxDelaySeconds}
                  onChange={(e) => {
                    setIsConfigDirty(true);
                    setConfig({ ...config, maxDelaySeconds: Number(e.target.value) });
                  }}
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <Button type="submit" disabled={savingConfig}>
                <Save size={15} className="mr-1.5" />
                {savingConfig ? 'Menyimpan…' : isConfigDirty ? 'Simpan Konfigurasi Distribusi' : 'Simpan Konfigurasi Distribusi'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Add Number & Live QR Dialog */}
      <Dialog open={showAddModal} onOpenChange={(open) => setShowAddModal(open)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Tautkan Nomor WhatsApp Baru</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {isPendingConnected ? (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center space-y-1">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center mb-2">
                  <Check size={20} />
                </div>
                <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  WhatsApp Terhubung: +{pendingQrData?.phone}
                </h4>
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Perangkat berhasil dipindai dan diverifikasi oleh Baileys socket.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Mode Selector Tabs */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
                  <button
                    type="button"
                    className={`py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                      connectMethod === 'qr'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setConnectMethod('qr')}
                  >
                    Scan QR Code
                  </button>
                  <button
                    type="button"
                    className={`py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                      connectMethod === 'code'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setConnectMethod('code')}
                  >
                    Kode Pairing (8 Digit)
                  </button>
                </div>

                {connectMethod === 'qr' ? (
                  <div className="text-center space-y-3">
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border inline-block shadow-sm">
                      {loadingPendingQr || !pendingQrData?.qrDataUrl ? (
                        <div className="w-56 h-56 flex flex-col items-center justify-center gap-2">
                          <RefreshCw size={24} className="animate-spin text-primary" />
                          <span className="text-xs text-muted-foreground">Menyiapkan QR Code...</span>
                        </div>
                      ) : (
                        <img src={pendingQrData.qrDataUrl} alt="WhatsApp QR Code" className="w-56 h-56 block" />
                      )}
                    </div>
                    <div className="flex justify-center">
                      <Button variant="outline" size="sm" onClick={handleRefreshPendingQr} disabled={loadingPendingQr}>
                        <RefreshCw size={12} className="mr-1" /> Muat Ulang QR
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border bg-card space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">
                        Nomor WhatsApp HP Anda
                      </label>
                      <p className="text-[11px] text-muted-foreground">
                        Masukkan nomor lengkap diawali kode negara (misal 62 untuk Indonesia tanpa tanda +).
                      </p>
                      <div className="flex gap-2 pt-1">
                        <Input
                          placeholder="6281234567890"
                          value={pairingPhone}
                          onChange={(e) => setPairingPhone(e.target.value)}
                          className="h-9 text-xs font-mono"
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 text-xs px-4 shrink-0 font-medium cursor-pointer"
                          disabled={loadingPairingCode || !pairingPhone.trim()}
                          onClick={handleRequestPairingCode}
                        >
                          {loadingPairingCode ? 'Meminta…' : 'Dapatkan Kode'}
                        </Button>
                      </div>
                    </div>

                    {pairingCode && (
                      <div className="p-4 bg-muted/70 rounded-xl border border-primary/20 text-center space-y-2">
                        <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                          Kode Penautan Anda
                        </span>
                        <div className="text-3xl font-mono font-extrabold tracking-widest text-primary selection:bg-primary/20">
                          {pairingCode}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Buka <strong>WhatsApp &gt; Setelan &gt; Perangkat Tertaut &gt; Tautkan Perangkat &gt; Tautkan dengan nomor telepon</strong> di HP Anda, lalu masukkan 8 karakter kode di atas.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSaveNewNumber} className="space-y-3 pt-2">
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Nomor WhatsApp</label>
                  {(pendingQrData?.phone || isPendingConnected) && (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <Check size={12} /> WhatsApp Terdeteksi
                    </span>
                  )}
                </div>
                <Input
                  value={inputPhone}
                  onChange={(e) => setInputPhone(e.target.value)}
                  placeholder="Contoh: 6281234567890 (terisi otomatis / ketik manual)"
                  className="font-mono text-sm"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Nomor terisi otomatis saat pairing selesai, atau ketik nomor jika WhatsApp di HP Anda sudah berstatus terhubung.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Label CS Internal</label>
                <Input
                  placeholder="Contoh: CS Line 1"
                  value={csLabel}
                  onChange={(e) => setCsLabel(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Nama CS Virtual</label>
                  <Input
                    placeholder="Siska"
                    value={csNameOverride}
                    onChange={(e) => setCsNameOverride(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Kuota Lead Harian</label>
                  <Input
                    type="number"
                    min={10}
                    max={5000}
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Batal
                </Button>
                <Button type="submit" disabled={savingNewNumber || !canSave}>
                  <CheckCircle2 size={14} className="mr-1" /> {savingNewNumber ? 'Menyimpan…' : 'Simpan & Aktifkan CS'}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Session Dialog */}
      <Dialog open={Boolean(editingSession)} onOpenChange={(open) => !open && setEditingSession(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Sesi +{editingSession?.phone}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveSessionEdit} className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Nama CS Virtual</label>
              <Input
                value={editCsName}
                onChange={(e) => setEditCsName(e.target.value)}
                placeholder="Siska"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Kuota Lead Harian</label>
              <Input
                type="number"
                min={10}
                max={5000}
                value={editDailyLimit}
                onChange={(e) => setEditDailyLimit(Number(e.target.value))}
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button type="button" variant="outline" onClick={() => setEditingSession(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? 'Menyimpan…' : 'Simpan Perubahan'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
