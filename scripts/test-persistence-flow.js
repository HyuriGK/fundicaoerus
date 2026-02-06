
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

// Fix database URL
let url = process.env.DATABASE_URL;
if (url.startsWith("psql '")) {
    url = url.substring(6, url.length - 1);
}

const pool = new Pool({ connectionString: url });

async function run() {
    // We need real data from faturamento_firebird to test the join correctly
    try {
        console.log("🔍 Fetching a real record to test...");
        const sampleRes = await pool.query('SELECT data_faturamento, nota_fiscal, codigo_item, pedido, quantidade FROM faturamento_firebird LIMIT 1');

        if (sampleRes.rows.length === 0) {
            console.log("❌ No data in faturamento_firebird to test with.");
            return;
        }

        const item = sampleRes.rows[0];
        console.log(`🧪 Testing Logic C for NF: ${item.nota_fiscal}, Item: ${item.codigo_item}, Date: ${item.data_faturamento.toISOString().split('T')[0]}, Quant: ${item.quantidade}`);

        const TEST_KEY = `TEST-LOGIC-C-${Date.now()}`;

        // 1. Clear existing preference for this specific identity
        await pool.query(`
            DELETE FROM faturamento_firebird_preferencias 
            WHERE nota_fiscal = $1 AND codigo_item = $2 AND COALESCE(pedido, '') = $3 AND data_faturamento = $4 AND quantidade = $5
        `, [item.nota_fiscal, item.codigo_item, item.pedido || '', item.data_faturamento, item.quantidade]);
        console.log("🧹 Cleared existing preference.");

        // 2. Simulate POST (Insert Preference with Detailed Identity)
        console.log("📝 Simulating POST /toggle-exclusion (Logic C)...");
        await pool.query(`
            INSERT INTO faturamento_firebird_preferencias (chave_unica, excluido, pedido, nota_fiscal, codigo_item, data_faturamento, quantidade)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [TEST_KEY, true, item.pedido || '', item.nota_fiscal, item.codigo_item, item.data_faturamento, item.quantidade]);
        console.log("✅ Inserted preference.");

        // 3. Simulate GET (Query with Logic C Join)
        console.log("🔍 Simulating GET /detalhado (Logic C Join)...");
        const res = await pool.query(`
            SELECT 
                f.nota_fiscal,
                f.codigo_item,
                f.data_faturamento,
                f.quantidade,
                p.excluido as pref_excluded,
                COALESCE(p.excluido, f.excluido_manualmente, false) as final_excluded
            FROM faturamento_firebird f
            LEFT JOIN faturamento_firebird_preferencias p 
                ON p.nota_fiscal = f.nota_fiscal
                AND p.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                AND COALESCE(p.pedido, '') = COALESCE(TRIM(f.pedido), '')
                AND p.data_faturamento = f.data_faturamento
                AND p.quantidade = f.quantidade
            WHERE f.nota_fiscal = $1 AND f.codigo_item = $2 AND f.data_faturamento = $3 AND f.quantidade = $4
        `, [item.nota_fiscal, item.codigo_item, item.data_faturamento, item.quantidade]);

        console.table(res.rows);

        if (res.rows.length > 0 && res.rows[0].final_excluded === true) {
            console.log("🎉 SUCCESS: Logic C (Detailed) is working in SQL logic!");
        } else {
            console.log("❌ FAILURE: Logic C failed to join.");
        }

    } catch (e) {
        console.error("❌ Error:", e);
    } finally {
        await pool.end();
    }
}

run();
