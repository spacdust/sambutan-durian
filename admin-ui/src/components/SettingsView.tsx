import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  Save,
  Server,
  Database,
  Smartphone,
  RefreshCw,
  CheckCircle2,
  Lock,
  Building,
  MessageSquare,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { useToast } from './ui/toast';

export const SettingsView: React.FC = () => {
  const { toast } = useToast();
  const [businessName, setBusinessName] = useState('Sambutan Durian');
  const [csName, setCsName] = useState('Admin Durian');
  const [welcomeMessage, setWelcomeMessage] = useState('Halo kak! Selamat datang di Sambutan Durian 🍈 Ada yang bisa kami bantu seputar pesanan durian hari ini?');
  const [enableGreeting, setEnableGreeting] = useState(true);
  const [adminPhone, setAdminPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const res = await api.settings.getConfig().catch(() => null);
      if (res) {
        setBusinessName(res.businessName || 'Sambutan Durian');
        setCsName(res.csName || 'Admin Durian');
        setWelcomeMessage(res.welcomeMessage || 'Halo kak! Selamat datang di Sambutan Durian 🍈 Ada yang bisa kami bantu seputar pesanan durian hari ini?');
        setEnableGreeting(res.enableGreeting ?? true);
        setAdminPhone(res.adminPhone || '');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.settings.updateConfig({
        businessName,
        csName,
        welcomeMessage,
        enableGreeting,
        adminPhone,
        ...(newPassword ? { password: newPassword } : {}),
      });
      setNewPassword('');
      toast.success('Pengaturan Sambutan Durian berhasil disimpan!', 'Berhasil Menyimpan');
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan pengaturan.', 'Error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 text-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <span className="text-xs text-muted-foreground font-medium">Memuat pengaturan sistem…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header Bar */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Pengaturan Sistem</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Konfigurasi nama toko, pesan sambutan durian, dan akun admin.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Business & Greeting Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Building size={16} className="text-primary" />
              Identitas Toko & Sambutan WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Nama Usaha / Brand</label>
                <Input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Sambutan Durian"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Nama Admin CS</label>
                <Input
                  value={csName}
                  onChange={(e) => setCsName(e.target.value)}
                  placeholder="Admin Durian"
                  required
                />
              </div>
            </div>

            {/* Enable Greeting Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border bg-muted/20">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <span>Balas Sambutan Otomatis</span>
                  <Badge variant={enableGreeting ? 'success' : 'secondary'} className="text-[10px]">
                    {enableGreeting ? '● Aktif' : '○ Nonaktif'}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Hanya membalas 1 kali untuk pesan pertama kali yang masuk dari nomor baru.
                </p>
              </div>
              <Switch
                checked={enableGreeting}
                onCheckedChange={setEnableGreeting}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">
                  Template Pesan Balasan Pertama Kali (Greeting)
                </label>
                <span className="text-[10px] text-muted-foreground">
                  Gunakan: <code className="text-primary font-mono bg-primary/10 px-1 py-0.5 rounded font-bold">&#123;&#123;nama&#125;&#125;</code> untuk nama WA pengirim
                </span>
              </div>
              <Textarea
                rows={4}
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                placeholder="Pesan selamat datang yang akan dikirim saat nomor baru pertama kali menyapa..."
              />
              <p className="text-[11px] text-muted-foreground">
                📌 <strong>Aturan Kerja:</strong> Pesan ini <em>hanya dikirim satu kali</em> saat nomor pelanggan pertama kali menghubungi. Pesan berikutnya dari pelanggan tersebut tidak akan dibalas lagi.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nomor HP Admin (Notifikasi)</label>
              <Input
                value={adminPhone}
                onChange={(e) => setAdminPhone(e.target.value)}
                placeholder="6281234567890"
              />
              <p className="text-[11px] text-muted-foreground">
                Format nomor internasional tanpa tanda plus, misal: 6281234567890.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Security & Admin Credentials Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Lock size={16} className="text-primary" />
              Keamanan Admin Web
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Ubah Password Admin</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Kosongkan jika tidak ingin mengubah password"
              />
              <p className="text-[11px] text-muted-foreground">
                Gunakan kombinasi minimal 8 karakter untuk menjaga keamanan akses portal.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* System Health / Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Server size={16} className="text-primary" />
              Informasi Infrastruktur
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg border bg-muted/30 flex items-center justify-between">
                <span className="text-muted-foreground">Database Engine:</span>
                <span className="font-semibold flex items-center gap-1.5">
                  <Database size={13} className="text-blue-500" />
                  SQLite (node:sqlite)
                </span>
              </div>
              <div className="p-3 rounded-lg border bg-muted/30 flex items-center justify-between">
                <span className="text-muted-foreground">WhatsApp Engine:</span>
                <span className="font-semibold flex items-center gap-1.5">
                  <Smartphone size={13} className="text-emerald-500" />
                  Baileys Multi-Device
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="submit"
            className="px-6 font-semibold shadow-sm cursor-pointer"
            disabled={saving}
          >
            <Save size={14} className="mr-2" />
            <span>{saving ? 'Menyimpan…' : 'Simpan Perubahan'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
};
