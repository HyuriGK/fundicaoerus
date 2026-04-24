const pool = require('../../lib/db');
const { Firebird, options: firebirdOptions } = require('../../lib/firebird-helper');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

/**
 * MASTER SYNC (v5.1) - OTIMIZADO
 * Foco: Sincronizar TODAS as OPs Ativas (A, N, P) diretamente do Firebird.
 * Correção: Reporte de progresso para o monitor (@PROG) e atualização de status do dashboard.
 */

async function syncMaster() {
    const startTime = Date.now();
    console.log('\n======================================================');
    console.log('🚀 INICIANDO SINCRONIZAÇÃO MASTER OTIMIZADA (V5.1)');
    console.log('======================================================\n');

    try {
        Firebird.attach(firebirdOptions, async function (err, db) {
            if (err) { 
                console.error('❌ [Erro] Falha ao conectar no Firebird:', err.message); 
                process.exit(1); 
            }

            // 1. Buscar TODAS as OPs Ativas (A, N, P) da Empresa 10
            process.stdout.write('@PROG:PEDIDOS:5%\n');
            console.log('📥 [1/4] Coletando OPs Ativas (A, N, P)...');
            
            const opsResults = await new Promise((res, rej) => {
                db.query(`
                    SELECT 
                        P.CODIGO_PCP as OP_PCS,
                        P.PRODUTO_PCP as PRODUTO_PPR,
                        PR.NOME_PRO as NOME_PRODUTO_PPR,
                        PR.PESO_LIQUIDO_PRO as PESO_PRODUTO,
                        P.QUANTIDADE_PCP as OP_QUANTIDADE,
                        P.DATA_PCP as OP_EMISSAO,
                        P.ENTREGA_PCP as OP_ENTREGA,
                        P.STATUS_PCP,
                        (SELECT FIRST 1 PS.LOTE_PCS FROM PRODUCAO_SETOR PS WHERE PS.CODIGO_PCS = P.CODIGO_PCP AND PS.EMPRESA_PCS = P.EMPRESA_PCP ORDER BY PS.ID_PCS DESC) as LOTE_PCS,
                        (
                            SELECT FIRST 1 C.RAZAO_SOCIAL_CLI 
                            FROM PRODUCAO_PEDIDO PP
                            JOIN PEDIDO D ON D.CODIGO_PED = PP.PPR_CODIGO_PCPR AND D.ANO_PED = PP.PPR_ANO_PCPR AND D.EMPRESA_PED = PP.PPR_EMPRESA_PCPR
                            JOIN CLIENTE C ON C.CODIGO_CLI = D.CLIENTE_PED AND C.EMPRESA_CLI = D.CLI_EMPRESA_PED
                            WHERE PP.PCP_CODIGO_PCPR = P.CODIGO_PCP AND PP.PCP_EMPRESA_PCPR = P.EMPRESA_PCP
                        ) as NOME_CLIENTE,
                        (
                            SELECT FIRST 1 D.CODIGO_PED
                            FROM PRODUCAO_PEDIDO PP
                            JOIN PEDIDO D ON D.CODIGO_PED = PP.PPR_CODIGO_PCPR AND D.ANO_PED = PP.PPR_ANO_PCPR AND D.EMPRESA_PED = PP.PPR_EMPRESA_PCPR
                            WHERE PP.PCP_CODIGO_PCPR = P.CODIGO_PCP AND PP.PCP_EMPRESA_PCPR = P.EMPRESA_PCP
                        ) as PEDIDO_NUM,
                        (
                            SELECT FIRST 1 D.EMISSAO_PED
                            FROM PRODUCAO_PEDIDO PP
                            JOIN PEDIDO D ON D.CODIGO_PED = PP.PPR_CODIGO_PCPR AND D.ANO_PED = PP.PPR_ANO_PCPR AND D.EMPRESA_PED = PP.PPR_EMPRESA_PCPR
                            WHERE PP.PCP_CODIGO_PCPR = P.CODIGO_PCP AND PP.PCP_EMPRESA_PCPR = P.EMPRESA_PCP
                        ) as DATA_EMISSAO_PEDIDO,
                        (
                            SELECT FIRST 1 PPR.FATURADO_PPR
                            FROM PRODUCAO_PEDIDO PP
                            JOIN PEDIDO_PRODUTO PPR ON PPR.CODIGO_PPR = PP.PPR_CODIGO_PCPR AND PPR.ANO_PPR = PP.PPR_ANO_PCPR AND PPR.ITEM_PPR = PP.PPR_ITEM_PCPR AND PPR.EMPRESA_PPR = PP.PPR_EMPRESA_PCPR
                            WHERE PP.PCP_CODIGO_PCPR = P.CODIGO_PCP AND PP.PCP_EMPRESA_PCPR = P.EMPRESA_PCP
                        ) as FATURADO_PPR,
                        (
                            SELECT FIRST 1 PPR.SALDO_LIBERADO_FATURAR_PPR
                            FROM PRODUCAO_PEDIDO PP
                            JOIN PEDIDO_PRODUTO PPR ON PPR.CODIGO_PPR = PP.PPR_CODIGO_PCPR AND PPR.ANO_PPR = PP.PPR_ANO_PCPR AND PPR.ITEM_PPR = PP.PPR_ITEM_PCPR AND PPR.EMPRESA_PPR = PP.PPR_EMPRESA_PCPR
                            WHERE PP.PCP_CODIGO_PCPR = P.CODIGO_PCP AND PP.PCP_EMPRESA_PCPR = P.EMPRESA_PCP
                        ) as SALDO_LIBERADO_FATURAR_PPR,
                        (
                            SELECT FIRST 1 PPR.PESO_LIQUIDO_NPR
                            FROM PRODUCAO_PEDIDO PP
                            JOIN PEDIDO_PRODUTO PPR ON PPR.CODIGO_PPR = PP.PPR_CODIGO_PCPR AND PPR.ANO_PPR = PP.PPR_ANO_PCPR AND PPR.ITEM_PPR = PP.PPR_ITEM_PCPR AND PPR.EMPRESA_PPR = PP.PPR_EMPRESA_PCPR
                            WHERE PP.PCP_CODIGO_PCPR = P.CODIGO_PCP AND PP.PCP_EMPRESA_PCPR = P.EMPRESA_PCP
                        ) as PESO_LIQUIDO_NPR
                    FROM PRODUCAO P
                    LEFT JOIN PRODUTO PR ON PR.CODIGO_PRO = P.PRODUTO_PCP
                    WHERE P.EMPRESA_PCP = 10 
                    AND P.STATUS_PCP IN ('A', 'N', 'P')
                `, (e, r) => e ? rej(e) : res(r));
            });

            console.log(`📦 [Status] ${opsResults.length} OPs ativas encontradas.`);
            process.stdout.write('@PROG:PEDIDOS:20%\n');

            // --- NOVO: Buscar Apontamentos em Lote (Igual sync-emissoes.js) ---
            const allOpIds = [...new Set(opsResults.map(l => l.OP_PCS))];
            // Mapa OP → data de emissão (para filtrar apontamentos de reuso de número de OP)
            const opEmissaoMap = {};
            opsResults.forEach(op => {
                if (op.OP_EMISSAO) opEmissaoMap[op.OP_PCS] = op.OP_EMISSAO;
            });
            const pointingsMap = {};

            if (allOpIds.length > 0) {
                console.log(`🔍 [1.5/4] Buscando apontamentos para ${allOpIds.length} OPs únicas...`);
                const OP_BATCH_LIMIT = 500;
                for (let j = 0; j < allOpIds.length; j += OP_BATCH_LIMIT) {
                    const batchIds = allOpIds.slice(j, j + OP_BATCH_LIMIT);
                    const pointingQuery = `
                        SELECT CODIGO_PCS, SETOR_PCS, DATA_PCS, SUM(QUANTIDADE_PCS) as TOTAL
                        FROM PRODUCAO_SETOR
                        WHERE EMPRESA_PCS = 10 AND CODIGO_PCS IN (${batchIds.join(',')})
                        GROUP BY 1, 2, 3
                    `;
                    const pointingRows = await new Promise((resolve, reject) => {
                        db.query(pointingQuery, (err, res) => {
                            if (err) reject(err);
                            else resolve(res || []);
                        });
                    });

                    pointingRows.forEach(row => {
                        const opEmissao = opEmissaoMap[row.CODIGO_PCS];
                        // Ignorar apontamentos anteriores à emissão da OP (número de OP reutilizado)
                        if (opEmissao && row.DATA_PCS && new Date(row.DATA_PCS) < new Date(opEmissao)) return;

                        const sId = Number(row.SETOR_PCS);
                        if (!pointingsMap[row.CODIGO_PCS]) pointingsMap[row.CODIGO_PCS] = {};

                        // Map older IDs (1, 2, 3...) to standard IDs (10, 20, 30...) if applicable
                        let targetId = sId;
                        if (sId === 1) targetId = 10;
                        else if (sId === 2) targetId = 20;
                        else if (sId === 3) targetId = 30;
                        else if (sId === 4) targetId = 40;
                        else if (sId === 5) targetId = 50;

                        if (!pointingsMap[row.CODIGO_PCS][targetId]) pointingsMap[row.CODIGO_PCS][targetId] = 0;
                        pointingsMap[row.CODIGO_PCS][targetId] += row.TOTAL;
                    });
                }
                console.log(`✅ [1.6/4] Pointings extraídos com sucesso para ${Object.keys(pointingsMap).length} OPs.`);
            }

            const pgClient = await pool.connect();
            try {
                // 2. Upsert OPs — transação separada para garantir que OPs nunca sejam perdidas
                console.log('📤 [2/4] Atualizando registros no Postgres...');
                const totalOPs = opsResults.length;
                let processed = 0;

                await pgClient.query('BEGIN');
                for (const op of opsResults) {
                    const syncKey = `OP-${op.OP_PCS}`;
                    op.OP_QUANTIDADE = op.OP_QUANTIDADE || 0;
                    op.QUANTIDADE_PPR = op.OP_QUANTIDADE;

                    const opsData = pointingsMap[op.OP_PCS] || {};
                    const totals = { 10: 0, 11: 0, 12: 0, 20: 0, 30: 0, 40: 0, 50: 0, 60: 0, 100: 0, 101: 0, 105: 0 };
                    Object.keys(opsData).forEach(sector => {
                        const sId = Number(sector);
                        if (totals[sId] !== undefined) totals[sId] += opsData[sector];
                    });

                    op.QTY_MOLDADA = totals[10] + totals[11] + totals[12];
                    op.QTY_FUSAO = totals[20];
                    op.QTY_ACABAMENTO = totals[30];
                    op.QTY_TT = totals[40];
                    op.QTY_USINAGEM = totals[50] + totals[105];
                    op.QTY_QUALIDADE = totals[60];
                    op.QTY_EXPEDICAO = totals[100];
                    op.QTY_FATURAMENTO = totals[101];

                    await pgClient.query(`
                        INSERT INTO firebird_sync_pedidos (sync_key, data, updated_at)
                        VALUES ($1, $2, NOW())
                        ON CONFLICT (sync_key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
                    `, [syncKey, JSON.stringify(op)]);

                    processed++;
                    if (processed % 50 === 0) {
                        const pct = 20 + Math.floor((processed / totalOPs) * 40);
                        process.stdout.write(`@PROG:PEDIDOS:${pct}%\n`);
                    }
                }
                await pgClient.query('COMMIT');
                console.log(`✅ [2/4] ${totalOPs} OPs salvas no Postgres.`);

                // 3. Sincronizar Roteiros — transação separada (erro aqui não apaga OPs)
                const uniqueProducts = [...new Set(opsResults.map(op => String(op.PRODUTO_PPR).trim()))];
                console.log(`📥 [3/4] Sincronizando roteiros para ${uniqueProducts.length} produtos...`);

                await pgClient.query(`ALTER TABLE ficha_tecnica ADD COLUMN IF NOT EXISTS lote_pmt TEXT`);

                const productChunks = [];
                for (let i = 0; i < uniqueProducts.length; i += 100) productChunks.push(uniqueProducts.slice(i, i + 100));

                let chunkIdx = 0;
                for (const chunk of productChunks) {
                    const placeholders = chunk.map(c => `'${c}'`).join(',');

                    const fts = await new Promise(res => db.query(`SELECT PRO_CODIGO_FIC, CODIGO_FIC FROM FICHA_TECNICA WHERE ATIVO_FIC = 'S' AND PRO_CODIGO_FIC IN (${placeholders})`, (e, r) => res(r || [])));

                    const loteRows = await new Promise(res => db.query(`SELECT PRODUTO_PMT, LOTE_PMT FROM PRODUTO_MATERIAL WHERE PRODUTO_PMT IN (${placeholders})`, (e, r) => res(r || [])));
                    const loteMap = {};
                    loteRows.forEach(l => { loteMap[String(l.PRODUTO_PMT).trim()] = l.LOTE_PMT || null; });

                    for (const ft of fts) {
                        const lote = loteMap[String(ft.PRO_CODIGO_FIC).trim()] || null;
                        try {
                            await pgClient.query(`
                                UPDATE ficha_tecnica SET codigo_fic = $2, lote_pmt = $3, updated_at = NOW()
                                WHERE pro_codigo_fic = $1
                            `, [String(ft.PRO_CODIGO_FIC).trim(), ft.CODIGO_FIC, lote]);
                        } catch (e) {
                            console.error(`  ⚠️ lote update failed for ${ft.PRO_CODIGO_FIC}:`, e.message);
                        }
                    }

                    const opFichas = await new Promise(res => db.query(`SELECT CODIGO_PCP, FIC_CODIGO_PCP FROM PRODUCAO WHERE FIC_CODIGO_PCP IS NOT NULL AND PRODUTO_PCP IN (${placeholders}) AND STATUS_PCP IN ('A', 'N', 'P')`, (e, r) => res(r || [])));
                    for (const opF of opFichas) {
                        try {
                            await pgClient.query(`INSERT INTO producao_fichas (op_codigo, ficha_id) VALUES ($1, $2) ON CONFLICT (op_codigo) DO UPDATE SET ficha_id = EXCLUDED.ficha_id`, [String(opF.CODIGO_PCP).trim(), opF.FIC_CODIGO_PCP]);
                        } catch (e) { /* ignore */ }
                    }

                    const rts = await new Promise(res => db.query(`
                        SELECT FT.CODIGO_FIC, PS.SEQUENCIA_PDS as SEQUENCIA, S.NOME_SET as SETOR
                        FROM FICHA_TECNICA FT
                        JOIN PROCEDIMENTO P ON P.CODIGO_PDT = FT.PDT_CODIGO_FIC
                        JOIN PROCEDIMENTO_SETOR PS ON PS.PDT_CODIGO_PDS = P.CODIGO_PDT
                        JOIN SETOR S ON S.CODIGO_SET = PS.SET_CODIGO_PDS
                        WHERE FT.ATIVO_FIC = 'S' AND PS.SET_EMPRESA_PDS = 10 AND S.NOME_SET NOT LIKE 'NAO USAR%'
                        AND FT.PRO_CODIGO_FIC IN (${placeholders})
                    `, (e, r) => res(r || [])));
                    for (const rt of rts) {
                        try {
                            await pgClient.query(`INSERT INTO roteiros_tecnicos (ficha_id, sequencia, setor_nome) VALUES ($1, $2, $3) ON CONFLICT (ficha_id, sequencia) DO UPDATE SET setor_nome = EXCLUDED.setor_nome`, [rt.CODIGO_FIC, rt.SEQUENCIA, String(rt.SETOR).trim().toUpperCase()]);
                        } catch (e) { /* ignore */ }
                    }

                    chunkIdx++;
                    const pct = 60 + Math.floor((chunkIdx / productChunks.length) * 35);
                    process.stdout.write(`@PROG:PEDIDOS:${pct}%\n`);
                }

                // 4. ATUALIZAR STATUS NO DASHBOARD
                process.stdout.write('@PROG:PEDIDOS:98%\n');
                console.log('✅ Atualizando status de sincronização...');
                await pgClient.query("SET TIME ZONE 'America/Sao_Paulo'");
                await pgClient.query(`
                    INSERT INTO sync_status (screen_name, last_sync_at)
                    VALUES ('Pedidos', NOW()), ('Industrial', NOW())
                    ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
                `);

            } catch (e) {
                try { await pgClient.query('ROLLBACK'); } catch (_) {}
                console.error('\n❌ [Erro Postgres]:', e.message);
            } finally {
                pgClient.release();
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            process.stdout.write('@PROG:PEDIDOS:100%\n');
            console.log('\n\n======================================================');
            console.log(`🎉 SINCRONIZAÇÃO V5.1 CONCLUÍDA EM ${duration}S!`);
            console.log('======================================================\n');
            db.detach();
            process.exit(0);
        });
    } catch (e) { console.error('❌ [Erro Crítico]:', e.message); process.exit(1); }
}

syncMaster();
