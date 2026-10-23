import os from 'node:os';

export interface CliNetworkArgs {
    host?: string;
    port?: number;
}

export const parseCliNetworkArgs = (argv: string[] = process.argv.slice(2)): CliNetworkArgs => {
    const args: CliNetworkArgs = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--host' || arg === '-h') {
            const next = argv[i + 1];
            if (next && !next.startsWith('-')) {
                args.host = next;
                i++;
            } else {
                args.host = '0.0.0.0';
            }
        } else if (arg.startsWith('--host=')) {
            args.host = arg.slice(7);
        } else if (arg === '--port' || arg === '-p') {
            const next = argv[i + 1];
            if (next && !next.startsWith('-')) {
                const p = Number(next);
                if (!Number.isNaN(p) && p > 0) args.port = p;
                i++;
            }
        } else if (arg.startsWith('--port=')) {
            const p = Number(arg.slice(7));
            if (!Number.isNaN(p) && p > 0) args.port = p;
        }
    }
    return args;
};

export const applyCliNetworkConfig = (argv: string[] = process.argv.slice(2)): CliNetworkArgs => {
    const args = parseCliNetworkArgs(argv);
    if (args.host) process.env.HOST = args.host;
    if (args.port) process.env.PORT = String(args.port);
    return args;
};

export const getNetworkIPv4Addresses = (): string[] => {
    const interfaces = os.networkInterfaces();
    const addresses: string[] = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push(iface.address);
            }
        }
    }
    return addresses.sort((a, b) => {
        const isStandardPrivate = (ip: string) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
        const aStd = isStandardPrivate(a);
        const bStd = isStandardPrivate(b);
        if (aStd && !bStd) return -1;
        if (!aStd && bStd) return 1;
        return a.localeCompare(b);
    });
};
