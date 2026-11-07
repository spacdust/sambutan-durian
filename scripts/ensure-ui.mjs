import { existsSync, statSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const adminUiIndex = path.join(cwd, 'dist', 'admin-ui', 'index.html');

let needsBuild = !existsSync(adminUiIndex);

if (!needsBuild) {
    try {
        const distMtime = statSync(adminUiIndex).mtimeMs;
        const srcDir = path.join(cwd, 'admin-ui', 'src');
        if (existsSync(srcDir)) {
            const checkNewer = (dir) => {
                const entries = readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        if (checkNewer(full)) return true;
                    } else if (entry.isFile() && /\.(tsx?|jsx?|css|html|json)$/i.test(entry.name)) {
                        if (statSync(full).mtimeMs > distMtime) {
                            return true;
                        }
                    }
                }
                return false;
            };
            needsBuild = checkNewer(srcDir);
        }
    } catch {}
}

if (needsBuild) {
    console.log('📦 Mendeteksi pembaruan Web Admin. Membangun dist/admin-ui secara otomatis...');
    const buildResult = spawnSync(process.execPath, [path.join(cwd, 'scripts', 'build-ui.mjs')], {
        cwd,
        stdio: 'inherit',
    });
    if (buildResult.status !== 0) {
        console.warn('⚠️ Gagal membangun Web Admin secara otomatis. Web Admin mungkin belum dapat diakses di /app.');
    }
}
