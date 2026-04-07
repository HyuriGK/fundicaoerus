const { Firebird, options: FIREBIRD_OPTIONS } = require('../lib/firebird-helper');
const { Pool } = require('pg');

function cleanConnectionString(str) {
    if (!str) return '';
    let cleaned = str.trim();
    if (cleaned.startsWith('psql')) cleaned = cleaned.substring(4).trim();
    return cleaned.replace(/^['"]|['"]$/g, '');
}

const pgPool = new Pool({
    connectionString: cleanConnectionString(process.env.DATABASE_URL),
    ssl: { rejectUnauthorized: false }
});

async function syncData() {
    console.log('🚀 Iniciando sincronização simplificada de DADOS (PEDIDOS/FATURAMENTO)...');
    const startTime = Date.now();

    let pgClient;
    let db;

    try {
        pgClient = await pgPool.connect();
        
        await pgClient.query(`
            CREATE TABLE IF NOT EXISTS firebird_sync_dados (
                sync_key TEXT PRIMARY KEY,
                data JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        db = await new Promise((resolve, reject) => {
            Firebird.attach(FIREBIRD_OPTIONS, (err, d) => {
                if (err) reject(err);
                else resolve(d);
            });
        });
        console.log('✅ Conectado ao Firebird');

        // Buscar Pedidos/Faturamentos Ativos (2025/2026)
        const query = `
            SELECT 
                P.CODIGO_PED, P.ANO_PED, P.EMPRESA_PED, P.EMISSAO_PED, P.STATUS_PED,
                C.RAZAO_SOCIAL_CLI as NOME_CLIENTE,
                (SELECT SUM(PP.VALOR_PPR * PP.QUANTIDADE_PPR) FROM PEDIDO_PRODUTO PP WHERE PP.CODIGO_PPR = P.CODIGO_PED AND PP.ANO_PPR = P.ANO_PED AND PP.EMPRESA_PPR = P.EMPRESA_PED) as TOTAL_PEDIDO
            FROM PEDIDO P
            JOIN CLIENTE C ON P.CLIENTE_PED = C.CODIGO_CLI AND P.CLI_EMPRESA_PED = C.EMPRESA_CLI
            WHERE EXTRACT(YEAR FROM P.EMISSAO_PED) IN (2025, 2026)
            AND P.STATUS_PED <> 'C'
        `;

        const results = await new Promise((resolve, reject) => {
            db.query(query, (err, res) => {
                if (err) reject(err);
                else resolve(res);
            });
        });

        console.log(`📊 ${results.length} pedidos encontrados.`);

        if (results.length > 0) {
            console.log('📤 Enviando para o Postgres...');
            for (let i = 0; i < results.length; i += 500) {
                const batch = results.slice(i, i + 500);
                const keys = batch.map(r => `PED-${r.EMPRESA_PED}-${r.ANO_PED}-${r.CODIGO_PED}`);
                const data = batch.map(r => JSON.stringify(r));

                await pgClient.query(`
                    INSERT INTO firebird_sync_dados (sync_key, data, updated_at)
                    SELECT unnest($1::text[]), unnest($2::jsonb[]), NOW()
                    ON CONFLICT (sync_key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
                `, [keys, data]);
                const pct = ((Math.min(i + 500, results.length) / results.length) * 100).toFixed(0);
                process.stdout.write(`@PROG:DADOS:${pct}%\n`);
            }
        }

        console.log(`\n\n✅ Sincronização de DADOS concluída em ${((Date.now() - startTime)/1000).toFixed(1)}s!`);

    } catch (err) {
        console.error('❌ ERRO NA SINCRONIZAÇÃO DE DADOS:', err.message);
    } finally {
        if (db) db.detach();
        if (pgClient) pgClient.release();
        process.exit(0);
    }
}

syncData();
