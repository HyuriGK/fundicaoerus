// scripts/sync-production-firebird-postgres.js
require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');
const pool = require('../lib/db');

// --- Firebird Configuration ---
const fbOptions = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

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

        // 1. Prepare Postgres (Create Table & Indexes) - REMOVED TRUNCATE
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

        // console.log('🧹 Clearing existing data...');
        // await pool.query('TRUNCATE TABLE producao_apontada_sincronizada');
        // console.log('✅ Table cleared.');

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

        Firebird.attach(fbOptions, function (err, db) {
            if (err) {
                console.error('❌ Firebird Connection Error:', err);
                process.exit(1);
            }
            console.log('✅ Firebird attached. Fetching Movements...');

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
                WHERE DATA_PCS >= '2026-01-01' AND DATA_PCS <= '2026-12-31'
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
                const fetchMap = (ids, table, pk, cols, targetMap) => {
                    return new Promise((resolve, reject) => {
                        if (ids.length === 0) return resolve();
                        const chunks = chunkArray(ids, 500);
                        let processed = 0;
                        chunks.forEach(chunk => {
                            const idList = chunk.join(',');
                            const q = `SELECT ${pk}, ${cols} FROM ${table} WHERE ${pk} IN (${idList})`;
                            db.query(q, (err, rows) => {
                                if (err) return reject(err);
                                rows.forEach(r => { targetMap[r[pk]] = r; });
                                processed++;
                                if (processed === chunks.length) resolve();
                            });
                        });
                    });
                };

                try {
                    // 3.1 Fetch SETOR names
                    await fetchMap(setIds, 'SETOR', 'CODIGO_SET', 'NOME_SET', lookupSET);

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

                for (const pcs of productionRows) {
                    try {
                        const set = lookupSET[pcs.SETOR_PCS] || {};

                        const dataProd = parseDate(pcs.DATA_PCS);
                        if (!dataProd || isNaN(dataProd.getTime())) {
                            // console.warn('Skipping invalid date:', pcs.DATA_PCS);
                            continue;
                        }

                        // Strict year check (redundant but safe)
                        if (dataProd.getFullYear() !== 2026) {
                            continue;
                        }

                        const chaveOrigem = `PCS-${pcs.ID_PCS}`; // UPDATED: Use Unique ID from Table, not OP Code
                        const setor = cleanString(set.NOME_SET) || 'DESCONHECIDO';

                        // Product Details from Joined Tables
                        let produtoName = 'PRODUTO INDEFINIDO';
                        let produtoCode = null; // Part Code (Referencia)
                        let produtoWeight = 0;

                        if (pcs._produto) {
                            produtoName = cleanString(pcs._produto.NOME_PRO) || produtoName;
                            // Ensure CODIGO_PRO is treated as a string before cleaning
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

                        // Note: LOTE_PCS is available in 'pcs.LOTE_PCS' but we don't have a column for it in Postgres yet. 
                        // User didn't ask to create a column, just to "use data from these columns".

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
                        if (inserted % 100 === 0) process.stdout.write('.');

                    } catch (rowErr) {
                        console.error('Row Error:', rowErr);
                        errors++;
                    }
                }

                console.log(`\n✅ Sync Loop Complete.`);
                console.log(`   Processed: ${inserted}`);
                console.log(`   Errors: ${errors}`);

                // Final Safeguard: Delete records that were NOT updated in this sync run
                // This handles deletions: if a record exists in Postgres but was not fetched from Firebird (because it was deleted or moved),
                // it won't have been updated, so its 'atualizado_em' will be older than 'syncStartTime'.
                console.log('🧹 Clearing stale data (Mark & Sweep)...');
                const cleanup = await pool.query(`
                    DELETE FROM producao_apontada_sincronizada 
                    WHERE data_producao >= '2026-01-01' 
                      AND data_producao <= '2026-12-31'
                      AND atualizado_em < $1
                `, [syncStartTime]);
                console.log(`   Removed ${cleanup.rowCount} stale records.`);

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