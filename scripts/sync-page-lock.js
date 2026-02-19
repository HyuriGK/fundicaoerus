/**
 * Utilitário para bloquear/desbloquear páginas durante sincronização.
 * Uso: node scripts/sync-page-lock.js <lock|unlock> <page_id>
 * Exemplo: node scripts/sync-page-lock.js lock faturamentos.html
 */
const http = require('http');

const action = process.argv[2]; // 'lock' ou 'unlock'
const pageId = process.argv[3]; // ex: 'faturamentos.html'

if (!action || !pageId) {
    console.error('Uso: node scripts/sync-page-lock.js <lock|unlock> <page_id>');
    process.exit(1);
}

const endpoint = action === 'lock' ? '/api/page-locks/sync-lock' : '/api/page-locks/sync-unlock';
const data = JSON.stringify({ page_id: pageId });

const options = {
    hostname: 'localhost',
    port: 3000,
    path: endpoint,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
    }
};

const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        try {
            const result = JSON.parse(body);
            if (result.success) {
                console.log(`[OK] ${action === 'lock' ? '🔒' : '🔓'} ${result.message}`);
            } else {
                console.error(`[ERRO] ${result.message}`);
            }
        } catch (e) {
            console.error('[ERRO] Resposta inválida:', body);
        }
    });
});

req.on('error', (e) => {
    console.error(`[ERRO] Não foi possível conectar ao servidor (localhost:3000): ${e.message}`);
    console.error('       Certifique-se de que o servidor está rodando.');
});

req.write(data);
req.end();
