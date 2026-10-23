import React, { useEffect, useState } from 'react';
import { api, LeadItem, formatWibTime, formatWibDateTime } from '../lib/api';
import { ChatDrawer } from './ChatDrawer';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Power, 
  MessageSquare, 
  Users, 
  Filter, 
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowDownUp
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from './ui/table';
import { useToast } from './ui/toast';

export const LeadsView: React.FC = () => {
  const { toast } = useToast();
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('updated');
  const [direction, setDirection] = useState('desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedJid, setSelectedJid] = useState<string | null>(null);

  const [botEnabled, setBotEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('durian_bot_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [togglingBot, setTogglingBot] = useState(false);

  const fetchLeads = async (pageToLoad = page, searchTerm = search, sortField = sort, dir = direction, silent = false) => {
    try {
      if (!silent && leads.length === 0) setLoading(true);
      const res = await api.leads.list(pageToLoad, searchTerm, sortField, dir);
      setLeads(res.leads);
      setTotalPages(res.pagination.totalPages);
      const isBotOn = Boolean(res.botEnabled);
      setBotEnabled(isBotOn);
      localStorage.setItem('durian_bot_enabled', String(isBotOn));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLeads(1, search, sort, direction);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, sort, direction]);

  useEffect(() => {
    // Periodic background sync every 4s when looking at leads without active search typing
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !search) {
        fetchLeads(page, search, sort, direction, true);
      }
    }, 4000);

    const handleFocus = () => {
      if (document.visibilityState === 'visible' && !search) {
        fetchLeads(page, search, sort, direction, true);
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [page, search, sort, direction]);

  const handleSortChange = (newSort: string, newDirection: string) => {
    setSort(newSort);
    setDirection(newDirection);
    setPage(1);
    fetchLeads(1, search, newSort, newDirection);
  };

  const toggleColumnSort = (columnKey: string) => {
    if (sort === columnKey) {
      const nextDir = direction === 'asc' ? 'desc' : 'asc';
      handleSortChange(columnKey, nextDir);
    } else {
      handleSortChange(columnKey, columnKey === 'name' || columnKey === 'phone' ? 'asc' : 'desc');
    }
  };

  const renderSortIcon = (columnKey: string) => {
    if (sort !== columnKey) {
      return <ArrowUpDown size={12} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />;
    }
    return direction === 'asc' ? (
      <ArrowUp size={12} className="text-primary font-bold animate-in fade-in" />
    ) : (
      <ArrowDown size={12} className="text-primary font-bold animate-in fade-in" />
    );
  };

  const handleToggleBot = async () => {
    const nextState = !botEnabled;
    try {
      setTogglingBot(true);
      const res = await api.dashboard.toggleBot(nextState);
      setBotEnabled(res.enabled);
      localStorage.setItem('durian_bot_enabled', String(res.enabled));
      toast.success(
        res.enabled ? 'Sambutan otomatis diaktifkan. Chat baru akan dibalas otomatis.' : 'Sambutan otomatis dinonaktifkan.',
        'Kontrol Sambutan'
      );
    } catch (err: any) {
      toast.error(err.message, 'Gagal Mengubah Status Sambutan');
    } finally {
      setTogglingBot(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary tracking-wider border-primary/30 bg-primary/5">
              Pesan & Kontak
            </Badge>
            <span className="text-xs text-muted-foreground">• WhatsApp Chat</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Percakapan & Kontak Pelanggan</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Daftar pesan percakapan dan kontak pelanggan WhatsApp Sambutan Durian.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card text-xs">
            <span className={`w-2 h-2 rounded-full ${botEnabled ? 'bg-primary animate-pulse' : 'bg-muted-foreground'}`} />
            <span className="text-muted-foreground">Sambutan:</span>
            <span className="font-semibold text-foreground">{botEnabled ? 'Aktif' : 'Nonaktif'}</span>
            <Button
              variant={botEnabled ? 'outline' : 'default'}
              size="sm"
              className="h-7 text-xs px-2.5 ml-1.5 cursor-pointer"
              disabled={togglingBot}
              onClick={handleToggleBot}
            >
              <Power size={12} className="mr-1" />
              <span>{botEnabled ? 'Matikan' : 'Nyalakan'}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Filter & Leads Table Card */}
      <Card className="border shadow-xs overflow-hidden">
        <CardHeader className="p-4 px-5 flex flex-row items-center justify-between gap-4 flex-wrap border-b bg-card/40">
          <div className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users size={16} className="text-primary" />
            Daftar Antrean Customer
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Sorting Dropdown */}
            <div className="flex items-center gap-1.5 bg-background border border-input rounded-lg px-2.5 h-9 focus-within:ring-1 focus-within:ring-ring">
              <ArrowDownUp size={13} className="text-muted-foreground shrink-0" />
              <select
                className="bg-transparent text-xs text-foreground focus:outline-none cursor-pointer pr-1"
                value={`${sort}-${direction}`}
                onChange={(e) => {
                  const [s, d] = e.target.value.split('-');
                  handleSortChange(s, d);
                }}
                title="Urutkan antrean customer"
              >
                <option value="updated-desc">Terakhir Diupdate (Terbaru)</option>
                <option value="updated-asc">Terakhir Diupdate (Terlama)</option>
                <option value="created-desc">Tanggal Dibuat (Terbaru)</option>
                <option value="created-asc">Tanggal Dibuat (Terlama)</option>
                <option value="name-asc">Nama Customer (A–Z)</option>
                <option value="name-desc">Nama Customer (Z–A)</option>
                <option value="phone-asc">Nomor WhatsApp (0–9)</option>
                <option value="phone-desc">Nomor WhatsApp (9–0)</option>
              </select>
            </div>

            {/* Search Box with proper padding and icon alignment */}
            <div className="relative w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9 pr-9 h-9 text-xs rounded-lg"
                placeholder="Cari nama atau nomor HP…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-0.5 rounded-full hover:bg-muted transition-colors"
                  title="Hapus pencarian"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/25 hover:bg-muted/25">
                <TableHead 
                  className="w-[300px] text-[11px] uppercase tracking-wider font-semibold cursor-pointer select-none group"
                  onClick={() => toggleColumnSort('name')}
                  title="Klik untuk mengurutkan berdasarkan nama customer"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Customer</span>
                    {renderSortIcon('name')}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-[11px] uppercase tracking-wider font-semibold cursor-pointer select-none group"
                  onClick={() => toggleColumnSort('phone')}
                  title="Klik untuk mengurutkan berdasarkan nomor WhatsApp"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Nomor WhatsApp</span>
                    {renderSortIcon('phone')}
                  </div>
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Status Sambutan</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider font-semibold">Waktu Disapa</TableHead>
                <TableHead 
                  className="text-[11px] uppercase tracking-wider font-semibold cursor-pointer select-none group"
                  onClick={() => toggleColumnSort('updated')}
                  title="Klik untuk mengurutkan berdasarkan waktu update / pesan terakhir"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Terakhir Pesan</span>
                    {renderSortIcon('updated')}
                  </div>
                </TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-xs text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      <span>Memuat data customer…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-xs text-muted-foreground">
                    Tidak ada customer yang sesuai kriteria pencarian.
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => {
                  const firstLetter = (lead.name || 'P').charAt(0).toUpperCase();
                  return (
                    <TableRow
                      key={lead.jid}
                      className="group cursor-pointer hover:bg-muted/40 transition-colors duration-150"
                      onClick={() => setSelectedJid(lead.jid)}
                      title="Klik untuk membuka riwayat chat lengkap"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center border border-primary/20 shrink-0">
                            {firstLetter}
                          </div>
                          <div className="truncate">
                            <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                              {lead.name || (lead.jid.endsWith('@lid') ? 'Pelanggan WhatsApp (LID)' : 'Pelanggan WhatsApp')}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate max-w-[200px]">
                              {lead.jid}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-xs font-mono font-medium text-foreground">
                        {lead.phone ? (
                          lead.phone
                        ) : lead.jid.endsWith('@lid') ? (
                          <span className="text-[11px] text-muted-foreground" title={`ID unik WhatsApp (LID): ${lead.jid}`}>
                            LID: {lead.jid.replace('@lid', '')}
                          </span>
                        ) : (
                          lead.jid.replace(/@.*$/, '')
                        )}
                      </TableCell>

                      <TableCell>
                        {lead.greeted_at ? (
                          <Badge variant="outline" className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/30">
                            🍈 Sudah Disapa (1x)
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-500/30">
                            ⏳ Belum Disapa
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground">
                        {lead.greeted_at ? formatWibDateTime(lead.greeted_at) : '—'}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground">
                        {formatWibDateTime(lead.updated_at)}
                      </TableCell>

                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs font-medium text-primary hover:text-primary hover:bg-primary/10 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedJid(lead.jid);
                          }}
                        >
                          <MessageSquare size={13} className="mr-1" />
                          <span>Buka Chat</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>

        {/* Pagination Footer */}
        <div className="p-4 px-5 border-t bg-card/40 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Menampilkan halaman <strong className="text-foreground">{page}</strong> dari <strong className="text-foreground">{totalPages}</strong>
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs rounded-lg cursor-pointer"
              disabled={page <= 1}
              onClick={() => {
                const newPage = page - 1;
                setPage(newPage);
                fetchLeads(newPage, search, sort, direction);
              }}
            >
              <ChevronLeft size={13} className="mr-1" /> Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs rounded-lg cursor-pointer"
              disabled={page >= totalPages}
              onClick={() => {
                const newPage = page + 1;
                setPage(newPage);
                fetchLeads(newPage, search, sort, direction);
              }}
            >
              Berikutnya <ChevronRight size={13} className="ml-1" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Slide-over Chat Drawer */}
      <ChatDrawer
        jid={selectedJid}
        onClose={() => setSelectedJid(null)}
        onRefreshList={() => fetchLeads(page, search, sort, direction, true)}
      />
    </div>
  );
};
