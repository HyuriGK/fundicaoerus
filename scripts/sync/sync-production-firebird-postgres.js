const path = require('path');
const fs = require('fs');

const { Firebird, options: fbOptions } = require('../../lib/firebird-helper');
const pool = require('../../lib/db');

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

        // OTIMIZAÇÃO: Sincronização Incremental (Janela de 90 dias)
        // Em vez de buscar dados de 2025 inteiros toda vez, buscamos apenas os últimos 90 dias.
        // Isso cobre OPs em aberto e correções recentes com muito mais agilidade.
        let startDateObj = new Date();
        startDateObj.setDate(startDateObj.getDate() - 105);
        let startDate = startDateObj.toISOString().split('T')[0];

        console.log(`📅 Janela de Sincronização: ${startDate} até hoje (105 dias).`);

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
            END $$;
        `);

        // Widen liga column if needed (was VARCHAR(50), now VARCHAR(255))
        await pool.query(`ALTER TABLE producao_apontada_sincronizada ALTER COLUMN liga TYPE VARCHAR(255)`);

        await pool.query('TRUNCATE TABLE producao_apontada_sincronizada');
        console.log('🧹 Tabela truncada.');

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
                    LOTE_PCS,
                    SETOR_PCS
                FROM PRODUCAO_SETOR
                WHERE DATA_PCS >= '${startDate}' AND DATA_PCS <= '2026-12-31'
                ORDER BY DATA_PCS DESC
            `;

            db.query(queryPCS, async (err, productionRows) => {
                if (err) {
                    console.error('❌ Query PCS Error:', err);
                    db.detach();
                    return;
                }
                console.log(`📦 Production records (PCS) fetched: ${productionRows.length}`);

                if (productionRows.length === 0) {
                    console.log('No production records found.');
                    db.detach();
                    process.exit(0);
                }

                // 2. Collect IDs (Only Setor ID needed for name lookup)
                const setIds = [...new Set(productionRows.map(p => p.SETOR_PCS).filter(id => id))];
                console.log(`ℹ️ Unique IDs - SET: ${setIds.length}`);

                // 3. Fetch Lookup Data
                const lookupSET = {};

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
                        await fetchMap(opIds, 'PRODUCAO', 'CODIGO_PCP', 'PRODUTO_PCP', lookupPRODUCAO);
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
                        await fetchMap(matIds, 'MATERIAL', 'ID_MAT', 'MATERIAL_MAT', lookupMATERIAL);
                        console.log(`ℹ️ Lookup MATERIAL size: ${Object.keys(lookupMATERIAL).length}`);
                    }

                    // Attach lookups to main scope for the loop
                    let ligaCount = 0;
                    productionRows.forEach(row => {
                        row._producao = lookupPRODUCAO[row.CODIGO_PCS];
                        row._produto = row._producao ? lookupPRODUTO[row._producao.PRODUTO_PCP] : null;
                        // Resolve material name now (while lookups are in scope)
                        if (row._produto && row._produto.CODIGO_PRO) {
                            const pm = lookupPRODUTO_MATERIAL[row._produto.CODIGO_PRO];
                            if (pm && pm.MAT_ID_PMT) {
                                const mat = lookupMATERIAL[pm.MAT_ID_PMT];
                                if (mat && mat.MATERIAL_MAT) {
                                    row._materialName = mat.MATERIAL_MAT.trim();
                                    ligaCount++;
                                }
                            }
                        }
                    });
                    console.log(`ℹ️ Rows with Liga/Material: ${ligaCount} / ${productionRows.length}`);

                } catch (fetchErr) {
                    console.error('❌ Error fetching lookups:', fetchErr);
                    db.detach();
                    return;
                }

                console.log('✅ Lookups fetched. Syncing to Postgres...');


                // 4. Transform & Insert
                let inserted = 0;
                let errors = 0;

                const insertChunks = chunkArray(productionRows, 100); // Process 100 rows in parallel
                console.log(`🚀 Inserting ${productionRows.length} rows (Chunks of 100)...`);

                for (const chunk of insertChunks) {
                    const promises = chunk.map(async (pcs) => {
                        try {
                            const set = lookupSET[pcs.SETOR_PCS] || {};

                            const dataProd = parseDate(pcs.DATA_PCS);
                            if (!dataProd || isNaN(dataProd.getTime())) return;

                            const chaveOrigem = `PCS-${pcs.ID_PCS}`;
                            const setor = cleanString(set.NOME_SET) || 'DESCONHECIDO';

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
                            const quantidade = parseFloat(pcs.QUANTIDADE_PCS || 0);
                            const codigoPeca = produtoCode;
                            const pesoTotal = quantidade * produtoWeight;
                            const pesoUn = produtoWeight;
                            const produto = produtoName;

                            const liga = pcs._materialName || null;

                            await pool.query(`
                                INSERT INTO producao_apontada_sincronizada 
                                (chave_origem, data_producao, setor, produto, liga, peso_un, quantidade, peso_total, op, codigo_peca, atualizado_em)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
                                ON CONFLICT (chave_origem) DO UPDATE SET
                                    data_producao = EXCLUDED.data_producao,
                                    setor = EXCLUDED.setor,
                                    produto = EXCLUDED.produto,
                                    liga = EXCLUDED.liga,
                                    peso_un = EXCLUDED.peso_un,
                                    quantidade = EXCLUDED.quantidade,
                                    peso_total = EXCLUDED.peso_total,
                                    op = EXCLUDED.op,
                                    codigo_peca = EXCLUDED.codigo_peca,
                                    atualizado_em = CURRENT_TIMESTAMP
                            `, [chaveOrigem, dataProd, setor, produto, liga, pesoUn, quantidade, pesoTotal, op, codigoPeca]);

                            inserted++;
                        } catch (rowErr) {
                            console.error('Row Error:', rowErr);
                            errors++;
                        }
                    });

                    await Promise.all(promises);
                    if (inserted % 100 === 0 || inserted === productionRows.length) {
                        const pct = ((inserted / productionRows.length) * 100).toFixed(0);
                        process.stdout.write(`@PROG:PRODUÇÃO:${pct}%\n`);
                    }
                }

                console.log(`\n✅ Sync Loop Complete.`);
                console.log(`   Processed: ${inserted}`);
                console.log(`   Errors: ${errors}`);

                // MARK & SWEEP: Limpar registros "fantasma" (estornados/excluídos do ERP)
                // Deleta registros dentro da janela de sync que NÃO foram atualizados nesta rodada
                try {
                    const sweepResult = await pool.query(
                        `DELETE FROM producao_apontada_sincronizada 
                         WHERE data_producao >= $1 
                           AND atualizado_em < $2`,
                        [startDate, syncStartTime]
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
                    await pool.query("SET TIME ZONE 'America/Sao_Paulo'");
                    await pool.query(`
                        INSERT INTO sync_status (screen_name, last_sync_at)
                        VALUES ('Produção', NOW())
                        ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
                    `);
                    console.log('📊 Status de sincronização atualizado para: Produção');
                } catch (statusErr) {
                    console.error('⚠️ Erro ao atualizar status de sincronização:', statusErr.message);
                }

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