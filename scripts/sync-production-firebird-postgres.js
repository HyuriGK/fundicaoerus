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
    lowercase_keys: false, // Use uppercase for column names as per Firebird tradition
    pageSize: 4096
};

// --- Helper Functions ---
function cleanString(str) {
    if (!str) return null;
    return str.trim();
}

function parseDate(dateVal) {
    if (!dateVal) return null;
    // Firebird node driver returns Date objects usually
    if (dateVal instanceof Date) return dateVal;
    return new Date(dateVal);
}

// --- Main Execution ---
(async () => {
    try {
        // 1. Verify Postgres Connection & Table
        await pool.query('SELECT NOW()');
        console.log('✅ Connected to Postgres.');

        // Ensure table exists (idempotent check)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS producao_apontada_sincronizada (
                id SERIAL PRIMARY KEY,
                chave_origem VARCHAR(255) UNIQUE NOT NULL, -- Unique ID from Firebird (e.g. "PMV-12345")
                data_producao TIMESTAMP NOT NULL,
                setor VARCHAR(100),
                produto VARCHAR(255),
                liga VARCHAR(50),
                peso_un NUMERIC(10,4),
                quantidade NUMERIC(10,2),
                peso_total NUMERIC(10,2),
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Postgres table verified.');

        // 2. Clear old data? No, we upsert. 
        // But if we want to full sync, we might want to delete old records not in source?
        // For now, let's just upsert new/changed records to be safe.

        // 3. Connect to Firebird
        Firebird.attach(fbOptions, function (err, db) {
            if (err) {
                console.error('❌ Error connecting to Firebird:', err);
                process.exit(1);
            }
            console.log('✅ Connected to Firebird.');

            // 4. Query Data
            // Join Strategy:
            // PRODUTO_MOVIMENTACAO (pmv) is the source of truth for "what went into stock from production"
            // PRODUCAO_SETOR (pcs) provides the sector context and production time
            // SETOR (s) provides sector name
            // PRODUTO (p) provides product name and weight

            const query = `
                SELECT 
                    pmv.CODIGO_PMV,
                    pmv.DATA_PMV,
                    pmv.QUANTIDADE_PMV,
                    pmv.CODIGO_PRODUCAO_PMV,
                    pcs.DATA_HORA_FIM_PCS,
                    s.NOME_SET,
                    p.NOME_PRO,
                    p.PESO_LIQUIDO_PRO
                FROM PRODUTO_MOVIMENTACAO pmv
                LEFT JOIN PRODUCAO_SETOR pcs ON pmv.CODIGO_PRODUCAO_PMV = pcs.CODIGO_PCS
                LEFT JOIN SETOR s ON pmv.SETOR_PRODUCAO_PMV = s.CODIGO_SET
                LEFT JOIN PRODUTO p ON pmv.PRODUTO_PMV = p.CODIGO_PRO
                WHERE pmv.DATA_PMV >= '2024-01-01'
                AND pmv.CODIGO_PRODUCAO_PMV IS NOT NULL
                ORDER BY pmv.DATA_PMV DESC
            `;

            db.query(query, async (err, results) => {
                if (err) {
                    console.error('❌ Firebird query error:', err);
                    db.detach();
                    await pool.end();
                    process.exit(1);
                }

                console.log(`📦 Fetched ${results.length} records from Firebird. Syncing to Postgres...`);

                let inserted = 0;
                let errors = 0;

                // Process in chunks if needed, but linear loop is fine for < 50k records usually
                for (const row of results) {
                    try {
                        const dataProd = parseDate(row.DATA_HORA_FIM_PCS) || parseDate(row.DATA_PMV);
                        if (!dataProd) continue;

                        const chaveOrigem = `PMV-${row.CODIGO_PMV}`;
                        const setor = cleanString(row.NOME_SET) || 'DESCONHECIDO';
                        const produto = cleanString(row.NOME_PRO) || 'PRODUTO DESCONHECIDO';

                        // Extract Alloy (Liga) from Product Name if present (after last /)
                        let liga = null;
                        if (produto.includes('/')) {
                            const parts = produto.split('/');
                            if (parts.length > 1) {
                                liga = parts[parts.length - 1].trim();
                            }
                        }

                        const pesoUn = parseFloat(row.PESO_LIQUIDO_PRO || 0);
                        const quantidade = parseFloat(row.QUANTIDADE_PMV || 0);
                        const pesoTotal = pesoUn * quantidade;

                        // Upsert
                        await pool.query(`
                            INSERT INTO producao_apontada_sincronizada 
                            (chave_origem, data_producao, setor, produto, liga, peso_un, quantidade, peso_total, atualizado_em)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
                            ON CONFLICT (chave_origem) DO UPDATE SET
                                data_producao = EXCLUDED.data_producao,
                                setor = EXCLUDED.setor,
                                produto = EXCLUDED.produto,
                                liga = EXCLUDED.liga,
                                peso_un = EXCLUDED.peso_un,
                                quantidade = EXCLUDED.quantidade,
                                peso_total = EXCLUDED.peso_total,
                                atualizado_em = CURRENT_TIMESTAMP
                        `, [chaveOrigem, dataProd, setor, produto, liga, pesoUn, quantidade, pesoTotal]);

                        inserted++;
                        if (inserted % 500 === 0) process.stdout.write('.');
                    } catch (syncErr) {
                        console.error(`Error syncing row ${row.CODIGO_PMV}:`, syncErr.message);
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
