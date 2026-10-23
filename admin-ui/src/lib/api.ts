export interface SessionInfo {
  authenticated: boolean;
  csrfToken: string;
  businessName: string;
  csName: string;
}

export interface DashboardData {
  leadsCount: number;
  totalContacts?: number;
  handoffCount: number;
  handoffHighCount?: number;
  handoffUnrepliedCount?: number;
  handoffSeverity?: 'high' | 'medium' | 'none';
  botEnabled: boolean;
  whatsappNumbers: Array<{
    phone: string;
    csName: string;
    status: string;
    todayLeadCount: number;
    todayMessageCount: number;
  }>;
  recentLeads: Array<{
    jid: string;
    name?: string;
    phone?: string;
    updated_at: string;
    active_order_id?: number;
    order_status?: string;
    total_amount?: number;
    active_handoff_id?: number;
  }>;
  recentHandoffs?: Array<{
    id: number;
    jid: string;
    reason: string;
    priority: string;
    created_at: string;
    customer_name?: string;
    phone?: string;
    last_message?: string;
    last_message_role?: string;
    last_sender_type?: string;
    is_high_complaint?: boolean;
    is_unreplied?: boolean;
    severity?: 'high' | 'medium' | 'none';
  }>;
}

export interface LeadItem {
  jid: string;
  name?: string;
  phone?: string;
  preferences?: string;
  address?: string;
  notes?: string;
  greeted_at?: string;
  created_at: string;
  updated_at: string;
  active_order_id?: number;
  order_status?: string;
  total_amount?: number;
  quantity?: number;
  active_handoff_id?: number;
}

export interface LeadDetail {
  lead: LeadItem;
  transcript: Array<{
    id: number;
    role: string;
    sender_type?: string;
    sender?: string;
    content: string;
    created_at: string;
  }>;
  order?: {
    id: number;
    status: string;
    total_amount: number;
    customer_name?: string;
    phone?: string;
    shipping_address?: string;
  } | null;
  activeHandoff?: {
    id: number;
    reason: string;
    priority: string;
  } | null;
}

export interface HandoffItem {
  id: number;
  jid: string;
  customer_name?: string;
  reason: string;
  priority: string;
  created_at: string;
  status: string;
  last_message?: string;
  last_message_at?: string;
  last_message_role?: string;
  last_sender_type?: string;
  is_high_complaint?: boolean;
  is_unreplied?: boolean;
  severity?: 'high' | 'medium' | 'none';
}

export interface KnowledgeFile {
  name: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface KnowledgeData {
  files: KnowledgeFile[];
  activeFile: string;
  content: string;
}

export interface WhatsAppConfig {
  rotationMode: 'round_robin' | 'least_busy' | 'random';
  minDelaySeconds: number;
  maxDelaySeconds: number;
  maxConcurrency: number;
  enableStickyAssignment: boolean;
}

export interface SystemHealth {
  database: string;
  whatsappState: string;
  ai: {
    status: string;
    label: string;
    detail: string;
    provider?: string;
    latencyMs?: number;
    checkedAt: string;
  };
}

export interface SandboxResponse {
  reply: string;
  bubbles: string[];
  usedTools: string[];
  citations: string[];
  state: Record<string, any>;
  silent?: boolean;
}

let cachedCsrfToken = '';

export const setCsrfToken = (token: string) => {
  cachedCsrfToken = token;
};

export const getCsrfToken = () => cachedCsrfToken;

const apiRequest = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  if (cachedCsrfToken && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method?.toUpperCase() || '')) {
    headers.set('X-CSRF-Token', cachedCsrfToken);
  }

  if (options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'same-origin',
  });

  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error(data.error || 'Password tidak valid atau sesi berakhir.');
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data as T;
};

export const api = {
  auth: {
    me: async () => {
      const res = await apiRequest<SessionInfo>('/admin/api/auth/me');
      if (res.csrfToken) setCsrfToken(res.csrfToken);
      return res;
    },
    login: async (password: string) => {
      const res = await apiRequest<{ ok: boolean; csrfToken: string }>('/admin/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      if (res.csrfToken) setCsrfToken(res.csrfToken);
      return res;
    },
    logout: async () => apiRequest<{ ok: boolean }>('/admin/api/auth/logout', { method: 'POST' }),
  },
  dashboard: {
    get: () => apiRequest<DashboardData>('/admin/api/dashboard'),
    getStreamUrl: () => '/admin/api/dashboard/stream',
    toggleBot: (enable: boolean) =>
      apiRequest<{ ok: boolean; enabled: boolean }>('/admin/api/bot-runtime/toggle', {
        method: 'POST',
        body: JSON.stringify({ enable }),
      }),
  },
  leads: {
    list: (page = 1, search = '', sort = 'updated', direction = 'desc') =>
      apiRequest<{
        leads: LeadItem[];
        botEnabled: boolean;
        botActivatedAt: string | null;
        pagination: { page: number; total: number; totalPages: number };
      }>(
        `/admin/api/leads?page=${page}&search=${encodeURIComponent(search)}&sort=${sort}&direction=${direction}`
      ),
    getDetail: (jid: string) => apiRequest<LeadDetail>(`/admin/api/leads/${encodeURIComponent(jid)}`),
    getStreamUrl: (jid: string) => `/admin/api/leads/${encodeURIComponent(jid)}/stream`,
    toggleBot: (jid: string, enable: boolean) =>
      apiRequest<{ ok: boolean; enabled: boolean }>(`/admin/api/leads/${encodeURIComponent(jid)}/bot`, {
        method: 'POST',
        body: JSON.stringify({ enable }),
      }),
    sendChat: (jid: string, message: string) =>
      apiRequest<{ ok: boolean; message: string }>('/admin/api/chat/send', {
        method: 'POST',
        body: JSON.stringify({ jid, message }),
      }),
    updateCustomer: (jid: string, data: { name?: string; phone?: string; preferences?: string; address?: string; notes?: string }) =>
      apiRequest<{ ok: boolean }>('/admin/api/customer/update', {
        method: 'POST',
        body: JSON.stringify({ jid, ...data }),
      }),
    update: (jid: string, data: { name?: string; phone?: string; preferences?: string; address?: string; notes?: string }) =>
      apiRequest<{ ok: boolean }>('/admin/api/customer/update', {
        method: 'POST',
        body: JSON.stringify({ jid, ...data }),
      }),
    deleteLead: (jid: string) =>
      apiRequest<{ ok: boolean }>('/admin/api/customer/delete', {
        method: 'POST',
        body: JSON.stringify({ jid }),
      }),
    clearChat: (jid: string) =>
      apiRequest<{ ok: boolean }>('/admin/api/customer/delete', {
        method: 'POST',
        body: JSON.stringify({ jid }),
      }),
    clearHistory: (jid: string) =>
      apiRequest<{ ok: boolean }>('/admin/api/customer/delete', {
        method: 'POST',
        body: JSON.stringify({ jid }),
      }),
    exportData: (jid: string) =>
      apiRequest<any>(`/admin/api/customer/export?jid=${encodeURIComponent(jid)}`),
  },
  chat: {
    sendManual: (jid: string, message: string) =>
      apiRequest<{ ok: boolean; message: string }>('/admin/api/chat/send', {
        method: 'POST',
        body: JSON.stringify({ jid, message }),
      }),
    enableBot: (jid: string) =>
      apiRequest<{ ok: boolean; enabled: boolean }>(`/admin/api/leads/${encodeURIComponent(jid)}/bot`, {
        method: 'POST',
        body: JSON.stringify({ enable: true }),
      }),
    disableBot: (jid: string, _reason?: string) =>
      apiRequest<{ ok: boolean; enabled: boolean }>(`/admin/api/leads/${encodeURIComponent(jid)}/bot`, {
        method: 'POST',
        body: JSON.stringify({ enable: false }),
      }),
  },
  handoff: {
    list: (page = 1, search = '', sort = 'last_message', direction = 'desc') =>
      apiRequest<{ handoffs: HandoffItem[]; pagination: { page: number; total: number; totalPages: number } }>(
        `/admin/api/handoff?page=${page}&search=${encodeURIComponent(search)}&sort=${sort}&direction=${direction}`
      ),
    resolve: (jid: string, note = '') =>
      apiRequest<{ ok: boolean }>('/admin/api/handoff/resolve', {
        method: 'POST',
        body: JSON.stringify({ jid, note }),
      }),
  },
  products: {
    get: () => apiRequest<{ catalog: any }>('/admin/api/products'),
    save: (catalog: any) =>
      apiRequest<{ ok: boolean; catalog: any }>('/admin/api/products', {
        method: 'POST',
        body: JSON.stringify({ catalog }),
      }),
  },
  knowledge: {
    get: () => apiRequest<KnowledgeData>('/admin/api/knowledge'),
    save: (filename: string, content: string) =>
      apiRequest<{ ok: boolean; filename: string }>('/admin/api/knowledge', {
        method: 'POST',
        body: JSON.stringify({ filename, content }),
      }),
    upload: async (files: FileList | File[]) => {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (cachedCsrfToken) headers['X-CSRF-Token'] = cachedCsrfToken;
      const res = await fetch('/admin/api/knowledge/upload', {
        method: 'POST',
        body: formData,
        headers,
      });
      return res.json();
    },
    reload: () =>
      apiRequest<{ ok: boolean; message: string }>('/admin/api/knowledge/reload', {
        method: 'POST',
      }),
    delete: (name: string) =>
      apiRequest<{ ok: boolean }>('/admin/api/knowledge/delete', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
  },
  sandbox: {
    send: (message: string, history: any[], state: any) =>
      apiRequest<SandboxResponse>('/admin/api/sandbox/reply', {
        method: 'POST',
        body: JSON.stringify({ message, history, state }),
      }),
  },
  whatsapp: {
    getStatus: () => apiRequest<{ numbers: any[]; config: WhatsAppConfig }>('/admin/api/whatsapp/status'),
    getPendingQr: () =>
      apiRequest<{ state: string; detail?: string; phone?: string | null; qrDataUrl: string }>('/admin/api/whatsapp/qr/pending'),
    refreshPendingQr: () =>
      apiRequest<{ ok: boolean; state: string; detail?: string; phone?: string | null; qrDataUrl: string }>('/admin/api/whatsapp/qr/pending/refresh', {
        method: 'POST',
      }),
    requestPairingCode: (phone: string) =>
      apiRequest<{ ok: boolean; code: string }>('/admin/api/whatsapp/qr/pending/pairing-code', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      }),
    addNumber: (phoneOrData: string | { phone: string; csName?: string; id?: string; dailyLimit?: number }, csName?: string, id?: string, dailyLimit?: number) => {
      const payload = typeof phoneOrData === 'object' && phoneOrData !== null
        ? { phone: phoneOrData.phone, csName: phoneOrData.csName || 'Admin Durian', id: phoneOrData.id, dailyLimit: phoneOrData.dailyLimit }
        : { phone: phoneOrData, csName: csName || 'Admin Durian', id, dailyLimit };
      return apiRequest<{ ok: boolean }>('/admin/api/whatsapp/numbers/add', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    updateNumber: (phone: string, csNameOrData: string | { csName?: string; dailyLimit?: number }, dailyLimit?: number) => {
      const payload = typeof csNameOrData === 'object' && csNameOrData !== null
        ? { phone, csName: csNameOrData.csName, dailyLimit: csNameOrData.dailyLimit }
        : { phone, csName: csNameOrData, dailyLimit };
      return apiRequest<{ ok: boolean }>('/admin/api/whatsapp/numbers/update', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    deleteNumber: (phone: string) =>
      apiRequest<{ ok: boolean }>('/admin/api/whatsapp/numbers/delete', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      }),
    saveConfig: (config: Partial<WhatsAppConfig>) =>
      apiRequest<{ ok: boolean; config: WhatsAppConfig }>('/admin/api/whatsapp/config', {
        method: 'POST',
        body: JSON.stringify(config),
      }),
    updateConfig: (config: Partial<WhatsAppConfig>) =>
      apiRequest<{ ok: boolean; config: WhatsAppConfig }>('/admin/api/whatsapp/config', {
        method: 'POST',
        body: JSON.stringify(config),
      }),
    clearAuth: (phone?: string) =>
      apiRequest<{ ok: boolean }>('/admin/api/whatsapp/auth/clear', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      }),
  },
  settings: {
    getConfig: () => apiRequest<{ businessName: string; csName: string; welcomeMessage: string; enableGreeting: boolean; adminPhone: string }>('/admin/api/settings'),
    updateConfig: (data: { businessName?: string; csName?: string; welcomeMessage?: string; enableGreeting?: boolean; adminPhone?: string; password?: string }) =>
      apiRequest<{ ok: boolean }>('/admin/api/settings', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    get: () => apiRequest<{ business: any; promptBuilder: any }>('/admin/api/settings'),
    save: (business: any, promptBuilder: any) =>
      apiRequest<{ ok: boolean }>('/admin/api/settings', {
        method: 'POST',
        body: JSON.stringify({ business, promptBuilder }),
      }),
    getHealth: () => apiRequest<SystemHealth>('/admin/api/settings/health'),
    testAi: () => apiRequest<{ ok: boolean; ai: any }>('/admin/api/settings/test-ai', { method: 'POST' }),
    fetchModels: (params?: { baseUrl?: string; apiKey?: string }) =>
      apiRequest<{ ok: boolean; models: string[]; error?: string }>('/admin/api/settings/models', {
        method: 'POST',
        body: JSON.stringify(params || {}),
      }),
    getEnv: () =>
      apiRequest<{
        aiProvider: string;
        aiApiBaseUrl: string;
        aiModel: string;
        aiApiKeyMasked: string;
        adminWaJid: string;
        adminWaPhone?: string;
      }>('/admin/api/settings/env'),
    updateEnv: (env: {
      aiApiKey?: string;
      aiApiBaseUrl?: string;
      aiModel?: string;
      adminWaJid?: string;
    }) =>
      apiRequest<{ ok: boolean }>('/admin/api/settings/env', {
        method: 'POST',
        body: JSON.stringify(env),
      }),
  },
};

export const formatWibTime = (dateStr?: string | Date | null): string => {
  if (!dateStr) return '—';
  const str = String(dateStr);
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(str) && !str.includes('Z') && !str.includes('+')
    ? str.replace(' ', 'T') + 'Z'
    : str;
  const date = new Date(normalized);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).replace(':', '.');
};

export const formatWibDateTime = (dateStr?: string | Date | null, withYear = false): string => {
  if (!dateStr) return '—';
  const str = String(dateStr);
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(str) && !str.includes('Z') && !str.includes('+')
    ? str.replace(' ', 'T') + 'Z'
    : str;
  const date = new Date(normalized);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).replace(':', '.');
};

