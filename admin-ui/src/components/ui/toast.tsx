import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  id?: string;
  title?: string;
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

export interface ToastContextValue {
  toast: {
    (options: ToastOptions): string;
    success: (message: string, title?: string, duration?: number) => string;
    error: (message: string, title?: string, duration?: number) => string;
    warning: (message: string, title?: string, duration?: number) => string;
    info: (message: string, title?: string, duration?: number) => string;
  };
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<(ToastOptions & { id: string })[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((options: ToastOptions): string => {
    const id = options.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const duration = options.duration ?? 4000;
    const item = { ...options, id, duration };

    setToasts((prev) => {
      // Limit to 4 concurrent toasts
      const filtered = prev.filter((t) => t.id !== id);
      return [...filtered.slice(-3), item];
    });

    if (duration > 0) {
      setTimeout(() => {
        dismiss(id);
      }, duration);
    }

    return id;
  }, [dismiss]);

  const toastMethods = Object.assign(
    (options: ToastOptions) => addToast(options),
    {
      success: (message: string, title?: string, duration?: number) =>
        addToast({ message, title: title || 'Berhasil', variant: 'success', duration }),
      error: (message: string, title?: string, duration?: number) =>
        addToast({ message, title: title || 'Gagal', variant: 'error', duration: duration || 5500 }),
      warning: (message: string, title?: string, duration?: number) =>
        addToast({ message, title: title || 'Peringatan', variant: 'warning', duration: duration || 5000 }),
      info: (message: string, title?: string, duration?: number) =>
        addToast({ message, title: title || 'Informasi', variant: 'info', duration }),
    }
  );

  return (
    <ToastContext.Provider value={{ toast: toastMethods, dismiss }}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

interface ToasterProps {
  toasts: (ToastOptions & { id: string })[];
  onDismiss: (id: string) => void;
}

const Toaster: React.FC<ToasterProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed top-4 right-4 z-[9999] pointer-events-none flex flex-col gap-2.5 max-w-sm w-full sm:max-w-md px-4 sm:px-0"
    >
      {toasts.map((item) => {
        const variant = item.variant || 'info';

        let borderColor = 'border-border/60';
        let iconBg = 'bg-primary/10 text-primary';
        let IconComponent = Info;

        if (variant === 'success') {
          borderColor = 'border-emerald-500/25 dark:border-emerald-500/35';
          iconBg = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
          IconComponent = CheckCircle2;
        } else if (variant === 'error') {
          borderColor = 'border-rose-500/25 dark:border-rose-500/35';
          iconBg = 'bg-rose-500/15 text-rose-600 dark:text-rose-400';
          IconComponent = AlertCircle;
        } else if (variant === 'warning') {
          borderColor = 'border-amber-500/25 dark:border-amber-500/35';
          iconBg = 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
          IconComponent = AlertTriangle;
        } else if (variant === 'info') {
          borderColor = 'border-sky-500/25 dark:border-sky-500/35';
          iconBg = 'bg-sky-500/15 text-sky-600 dark:text-sky-400';
          IconComponent = Info;
        }

        return (
          <div
            key={item.id}
            role="status"
            className={`pointer-events-auto w-full bg-card/95 dark:bg-slate-900/95 backdrop-blur-md border ${borderColor} shadow-lg shadow-black/5 dark:shadow-black/20 rounded-xl p-3.5 flex items-start gap-3 transition-all duration-300 animate-in fade-in slide-in-from-top-3`}
          >
            <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
              <IconComponent size={15} />
            </div>

            <div className="flex-1 min-w-0 pr-1">
              {item.title && (
                <div className="text-xs font-semibold text-foreground tracking-tight flex items-center gap-1.5">
                  <span>{item.title}</span>
                </div>
              )}
              <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5 break-words">
                {item.message}
              </div>
            </div>

            <button
              onClick={() => onDismiss(item.id)}
              className="p-1 text-muted-foreground/60 hover:text-foreground rounded-md hover:bg-muted/70 transition-colors cursor-pointer shrink-0"
              title="Tutup notifikasi"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
