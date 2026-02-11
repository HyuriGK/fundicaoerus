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
        console.log('🔗 Connecting to Postgres...');
        await pool.query('SELECT NOW()');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS producao_apontada_sincronizada (
                id SERIAL PRIMARY KEY,
                chave_origem VARCHAR(255) UNIQUE NOT NULL,
                data_producao TIMESTAMP NOT NULL,
                setor VARCHAR(100),
                produto VARCHAR(255),
                liga VARCHAR(50),
                op VARCHAR(50),
                codigo_peca VARCHAR(50),
                peso_un NUMERIC(10,4),
                quantidade NUMERIC(10,2),
                peso_total NUMERIC(10,2),
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Postgres ready.');

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

        Firebird.attach(fbOptions, function (err, db) {
            if (err) {
                console.error('❌ Firebird Connection Error:', err);
                process.exit(1);
            }
            console.log('✅ Firebird attached. Fetching Movements...');

            // 1. Fetch Movements (Base)
            // No joins, just raw data. Should be fast.
            const queryPMV = `
                SELECT 
                    CODIGO_PMV,
                    DATA_PMV,
                    QUANTIDADE_PMV,
                    CODIGO_PRODUCAO_PMV,
                    SETOR_PRODUCAO_PMV,
                    PRODUTO_PMV
                FROM PRODUTO_MOVIMENTACAO
                WHERE DATA_PMV >= '2026-01-01'
                AND CODIGO_PRODUCAO_PMV IS NOT NULL
                ORDER BY DATA_PMV DESC
            `;

            db.query(queryPMV, async (err, movements) => {
                if (err) {
                    console.error('❌ Query PMV Error:', err);
                    db.detach();
                    return;
                }
                console.log(`📦 Movements fetched: ${movements.length}`);

                if (movements.length === 0) {
                    console.log('No movements found.');
                    db.detach();
                    process.exit(0);
                }

                // 2. Collect IDs
                const pcsIds = [...new Set(movements.map(m => m.CODIGO_PRODUCAO_PMV).filter(id => id))];
                const setIds = [...new Set(movements.map(m => m.SETOR_PRODUCAO_PMV).filter(id => id))];
                const proIds = [...new Set(movements.map(m => m.PRODUTO_PMV).filter(id => id))];

                console.log(`ℹ️ Unique IDs - PCS: ${pcsIds.length}, SET: ${setIds.length}, PRO: ${proIds.length}`);

                // 3. Fetch Lookup Data (Batched)
                const lookupPCS = {};
                const lookupSET = {};
                const lookupPRO = {};

                // Helper to fetch and map
                const fetchMap = (ids, table, pk, cols, targetMap) => {
                    return new Promise((resolve, reject) => {
                        if (ids.length === 0) return resolve();

                        // Chunk IDs to avoid query limit
                        const chunks = chunkArray(ids, 500);
                        let processed = 0;

                        chunks.forEach(chunk => {
                            const idList = chunk.join(',');
                            const q = `SELECT ${pk}, ${cols} FROM ${table} WHERE ${pk} IN (${idList})`;

                            db.query(q, (err, rows) => {
                                if (err) return reject(err);
                                rows.forEach(r => {
                                    targetMap[r[pk]] = r;
                                });
                                processed++;
                                if (processed === chunks.length) resolve();
                            });
                        });
                    });
                };

                try {
                    // Execute sequentially to avoid Firebird driver concurrency issues on single attachment
                    await fetchMap(pcsIds, 'PRODUCAO_SETOR', 'CODIGO_PCS', 'DATA_HORA_FIM_PCS, CODIGO_PCS', lookupPCS);
                    await fetchMap(setIds, 'SETOR', 'CODIGO_SET', 'NOME_SET', lookupSET);
                    await fetchMap(proIds, 'PRODUTO', 'CODIGO_PRO', 'NOME_PRO, PESO_LIQUIDO_PRO, REFERENCIA_PRO, CODIGO_PRO', lookupPRO);
                } catch (fetchErr) {
                    console.error('❌ Error fetching lookups:', fetchErr);
                    db.detach();
                    return;
                }

                console.log('✅ Lookups fetched. Syncing to Postgres...');

                // 4. Join & Sync
                let inserted = 0;
                let errors = 0;

                for (const pmv of movements) {
                    try {
                        const pcs = lookupPCS[pmv.CODIGO_PRODUCAO_PMV] || {};
                        const set = lookupSET[pmv.SETOR_PRODUCAO_PMV] || {};
                        const pro = lookupPRO[pmv.PRODUTO_PMV] || {};

                        const dataProd = parseDate(pcs.DATA_HORA_FIM_PCS) || parseDate(pmv.DATA_PMV);
                        if (!dataProd) continue;

                        const chaveOrigem = `PMV-${pmv.CODIGO_PMV}`;
                        const setor = cleanString(set.NOME_SET) || 'DESCONHECIDO';
                        const produto = cleanString(pro.NOME_PRO) || 'PRODUTO DESCONHECIDO';

                        // New Fields
                        const op = pcs.CODIGO_PCS ? String(pcs.CODIGO_PCS) : null;

                        let codigoPeca = cleanString(pro.REFERENCIA_PRO);
                        // If reference is empty, try to extract from name (often formatted like "NAME... 123-456 ...")
                        if (!codigoPeca && produto) {
                            // Look for patterns like X-X-X or XX.XX.XX
                            const codeMatch = produto.match(/(\d{2,}[-.]\d{2,}[-.]\d{2,}[-.]\d{2,}[-.]\d{2,})|(\d{2,}[-.]\d{3,}[-.]\d{4,}[-.]\d{2,}[-.]\d{3,})|(\d{2,}[-.]\d{3,}[-.]\d{4,}[-.]\d{2,})/);
                            if (codeMatch) {
                                codigoPeca = codeMatch[0];
                            } else {
                                codigoPeca = String(pro.CODIGO_PRO || '');
                            }
                        } else if (!codigoPeca) {
                            codigoPeca = String(pro.CODIGO_PRO || '');
                        }

                        let liga = null;
                        if (produto.includes('/')) {
                            const parts = produto.split('/');
                            if (parts.length > 1) {
                                liga = parts[parts.length - 1].trim();
                            }
                        }

                        const pesoUn = parseFloat(pro.PESO_LIQUIDO_PRO || 0);
                        const quantidade = parseFloat(pmv.QUANTIDADE_PMV || 0);
                        const pesoTotal = pesoUn * quantidade;

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

                    } catch (syncErr) {
                        console.error(`Sync Error ID ${pmv.CODIGO_PMV}:`, syncErr.message);
                        errors++;
                    }
                }

                console.log(`\n✅ Sync Complete.`);
                console.log(`   Processed: ${inserted}`);
                console.log(`   Errors: ${errors}`);

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