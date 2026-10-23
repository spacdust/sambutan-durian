import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const adminUiDir = path.join(cwd, 'admin-ui');
const adminUiNodeModules = path.join(adminUiDir, 'node_modules');

// 1. Pastikan dependency admin-ui ter-install
if (!existsSync(adminUiNodeModules)) {
    console.log('📦 Menginstal dependency admin-ui...');
    const installResult = spawnSync('npm --prefix admin-ui install', {
        cwd,
        stdio: 'inherit',
        shell: true,
    });
    if (installResult.status !== 0) {
        console.error('❌ Gagal menginstal dependency admin-ui.');
        process.exit(installResult.status ?? 1);
    }
}

// 2. Jalankan build admin-ui dengan Vite
console.log('⚡ Membangun frontend admin-ui dengan Vite...');
const buildResult = spawnSync('npm --prefix admin-ui run build', {
    cwd,
    stdio: 'inherit',
    shell: true,
});

if (buildResult.status !== 0) {
    console.error('❌ Gagal membangun admin-ui.');
    process.exit(buildResult.status ?? 1);
}

console.log('✅ Frontend admin-ui berhasil dibangun ke dist/admin-ui.');
