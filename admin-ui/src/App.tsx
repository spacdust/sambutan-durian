import React, { useState, useEffect } from 'react';
import { api, SessionInfo } from './lib/api';
import {
  LayoutDashboard,
  Users,
  Smartphone,
  Settings,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { DashboardView } from './components/DashboardView';
import { LeadsView } from './components/LeadsView';
import { WhatsAppView } from './components/WhatsAppView';
import { SettingsView } from './components/SettingsView';
import { LoginView } from './components/LoginView';
import { Button } from './components/ui/button';

const VALID_VIEWS = ['whatsapp', 'dashboard', 'leads', 'settings'];

const getInitialView = (): string => {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  if (VALID_VIEWS.includes(hash)) return hash;
  const saved = localStorage.getItem('durian_admin_active_tab');
  if (saved && VALID_VIEWS.includes(saved)) return saved;
  return 'whatsapp';
};

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<string>(getInitialView);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const handleNavigate = (view: string) => {
    if (!VALID_VIEWS.includes(view)) return;
    setActiveView(view);
    window.location.hash = `#/${view}`;
    localStorage.setItem('durian_admin_active_tab', view);
  };

  useEffect(() => {
    // Check active session
    api.auth
      .me()
      .then((s) => {
        if (s.authenticated) {
          setSession(s);
        } else {
          setSession(null);
        }
      })
      .catch(() => {
        setSession(null);
      })
      .finally(() => {
        setCheckingAuth(false);
      });

    // Read stored theme
    const savedTheme = localStorage.getItem('durian_theme') as 'light' | 'dark' | null;
    const initialTheme = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);
    if (initialTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    document.documentElement.style.colorScheme = initialTheme;

    // Handle back/forward and hash changes
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
      if (VALID_VIEWS.includes(hash)) {
        setActiveView(hash);
        localStorage.setItem('durian_admin_active_tab', hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('durian_theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    document.documentElement.style.colorScheme = nextTheme;
  };

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } finally {
      setSession(null);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary/20 text-primary flex items-center justify-center animate-pulse">
          <Smartphone size={22} />
        </div>
        <span className="text-xs text-muted-foreground font-medium">Memuat portal Sambutan Durian…</span>
      </div>
    );
  }

  if (!session?.authenticated) {
    return <LoginView onLoginSuccess={(newSession) => setSession(newSession)} />;
  }

  const businessName = session?.businessName || 'Sambutan Durian';

  const navItems = [
    { key: 'whatsapp', label: 'Koneksi WhatsApp', icon: Smartphone },
    { key: 'dashboard', label: 'Ringkasan', icon: LayoutDashboard },
    { key: 'leads', label: 'Pesan & Chat', icon: Users },
    { key: 'settings', label: 'Pengaturan', icon: Settings },
  ];

  const currentNav = navItems.find((item) => item.key === activeView) || navItems[0];

  return (
    <div className="flex min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      {/* Sleek Modern Sidebar */}
      <aside className="w-64 border-r bg-card/60 backdrop-blur-xl flex flex-col shrink-0 sticky top-0 h-screen z-30 transition-all">
        {/* Brand Header */}
        <div className="p-4 px-5 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 p-1 flex items-center justify-center shadow-xs overflow-hidden shrink-0 text-xl">
              🍈
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm tracking-tight leading-none text-foreground flex items-center gap-1.5">
                {businessName}
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </span>
              <span className="text-[10px] text-muted-foreground mt-1 font-medium tracking-wide uppercase">
                WhatsApp Connect
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 flex-1 overflow-y-auto space-y-1">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            Menu Utama
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.key;
            return (
              <button
                key={item.key}
                className={`group w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 text-left cursor-pointer ${
                  isActive
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs shadow-primary/25'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
                }`}
                onClick={() => handleNavigate(item.key)}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    size={16}
                    className={`transition-transform duration-200 ${
                      isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:scale-110 group-hover:text-foreground'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* User Card & Bottom Actions */}
        <div className="p-3 border-t bg-card/40 space-y-2">
          <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-muted/40 border text-xs">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-[11px] shrink-0 border border-primary/20">
                SD
              </div>
              <div className="truncate">
                <div className="font-semibold truncate text-xs text-foreground">Admin</div>
                <div className="text-[10px] text-muted-foreground font-mono">{businessName}</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors cursor-pointer"
              title="Keluar dari sesi admin"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden">
        {/* Top Sticky Header */}
        <header className="sticky top-0 z-20 h-14 border-b bg-background/80 backdrop-blur-md px-6 md:px-8 flex items-center justify-between">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground font-medium">
            <span className="text-lg">🍈</span>
            <span>{businessName}</span>
            <ChevronRight size={13} className="text-muted-foreground/60" />
            <span className="text-foreground font-semibold flex items-center gap-1.5">
              <currentNav.icon size={14} className="text-primary" />
              {currentNav.label}
            </span>
          </div>

          {/* Right Header Status Pill & Theme Toggle */}
          <div className="flex items-center gap-3">
            {/* Live Socket Status Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium shadow-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-semibold">Sistem Siap</span>
            </div>

            {/* Theme Switcher Button */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-lg cursor-pointer"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Beralih ke Mode Gelap' : 'Beralih ke Mode Terang'}
            >
              {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
            </Button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto animate-in fade-in-50 duration-200">
          {activeView === 'whatsapp' && <WhatsAppView />}
          {activeView === 'dashboard' && <DashboardView onNavigate={handleNavigate} />}
          {activeView === 'leads' && <LeadsView />}
          {activeView === 'settings' && <SettingsView />}
        </main>
      </div>
    </div>
  );
};
