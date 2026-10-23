import React, { useEffect, useRef, useState, useCallback } from 'react';
import { api, DashboardData, formatWibDateTime } from '../lib/api';
import { ChatDrawer } from './ChatDrawer';
import {
  Users,
  MessageSquare,
  RefreshCw,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowRight,
  TrendingUp,
  Radio,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from './ui/table';
import { useToast } from './ui/toast';

export const DashboardView: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const { toast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingBot, setTogglingBot] = useState(false);
  const [selectedJid, setSelectedJid] = useState<string | null>(null);

  const dataRef = useRef<DashboardData | null>(null);
  dataRef.current = data;

  const loadDashboard = useCallback(async (isManualRefresh = false, silent = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else if (!dataRef.current && !silent) setLoading(true);
      const res = await api.dashboard.get();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();

    // SSE Realtime Stream for instant updates
    let es: EventSource | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;

    const triggerSilentRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadDashboard(false, true);
      }, 300);
    };

    try {
      es = new EventSource(api.dashboard.getStreamUrl());
      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'activity_updated' || payload.type === 'new_message' || payload.type === 'wa_status') {
            triggerSilentRefresh();
          }
        } catch {
          // ignore parse error
        }
      };
    } catch (err) {
      console.error('Failed to initialize dashboard realtime stream:', err);
    }

    // Periodic Polling Fallback
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadDashboard(false, true);
      }
    }, 4000);

    return () => {
      if (es) es.close();
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(pollInterval);
    };
  }, [loadDashboard]);

  const handleToggleBot = async () => {
    if (!data) return;
    const nextState = !data.botEnabled;
    try {
      setTogglingBot(true);
      const res = await api.dashboard.toggleBot(nextState);
      setData({ ...data, botEnabled: res.enabled });
      toast.success(
        res.enabled ? 'Sambutan otomatis diaktifkan.' : 'Sambutan otomatis dinonaktifkan.',
        'Status Sambutan Bot'
      );
    } catch (err: any) {
      toast.error(err.message, 'Gagal Mengubah Status Sambutan');
    } finally {
      setTogglingBot(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-24 text-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <span className="text-xs text-muted-foreground font-medium">Memuat data dashboard…</span>
      </div>
    );
  }

  const waNumbers = data?.whatsappNumbers || [];
  const onlineCount = waNumbers.filter((n) => n.status === 'online').length;
  const totalContacts = data?.totalContacts ?? data?.leadsCount ?? 0;
  const recentLeads = data?.recentLeads || [];

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary tracking-wider border-primary/30 bg-primary/5">
              Live Dashboard
            </Badge>
            <span className="text-xs text-muted-foreground">• Real-time Sync</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Ringkasan Sambutan Durian</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pantau status koneksi WhatsApp, pesan masuk, dan aktivitas pelanggan.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 text-xs cursor-pointer hover:bg-muted"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
          >
            <RefreshCw size={13} className={`mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
          <Button
            size="sm"
            className="h-9 px-4 text-xs font-semibold shadow-sm cursor-pointer"
            onClick={() => onNavigate('whatsapp')}
          >
            <Smartphone size={13} className="mr-1.5" />
            <span>Kelola WhatsApp</span>
          </Button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: WhatsApp Connected */}
        <Card
          className="relative overflow-hidden group hover:border-primary/50 transition-all duration-300 hover:shadow-md cursor-pointer"
          onClick={() => onNavigate('whatsapp')}
        >
          <div className="absolute -top-10 -right-10 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-colors pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Nomor WhatsApp
            </CardTitle>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Smartphone size={15} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold tracking-tight text-foreground">
              {onlineCount} <span className="text-base font-normal text-muted-foreground">/ {waNumbers.length} aktif</span>
            </div>
            <div className="flex justify-between items-center mt-3 pt-3 border-t text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${onlineCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {onlineCount > 0 ? 'Terhubung' : 'Belum terhubung'}
              </span>
              <span className="text-primary font-medium group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                Detail &rarr;
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Total Kontak */}
        <Card
          className="relative overflow-hidden group hover:border-primary/50 transition-all duration-300 hover:shadow-md cursor-pointer"
          onClick={() => onNavigate('leads')}
        >
          <div className="absolute -top-10 -right-10 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-colors pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Kontak / Chat
            </CardTitle>
            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Users size={15} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold tracking-tight text-foreground">{totalContacts}</div>
            <div className="flex justify-between items-center mt-3 pt-3 border-t text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <MessageSquare size={13} />
                Pesan pelanggan
              </span>
              <span className="text-primary font-medium group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                Buka Chat &rarr;
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Sambutan Otomatis Toggle */}
        <Card className="relative overflow-hidden transition-all duration-300 hover:border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Sambutan Otomatis
            </CardTitle>
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Radio size={15} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant={data?.botEnabled ? 'success' : 'warning'} className="text-[11px] font-semibold">
                {data?.botEnabled ? '● Aktif' : '○ Nonaktif'}
              </Badge>
              <Switch
                checked={Boolean(data?.botEnabled)}
                disabled={togglingBot}
                onCheckedChange={handleToggleBot}
              />
            </div>
            <div className="pt-2.5 border-t text-[11px] text-muted-foreground">
              Beri salam otomatis saat ada pesan masuk baru.
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Database Status */}
        <Card className="relative overflow-hidden transition-all duration-300 hover:border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Database Engine
            </CardTitle>
            <div className="w-7 h-7 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Database size={15} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-semibold text-foreground">SQLite (Built-in)</span>
            </div>
            <div className="pt-2.5 border-t text-[11px] text-muted-foreground">
              Penyimpanan sesi WA & chat lokal aman di disk.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* WhatsApp Lines Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Smartphone size={16} className="text-primary" />
              Status Nomor WhatsApp
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Daftar akun WhatsApp yang terhubung ke sistem.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-8"
            onClick={() => onNavigate('whatsapp')}
          >
            + Hubungkan Nomor Baru
          </Button>
        </CardHeader>
        <CardContent>
          {waNumbers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">
              Belum ada nomor WhatsApp yang terhubung.{' '}
              <button
                onClick={() => onNavigate('whatsapp')}
                className="text-primary font-semibold underline ml-1 cursor-pointer"
              >
                Scan QR Code sekarang &rarr;
              </button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nomor HP</TableHead>
                  <TableHead className="text-xs">Label CS</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Pesan Hari Ini</TableHead>
                  <TableHead className="text-xs">Kontak Hari Ini</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waNumbers.map((num, i) => (
                  <TableRow key={num.phone || i}>
                    <TableCell className="font-mono text-xs font-semibold">
                      +{num.phone}
                    </TableCell>
                    <TableCell className="text-xs">{num.csName || 'CS'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={num.status === 'online' ? 'success' : 'secondary'}
                        className="text-[10px]"
                      >
                        {num.status === 'online' ? '● Online' : num.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{num.todayMessageCount ?? 0}</TableCell>
                    <TableCell className="text-xs">{num.todayLeadCount ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Chats Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <MessageSquare size={16} className="text-primary" />
              Percakapan WhatsApp Terbaru
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pelanggan yang baru saja berinteraksi melalui WhatsApp.
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-8 text-primary font-semibold"
            onClick={() => onNavigate('leads')}
          >
            Lihat Semua &rarr;
          </Button>
        </CardHeader>
        <CardContent>
          {recentLeads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">
              Belum ada percakapan masuk.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Nomor WA</TableHead>
                  <TableHead className="text-xs">Terakhir Aktif</TableHead>
                  <TableHead className="text-xs text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLeads.map((lead) => (
                  <TableRow key={lead.jid}>
                    <TableCell className="text-xs font-semibold">
                      {lead.name || 'Pelanggan'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {lead.phone || lead.jid.replace('@s.whatsapp.net', '')}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatWibDateTime(lead.updated_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2.5"
                        onClick={() => setSelectedJid(lead.jid)}
                      >
                        Buka Chat
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Chat Drawer Slide-over */}
      {selectedJid && (
        <ChatDrawer
          jid={selectedJid}
          onClose={() => setSelectedJid(null)}
          onRefreshList={() => loadDashboard(false, true)}
        />
      )}
    </div>
  );
};
