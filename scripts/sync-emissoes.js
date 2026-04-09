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
            CREATE TABLE IF NOT EXISTS firebird_sync_pedidos (
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
                P.QUANTIDADE_PPR, P.FATURADO_PPR, P.QUANTIDADE_FATURADA_PPR, P.PESO_LIQUIDO_NPR, P.EMPRESA_PPR, P.ANO_PPR, P.ITEM_PPR, P.ORDEM_COMPRA_PPR,
                D.EMISSAO_PED AS DATA_EMISSAO_PEDIDO,
                P.DATA_ENTREGA_PPR,
                P.STATUS_PPR,
                D.STATUS_PED,
                D.STATUS_DESC_PED,
                P.SALDO_LIBERADO_FATURAR_PPR,
                C.RAZAO_SOCIAL_CLI AS NOME_CLIENTE, C.CODIGO_CLI AS ID_CLIENTE_CORE,
                M.MATERIAL_MAT AS NOME_MATERIAL,

                -- CAMPOS DE PRODUÇÃO (OP) - Puxando metadados básicos
                (SELECT FIRST 1 PP.PCP_CODIGO_PCPR FROM PRODUCAO_PEDIDO PP WHERE PP.PPR_CODIGO_PCPR = P.CODIGO_PPR AND PP.PPR_ANO_PCPR = P.ANO_PPR AND PP.PPR_ITEM_PCPR = P.ITEM_PPR AND PP.PPR_EMPRESA_PCPR = P.EMPRESA_PPR) as OP_PCS,
                (SELECT FIRST 1 PR.DATA_PCP FROM PRODUCAO_PEDIDO PP JOIN PRODUCAO PR ON PR.CODIGO_PCP = PP.PCP_CODIGO_PCPR AND PR.EMPRESA_PCP = PP.PCP_EMPRESA_PCPR WHERE PP.PPR_CODIGO_PCPR = P.CODIGO_PPR AND PP.PPR_ANO_PCPR = P.ANO_PPR AND PP.PPR_ITEM_PCPR = P.ITEM_PPR AND PP.PPR_EMPRESA_PCPR = P.EMPRESA_PPR) as OP_EMISSAO,
                (SELECT FIRST 1 PR.ENTREGA_PCP FROM PRODUCAO_PEDIDO PP JOIN PRODUCAO PR ON PR.CODIGO_PCP = PP.PCP_CODIGO_PCPR AND PR.EMPRESA_PCP = PP.PCP_EMPRESA_PCPR WHERE PP.PPR_CODIGO_PCPR = P.CODIGO_PPR AND PP.PPR_ANO_PCPR = P.ANO_PPR AND PP.PPR_ITEM_PCPR = P.ITEM_PPR AND PP.PPR_EMPRESA_PCPR = P.EMPRESA_PPR) as OP_ENTREGA,
                (SELECT FIRST 1 PR.QUANTIDADE_PCP FROM PRODUCAO_PEDIDO PP JOIN PRODUCAO PR ON PR.CODIGO_PCP = PP.PCP_CODIGO_PCPR AND PR.EMPRESA_PCP = PP.PCP_EMPRESA_PCPR WHERE PP.PPR_CODIGO_PCPR = P.CODIGO_PPR AND PP.PPR_ANO_PCPR = P.ANO_PPR AND PP.PPR_ITEM_PCPR = P.ITEM_PPR AND PP.PPR_EMPRESA_PCPR = P.EMPRESA_PPR) as OP_QUANTIDADE,
                (SELECT FIRST 1 PR.STATUS_PCP FROM PRODUCAO_PEDIDO PP JOIN PRODUCAO PR ON PR.CODIGO_PCP = PP.PCP_CODIGO_PCPR AND PR.EMPRESA_PCP = PP.PCP_EMPRESA_PCPR WHERE PP.PPR_CODIGO_PCPR = P.CODIGO_PPR AND PP.PPR_ANO_PCPR = P.ANO_PPR AND PP.PPR_ITEM_PCPR = P.ITEM_PPR AND PP.PPR_EMPRESA_PCPR = P.EMPRESA_PPR) as STATUS_PCP,
                (SELECT FIRST 1 PS.LOTE_PCS FROM PRODUCAO_PEDIDO PP JOIN PRODUCAO_SETOR PS ON PS.CODIGO_PCS = PP.PCP_CODIGO_PCPR AND PS.EMPRESA_PCS = PP.PCP_EMPRESA_PCPR WHERE PP.PPR_CODIGO_PCPR = P.CODIGO_PPR AND PP.PPR_ANO_PCPR = P.ANO_PPR AND PP.PPR_ITEM_PCPR = P.ITEM_PPR AND PP.PPR_EMPRESA_PCPR = P.EMPRESA_PPR ORDER BY PS.ID_PCS DESC) as LOTE_PCS,
                (SELECT FIRST 1 E.ENTREGA_PETR FROM PEDIDO_PRODUTO_ENTREGA E WHERE E.PPR_CODIGO_PETR = P.CODIGO_PPR AND E.PPR_ANO_PETR = P.ANO_PPR AND E.PPR_ITEM_PETR = P.ITEM_PPR AND E.PPR_EMPRESA_PETR = P.EMPRESA_PPR) as ENTREGA_PETR

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
            // 1. BUSCAR MAPA DE TODOS OS VÍNCULOS PEDIDO -> OP
            console.log('🔗 Mapeando todos os vínculos Pedido -> OP...');
            const linksQuery = `
                SELECT PPR_EMPRESA_PCPR, PPR_ANO_PCPR, PPR_CODIGO_PCPR, PPR_ITEM_PCPR, PCP_CODIGO_PCPR
                FROM PRODUCAO_PEDIDO
                WHERE PPR_ANO_PCPR IN (2025, 2026)
            `;
            const links = await new Promise((resolve, reject) => {
                db.query(linksQuery, (err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });

            const linksMap = {};
            links.forEach(l => {
                const key = `${l.PPR_EMPRESA_PCPR}-${l.PPR_ANO_PCPR}-${l.PPR_CODIGO_PCPR}-${l.PPR_ITEM_PCPR}`;
                if (!linksMap[key]) linksMap[key] = [];
                linksMap[key].push(l.PCP_CODIGO_PCPR);
            });

            // 2. BUSCAR APONTAMENTOS EM LOTE (TURBO)
            const allOpIds = [...new Set(links.map(l => l.PCP_CODIGO_PCPR))];
            const pointingsMap = {};

            if (allOpIds.length > 0) {
                console.log(`🔍 Buscando apontamentos para ${allOpIds.length} OPs únicas...`);
                // Dividir em lotes grandes para o Firebird
                const OP_BATCH_LIMIT = 500;
                for (let j = 0; j < allOpIds.length; j += OP_BATCH_LIMIT) {
                    const batchIds = allOpIds.slice(j, j + OP_BATCH_LIMIT);
                    const pointingQuery = `
                        SELECT CODIGO_PCS, SETOR_PCS, SUM(QUANTIDADE_PCS) as TOTAL
                        FROM PRODUCAO_SETOR
                        WHERE CODIGO_PCS IN (${batchIds.join(',')})
                        GROUP BY 1, 2
                    `;
                    const pointingRows = await new Promise((resolve, reject) => {
                        db.query(pointingQuery, (err, res) => {
                            if (err) reject(err);
                            else resolve(res);
                        });
                    });

                    pointingRows.forEach(row => {
                        if (!pointingsMap[row.CODIGO_PCS]) pointingsMap[row.CODIGO_PCS] = {};
                        pointingsMap[row.CODIGO_PCS][row.SETOR_PCS] = row.TOTAL;
                    });
                }
            }

            console.log('📤 Enviando para o Postgres em lotes...');
            const BATCH_SIZE = 500;
            for (let i = 0; i < results.length; i += BATCH_SIZE) {
                const batch = results.slice(i, i + BATCH_SIZE);
                
                // Mesclar apontamentos de TODAS as OPs vinculadas ao item
                const batchWithMetrics = batch.map(r => {
                    const key = `${r.EMPRESA_PPR}-${r.ANO_PPR}-${r.CODIGO_PPR}-${r.ITEM_PPR}`;
                    const linkedOps = linksMap[key] || [];
                    
                    const totals = { 10: 0, 11: 0, 12: 0, 20: 0, 30: 0, 40: 0, 50: 0, 60: 0, 100: 0, 101: 0, 105: 0 };
                    
                    linkedOps.forEach(opId => {
                        const opsData = pointingsMap[opId] || {};
                        Object.keys(opsData).forEach(sector => {
                            if (totals[sector] !== undefined) {
                                totals[sector] += opsData[sector];
                            }
                        });
                    });

                    return {
                        ...r,
                        QTY_MOLDADA: totals[10] + totals[11] + totals[12],
                        QTY_FUSAO: totals[20],
                        QTY_ACABAMENTO: totals[30],
                        QTY_TT: totals[40],
                        QTY_USINAGEM: totals[50] + totals[105],
                        QTY_QUALIDADE: totals[60],
                        QTY_EXPEDICAO: totals[100],
                        QTY_FATURAMENTO: totals[101]
                    };
                });

                const keys = batchWithMetrics.map(r => `${r.EMPRESA_PPR}-${r.ANO_PPR}-${r.CODIGO_PPR}-${r.ITEM_PPR}`);
                const data = batchWithMetrics.map(r => JSON.stringify(r));

                await pgClient.query(`
                    INSERT INTO firebird_sync_pedidos (sync_key, data, updated_at)
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
