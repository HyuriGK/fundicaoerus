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

async function syncEmissoes() {
    console.log('🚀 Iniciando sincronização de EMISSÕES (Histórico 2025/2026)...');
    const startTime = Date.now();

    let pgClient;
    let db;

    try {
        pgClient = await pgPool.connect();
        
        await pgClient.query(`
            CREATE TABLE IF NOT EXISTS firebird_sync_emissoes (
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

        const query = `
            SELECT 
                P.CODIGO_PPR, P.PRODUTO_PPR, P.NOME_PRODUTO_PPR,
                CASE 
                    WHEN PC.PPR_CODIGO_PPRC IS NOT NULL THEN 
                         CAST(PC.PRECO_POR_KG_PPRC * (CASE WHEN COALESCE(PC.PRO_PESO_LIQUIDO_PPRC, 0) > 0 THEN PC.PRO_PESO_LIQUIDO_PPRC ELSE COALESCE(PC.PRO_PESO_ESTIMADO_PPRC, 0) END) AS DECIMAL(18,4))
                    ELSE P.VALOR_PPR 
                END AS VALOR_PPR,
                CAST(PC.PRECO_POR_KG_PPRC AS DECIMAL(18,4)) AS PRECO_KG,
                P.QUANTIDADE_PPR, P.PESO_LIQUIDO_NPR, P.EMPRESA_PPR, P.ANO_PPR, P.ITEM_PPR, P.ORDEM_COMPRA_PPR,
                D.EMISSAO_PED AS DATA_EMISSAO_PEDIDO,
                C.RAZAO_SOCIAL_CLI AS NOME_CLIENTE, C.CODIGO_CLI AS ID_CLIENTE_CORE,
                M.MATERIAL_MAT AS NOME_MATERIAL
            FROM PEDIDO_PRODUTO P
            INNER JOIN PEDIDO D ON P.CODIGO_PPR = D.CODIGO_PED AND P.ANO_PPR = D.ANO_PED AND P.EMPRESA_PPR = D.EMPRESA_PED
            LEFT JOIN CLIENTE C ON D.CLIENTE_PED = C.CODIGO_CLI AND D.CLI_EMPRESA_PED = C.EMPRESA_CLI
            LEFT JOIN PRODUTO_MATERIAL PM ON P.PRODUTO_PPR = PM.PRODUTO_PMT
            LEFT JOIN MATERIAL M ON PM.MAT_ID_PMT = M.ID_MAT
            LEFT JOIN PEDIDO_PRODUTO_CALCULO_PRECO PC ON P.CODIGO_PPR = PC.PPR_CODIGO_PPRC AND P.ANO_PPR = PC.PPR_ANO_PPRC AND P.ITEM_PPR = PC.PPR_ITEM_PPRC AND P.EMPRESA_PPR = PC.PPR_EMPRESA_PPRC
            WHERE EXTRACT(YEAR FROM D.EMISSAO_PED) IN (2025, 2026)
            AND D.STATUS_PED <> 'C'
        `;

        const results = await new Promise((resolve, reject) => {
            db.query(query, (err, res) => {
                if (err) reject(err);
                else resolve(res);
            });
        });

        console.log(`📊 ${results.length} registros de emissão encontrados.`);

        if (results.length > 0) {
            console.log('📤 Enviando para o Postgres em lotes...');
            const BATCH_SIZE = 500;
            for (let i = 0; i < results.length; i += BATCH_SIZE) {
                const batch = results.slice(i, i + BATCH_SIZE);
                const keys = batch.map(r => `${r.EMPRESA_PPR}-${r.ANO_PPR}-${r.CODIGO_PPR}-${r.ITEM_PPR}`);
                const data = batch.map(r => JSON.stringify(r));

                await pgClient.query(`
                    INSERT INTO firebird_sync_emissoes (sync_key, data, updated_at)
                    SELECT unnest($1::text[]), unnest($2::jsonb[]), NOW()
                    ON CONFLICT (sync_key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;
                `, [keys, data]);
                const pct = ((Math.min(i + BATCH_SIZE, results.length) / results.length) * 100).toFixed(0);
                process.stdout.write(`@PROG:EMISSÕES:${pct}%\n`);
            }
        }

        console.log(`\n\n✅ Sincronização de EMISSÕES concluída em ${((Date.now() - startTime)/1000).toFixed(1)}s!`);

        // ATUALIZAR STATUS
        await pgClient.query("SET TIME ZONE 'America/Sao_Paulo'");
        await pgClient.query(`
            INSERT INTO sync_status (screen_name, last_sync_at)
            VALUES ('Pedidos', NOW())
            ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
        `);

    } catch (err) {
        console.error('❌ ERRO NA SINCRONIZAÇÃO DE EMISSÕES:', err.message);
    } finally {
        if (db) db.detach();
        if (pgClient) pgClient.release();
        process.exit(0);
    }
}

syncEmissoes();
