import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const adminUiIndex = path.join(cwd, 'dist', 'admin-ui', 'index.html');

if (!existsSync(adminUiIndex)) {
    console.log('📦 Folder dist/admin-ui belum ditemukan. Membangun Web Admin secara otomatis...');
    const buildResult = spawnSync(process.execPath, [path.join(cwd, 'scripts', 'build-ui.mjs')], {
        cwd,
        stdio: 'inherit',
    });
    if (buildResult.status !== 0) {
        console.warn('⚠️ Gagal membangun Web Admin secara otomatis. Web Admin mungkin belum dapat diakses di /app.');
    }
}
