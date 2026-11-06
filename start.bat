@echo off
setlocal enabledelayedexpansion

:: Pastikan direktori kerja berada di folder script ini
cd /d "%~dp0"

:: Set encoding ke UTF-8
chcp 65001 >nul 2>&1

:: Judul Terminal
title Sambutan Durian - WhatsApp Automation and Web Admin

cls
echo ======================================================================
echo    [SAMBUTAN DURIAN] WhatsApp Engine and Web Admin Auto-Launcher
echo ======================================================================
echo.

:: -------------------------------------------------------------
:: LANGKAH 1: Cek Lingkungan dan Perangkat Lunak Wajib
:: -------------------------------------------------------------
echo [1/6] Memeriksa kesiapan sistem...

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js TIDAK ditemukan di komputer ini!
    echo.
    echo Aplikasi ini membutuhkan Node.js. Disarankan versi LTS: v18, v20, atau v22.
    echo Silakan unduh dan pasang dari: https://nodejs.org/
    echo.
    echo Setelah selesai memasang Node.js, silakan jalankan kembali file ini.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
echo  [OK] Node.js terpasang: %NODE_VER%

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm TIDAK ditemukan! Pastikan instalasi Node.js menyertakan npm.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('npm -v 2^>nul') do set "NPM_VER=%%v"
echo  [OK] npm terpasang: %NPM_VER%

:: -------------------------------------------------------------
:: LANGKAH 2: Cek dan Jalankan Pembaruan (Git Pull)
:: -------------------------------------------------------------
echo.
echo [2/6] Memeriksa pembaruan kode terbaru (Git Pull)...

set "UPDATE_PULLED=0"
where git >nul 2>&1
if %errorlevel% equ 0 (
    if exist ".git" (
        echo  Mengecek repositori remote origin/main...
        git pull origin main > "%TEMP%\sambutan_git_pull.log" 2>&1
        set "GIT_PULL_EXIT=!errorlevel!"
        
        findstr /I /C:"Already up to date" "%TEMP%\sambutan_git_pull.log" >nul 2>&1
        if !errorlevel! equ 0 (
            echo  [OK] Aplikasi sudah menggunakan versi paling terbaru.
        ) else (
            findstr /I /C:"Updating" "%TEMP%\sambutan_git_pull.log" >nul 2>&1
            if !errorlevel! equ 0 (
                echo  [UPDATE] Berhasil mengunduh pembaruan terbaru dari GitHub!
                set "UPDATE_PULLED=1"
            ) else (
                if !GIT_PULL_EXIT! neq 0 (
                    echo  [INFO] Tidak dapat mengambil update git. Kendala jaringan atau offline.
                    echo  Melanjutkan dengan file versi lokal saat ini.
                ) else (
                    echo  [OK] Sinkronisasi git selesai.
                )
            )
        )
        if exist "%TEMP%\sambutan_git_pull.log" del "%TEMP%\sambutan_git_pull.log" >nul 2>&1
    ) else (
        echo  [INFO] Direktori bukan repositori Git. Melewati pengecekan git.
    )
) else (
    echo  [INFO] Git tidak terdeteksi di PATH. Melewati pembaruan git otomatis.
)

:: -------------------------------------------------------------
:: LANGKAH 3: Cek Berkas Konfigurasi (.env dan business.config.json)
:: -------------------------------------------------------------
echo.
echo [3/6] Memeriksa berkas konfigurasi...

if not exist "data\" (
    mkdir "data" 2>nul
    echo  [INFO] Folder data/ dibuat.
)

if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo  [INFO] Berkas .env belum ada. Dibuat otomatis dari .env.example.
    ) else (
        echo  [WARN] Berkas .env maupun .env.example tidak ditemukan!
    )
) else (
    echo  [OK] Berkas .env ditemukan.
)

if not exist "business.config.json" (
    if exist "business.config.example.json" (
        copy "business.config.example.json" "business.config.json" >nul
        echo  [INFO] Berkas business.config.json dibuat dari template contoh.
    )
) else (
    echo  [OK] Berkas business.config.json ditemukan.
)

:: Baca PORT dari .env
set "APP_PORT=3009"
if exist ".env" (
    for /f "usebackq tokens=1,2 delims==" %%A in (".env") do (
        set "ENV_KEY=%%A"
        set "ENV_VAL=%%B"
        if /i "!ENV_KEY!"=="PORT" (
            set "APP_PORT=!ENV_VAL!"
        )
    )
)

:: -------------------------------------------------------------
:: LANGKAH 4: Cek Dependensi (node_modules) dan Patch Baileys
:: -------------------------------------------------------------
echo.
echo [4/6] Memeriksa paket dependensi (node_modules)...

set "NEED_INSTALL=0"
if not exist "node_modules\" set "NEED_INSTALL=1"
if not exist "admin-ui\node_modules\" set "NEED_INSTALL=1"
if "!UPDATE_PULLED!"=="1" set "NEED_INSTALL=1"

if "!NEED_INSTALL!"=="1" (
    echo  Memasang dependensi backend...
    call npm install
    if !errorlevel! neq 0 (
        echo [ERROR] Gagal menjalankan npm install.
        pause
        exit /b !errorlevel!
    )
    
    echo  Memasang dependensi frontend admin-ui...
    call npm --prefix admin-ui install
    if !errorlevel! neq 0 (
        echo [ERROR] Gagal memasang dependensi admin-ui.
        pause
        exit /b !errorlevel!
    )
    set "UPDATE_PULLED=1"
) else (
    echo  [OK] Seluruh dependensi paket telah terpasang lengkap.
)

:: Pastikan patch Baileys terpasang
node scripts/patch-baileys.mjs >nul 2>&1

:: -------------------------------------------------------------
:: LANGKAH 5: Cek Kompilasi dan Build Aplikasi (dist)
:: -------------------------------------------------------------
echo.
echo [5/6] Memeriksa status build aplikasi...

set "NEED_BUILD=0"
if not exist "dist\index.js" set "NEED_BUILD=1"
if not exist "dist\admin-ui\index.html" set "NEED_BUILD=1"
if "!UPDATE_PULLED!"=="1" set "NEED_BUILD=1"

if "!NEED_BUILD!"=="1" (
    echo  Melakukan build aplikasi: TypeScript dan Vite Frontend...
    call npm run build
    if !errorlevel! neq 0 (
        echo [ERROR] Build aplikasi gagal! Periksa error di atas.
        pause
        exit /b !errorlevel!
    )
    echo  [OK] Build berhasil selesai!
) else (
    echo  [OK] Aplikasi sudah siap: build dist tersedia.
)

:: -------------------------------------------------------------
:: LANGKAH 6: Menjalankan Aplikasi dan Membuka Web Admin
:: -------------------------------------------------------------
echo.
echo [6/6] Menyiapkan server Sambutan Durian...
echo.
echo ======================================================================
echo  [SIAP] SEMUA PEMERIKSAAN BERHASIL! APLIKASI SIAP DIJALANKAN.
echo ======================================================================
echo.
echo   Web Admin Panel : http://localhost:%APP_PORT%/app
echo   Scan QR WhatsApp: Buka alamat di atas di browser Anda.
echo.
echo  [INFO] Menjalankan server... Tekan Ctrl+C untuk menghentikan bot.
echo ======================================================================
echo.

:: Otomatis buka browser setelah server mulai (delay background 3 detik)
start "" /min cmd /c "ping -n 4 127.0.0.1 >nul && start http://localhost:%APP_PORT%/app"

:: Jalankan server backend
call npm start

if !errorlevel! neq 0 (
    echo.
    echo [ERROR] Aplikasi berhenti dengan kode error: !errorlevel!
    pause
)
