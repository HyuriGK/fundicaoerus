const https = require('https');

const action = process.argv[2];
const pageId = process.argv[3];

if (!action || !pageId || !['start', 'end'].includes(action)) {
    console.error('Uso: node scripts/sync/sync-page-syncing.js <start|end> <page_id>');
    process.exit(1);
}

const endpoint = action === 'start' ? '/api/page-locks/sync-lock' : '/api/page-locks/sync-unlock';
const data = JSON.stringify({ page_id: pageId });

const req = https.request({
    hostname: 'fundicaoerus.vercel.app',
    port: 443,
    path: endpoint,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
    }
}, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        try {
            const result = JSON.parse(body);
            if (result.success) {
                console.log(`[OK] sync ${action}: ${pageId}`);
            } else {
                console.error(`[ERRO] ${result.message}`);
            }
        } catch (e) {
            console.error('[ERRO] Resposta invalida:', body);
        }
        process.exit(0);
    });
});

req.setTimeout(15000, () => {
    console.error('[ERRO] Timeout ao atualizar status de sincronizacao.');
    req.destroy();
    process.exit(0);
});

req.on('error', e => {
    console.error(`[ERRO] Nao foi possivel conectar ao servidor: ${e.message}`);
    process.exit(0);
});

req.write(data);
req.end();
