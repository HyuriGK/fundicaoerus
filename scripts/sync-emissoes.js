const { Firebird, attachWithRetry } = require('../lib/firebird-helper');
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

    try {
        const pgClient = await pgPool.connect();
        await pgClient.query(`
            CREATE TABLE IF NOT EXISTS firebird_sync_emissoes (
                sync_key TEXT PRIMARY KEY,
                data JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        pgClient.release();

        // 2. Conectar ao Firebird com Retry
        const db = await attachWithRetry();
        console.log('✅ Conectado ao Firebird com sucesso.');

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
            FROM PEDIDO_PRODUTOR P
            LEFT JOIN PEDIDO D ON P.CODIGO_PPR = D.CODIGO_PED
            LEFT JOIN CLIENTE C ON D.CLIENTE_PED = C.CODIGO_CLI
            LEFT JOIN PRODUTO_MATERIAL PM ON P.PRODUTO_PPR = PM.PRODUTO_PMT
            LEFT JOIN MATERIAL M ON PM.MAT_ID_PMT = M.ID_MAT
            LEFT JOIN PRODUTOR_CUSTO PC ON (P.CODIGO_PPR = PC.PPR_CODIGO_PPRC AND P.ITEM_PPR = PC.PPR_ITEM_PPRC)
            WHERE P.ANO_PPR IN (2025, 2026)
        `;

        const result = await new Promise((resolve, reject) => {
            db.query(query, [], (err, res) => {
                if (err) reject(err);
                else resolve(res || []);
            });
        });

        console.log(`📦 Encontrados ${result.length} registros de emissões no Firebird.`);

        const client = await pgPool.connect();
        try {
            let inserted = 0;
            for (const row of result) {
                const syncKey = `EMI-${row.CODIGO_PPR}-${row.ITEM_PPR}`;
                await client.query(`
                    INSERT INTO firebird_sync_emissoes (sync_key, data, updated_at)
                    VALUES ($1, $2, CURRENT_TIMESTAMP)
                    ON CONFLICT (sync_key) DO UPDATE SET
                        data = EXCLUDED.data,
                        updated_at = CURRENT_TIMESTAMP
                `, [syncKey, row]);

                inserted++;
                if (inserted % 200 === 0 || inserted === result.length) {
                    const pct = ((inserted / result.length) * 100).toFixed(0);
                    process.stdout.write(`@PROG:EMISSÕES:${pct}%\n`);
                }
            }

            // ATUALIZAR STATUS DE SINCRONIZAÇÃO
            await client.query("SET TIME ZONE 'America/Sao_Paulo'");
            await client.query(`
                INSERT INTO sync_status (screen_name, last_sync_at)
                VALUES ('Emissões', NOW())
                ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
            `);
            console.log('📊 Status de sincronização atualizado para: Emissões');

        } finally {
            client.release();
        }

        db.detach();
        console.log('✅ Sincronização de emissões finalizada com sucesso.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Erro crítico na sincronização de emissões:', error);
        process.exit(1);
    }
}

syncEmissoes();
