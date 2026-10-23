import React, { useState } from 'react';
import { api, SessionInfo } from '../lib/api';
import { Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';

export const LoginView: React.FC<{ onLoginSuccess: (session: SessionInfo) => void }> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    try {
      setLoading(true);
      setError(null);
      await api.auth.login(password);
      const session = await api.auth.me();
      onLoginSuccess(session);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('429')) {
        setError('Terlalu banyak percobaan masuk. Mohon tunggu beberapa detik lalu coba lagi.');
      } else {
        setError(err.message || 'Password tidak valid. Silakan coba lagi.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 dark:bg-background p-4 relative selection:bg-primary/20 selection:text-primary">
      {/* Ambient background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[540px] h-[360px] bg-emerald-500/10 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md shadow-xl border-border bg-card text-card-foreground">
        <CardHeader className="text-center pb-4 pt-8">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3.5 shadow-md text-3xl">
            🍈
          </div>
          <CardTitle className="text-xl font-bold tracking-tight text-foreground">
            Sambutan Durian
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground mt-1">
            Portal Admin & Koneksi WhatsApp
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 px-6">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                Password Admin
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-3 text-muted-foreground" />
                <Input
                  type="password"
                  className="pl-9 h-10 text-sm bg-background border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
                  placeholder="Masukkan password admin…"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-10 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs cursor-pointer transition-all"
              disabled={loading}
            >
              {loading ? 'Memverifikasi…' : 'Masuk ke Dashboard'} <ArrowRight size={15} className="ml-1.5" />
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center border-t border-border/60 py-3.5 text-[11px] text-muted-foreground bg-muted/20">
          Password default: <code className="text-primary ml-1 font-mono font-medium px-1.5 py-0.5 bg-primary/10 rounded">admin-dev-only</code>
        </CardFooter>
      </Card>
    </div>
  );
};
