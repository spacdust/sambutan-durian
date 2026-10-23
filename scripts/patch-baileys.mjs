import fs from 'fs';
import path from 'path';

const utilsPath = path.resolve('node_modules/@whiskeysockets/baileys/lib/Utils/companion-reg-client-utils.js');
const socketPath = path.resolve('node_modules/@whiskeysockets/baileys/lib/Socket/socket.js');

if (!fs.existsSync(utilsPath) || !fs.existsSync(socketPath)) {
    console.log('[patch-baileys] Baileys lib files not found, skipping patch.');
    process.exit(0);
}

// 1. Patch companion-reg-client-utils.js
let utilsContent = fs.readFileSync(utilsPath, 'utf8');
if (!utilsContent.includes('handleCompanionRegRefresh')) {
    const importTop = `import { randomBytes } from 'crypto';\nimport { getBinaryNodeChild } from '../WABinary/index.js';\n`;
    const companionCode = `
export const makePairingQRRenderer = (refs, render) => {
    let index = 0;
    let current;
    return {
        next() {
            const ref = refs[index];
            if (ref === undefined) {
                return false;
            }
            index += 1;
            current = ref;
            render(ref);
            return true;
        },
        refresh() {
            if (current === undefined) {
                return false;
            }
            render(current);
            return true;
        }
    };
};

const COMPANION_REG_REFRESH_CHILDREN = ['companion_reg_refresh', 'pair-device-rotate-qr'];

export const handleCompanionRegRefresh = (node, { creds, emitCredsUpdate, refreshQR, logger }) => {
    if (!COMPANION_REG_REFRESH_CHILDREN.some(tag => getBinaryNodeChild(node, tag))) {
        logger?.warn?.({ node }, 'companion_reg_refresh carries neither expected child; ignoring');
        return 'ignored_malformed';
    }
    if (creds.me) {
        logger?.debug?.('companion_reg_refresh on a registered session; keeping the adv secret');
        return 'ignored_registered';
    }
    creds.advSecretKey = randomBytes(32).toString('base64');
    emitCredsUpdate({ advSecretKey: creds.advSecretKey });
    logger?.info?.('rotated the adv secret the server asked to retire; re-rendering the pairing QR');
    refreshQR?.();
    return 'rotated';
};
`;
    utilsContent = importTop + utilsContent + '\n' + companionCode;
    fs.writeFileSync(utilsPath, utilsContent, 'utf8');
    console.log('[patch-baileys] Successfully patched companion-reg-client-utils.js');
} else {
    console.log('[patch-baileys] companion-reg-client-utils.js already patched.');
}

// 2. Patch socket.js
let socketContent = fs.readFileSync(socketPath, 'utf8');
if (!socketContent.includes('handleCompanionRegRefresh')) {
    // Add imports
    socketContent = socketContent.replace(
        "buildPairingQRData, bytesToCrockford,",
        "buildPairingQRData, bytesToCrockford, handleCompanionRegRefresh, makePairingQRRenderer,"
    );

    // Add let refreshPairingQR before QR gen
    socketContent = socketContent.replace(
        "    // QR gen\n    ws.on('CB:iq,type:set,pair-device',",
        "    let refreshPairingQR;\n    // QR gen\n    ws.on('CB:iq,type:set,pair-device',"
    );

    // Replace the QR renderer and rotation inside pair-device
    const oldQRGen = `        const refNodes = getBinaryNodeChildren(pairDeviceNode, 'ref');
        const noiseKeyB64 = Buffer.from(creds.noiseKey.public).toString('base64');
        const identityKeyB64 = Buffer.from(creds.signedIdentityKey.public).toString('base64');
        const advB64 = creds.advSecretKey;
        let qrMs = qrTimeout || 60000; // time to let a QR live
        const genPairQR = () => {
            if (!ws.isOpen) {
                return;
            }
            const refNode = refNodes.shift();
            if (!refNode) {
                void end(new Boom('QR refs attempts ended', { statusCode: DisconnectReason.timedOut }));
                return;
            }
            const ref = refNode.content.toString('utf-8');
            const qr = buildPairingQRData(ref, noiseKeyB64, identityKeyB64, advB64, browser);
            ev.emit('connection.update', { qr });
            qrTimer = setTimeout(genPairQR, qrMs);
            qrMs = qrTimeout || 20000; // shorter subsequent qrs
        };
        genPairQR();`;

    const newQRGen = `        const refNodes = getBinaryNodeChildren(pairDeviceNode, 'ref');
        const noiseKeyB64 = Buffer.from(creds.noiseKey.public).toString('base64');
        const identityKeyB64 = Buffer.from(creds.signedIdentityKey.public).toString('base64');
        const renderer = makePairingQRRenderer(
            refNodes.map(refNode => refNode.content.toString('utf-8')),
            ref => ev.emit('connection.update', {
                qr: buildPairingQRData(ref, noiseKeyB64, identityKeyB64, creds.advSecretKey, browser)
            })
        );
        refreshPairingQR = () => void renderer.refresh();
        let qrMs = qrTimeout || 60000; // time to let a QR live
        const genPairQR = () => {
            if (!ws.isOpen) {
                return;
            }
            if (!renderer.next()) {
                void end(new Boom('QR refs attempts ended', { statusCode: DisconnectReason.timedOut }));
                return;
            }
            qrTimer = setTimeout(genPairQR, qrMs);
            qrMs = qrTimeout || 20000; // shorter subsequent qrs
        };
        genPairQR();`;

    socketContent = socketContent.replace(oldQRGen, newQRGen);

    // Add CB:notification,type:companion_reg_refresh handler
    const companionRefreshHandler = `
    // the server retiring an unpaired companion's registration material
    ws.on('CB:notification,type:companion_reg_refresh', (node) => {
        handleCompanionRegRefresh(node, {
            creds,
            emitCredsUpdate: update => ev.emit('creds.update', update),
            refreshQR: () => refreshPairingQR?.(),
            logger
        });
    });
`;

    socketContent = socketContent.replace(
        "    // device paired for the first time",
        companionRefreshHandler + "    // device paired for the first time"
    );

    fs.writeFileSync(socketPath, socketContent, 'utf8');
    console.log('[patch-baileys] Successfully patched socket.js');
} else {
    console.log('[patch-baileys] socket.js already patched.');
}
