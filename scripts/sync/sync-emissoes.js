require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.local') });
const { Firebird, options: FIREBIRD_OPTIONS } = require('../../lib/firebird-helper');
const { Pool } = require('pg');

function cleanConnectionString(str) {
    if (!str) return '';
    let cleaned = str.trim();
    if (cleaned.startsWith('psql')) cleaned = cleaned.substring(4).trim();
    return cleaned.replace(/^['"]|['"]$/g, '');
}

const pgPool = new Pool({
    connectionString: cleanConnectionString(process.env.DATABASE_URL),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    // Aborta queries presas (ex.: lock segurado por sessão antiga) em vez de travar o ciclo
    statement_timeout: 120000,
    // Libera automaticamente sessões mortas no meio de uma transação (evita lock persistente entre execuções)
    idle_in_transaction_session_timeout: 60000
});

// Timeout por query do Firebird — impede que uma query sem retorno congele a sincronização
const FB_QUERY_TIMEOUT_MS = 180000;
function fbQuery(db, sql, label, params = []) {
    return new Promise((resolve, reject) => {
        let done = false;
        const t = setTimeout(() => {
            if (done) return;
            done = true;
            reject(new Error(`Timeout (${FB_QUERY_TIMEOUT_MS / 1000}s) na query Firebird: ${label}`));
        }, FB_QUERY_TIMEOUT_MS);
        db.query(sql, params, (err, res) => {
            if (done) return;
            done = true;
            clearTimeout(t);
            if (err) reject(err); else resolve(res);
        });
    });
}

function chunkArray(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
}

async function syncEmissoes() {
    const janela = { inicio: new Date('2025-01-01T00:00:00'), fim: new Date('2027-01-01T00:00:00'), inicioSql: '2025-01-01', fimSql: '2027-01-01' };
    console.log(`🚀 Iniciando sincronização de EMISSÕES (${janela.inicioSql} até ${janela.fimSql})...`);
    const startTime = Date.now();

    let pgClient;
    let db;
    let pgTransactionOpen = false;

    try {
        pgClient = await pgPool.connect();

        // Encerra sessões zumbis (mortas no meio de uma transação) que possam estar
        // segurando lock em firebird_sync_emissoes e travando o CREATE TABLE/INSERT.
        try {
            const killed = await pgClient.query(`
                SELECT pg_terminate_backend(pid) FROM pg_stat_activity
                WHERE datname = current_database()
                  AND state = 'idle in transaction'
                  AND pid <> pg_backend_pid()
                  AND state_change < now() - interval '2 minutes'
            `);
            if (killed.rowCount > 0) console.log(`🧟 ${killed.rowCount} sessão(ões) ociosa(s) em transação encerrada(s).`);
        } catch (e) { console.warn('⚠️ Não foi possível verificar sessões ociosas:', e.message); }

        await pgClient.query(`
            CREATE TABLE IF NOT EXISTS firebird_sync_emissoes (
                sync_key TEXT PRIMARY KEY,
                data JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        db = await Promise.race([
            new Promise((resolve, reject) => {
                Firebird.attach(FIREBIRD_OPTIONS, (err, d) => {
                    if (err) reject(err);
                    else resolve(d);
                });
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout (30s) ao conectar no Firebird')), 30000))
        ]);
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
                P.QUANTIDADE_PPR, P.FATURADO_PPR, P.QUANTIDADE_FATURADA_PPR, P.QUANTIDADE_DESISTENCIA_PPR, P.PESO_LIQUIDO_NPR, PRD.PESO_LIQUIDO_PRO AS PESO_PRODUTO, P.EMPRESA_PPR, P.ANO_PPR, P.ITEM_PPR, P.ORDEM_COMPRA_PPR,
                D.EMISSAO_PED AS DATA_EMISSAO_PEDIDO,
                D.ENTREGA_PED,
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
            LEFT JOIN PRODUTO PRD ON PRD.CODIGO_PRO = P.PRODUTO_PPR
            LEFT JOIN PRODUTO_MATERIAL PM ON P.PRODUTO_PPR = PM.PRODUTO_PMT
            LEFT JOIN MATERIAL M ON PM.MAT_ID_PMT = M.ID_MAT
            LEFT JOIN PEDIDO_PRODUTO_CALCULO_PRECO PC ON P.CODIGO_PPR = PC.PPR_CODIGO_PPRC AND P.ANO_PPR = PC.PPR_ANO_PPRC AND P.ITEM_PPR = PC.PPR_ITEM_PPRC AND P.EMPRESA_PPR = PC.PPR_EMPRESA_PPRC
            WHERE D.EMISSAO_PED >= ?
            AND D.EMISSAO_PED < ?
            AND D.STATUS_PED <> 'C'
            AND UPPER(D.STATUS_DESC_PED) <> 'CANCELADO'
        `;

        const results = await fbQuery(db, query, 'emissoes-principal', [janela.inicio, janela.fim]);

        console.log(`📊 ${results.length} registros de emissão encontrados.`);

        if (results.length > 0) {
            // 1. BUSCAR MAPA DE TODOS OS VÍNCULOS PEDIDO -> OP
            console.log('🔗 Mapeando todos os vínculos Pedido -> OP...');
            const pedidoCodigos = [...new Set(results.map(r => Number(r.CODIGO_PPR)).filter(Number.isFinite))];
            const links = [];
            for (const pedidoBatch of chunkArray(pedidoCodigos, 500)) {
                const linksQuery = `
                    SELECT PP.PPR_EMPRESA_PCPR, PP.PPR_ANO_PCPR, PP.PPR_CODIGO_PCPR, PP.PPR_ITEM_PCPR, PP.PCP_CODIGO_PCPR
                    FROM PRODUCAO_PEDIDO PP
                    JOIN PRODUCAO PR ON PR.CODIGO_PCP = PP.PCP_CODIGO_PCPR AND PR.EMPRESA_PCP = PP.PPR_EMPRESA_PCPR
                    WHERE PP.PPR_ANO_PCPR = 2026
                      AND PP.PPR_CODIGO_PCPR IN (${pedidoBatch.join(',')})
                      AND PR.STATUS_PCP NOT IN ('C', 'E')
                `;
                links.push(...await fbQuery(db, linksQuery, 'vinculos-pedido-op'));
            }

            const linksMap = {};
            links.forEach(l => {
                const key = `${l.PPR_EMPRESA_PCPR}-${l.PPR_ANO_PCPR}-${l.PPR_CODIGO_PCPR}-${l.PPR_ITEM_PCPR}`;
                if (!linksMap[key]) linksMap[key] = [];
                linksMap[key].push(l.PCP_CODIGO_PCPR);
            });

            // 1.2 BUSCAR VÍNCULOS MANUAIS DO POSTGRES
            console.log('📝 Buscando vínculos manuais do Postgres...');
            const manualLinksRes = await pgClient.query('SELECT sync_key, op, status FROM pedidos_op_links');
            const manualLinksMap = {};
            manualLinksRes.rows.forEach(row => {
                manualLinksMap[row.sync_key] = row;
            });

            // 2. BUSCAR ROTEIROS DE PRODUÇÃO POR PRODUTO (via Postgres)
            console.log('🗺️ Buscando roteiros de produção por produto...');
            const uniqueProducts = [...new Set(results.map(r => String(r.PRODUTO_PPR).trim()).filter(Boolean))];
            const routeMap = {}; // produto -> 'SETOR1,SETOR2,...'

            if (uniqueProducts.length > 0) {
                const routeRes = await pgClient.query(`
                    SELECT ft.pro_codigo_fic AS produto, string_agg(rt.setor_nome, ',' ORDER BY rt.sequencia) AS roteiro
                    FROM ficha_tecnica ft
                    JOIN roteiros_tecnicos rt ON rt.ficha_id = ft.codigo_fic
                    WHERE ft.pro_codigo_fic = ANY($1::text[])
                    GROUP BY ft.pro_codigo_fic
                `, [uniqueProducts]);

                routeRes.rows.forEach(row => {
                    routeMap[String(row.produto).trim()] = row.roteiro;
                });
                console.log(`✅ Roteiros encontrados for ${routeRes.rows.length} de ${uniqueProducts.length} produtos únicos.`);
            }

            // 2c. BUSCAR TODAS AS OPS EM ABERTO PARA OS PRODUTOS DA CARTEIRA
            console.log('🔍 Buscando OPs abertas por produto para sugestões...');
            const productOpsMap = {};
            if (uniqueProducts.length > 0) {
                // Sanitizar e preparar lista de códigos
                const PRODUCT_BATCH_LIMIT = 500;
                for (const productBatch of chunkArray(uniqueProducts, PRODUCT_BATCH_LIMIT)) {
                    const prodList = productBatch.map(p => `'${p.replace(/'/g, "''")}'`).join(',');
                const openOpsQuery = `
                    SELECT 
                        CODIGO_PCP, PRODUTO_PCP, STATUS_PCP, 
                        DATA_PCP, ENTREGA_PCP, QUANTIDADE_PCP
                    FROM PRODUCAO
                    WHERE STATUS_PCP NOT IN ('C', 'E')
                      AND PRODUTO_PCP IN (${prodList})
                    ORDER BY DATA_PCP DESC
                `;
                const openOps = await fbQuery(db, openOpsQuery, 'ops-abertas');

                openOps.forEach(op => {
                    const pCode = String(op.PRODUTO_PCP).trim();
                    if (!productOpsMap[pCode]) productOpsMap[pCode] = [];
                    productOpsMap[pCode].push(op);
                });
                }
                console.log(`✅ Sugestões carregadas para ${Object.keys(productOpsMap).length} produtos.`);
            }

            // 2d. COLETAR TODOS OS IDs DE OP QUE PRECISAMOS BUSCAR APONTAMENTOS
            // Inclui: OPs oficiais, OPs confirmadas manualmente e OPs sugeridas
            const extendedOpIds = new Set(links.map(l => l.PCP_CODIGO_PCPR));
            
            // Adicionar OPs manuais/confirmadas
            Object.values(manualLinksMap).forEach(ml => {
                if (ml.status === 'confirmado') extendedOpIds.add(Number(ml.op));
            });
            
            // Adicionar a PRIMEIRA OP sugerida de cada produto (para ter métricas básicas)
            Object.values(productOpsMap).forEach(ops => {
                if (ops.length > 0) extendedOpIds.add(Number(ops[0].CODIGO_PCP));
            });

            const allOpIds = [...extendedOpIds];
            const pointingsMap = {};

            if (allOpIds.length > 0) {
                console.log(`🔍 Buscando apontamentos para ${allOpIds.length} OPs únicas...`);
                // Dividir em lotes grandes para o Firebird
                const OP_BATCH_LIMIT = 500;
                for (let j = 0; j < allOpIds.length; j += OP_BATCH_LIMIT) {
                    const batchIds = allOpIds.slice(j, j + OP_BATCH_LIMIT);
                    const pointingQuery = `
                        SELECT CODIGO_PCS, SETOR_PCS, SUM(QUANTIDADE_PCS) as TOTAL, SUM(DQUANTIDADE_REFUGO_PCS) as TOTAL_REFUGO
                        FROM PRODUCAO_SETOR
                        WHERE CODIGO_PCS IN (${batchIds.join(',')})
                          AND DATA_PCS >= ? AND DATA_PCS < ?
                        GROUP BY 1, 2
                    `;
                    const pointingRows = await fbQuery(db, pointingQuery, 'apontamentos', [janela.inicio, janela.fim]);

                    pointingRows.forEach(row => {
                        if (!pointingsMap[row.CODIGO_PCS]) pointingsMap[row.CODIGO_PCS] = {};
                        pointingsMap[row.CODIGO_PCS][row.SETOR_PCS] = row.TOTAL;
                        const refugoQty = Number(row.TOTAL_REFUGO) || 0;
                        if (refugoQty > 0) {
                            pointingsMap[row.CODIGO_PCS][`REF_${row.SETOR_PCS}`] = (pointingsMap[row.CODIGO_PCS][`REF_${row.SETOR_PCS}`] || 0) + refugoQty;
                        }
                    });
                }
            }

            console.log('📤 Enviando para o Postgres em lotes...');
            await pgClient.query('BEGIN');
            pgTransactionOpen = true;
            const BATCH_SIZE = 500;
            for (let i = 0; i < results.length; i += BATCH_SIZE) {
                const batch = results.slice(i, i + BATCH_SIZE);
                
                // Mesclar apontamentos de TODAS as OPs vinculadas ao item
                const batchWithMetrics = batch.map(r => {
                    const key = `${r.EMPRESA_PPR}-${r.ANO_PPR}-${r.CODIGO_PPR}-${r.ITEM_PPR}`;
                    const roteiro = routeMap[String(r.PRODUTO_PPR).trim()] || null;
                    
                    let linkedOps = linksMap[key] || [];
                    let suggestedOp = null;
                    let linkStatus = 'oficial'; // 'oficial', 'confirmado', 'sugerido', 'rejeitado', 'removido'

                    // Lógica de Vínculo:
                    // 1. Se tem OP oficial, usa ela.
                    // 2. Se não, verifica se tem vínculo manual no Postgres.
                    // 3. Se não, tenta sugerir uma OP do mesmo produto.
                    
                    if (linkedOps.length === 0) {
                        const mLink = manualLinksMap[key];
                        if (mLink) {
                            if (mLink.status === 'confirmado') {
                                linkedOps = [Number(mLink.op)];
                                linkStatus = 'confirmado';
                            } else if (mLink.status === 'rejeitado' || mLink.status === 'removido') {
                                linkStatus = mLink.status;
                            }
                        }
                    }

                    if (linkedOps.length === 0 && linkStatus !== 'rejeitado' && linkStatus !== 'removido') {
                        const suggestions = productOpsMap[String(r.PRODUTO_PPR || '').trim()] || [];
                        if (suggestions.length > 0) {
                            // Pega a OP mais recente
                            suggestedOp = suggestions[0];
                            linkedOps = [Number(suggestedOp.CODIGO_PCP)];
                            linkStatus = 'sugerido';
                        }
                    }
                    
                    const totals = { 10: 0, 11: 0, 12: 0, 20: 0, 30: 0, 40: 0, 50: 0, 60: 0, 100: 0, 101: 0, 105: 0 };
                    
                    linkedOps.forEach(opId => {
                        const opsData = pointingsMap[opId] || {};
                        Object.keys(opsData).forEach(sector => {
                            if (totals[sector] !== undefined) {
                                totals[sector] += opsData[sector];
                            }
                        });
                    });

                    // Agregar refugos de todas as OPs vinculadas
                    const refs = { 10:0, 11:0, 12:0, 20:0, 30:0, 40:0, 50:0, 60:0, 100:0, 105:0 };
                    linkedOps.forEach(opId => {
                        const opsData = pointingsMap[opId] || {};
                        Object.keys(refs).forEach(s => {
                            refs[s] += Number(opsData[`REF_${s}`] || 0);
                        });
                    });

                    let selectedOpInfo = null;
                    if (linkedOps.length > 0) {
                        const suggestions = productOpsMap[String(r.PRODUTO_PPR || '').trim()] || [];
                        selectedOpInfo = suggestions.find(op => Number(op.CODIGO_PCP) === Number(linkedOps[0])) || null;
                    }

                    return {
                        ...r,
                        ROTEIRO_PRODUCAO: roteiro,
                        OP_PCS: linkedOps.length > 0 ? String(linkedOps[0]) : null,
                        OP_EMISSAO: selectedOpInfo?.DATA_PCP || r.OP_EMISSAO || null,
                        OP_ENTREGA: selectedOpInfo?.ENTREGA_PCP || r.OP_ENTREGA || null,
                        OP_QUANTIDADE: selectedOpInfo?.QUANTIDADE_PCP || r.OP_QUANTIDADE || null,
                        STATUS_PCP: selectedOpInfo?.STATUS_PCP || r.STATUS_PCP || null,
                        LINK_STATUS: linkStatus,
                        OP_SUGERIDA_INFO: suggestedOp,
                        QTY_MOLDADA: totals[10] + totals[11] + totals[12],
                        QTY_FUSAO: totals[20],
                        QTY_ACABAMENTO: totals[30],
                        QTY_TT: totals[40],
                        QTY_USINAGEM: totals[50] + totals[105],
                        QTY_QUALIDADE: totals[60],
                        QTY_EXPEDICAO: totals[100],
                        QTY_FATURAMENTO: totals[101],
                        REFUGO_MOLDAGEM:   refs[10] + refs[11] + refs[12],
                        REFUGO_FUSAO:      refs[20],
                        REFUGO_ACABAMENTO: refs[30],
                        REFUGO_TT:         refs[40],
                        REFUGO_USINAGEM:   refs[50] + refs[105],
                        REFUGO_QUALIDADE:  refs[60],
                        REFUGO_EXPEDICAO:  refs[100]
                    };
                });

                const seen = new Set();
                const deduped = batchWithMetrics.filter(r => {
                    const k = `${r.EMPRESA_PPR}-${r.ANO_PPR}-${r.CODIGO_PPR}-${r.ITEM_PPR}`;
                    if (seen.has(k)) return false;
                    seen.add(k);
                    return true;
                });
                const keys = deduped.map(r => `${r.EMPRESA_PPR}-${r.ANO_PPR}-${r.CODIGO_PPR}-${r.ITEM_PPR}`);
                const data = deduped.map(r => JSON.stringify(r));

                await pgClient.query(`
                    INSERT INTO firebird_sync_emissoes (sync_key, data, updated_at)
                    SELECT unnest($1::text[]), unnest($2::jsonb[]), NOW()
                    ON CONFLICT (sync_key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;
                `, [keys, data]);
                const pct = ((Math.min(i + BATCH_SIZE, results.length) / results.length) * 100).toFixed(0);
                process.stdout.write(`@PROG:EMISSÕES:${pct}%\n`);
            }

            // 3. LIMPEZA DE REGISTROS DELETADOS NO ERP (apenas janela movel)
            console.log(`🧹 Limpando registros que não existem mais no ERP (${janela.inicioSql} até ${janela.fimSql})...`);
            const validKeys = results.map(r => `${r.EMPRESA_PPR}-${r.ANO_PPR}-${r.CODIGO_PPR}-${r.ITEM_PPR}`);
            
            const deleteRes = await pgClient.query(`
                DELETE FROM firebird_sync_emissoes
                WHERE NULLIF(data->>'DATA_EMISSAO_PEDIDO', '')::date >= $1::date
                AND NULLIF(data->>'DATA_EMISSAO_PEDIDO', '')::date < $2::date
                AND sync_key <> ALL($3::text[])
            `, [janela.inicioSql, janela.fimSql, validKeys]);
            
            if (deleteRes.rowCount > 0) {
                console.log(`🗑️ Removidos ${deleteRes.rowCount} registros órfãos do dashboard.`);
            }
        }

            await pgClient.query(`
                CREATE TABLE IF NOT EXISTS pedidos_observacoes_historico (
                    id BIGSERIAL PRIMARY KEY,
                    sync_key TEXT NOT NULL,
                    observacao TEXT NOT NULL,
                    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    ended_at TIMESTAMP,
                    updated_by TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_pedidos_observacoes_historico_sync_key
                    ON pedidos_observacoes_historico (sync_key, started_at DESC);

                UPDATE pedidos_observacoes_historico h
                SET ended_at = NOW()
                WHERE h.observacao = 'SEM FICHA TÉCNICA'
                  AND h.ended_at IS NULL
                  AND EXISTS (
                      SELECT 1 FROM firebird_sync_emissoes p
                      JOIN ficha_tecnica f ON f.pro_codigo_fic = p.data->>'PRODUTO_PPR'
                      WHERE p.sync_key = h.sync_key
                  );

                UPDATE pedidos_observacoes o
                SET observacao = '', updated_at = NOW()
                FROM firebird_sync_emissoes p
                JOIN ficha_tecnica f ON f.pro_codigo_fic = p.data->>'PRODUTO_PPR'
                WHERE o.sync_key = p.sync_key
                  AND UPPER(TRIM(o.observacao)) = 'SEM FICHA TÉCNICA';

                WITH inserted AS (
                    INSERT INTO pedidos_observacoes (sync_key, observacao, updated_at)
                    SELECT p.sync_key, 'SEM FICHA TÉCNICA', NOW()
                    FROM firebird_sync_emissoes p
                    LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = p.data->>'PRODUTO_PPR'
                    LEFT JOIN pedidos_observacoes o ON o.sync_key = p.sync_key
                    WHERE f.pro_codigo_fic IS NULL
                      AND COALESCE(TRIM(o.observacao), '') = ''
                      AND ((p.data->>'QUANTIDADE_PPR')::numeric - COALESCE((p.data->>'QUANTIDADE_FATURADA_PPR')::numeric, 0) - COALESCE((p.data->>'QUANTIDADE_DESISTENCIA_PPR')::numeric, 0)) > 0
                      AND COALESCE(p.data->>'STATUS_PPR', '') <> 'C'
                      AND COALESCE(p.data->>'STATUS_PCP', '') NOT IN ('C', 'E', 'F')
                    ON CONFLICT (sync_key) DO NOTHING
                    RETURNING sync_key, observacao, updated_at
                )
                INSERT INTO pedidos_observacoes_historico (sync_key, observacao, started_at)
                SELECT sync_key, observacao, updated_at FROM inserted;
            `);

        console.log(`\n\n✅ Sincronização de EMISSÕES concluída em ${((Date.now() - startTime)/1000).toFixed(1)}s!`);

        // ATUALIZAR STATUS
        await pgClient.query("SET TIME ZONE 'America/Sao_Paulo'");
        await pgClient.query(`
            INSERT INTO sync_status (screen_name, last_sync_at)
            VALUES ('Pedidos', NOW()), ('Emissões', NOW())
            ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
        `);
        if (pgTransactionOpen) {
            await pgClient.query('COMMIT');
            pgTransactionOpen = false;
        }

    } catch (err) {
        if (pgClient && pgTransactionOpen) {
            try { await pgClient.query('ROLLBACK'); } catch (_) {}
        }
        console.error('❌ ERRO NA SINCRONIZAÇÃO DE EMISSÕES:', (err && err.message) || '(sem mensagem)');
        if (err && err.code) console.error('   código:', err.code, '| rotina:', err.routine || '-');
        if (err && Array.isArray(err.errors)) err.errors.forEach((e, i) => console.error(`   causa[${i}]:`, e && (e.message || e)));
        if (err && err.stack) console.error(err.stack);
    } finally {
        if (db) db.detach();
        if (pgClient) pgClient.release();
        process.exit(0);
    }
}

syncEmissoes();
