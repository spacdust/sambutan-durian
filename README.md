# 🍈 Sambutan Durian

Platform Web Admin & Manajemen Koneksi WhatsApp Multi-Perangkat (Baileys Engine), diekstrak secara spesifik tanpa modul AI.

---

## ✨ Fitur Utama

- **🖥️ Web Admin Modern & Responsif**:
  - Dibangun dengan **React 18 + Vite + TailwindCSS + Radix UI**.
  - Tampilan elegan dengan tema **Terang (Light)** dan **Gelap (Dark)**.
  - Ringkasan statistik operasional, status koneksi nomor WhatsApp, dan pesan masuk secara real-time.
- **📱 Manajemen WhatsApp (Multi-Device Baileys)**:
  - Dukungan multi-nomor WhatsApp sekaligus.
  - **Live Scan QR Code** langsung di modal browser Web Admin atau di terminal console.
  - Deteksi otomatis saat nomor berhasil dipindai dan pairing selesai.
  - Kelola label CS, batasan pesan harian (daily limit), serta pemutusan sesi (disconnect/delete).
  - Pengaturan **Anti-Ban Delay** & simulasi jeda mengetik (*typing indicator*).
- **💬 Percakapan & Sambutan Pelanggan**:
  - Live chat drawer untuk melihat riwayat percakapan WhatsApp.
  - Fitur kirim pesan balasan langsung dari Web Admin ke nomor customer.
  - Opsi salam pembuka otomatis (*welcome greeting message*) saat pelanggan pertama kali menghubungi.
- **⚡ Database Ringan & Mandiri**:
  - Menggunakan engine **SQLite bawaan Node.js (`node:sqlite`)** tanpa perlu install server database eksternal.
  - Mendukung PostgreSQL jika `DB_DRIVER=postgres` diatur di `.env`.

---

## 🚀 Panduan Memulai

### 1. Prasyarat
- **Node.js** v20 atau lebih baru (disarankan v22+).
- **NPM** bawaan Node.js.

### 2. Instalasi Dependency (Jika diperlukan)
```bash
npm install
npm --prefix admin-ui install
```

### 3. Konfigurasi Lingkungan (`.env`)
Salin file `.env.example` menjadi `.env` (sudah disediakan default):
```env
PORT=3009
ADMIN_PASSWORD=admin123456789
DB_DRIVER=sqlite
SQLITE_PATH=./data/durian.db
```

### 4. Menjalankan Aplikasi

#### Mode Pengembangan (Development)
```bash
npm run dev
```
Aplikasi backend dan web admin akan aktif dan dapat diakses di:
👉 **http://localhost:3009/app**

*(Password default admin: `admin123456789`)*

#### Membangun Frontend (Build)
```bash
npm run build:ui
```

#### Menjalankan Produksi (Production)
```bash
npm run build
npm start
```

---

## 📁 Struktur Direktori

```
chat-sambutan-durian/
├── admin-ui/              # Frontend React + Vite SPA
│   ├── src/components/    # WhatsAppView, DashboardView, LeadsView, SettingsView, LoginView
│   └── src/lib/api.ts     # Client HTTP & Realtime SSE
├── config/                # Konfigurasi sesi WhatsApp
├── scripts/               # Script otomatisasi build UI
├── src/
│   ├── admin/             # Server Express & Router API Admin
│   ├── chat/              # Manajemen chat history & leads
│   ├── config/            # Database (SQLite/Postgres), Logger, Instance Lock
│   ├── whatsapp/          # Baileys Socket Engine, Multi-Device, Anti-ban Delay
│   └── index.ts           # Entry point aplikasi
├── business.config.json   # Konfigurasi nama bisnis & sambutan
└── .env                   # Variabel konfigurasi lingkungan
```
