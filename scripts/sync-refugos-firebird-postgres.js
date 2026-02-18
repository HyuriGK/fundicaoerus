// scripts/sync-refugos-firebird-postgres.js
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
        const syncStartTime = new Date();
        console.log(`🕒 Refugo Sync Start Time: ${syncStartTime.toISOString()}`);

        console.log('🔗 Connecting to Postgres...');
        await pool.query('SELECT NOW()');

        // 1. Prepare Postgres (Create Table & Indexes)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS refugo_apontado_sincronizado (
                id SERIAL PRIMARY KEY,
                chave_origem VARCHAR(255) UNIQUE NOT NULL,
                data_refugo TIMESTAMP NOT NULL,
                setor VARCHAR(100),
                produto VARCHAR(255),
                codigo_peca VARCHAR(50),
                lote VARCHAR(100),
                quantidade NUMERIC(10,2),
                peso_un NUMERIC(10,4),
                peso_total NUMERIC(10,2),
                op VARCHAR(50),
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_refugo_data ON refugo_apontado_sincronizado(data_refugo);
            CREATE INDEX IF NOT EXISTS idx_refugo_setor ON refugo_apontado_sincronizado(setor);
            
            DO $$ 
            BEGIN 
                BEGIN
                    ALTER TABLE refugo_apontado_sincronizado ADD COLUMN op VARCHAR(50);
                EXCEPTION
                    WHEN duplicate_column THEN NULL;
                END;
            END $$;
        `);
        console.log('✅ Postgres table ready.');

        Firebird.attach(fbOptions, function (err, db) {
            if (err) {
                console.error('❌ Firebird Connection Error:', err);
                process.exit(1);
            }
            console.log('✅ Firebird attached. Fetching Refugo Data...');

            // 1. Fetch PRODUCAO_SETOR (Refugo)
            // Filters: QUANTIDADE_REFUGO_PCS > 0 AND DATA_PCS >= '2025-01-01'
            const queryPCS = `
                SELECT 
                    ID_PCS,
                    CODIGO_PCS,
                    DATA_PCS,
                    QUANTIDADE_REFUGO_PCS,
                    LOTE_PCS,
                    SETOR_PCS
                FROM PRODUCAO_SETOR
                WHERE DATA_PCS >= '2025-01-01'
                  AND QUANTIDADE_REFUGO_PCS > 0
                ORDER BY DATA_PCS DESC
            `;

            db.query(queryPCS, async (err, productionRows) => {
                if (err) {
                    console.error('❌ Query PCS Error:', err);
                    db.detach();
                    return;
                }
                console.log(`📦 Refugo records fetched: ${productionRows.length}`);

                if (productionRows.length === 0) {
                    console.log('No refugo records found.');
                    db.detach();
                    process.exit(0);
                }

                // 2. Collect IDs for Lookups
                const setIds = [...new Set(productionRows.map(p => p.SETOR_PCS).filter(id => id))];
                console.log(`ℹ️ Unique IDs - SET: ${setIds.length}`);

                const opIds = [...new Set(productionRows.map(p => p.CODIGO_PCS).filter(id => id))];
                console.log(`ℹ️ Unique IDs - OP: ${opIds.length}`);

                // 3. Fetch Lookup Data
                const lookupSET = {};
                const lookupPRODUCAO = {};
                const lookupPRODUTO = {};

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
                    if (opIds.length > 0) {
                        await fetchMap(opIds, 'PRODUCAO', 'CODIGO_PCP', 'PRODUTO_PCP', lookupPRODUCAO);
                    }

                    // 3.3 Fetch PRODUTO (Product Details)
                    const productIds = [...new Set(Object.values(lookupPRODUCAO).map(p => p.PRODUTO_PCP).filter(id => id))];
                    if (productIds.length > 0) {
                        await fetchMap(productIds, 'PRODUTO', 'CODIGO_PRO', 'NOME_PRO, REFERENCIA_PRO, PESO_LIQUIDO_PRO', lookupPRODUTO);
                    }

                    // Attach lookups
                    productionRows.forEach(row => {
                        row._producao = lookupPRODUCAO[row.CODIGO_PCS];
                        row._produto = row._producao ? lookupPRODUTO[row._producao.PRODUTO_PCP] : null;
                    });

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
                        const dataRefugo = parseDate(pcs.DATA_PCS);

                        // Validation
                        if (!dataRefugo || isNaN(dataRefugo.getTime())) continue;

                        const chaveOrigem = `REF-PCS-${pcs.ID_PCS}`;
                        const setor = cleanString(set.NOME_SET) || 'DESCONHECIDO';
                        const lote = cleanString(pcs.LOTE_PCS) || '';

                        const op = pcs.CODIGO_PCS ? String(pcs.CODIGO_PCS) : null;

                        // Product Details
                        let produtoName = 'PRODUTO INDEFINIDO';
                        let produtoCode = null;
                        let produtoWeight = 0;

                        if (pcs._produto) {
                            produtoName = cleanString(pcs._produto.NOME_PRO) || produtoName;
                            const rawCode = pcs._produto.CODIGO_PRO;
                            produtoCode = rawCode ? cleanString(String(rawCode)) : null;
                            produtoWeight = parseFloat(pcs._produto.PESO_LIQUIDO_PRO || 0);
                        }

                        const quantidade = parseFloat(pcs.QUANTIDADE_REFUGO_PCS || 0);
                        const pesoTotal = quantidade * produtoWeight;
                        const pesoUn = produtoWeight;

                        await pool.query(`
                            INSERT INTO refugo_apontado_sincronizado 
                            (chave_origem, data_refugo, setor, produto, codigo_peca, lote, quantidade, peso_un, peso_total, op, atualizado_em)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
                            ON CONFLICT (chave_origem) DO UPDATE SET
                                data_refugo = EXCLUDED.data_refugo,
                                setor = EXCLUDED.setor,
                                produto = EXCLUDED.produto,
                                codigo_peca = EXCLUDED.codigo_peca,
                                lote = EXCLUDED.lote,
                                quantidade = EXCLUDED.quantidade,
                                peso_un = EXCLUDED.peso_un,
                                peso_total = EXCLUDED.peso_total,
                                op = EXCLUDED.op,
                                atualizado_em = CURRENT_TIMESTAMP
                        `, [chaveOrigem, dataRefugo, setor, produtoName, produtoCode, lote, quantidade, pesoUn, pesoTotal, op]);

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
