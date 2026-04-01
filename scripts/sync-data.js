require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');
const { Pool } = require('pg');

// --- CONFIGURAÇÃO ---
const FIREBIRD_OPTIONS = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

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

// Helper for Firebird queries with Promises
function queryFB(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}

async function syncData() {
    console.log('🚀 Iniciando sincronização OTIMIZADA (PEDIDOS 2026)...');
    const startTime = Date.now();

    const pgClient = await pgPool.connect();
    let db;

    try {
        // 1. Preparar tabela no Postgres
        await pgClient.query(`
            CREATE TABLE IF NOT EXISTS firebird_sync_pedidos (
                sync_key TEXT PRIMARY KEY,
                data JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Conectar no Firebird
        db = await new Promise((resolve, reject) => {
            Firebird.attach(FIREBIRD_OPTIONS, (err, d) => {
                if (err) reject(err);
                else resolve(d);
            });
        });
        console.log('✅ Conectado ao Firebird');

        // 3. FETCH DATA IN BULK
        
        // --- 3.1 BASE ORDERS ---
        console.log('📥 Lendo base de Pedidos (2025/2026)...');
        const baseOrdersSql = `
            SELECT 
                P.CODIGO_PPR, P.PRODUTO_PPR, P.NOME_PRODUTO_PPR,
                P.QUANTIDADE_PPR, P.QUANTIDADE_FATURADA_PPR, P.SALDO_LIBERADO_FATURAR_PPR,
                P.PESO_LIQUIDO_NPR, P.EMPRESA_PPR, P.ANO_PPR, P.ITEM_PPR,
                P.ORDEM_COMPRA_PPR, P.STATUS_PPR,
                D.STATUS_PED, D.STATUS_DESC_PED, D.CLIENTE_PED AS ID_CLIENTE_CORE, D.EMISSAO_PED AS DATA_EMISSAO_PEDIDO,
                C.RAZAO_SOCIAL_CLI AS NOME_CLIENTE, M.MATERIAL_MAT AS NOME_MATERIAL,
                E.ENTREGA_PETR,
                CAST(PC.PRECO_POR_KG_PPRC AS DECIMAL(18,4)) AS PRECO_KG,
                CASE 
                    WHEN PC.PPR_CODIGO_PPRC IS NOT NULL THEN 
                         CAST(PC.PRECO_POR_KG_PPRC * (CASE WHEN COALESCE(PC.PRO_PESO_LIQUIDO_PPRC, 0) > 0 THEN PC.PRO_PESO_LIQUIDO_PPRC ELSE COALESCE(PC.PRO_PESO_ESTIMADO_PPRC, 0) END) AS DECIMAL(18,4))
                    ELSE P.VALOR_PPR 
                END AS VALOR_PPR
            FROM PEDIDO_PRODUTO P
            LEFT JOIN PEDIDO_PRODUTO_ENTREGA E ON P.CODIGO_PPR = E.PPR_CODIGO_PETR AND P.ANO_PPR = E.PPR_ANO_PETR AND P.ITEM_PPR = E.PPR_ITEM_PETR
            LEFT JOIN PEDIDO D ON P.CODIGO_PPR = D.CODIGO_PED AND P.ANO_PPR = D.ANO_PED AND P.EMPRESA_PPR = D.EMPRESA_PED
            LEFT JOIN CLIENTE C ON D.CLIENTE_PED = C.CODIGO_CLI AND D.CLI_EMPRESA_PED = C.EMPRESA_CLI
            LEFT JOIN PRODUTO_MATERIAL PM ON P.PRODUTO_PPR = PM.PRODUTO_PMT
            LEFT JOIN MATERIAL M ON PM.MAT_ID_PMT = M.ID_MAT
            LEFT JOIN PEDIDO_PRODUTO_CALCULO_PRECO PC ON P.CODIGO_PPR = PC.PPR_CODIGO_PPRC AND P.ANO_PPR = PC.PPR_ANO_PPRC AND P.ITEM_PPR = PC.PPR_ITEM_PPRC AND P.EMPRESA_PPR = PC.PPR_EMPRESA_PPRC
            WHERE P.ANO_PPR IN (2025, 2026)
            AND (P.FATURADO_PPR <> 'T' OR P.FATURADO_PPR IS NULL)
            AND (P.STATUS_PPR <> 'C' OR P.STATUS_PPR IS NULL)
        `;
        const orders = await queryFB(db, baseOrdersSql);
        console.log(`📊 ${orders.length} pedidos em carteira encontrados.`);

        if (orders.length === 0) {
            console.log('Nada para sincronizar.');
            return;
        }

        // --- 3.2 PRODUCTION LINKS & LATEST STATUS ---
        console.log('📥 Lendo vínculos de Produção e status atual...');
        const productionLinksSql = `
            SELECT 
                PP.PPR_CODIGO_PCPR AS COD_PED, PP.PPR_ANO_PCPR AS ANO_PED, PP.PPR_ITEM_PCPR AS ITEM_PED, PP.PPR_EMPRESA_PCPR AS EMP_PED,
                PP.PCP_CODIGO_PCPR AS OP_CODE,
                PCP.QUANTIDADE_PCP, PCP.DATA_PCP, PCP.ENTREGA_PCP, PCP.STATUS_PCP, PCP.DATA_CONCLUSAO_PCP,
                PS.LOTE_PCS, S.NOME_SET, PS.SETOR_PCS
            FROM PRODUCAO_PEDIDO PP
            JOIN PRODUCAO PCP ON PCP.CODIGO_PCP = PP.PCP_CODIGO_PCPR AND PCP.EMPRESA_PCP = PP.PCP_EMPRESA_PCPR
            LEFT JOIN PRODUCAO_SETOR PS ON PS.CODIGO_PCS = PP.PCP_CODIGO_PCPR AND PS.EMPRESA_PCS = PP.PCP_EMPRESA_PCPR AND PS.ID_PCS = (
                SELECT MAX(ID_PCS) FROM PRODUCAO_SETOR WHERE CODIGO_PCS = PP.PCP_CODIGO_PCPR AND EMPRESA_PCS = PP.PCP_EMPRESA_PCPR AND STATUS_PCS <> 'C'
            )
            LEFT JOIN SETOR S ON S.CODIGO_SET = PS.SETOR_PCS AND S.EMPRESA_SET = PS.SET_EMPRESA_PCS
            WHERE PP.PPR_ANO_PCPR IN (2025, 2026)
        `;
        const prodLinks = await queryFB(db, productionLinksSql);
        
        const opMap = new Map(); // Key: EMP-ANO-COD-ITEM -> { bestOP: info, allOPs: Set }
        const activeOPs = new Set();
        prodLinks.forEach(p => {
            const key = `${p.EMP_PED}-${p.ANO_PED}-${p.COD_PED}-${p.ITEM_PED}`;
            
            if (!opMap.has(key)) {
                opMap.set(key, { bestOP: p, allOPs: new Set() });
            }
            
            const current = opMap.get(key);
            current.allOPs.add(p.OP_CODE);

            // Prioritization: N (Normal) or P (Planned) are "Better" than C (Completed) or E (Encerrada)
            const isNewBetter = (p.STATUS_PCP === 'N' || p.STATUS_PCP === 'P') && 
                               (current.bestOP.STATUS_PCP === 'C' || current.bestOP.STATUS_PCP === 'E');
            
            if (isNewBetter || current.allOPs.size === 1) {
                current.bestOP = p;
            }

            if (p.OP_CODE) activeOPs.add(p.OP_CODE);
        });

        // --- 3.3 PRODUCTION SUMS (SECTORS) ---
        console.log('📥 Lendo somatórios de produção por setor...');
        const sectorSumsSql = `
            SELECT 
                CODIGO_PCS AS OP_CODE, SETOR_PCS, SUM(QUANTIDADE_PCS) AS QTY
            FROM PRODUCAO_SETOR
            WHERE EMPRESA_PCS = 10 AND STATUS_PCS <> 'C' AND QUANTIDADE_PCS > 0
            AND EXTRACT(YEAR FROM DATA_PCS) IN (2025, 2026)
            GROUP BY CODIGO_PCS, SETOR_PCS
        `;
        const sectorData = await queryFB(db, sectorSumsSql);
        
        const sectorSumsMap = new Map(); // OP_CODE -> SectorGroupMap
        sectorData.forEach(s => {
            if (!sectorSumsMap.has(s.OP_CODE)) sectorSumsMap.set(s.OP_CODE, {});
            const groups = sectorSumsMap.get(s.OP_CODE);
            const sec = parseInt(s.SETOR_PCS);
            const qty = parseFloat(s.QTY || 0);

            if ([1, 10, 11, 12].includes(sec)) groups.QTY_MOLDADA = (groups.QTY_MOLDADA || 0) + qty;
            else if ([2, 20].includes(sec)) groups.QTY_FUSAO = (groups.QTY_FUSAO || 0) + qty;
            else if ([3, 30, 33, 113].includes(sec)) groups.QTY_ACABAMENTO = (groups.QTY_ACABAMENTO || 0) + qty;
            else if ([4, 7, 8, 9, 31, 40, 61].includes(sec)) groups.QTY_TT = (groups.QTY_TT || 0) + qty;
            else if ([50, 51, 104, 105].includes(sec)) groups.QTY_USINAGEM = (groups.QTY_USINAGEM || 0) + qty;
            else if ([6, 60].includes(sec)) groups.QTY_QUALIDADE = (groups.QTY_QUALIDADE || 0) + qty;
            else if ([100].includes(sec)) groups.QTY_EXPEDICAO = (groups.QTY_EXPEDICAO || 0) + qty;
            else if ([101].includes(sec)) groups.QTY_FATURAMENTO = (groups.QTY_FATURAMENTO || 0) + qty;
        });

        // --- 3.4 ROTEIROS PRODUTO (POSTGRES) ---
        console.log('📥 Lendo roteiros de produção do Postgres...');
        
        // 1. Roteiros por PRODUTO (Fallback)
        const roteirosProdRes = await pgClient.query(`
            SELECT FT.pro_codigo_fic, RT.setor_nome 
            FROM ficha_tecnica FT 
            JOIN roteiros_tecnicos RT ON RT.ficha_id = FT.codigo_fic 
            ORDER BY FT.pro_codigo_fic, RT.sequencia
        `);
        const roteiroProdMap = new Map();
        roteirosProdRes.rows.forEach(r => {
            const current = roteiroProdMap.get(r.pro_codigo_fic) || [];
            current.push(r.setor_nome.trim().toUpperCase());
            roteiroProdMap.set(r.pro_codigo_fic, current);
        });
        
        // 2. Roteiros por OP (Prioridade)
        const roteirosOpRes = await pgClient.query(`
            SELECT pf.op_codigo, rt.setor_nome 
            FROM producao_fichas pf
            JOIN roteiros_tecnicos rt ON rt.ficha_id = pf.ficha_id
            ORDER BY pf.op_codigo, rt.sequencia
        `);
        const roteiroOpMap = new Map();
        roteirosOpRes.rows.forEach(r => {
            const current = roteiroOpMap.get(r.op_codigo) || [];
            current.push(r.setor_nome.trim().toUpperCase());
            roteiroOpMap.set(r.op_codigo, current);
        });

        // --- 4. JOIN IN MEMORY & PREPARE UPSERT ---
        console.log('🔄 Cruzando dados e preparando sincronização...');
        
        // Mapear apontamentos locais do Postgres (fallback)
        let prodDictLocal = {};
        const prodQueryLocal = `
            SELECT op,
                SUM(CASE WHEN setor LIKE '%MOLDAGEM%' THEN quantidade ELSE 0 END) as qty_moldagem,
                SUM(CASE WHEN setor LIKE '%FUSAO%' OR setor LIKE '%FUNDICAO%' THEN quantidade ELSE 0 END) as qty_fusao,
                SUM(CASE WHEN setor LIKE '%ACABAMENTO%' OR setor LIKE '%REBARBA%' THEN quantidade ELSE 0 END) as qty_acabamento,
                SUM(CASE WHEN setor LIKE '%TRATAMENTO%' OR setor LIKE '%NORMALIZA%' OR setor LIKE '%TEMPERA%' OR setor LIKE '%REVENIMENTO%' THEN quantidade ELSE 0 END) as qty_tt,
                SUM(CASE WHEN setor LIKE '%USINAGEM%' THEN quantidade ELSE 0 END) as qty_usinagem,
                SUM(CASE WHEN setor LIKE '%INSPECAO%' OR setor LIKE '%QUALIDADE%' THEN quantidade ELSE 0 END) as qty_qualidade,
                SUM(CASE WHEN setor LIKE '%EXPEDICAO%' THEN quantidade ELSE 0 END) as qty_expedicao,
                SUM(CASE WHEN setor LIKE '%FATURAMENTO%' THEN quantidade ELSE 0 END) as qty_faturamento
            FROM producao_apontada_sincronizada
            WHERE op IS NOT NULL AND op != ''
            GROUP BY op
        `;
        const prodResultLocal = await pgClient.query(prodQueryLocal);
        prodResultLocal.rows.forEach(r => {
            prodDictLocal[String(r.op).trim()] = {
                QTY_MOLDADA: parseFloat(r.qty_moldagem || 0),
                QTY_FUSAO: parseFloat(r.qty_fusao || 0),
                QTY_ACABAMENTO: parseFloat(r.qty_acabamento || 0),
                QTY_TT: parseFloat(r.qty_tt || 0),
                QTY_USINAGEM: parseFloat(r.qty_usinagem || 0),
                QTY_QUALIDADE: parseFloat(r.qty_qualidade || 0),
                QTY_EXPEDICAO: parseFloat(r.qty_expedicao || 0),
                QTY_FATURAMENTO: parseFloat(r.qty_faturamento || 0)
            };
        });

        const fbKeys = new Set();
        const rowsToUpsert = orders.map(row => {
            const key = `${row.EMPRESA_PPR}-${row.ANO_PPR}-${row.CODIGO_PPR}-${row.ITEM_PPR}`;
            fbKeys.add(key);

            const opGroup = opMap.get(key) || { bestOP: {}, allOPs: new Set() };
            const opInfo = opGroup.bestOP;
            
            // AGGREGATE SECTOR QUANTITIES ACROSS ALL OPS LINKED TO THIS PEDIDO-ITEM
            let totalSums = {
                QTY_MOLDADA: 0, QTY_FUSAO: 0, QTY_ACABAMENTO: 0, QTY_TT: 0,
                QTY_USINAGEM: 0, QTY_QUALIDADE: 0, QTY_EXPEDICAO: 0, QTY_FATURAMENTO: 0
            };

            opGroup.allOPs.forEach(opCode => {
                const sums = sectorSumsMap.get(opCode) || {};
                const local = prodDictLocal[String(opCode || '').trim()] || {};

                totalSums.QTY_MOLDADA += Math.max(sums.QTY_MOLDADA || 0, local.QTY_MOLDADA || 0);
                totalSums.QTY_FUSAO += Math.max(sums.QTY_FUSAO || 0, local.QTY_FUSAO || 0);
                totalSums.QTY_ACABAMENTO += Math.max(sums.QTY_ACABAMENTO || 0, local.QTY_ACABAMENTO || 0);
                totalSums.QTY_TT += Math.max(sums.QTY_TT || 0, local.QTY_TT || 0);
                totalSums.QTY_USINAGEM += Math.max(sums.QTY_USINAGEM || 0, local.QTY_USINAGEM || 0);
                totalSums.QTY_QUALIDADE += Math.max(sums.QTY_QUALIDADE || 0, local.QTY_QUALIDADE || 0);
                totalSums.QTY_EXPEDICAO += Math.max(sums.QTY_EXPEDICAO || 0, local.QTY_EXPEDICAO || 0);
                totalSums.QTY_FATURAMENTO += Math.max(sums.QTY_FATURAMENTO || 0, local.QTY_FATURAMENTO || 0);
            });

            const finalRow = {
                ...row,
                ANDAMENTO_PCS: opInfo.NOME_SET || (opInfo.SETOR_PCS ? String(opInfo.SETOR_PCS) : null),
                LOTE_PCS: opInfo.LOTE_PCS,
                OP_PCS: opInfo.OP_CODE,
                OP_QUANTIDADE: opInfo.QUANTIDADE_PCP,
                OP_EMISSAO: opInfo.DATA_PCP,
                OP_ENTREGA: opInfo.ENTREGA_PCP,
                STATUS_PCP: opInfo.STATUS_PCP,
                DATA_CONCLUSAO_PCP: opInfo.DATA_CONCLUSAO_PCP,
                QTY_MOLDADA: totalSums.QTY_MOLDADA,
                QTY_FUSAO: totalSums.QTY_FUSAO,
                QTY_ACABAMENTO: totalSums.QTY_ACABAMENTO,
                QTY_TT: totalSums.QTY_TT,
                QTY_USINAGEM: totalSums.QTY_USINAGEM,
                QTY_QUALIDADE: totalSums.QTY_QUALIDADE,
                QTY_EXPEDICAO: totalSums.QTY_EXPEDICAO,
                QTY_FATURAMENTO: totalSums.QTY_FATURAMENTO,
                ROTEIRO_PRODUCAO: (roteiroOpMap.get(String(opInfo.OP_CODE || '')) || roteiroProdMap.get(String(row.PRODUTO_PPR || '')) || []).join(',')
            };

            return [key, JSON.stringify(finalRow)];
        });

        // --- 5. RECONCILIATION / PRUNING ---
        console.log('🧹 Removendo registros obsoletos (Faturados/Cancelados)...');
        const pgKeysResult = await pgClient.query('SELECT sync_key FROM firebird_sync_pedidos');
        const pgKeys = pgKeysResult.rows.map(r => r.sync_key);
        const keysToDelete = pgKeys.filter(k => !fbKeys.has(k));

        if (keysToDelete.length > 0) {
            console.log(`🗑️ Deletando ${keysToDelete.length} registros...`);
            await pgClient.query('DELETE FROM firebird_sync_pedidos WHERE sync_key = ANY($1)', [keysToDelete]);
        }

        // --- 6. BATCH UPSERT ---
        console.log(`📤 Enviando ${rowsToUpsert.length} registros em lotes...`);
        const BATCH_SIZE = 500;
        for (let i = 0; i < rowsToUpsert.length; i += BATCH_SIZE) {
            const batch = rowsToUpsert.slice(i, i + BATCH_SIZE);
            const keys = batch.map(b => b[0]);
            const data = batch.map(b => b[1]);

            await pgClient.query(`
                INSERT INTO firebird_sync_pedidos (sync_key, data, updated_at)
                SELECT unnest($1::text[]), unnest($2::jsonb[]), NOW()
                ON CONFLICT (sync_key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;
            `, [keys, data]);
            const pct = ((Math.min(i + BATCH_SIZE, rowsToUpsert.length) / rowsToUpsert.length) * 100).toFixed(0);
            process.stdout.write(`@PROG:PEDIDOS:${pct}%\n`);
        }

        console.log(`\n\n✅ Sincronização CONCLUÍDA em ${((Date.now() - startTime)/1000).toFixed(1)}s!`);
        
        // 7. ATUALIZAR STATUS
        await pgClient.query("SET TIME ZONE 'America/Sao_Paulo'");
        await pgClient.query(`
            INSERT INTO sync_status (screen_name, last_sync_at)
            VALUES ('Pedidos', NOW())
            ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
        `);

    } catch (err) {
        console.error('❌ ERRO NA SINCRONIZAÇÃO:', err);
    } finally {
        if (db) db.detach();
        pgClient.release();
        process.exit(0);
    }
}

syncData();
