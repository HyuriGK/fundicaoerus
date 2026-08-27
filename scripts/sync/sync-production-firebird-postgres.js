const path = require('path');
const fs = require('fs');

const { Firebird, options: fbOptions } = require('../../lib/firebird-helper');
const pool = require('../../lib/db');

function failSync(error) {
    console.error('❌ Falha controlada no sync de Produção:', error?.message || error);
    process.exit(1);
}

process.once('unhandledRejection', failSync);
process.once('uncaughtException', failSync);

// --- Helper Functions ---
function cleanString(str) {
    if (!str) return null;
    return str.trim();
}

function parseDate(dateVal) {
    if (!dateVal) return null;
    if (dateVal instanceof Date) return dateVal;
    return new Date(dateVal);
}

function formatSqlDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function chunkArray(myArray, chunk_size) {
    var index = 0;
    var arrayLength = myArray.length;
    var tempArray = [];

    for (index = 0; index < arrayLength; index += chunk_size) {
        myChunk = myArray.slice(index, index + chunk_size);
        tempArray.push(myChunk);
    }
    return tempArray;
}

// --- Main Execution ---
(async () => {
    try {
        const syncStartTime = new Date(); // Capture start time for Mark & Sweep
        console.log(`🕒 Sync Start Time: ${syncStartTime.toISOString()}`);

        console.log('🔗 Connecting to Postgres...');
        await pool.query('SELECT NOW()');

        // 1. Prepare Postgres (Create Table & Indexes)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS producao_apontada_sincronizada (
                id SERIAL PRIMARY KEY,
                chave_origem VARCHAR(255) UNIQUE NOT NULL,
                data_producao TIMESTAMP NOT NULL,
                setor VARCHAR(100),
                cliente VARCHAR(255),
                produto VARCHAR(255),
                liga VARCHAR(255),
                op VARCHAR(50),
                codigo_peca VARCHAR(50),
                peso_un NUMERIC(10,4),
                quantidade NUMERIC(10,2),
                peso_total NUMERIC(10,2),
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_producao_data ON producao_apontada_sincronizada(data_producao);
            CREATE INDEX IF NOT EXISTS idx_producao_setor ON producao_apontada_sincronizada(setor);
        `);
        console.log('✅ Postgres ready.');

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = new Date(today);
        start.setDate(start.getDate() - 60);
        const minimumStart = new Date('2025-01-01T00:00:00');
        if (start < minimumStart) start.setTime(minimumStart.getTime());
        const end = new Date(today);
        end.setDate(end.getDate() + 1);
        const startDate = formatSqlDate(start);
        const endDate = formatSqlDate(end);

        console.log(`📅 Janela de Sincronização: ${startDate} até ${endDate} (60 dias).`);

        // Add columns if they don't exist (migration for existing table)
        await pool.query(`
            DO $$ 
            BEGIN 
                BEGIN
                    ALTER TABLE producao_apontada_sincronizada ADD COLUMN op VARCHAR(50);
                EXCEPTION
                    WHEN duplicate_column THEN RAISE NOTICE 'column op already exists in producao_apontada_sincronizada.';
                END;
                BEGIN
                    ALTER TABLE producao_apontada_sincronizada ADD COLUMN codigo_peca VARCHAR(50);
                EXCEPTION
                    WHEN duplicate_column THEN RAISE NOTICE 'column codigo_peca already exists in producao_apontada_sincronizada.';
                END;
                BEGIN
                    ALTER TABLE producao_apontada_sincronizada ADD COLUMN refugo NUMERIC(10,2) DEFAULT 0;
                EXCEPTION
                    WHEN duplicate_column THEN RAISE NOTICE 'column refugo already exists in producao_apontada_sincronizada.';
                END;
                BEGIN
                    ALTER TABLE producao_apontada_sincronizada ADD COLUMN grupo_material VARCHAR(100);
                EXCEPTION
                    WHEN duplicate_column THEN RAISE NOTICE 'column grupo_material already exists in producao_apontada_sincronizada.';
                END;
                BEGIN
                    ALTER TABLE producao_apontada_sincronizada ADD COLUMN cliente VARCHAR(255);
                EXCEPTION
                    WHEN duplicate_column THEN RAISE NOTICE 'column cliente already exists in producao_apontada_sincronizada.';
                END;
            END $$;
        `);

        // Widen liga column if needed (was VARCHAR(50), now VARCHAR(255))
        await pool.query(`ALTER TABLE producao_apontada_sincronizada ALTER COLUMN liga TYPE VARCHAR(255)`);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS producao_apontada_sincronizada_staging
            (LIKE producao_apontada_sincronizada INCLUDING DEFAULTS);
            ALTER TABLE producao_apontada_sincronizada_staging ADD COLUMN IF NOT EXISTS refugo NUMERIC(10,2) DEFAULT 0;
            ALTER TABLE producao_apontada_sincronizada_staging ADD COLUMN IF NOT EXISTS grupo_material VARCHAR(100);
            ALTER TABLE producao_apontada_sincronizada_staging ALTER COLUMN liga TYPE VARCHAR(255);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_producao_staging_chave ON producao_apontada_sincronizada_staging(chave_origem);
        `);

        Firebird.attach(fbOptions, function (err, db) {
            if (err) {
                console.error('❌ Firebird Connection Error:', err);
                process.exit(1);
            }
            console.log(`✅ Firebird attached. Fetching Movements starting from ${startDate}...`);

            // 1. Fetch PRODUCAO_SETOR (Base Table as per user request)
            // User restriction: "se baseie em PRODUCAO_SETOR SOMENTE COM AS COLUNAS QUE EU TE MANDEI"
            // Columns: CODIGO_PCS, DATA_PCS, QUANTIDADE_PCS, LOTE_PCS, SETOR_PCS
            const queryPCS = `
                SELECT
                    ID_PCS,
                    CODIGO_PCS,
                    DATA_PCS,
                    QUANTIDADE_PCS,
                    DQUANTIDADE_REFUGO_PCS,
                    LOTE_PCS,
                    SETOR_PCS
                FROM PRODUCAO_SETOR
                WHERE EMPRESA_PCS = 10
                  AND DATA_PCS >= '${startDate}'
                  AND DATA_PCS < '${endDate}'
                ORDER BY DATA_PCS DESC
            `;

            db.query(queryPCS, async (err, productionRows) => {
                if (err) {
                    console.error('❌ Query PCS Error:', err);
                    db.detach();
                    return;
                }
                console.log(`📦 Production records (PCS) fetched: ${productionRows.length}`);

                // 2. Collect IDs (Only Setor ID needed for name lookup)
                const setIds = [...new Set(productionRows.map(p => p.SETOR_PCS).filter(id => id))];
                console.log(`ℹ️ Unique IDs - SET: ${setIds.length}`);

                // 3. Fetch Lookup Data
                const lookupSET = {};
                const lookupCLIENTE = {};

                // Helper to fetch and map
                // Helper to fetch and map (Sequential to avoid Firebird congestion)
                const fetchMap = async (ids, table, pk, cols, targetMap) => {
                    if (ids.length === 0) return;
                    const chunks = chunkArray(ids, 200); // Smaller chunks
                    console.log(`       fetching ${table} in ${chunks.length} chunks...`);

                    for (const chunk of chunks) {
                        const idList = chunk.join(',');
                        const q = `SELECT ${pk}, ${cols} FROM ${table} WHERE ${pk} IN (${idList})`;

                        await new Promise((resolve, reject) => {
                            db.query(q, (err, rows) => {
                                if (err) return reject(err);
                                rows.forEach(r => { targetMap[r[pk]] = r; });
                                resolve();
                            });
                        });
                    }
                };

                try {
                    // 3.1 Fetch SETOR names (com deduplicação inteligente por nome prioritário)
                    if (setIds.length > 0) {
                        const chunks = chunkArray(setIds, 200);
                        console.log(`       fetching SETOR in ${chunks.length} chunks (deduplicated)...`);
                        
                        // Nomes prioritários (os nomes "corretos" dos setores de produção)
                        const priorityNames = ['MOLDAGEM', 'FUSAO', 'FUSÃO', 'ACABAMENTO', 'USINAGEM', 'INSPECAO', 'INSPEÇÃO', 'QUALIDADE'];
                        
                        for (const chunk of chunks) {
                            const idList = chunk.join(',');
                            const q = `SELECT CODIGO_SET, NOME_SET FROM SETOR WHERE CODIGO_SET IN (${idList})`;
                            await new Promise((resolve, reject) => {
                                db.query(q, (err, rows) => {
                                    if (err) return reject(err);
                                    rows.forEach(r => {
                                        const name = (r.NOME_SET || '').trim().toUpperCase();
                                        const existing = lookupSET[r.CODIGO_SET];
                                        
                                        if (!existing) {
                                            // Primeiro nome encontrado
                                            lookupSET[r.CODIGO_SET] = r;
                                        } else {
                                            // Já tem um nome — verificar se o novo é melhor
                                            const existingName = (existing.NOME_SET || '').trim().toUpperCase();
                                            const existingBad = existingName.startsWith('NAO USAR') || existingName.startsWith('NÃO USAR');
                                            const newBad = name.startsWith('NAO USAR') || name.startsWith('NÃO USAR');
                                            
                                            if (existingBad && !newBad) {
                                                // Substituir nome ruim pelo bom
                                                lookupSET[r.CODIGO_SET] = r;
                                            } else if (!existingBad && !newBad) {
                                                // Ambos são válidos — priorizar nomes conhecidos
                                                const existingPriority = priorityNames.some(p => existingName.includes(p));
                                                const newPriority = priorityNames.some(p => name.includes(p));
                                                if (!existingPriority && newPriority) {
                                                    lookupSET[r.CODIGO_SET] = r;
                                                }
                                            }
                                        }
                                    });
                                    resolve();
                                });
                            });
                        }
                    }

                    // 3.2 Fetch PRODUCAO (OP Details) to get Product ID
                    // CODIGO_PCS in PRODUCAO_SETOR maps to CODIGO_PCP in PRODUCAO
                    const opIds = [...new Set(productionRows.map(p => p.CODIGO_PCS).filter(id => id))];
                    const lookupPRODUCAO = {};
                    console.log(`ℹ️ Unique IDs - OP: ${opIds.length}`);

                    if (opIds.length > 0) {
                        await fetchMap(opIds, 'PRODUCAO', 'CODIGO_PCP', 'PRODUTO_PCP, EMPRESA_PCP', lookupPRODUCAO);
                    }

                    // 3.3 Fetch PRODUTO (Product Details) using Product IDs from PRODUCAO
                    // PRODUTO_PCP in PRODUCAO maps to CODIGO_PRO in PRODUTO
                    const productIds = [...new Set(Object.values(lookupPRODUCAO).map(p => p.PRODUTO_PCP).filter(id => id))];
                    const lookupPRODUTO = {};
                    console.log(`ℹ️ Unique IDs - PRO: ${productIds.length}`);

                    if (productIds.length > 0) {
                        await fetchMap(productIds, 'PRODUTO', 'CODIGO_PRO', 'NOME_PRO, REFERENCIA_PRO, PESO_LIQUIDO_PRO', lookupPRODUTO);
                    }

                    // 3.4 Fetch PRODUTO_MATERIAL (Product -> Material link)
                    const lookupPRODUTO_MATERIAL = {};
                    console.log(`ℹ️ Fetching PRODUTO_MATERIAL...`);

                    if (productIds.length > 0) {
                        await fetchMap(productIds, 'PRODUTO_MATERIAL', 'PRODUTO_PMT', 'MAT_ID_PMT', lookupPRODUTO_MATERIAL);
                        console.log(`ℹ️ Lookup PRODUTO_MATERIAL size: ${Object.keys(lookupPRODUTO_MATERIAL).length}`);
                    }

                    // 3.5 Fetch MATERIAL (Material details)
                    const matIds = [...new Set(Object.values(lookupPRODUTO_MATERIAL).map(pm => pm.MAT_ID_PMT).filter(id => id))];
                    const lookupMATERIAL = {};
                    console.log(`ℹ️ Unique Material IDs: ${matIds.length}`);

                    if (matIds.length > 0) {
                        await fetchMap(matIds, 'MATERIAL', 'ID_MAT', 'MATERIAL_MAT, GRUPO_MAT', lookupMATERIAL);
                        console.log(`ℹ️ Lookup MATERIAL size: ${Object.keys(lookupMATERIAL).length}`);
                    }

                    if (opIds.length > 0) {
                        const chunks = chunkArray(opIds, 200);
                        console.log(`       fetching CLIENTE por OP in ${chunks.length} chunks...`);

                        for (const chunk of chunks) {
                            const idList = chunk.join(',');
                            const q = `
                                SELECT
                                    PP.PCP_CODIGO_PCPR,
                                    PP.PCP_EMPRESA_PCPR,
                                    C.RAZAO_SOCIAL_CLI
                                FROM PRODUCAO_PEDIDO PP
                                JOIN PEDIDO D
                                  ON D.CODIGO_PED = PP.PPR_CODIGO_PCPR
                                 AND D.ANO_PED = PP.PPR_ANO_PCPR
                                 AND D.EMPRESA_PED = PP.PPR_EMPRESA_PCPR
                                JOIN CLIENTE C
                                  ON C.CODIGO_CLI = D.CLIENTE_PED
                                 AND C.EMPRESA_CLI = D.CLI_EMPRESA_PED
                                WHERE PP.PCP_CODIGO_PCPR IN (${idList})
                            `;

                            await new Promise((resolve, reject) => {
                                db.query(q, (err, rows) => {
                                    if (err) return reject(err);
                                    rows.forEach(r => {
                                        const op = r.PCP_CODIGO_PCPR ? String(r.PCP_CODIGO_PCPR).trim() : '';
                                        const empresa = r.PCP_EMPRESA_PCPR ? String(r.PCP_EMPRESA_PCPR).trim() : '';
                                        const cliente = cleanString(r.RAZAO_SOCIAL_CLI);
                                        if (!op || !cliente) return;
                                        if (empresa) lookupCLIENTE[`${op}-${empresa}`] = cliente;
                                        if (!lookupCLIENTE[op]) lookupCLIENTE[op] = cliente;
                                    });
                                    resolve();
                                });
                            });
                        }
                    }

                    // 3.6 Fetch ALL Materials for fallback mapping (Each Liga must have its Group)
                    const fallbackMaterialMap = {};
                    console.log(`ℹ️ Fetching full MATERIAL table for fallback mapping...`);
                    await new Promise((resolve, reject) => {
                        db.query('SELECT MATERIAL_MAT, GRUPO_MAT FROM MATERIAL', (err, rows) => {
                            if (err) return reject(err);
                            rows.forEach(r => {
                                const name = (r.MATERIAL_MAT || '').trim().toUpperCase();
                                const group = (r.GRUPO_MAT || '').trim();
                                if (name && group) fallbackMaterialMap[name] = group;
                            });
                            resolve();
                        });
                    });
                    console.log(`ℹ️ Fallback MATERIAL map size: ${Object.keys(fallbackMaterialMap).length}`);

                    // Attach lookups to main scope for the loop
                    let ligaCount = 0;
                    let grupoCount = 0;
                    productionRows.forEach((row, idx) => {
                        const opKey = row.CODIGO_PCS;
                        row._producao = lookupPRODUCAO[opKey];
                        
                        if (row._producao) {
                            const prodKey = row._producao.PRODUTO_PCP;
                            row._produto = lookupPRODUTO[prodKey];
                            
                            // 1. Tentar resolver via vínculo oficial (PRODUTO -> MATERIAL)
                            if (row._produto) {
                                const pm = lookupPRODUTO_MATERIAL[prodKey];
                                if (pm && pm.MAT_ID_PMT) {
                                    const mat = lookupMATERIAL[pm.MAT_ID_PMT];
                                    if (mat) {
                                        row._materialName = mat.MATERIAL_MAT ? mat.MATERIAL_MAT.trim() : null;
                                        row._grupoMaterial = mat.GRUPO_MAT ? mat.GRUPO_MAT.trim() : null;
                                    }
                                }
                            }
                        }

                        // 2. Fallback: Se não tem grupo mas tem nome de liga, usar o mapa global
                        if (row._materialName && !row._grupoMaterial) {
                            const upperName = row._materialName.toUpperCase();
                            if (fallbackMaterialMap[upperName]) {
                                row._grupoMaterial = fallbackMaterialMap[upperName];
                            }
                        }
                        
                        if (row._materialName) ligaCount++;
                        if (row._grupoMaterial) grupoCount++;
                    });
                    console.log(`ℹ️ Ligas resolvidas: ${ligaCount}, Grupos resolvidos: ${grupoCount}`);
                    console.log(`ℹ️ Rows with Liga/Material: ${ligaCount} / ${productionRows.length}`);

                } catch (fetchErr) {
                    console.error('❌ Error fetching lookups:', fetchErr);
                    db.detach();
                    return;
                }

                console.log('✅ Lookups fetched. Syncing to Postgres...');


                const stagingClient = await pool.connect();
                await stagingClient.query('BEGIN');
                await stagingClient.query('TRUNCATE producao_apontada_sincronizada_staging');
                // Recarrega somente a janela movel, preservando o historico anterior.
                console.log('🧹 Nova carga preparada para publicação.');

                // 4. Transform & Insert
                let inserted = 0;
                let errors = 0;
                const snapshotTotals = {
                    'MOLDAGEM GERAL': 0, 'FUSAO': 0, 'ACABAMENTO': 0, 'TRATAMENTO TERMICO': 0,
                    'USINAGEM EXPEDICAO': 0, 'INSPECAO DE QUALIDADE': 0, 'EXPEDICAO': 0,
                    'MOLDAGEM LEVE': 0, 'MOLDAGEM MANUAL': 0, 'MOLDAGEM PESADA': 0, 'FECHAMENTO MANUAL': 0
                };
                const snapshotMonth = new Date();
                const snapshotMonthKey = `${snapshotMonth.getFullYear()}-${String(snapshotMonth.getMonth() + 1).padStart(2, '0')}`;
                const normalizeSnapshotSector = (value) => {
                    const setor = String(value || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    return setor === 'FUNDICAO' ? 'FUSAO'
                        : setor === 'TT' ? 'TRATAMENTO TERMICO'
                        : setor === 'QUALIDADE' ? 'INSPECAO DE QUALIDADE'
                        : setor === 'USINAGEM' || setor === '50' ? 'USINAGEM EXPEDICAO'
                        : setor === 'REBARBACAO' ? 'ACABAMENTO' : setor;
                };

                const insertChunks = chunkArray(productionRows, 100); // Process 100 rows in parallel
                console.log(`🚀 Inserting ${productionRows.length} rows (Chunks of 100)...`);

                for (const chunk of insertChunks) {
                    for (const pcs of chunk) {
                        try {
                            const set = lookupSET[pcs.SETOR_PCS] || {};

                            const dataProd = parseDate(pcs.DATA_PCS);
                            if (!dataProd || isNaN(dataProd.getTime())) return;

                            const chaveOrigem = `PCS-${pcs.ID_PCS}`;
                            const setor = Number(pcs.SETOR_PCS) === 116 ? 'FECHAMENTO MANUAL' : (cleanString(set.NOME_SET) || 'DESCONHECIDO');

                            // Product Details from Joined Tables
                            let produtoName = 'PRODUTO INDEFINIDO';
                            let produtoCode = null; // Part Code (Referencia)
                            let produtoWeight = 0;

                            if (pcs._produto) {
                                produtoName = cleanString(pcs._produto.NOME_PRO) || produtoName;
                                const rawCode = pcs._produto.CODIGO_PRO;
                                produtoCode = rawCode ? cleanString(String(rawCode)) : null;
                                produtoWeight = parseFloat(pcs._produto.PESO_LIQUIDO_PRO || 0);
                            }

                            // Mapped Fields:
                            const op = pcs.CODIGO_PCS ? String(pcs.CODIGO_PCS) : null;
                            const empresaPcp = pcs._producao && pcs._producao.EMPRESA_PCP ? String(pcs._producao.EMPRESA_PCP).trim() : '';
                            const cliente = cleanString((op && empresaPcp ? lookupCLIENTE[`${op}-${empresaPcp}`] : null) || (op ? lookupCLIENTE[op] : null));
                            const quantidade = parseFloat(pcs.QUANTIDADE_PCS || 0);
                            const refugo = parseFloat(pcs.DQUANTIDADE_REFUGO_PCS || 0);
                            const codigoPeca = produtoCode;
                            const pesoTotal = quantidade * produtoWeight;
                            const pesoUn = produtoWeight;
                            const produto = produtoName;
                            const liga = pcs._materialName || null;
                            const grupoMaterial = pcs._grupoMaterial || null;

                            await stagingClient.query(`
                                INSERT INTO producao_apontada_sincronizada_staging
                                (chave_origem, data_producao, setor, cliente, produto, liga, grupo_material, peso_un, quantidade, refugo, peso_total, op, codigo_peca, atualizado_em)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
                                ON CONFLICT (chave_origem) DO UPDATE SET
                                    data_producao = EXCLUDED.data_producao,
                                    setor = EXCLUDED.setor,
                                    cliente = EXCLUDED.cliente,
                                    produto = EXCLUDED.produto,
                                    liga = EXCLUDED.liga,
                                    grupo_material = EXCLUDED.grupo_material,
                                    peso_un = EXCLUDED.peso_un,
                                    quantidade = EXCLUDED.quantidade,
                                    refugo = EXCLUDED.refugo,
                                    peso_total = EXCLUDED.peso_total,
                                    op = EXCLUDED.op,
                                    codigo_peca = EXCLUDED.codigo_peca,
                                    atualizado_em = CURRENT_TIMESTAMP
                            `, [chaveOrigem, dataProd, setor, cliente, produto, liga, grupoMaterial, pesoUn, quantidade, refugo, pesoTotal, op, codigoPeca]);

                            inserted++;
                            if (dataProd.toISOString().slice(0, 7) === snapshotMonthKey && !['18358', '801032102'].includes(String(codigoPeca || '').trim())) {
                                const snapshotSector = normalizeSnapshotSector(setor);
                                if (['MOLDAGEM LEVE', 'MOLDAGEM MANUAL', 'MOLDAGEM PESADA'].includes(snapshotSector)) {
                                    snapshotTotals[snapshotSector] += pesoTotal;
                                    snapshotTotals['MOLDAGEM GERAL'] += pesoTotal;
                                } else if (Object.prototype.hasOwnProperty.call(snapshotTotals, snapshotSector)) {
                                    snapshotTotals[snapshotSector] += pesoTotal;
                                }
                            }
                        } catch (rowErr) {
                            console.error('Row Error:', rowErr);
                            errors++;
                        }
                    }
                    if (inserted % 100 === 0 || inserted === productionRows.length) {
                        const pct = ((inserted / productionRows.length) * 100).toFixed(0);
                        process.stdout.write(`@PROG:PRODUÇÃO:${pct}%\n`);
                    }
                }

                console.log(`\n✅ Sync Loop Complete.`);
                console.log(`   Processed: ${inserted}`);
                console.log(`   Errors: ${errors}`);

                if (errors > 0) {
                    await stagingClient.query('ROLLBACK');
                    stagingClient.release();
                    console.error('❌ Carga cancelada: nenhum dado parcial foi publicado.');
                    db.detach();
                    await pool.end();
                    process.exit(1);
                }

                await stagingClient.query('COMMIT');
                stagingClient.release();

                const publishClient = await pool.connect();
                await publishClient.query('BEGIN');
                await publishClient.query(`
                    DELETE FROM producao_apontada_sincronizada
                    WHERE data_producao >= $1
                      AND data_producao < $2
                `, [startDate, endDate]);
                await publishClient.query(`
                    INSERT INTO producao_apontada_sincronizada
                    (chave_origem, data_producao, setor, cliente, produto, liga, grupo_material, peso_un, quantidade, refugo, peso_total, op, codigo_peca, atualizado_em)
                    SELECT chave_origem, data_producao, setor, cliente, produto, liga, grupo_material, peso_un, quantidade, refugo, peso_total, op, codigo_peca, atualizado_em
                    FROM producao_apontada_sincronizada_staging
                `);

                // MARK & SWEEP: Limpar registros "fantasma" (estornados/excluídos do ERP)
                // Deleta registros dentro da janela de sync que NÃO foram atualizados nesta rodada
                try {
                    const sweepResult = await publishClient.query(
                        `DELETE FROM producao_apontada_sincronizada 
                         WHERE data_producao >= $1
                           AND data_producao < $2
                           AND atualizado_em < $3`,
                        [startDate, endDate, syncStartTime]
                    );
                    const swept = sweepResult.rowCount || 0;
                    if (swept > 0) {
                        console.log(`🧹 Mark & Sweep: ${swept} registros fantasma removidos (estornados do ERP).`);
                    } else {
                        console.log(`🧹 Mark & Sweep: Nenhum registro fantasma encontrado.`);
                    }
                } catch (sweepErr) {
                    console.error('⚠️ Erro no Mark & Sweep:', sweepErr.message);
                }

                // ATUALIZAR STATUS DE SINCRONIZAÇÃO
                try {
                    const snapshotWeightsResult = await publishClient.query(`
                        SELECT
                            UPPER(TRIM(t.setor)) AS setor,
                            COALESCE(SUM(
                                t.quantidade * COALESCE(NULLIF(t.peso_un, 0), pc.peso, p.peso, 0)
                            ), 0) AS peso_total
                        FROM producao_apontada_sincronizada t
                        LEFT JOIN pesos_customizados pc ON t.codigo_peca = pc.codigo
                        LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
                        WHERE t.data_producao >= date_trunc('month', CURRENT_DATE)
                          AND t.data_producao < date_trunc('month', CURRENT_DATE) + interval '1 month'
                          AND TRIM(t.codigo_peca) NOT IN ('18358', '801032102')
                        GROUP BY 1
                    `);
                    Object.keys(snapshotTotals).forEach(key => { snapshotTotals[key] = 0; });
                    snapshotWeightsResult.rows.forEach(row => {
                        const setor = String(row.setor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                        const normalizado = setor === 'FUNDICAO' ? 'FUSAO'
                            : setor === 'TT' ? 'TRATAMENTO TERMICO'
                            : setor === 'QUALIDADE' ? 'INSPECAO DE QUALIDADE'
                            : setor === 'USINAGEM' ? 'USINAGEM EXPEDICAO'
                            : setor === 'REBARBACAO' ? 'ACABAMENTO' : setor;
                        const peso = Number(row.peso_total) || 0;
                        if (['MOLDAGEM LEVE', 'MOLDAGEM MANUAL', 'MOLDAGEM PESADA'].includes(normalizado)) {
                            snapshotTotals[normalizado] += peso;
                            snapshotTotals['MOLDAGEM GERAL'] += peso;
                        } else if (Object.prototype.hasOwnProperty.call(snapshotTotals, normalizado)) {
                            snapshotTotals[normalizado] += peso;
                        }
                    });
                    await publishClient.query(`
                        CREATE TABLE IF NOT EXISTS dashboard_snapshots (
                            snapshot_key TEXT PRIMARY KEY,
                            payload JSONB NOT NULL,
                            source_status JSONB NOT NULL DEFAULT '{}'::jsonb,
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        )
                    `);
                    await publishClient.query(`
                        INSERT INTO dashboard_snapshots (snapshot_key, payload, source_status, updated_at)
                        VALUES ('producao_setores', $1, '{}'::jsonb, NOW())
                        ON CONFLICT (snapshot_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
                    `, [JSON.stringify({ monthKey: snapshotMonthKey, totals: snapshotTotals })]);
                    const monthlyProductionResult = await publishClient.query(`
                        SELECT
                            TO_CHAR(t.data_producao, 'YYYY-MM') AS month_key,
                            COALESCE(SUM(t.quantidade * COALESCE(NULLIF(t.peso_un, 0), pc.peso, p.peso, 0)), 0) AS total
                        FROM producao_apontada_sincronizada t
                        LEFT JOIN pesos_customizados pc ON pc.codigo = t.codigo_peca
                        LEFT JOIN produto_pesos_producao p ON p.codigo_peca = t.codigo_peca
                        WHERE UPPER(TRIM(COALESCE(setor, ''))) IN ('FUSAO', 'FUSÃO', 'FUNDICAO', 'FUNDIÇÃO')
                          AND COALESCE(t.codigo_peca, '') NOT IN ('18358', '801032102')
                        GROUP BY TO_CHAR(t.data_producao, 'YYYY-MM')
                    `);
                    const fullMonthlyProduction = {};
                    monthlyProductionResult.rows.forEach(row => {
                        fullMonthlyProduction[row.month_key] = Number(row.total) || 0;
                    });
                    await publishClient.query(`
                        INSERT INTO dashboard_snapshots (snapshot_key, payload, source_status, updated_at)
                        VALUES ('producao_mensal', $1, '{}'::jsonb, NOW())
                        ON CONFLICT (snapshot_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
                    `, [JSON.stringify({ monthlyProduction: fullMonthlyProduction })]);
                    await publishClient.query("SET TIME ZONE 'America/Sao_Paulo'");
                    await publishClient.query(`
                        INSERT INTO sync_status (screen_name, last_sync_at)
                        VALUES ('Produção', NOW())
                        ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
                    `);
                    console.log('📊 Status de sincronização atualizado para: Produção');
                } catch (statusErr) {
                    console.error('⚠️ Erro ao atualizar status de sincronização:', statusErr.message);
                }

                await publishClient.query('COMMIT');
                publishClient.release();
                console.log('✅ Carga publicada atomicamente.');
                db.detach();
                await pool.end();
                process.exit(0);
            });
        });

    } catch (err) {
        console.error('❌ Critical Error:', err);
        process.exit(1);
    }
})();
