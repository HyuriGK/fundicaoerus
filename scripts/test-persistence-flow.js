
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

// Fix database URL
let url = process.env.DATABASE_URL;
if (url.startsWith("psql '")) {
    url = url.substring(6, url.length - 1);
}

const pool = new Pool({ connectionString: url });

async function run() {
    const TEST_NF = 34731; // Using the invoice from previous debug
    const TEST_ITEM = '222800200';
    const TEST_PEDIDO = '103';
    const TEST_KEY = `${TEST_NF}-${TEST_ITEM}-${TEST_PEDIDO}`;

    try {
        console.log(`🧪 Testing Persistence Flow for NF: ${TEST_NF}, Item: ${TEST_ITEM}, Pedido: ${TEST_PEDIDO}`);

        // 1. Clear existing preference
        await pool.query('DELETE FROM faturamento_firebird_preferencias WHERE nota_fiscal = $1', [TEST_NF]);
        console.log("🧹 Cleared existing preferences.");

        // 2. Simulate POST (Insert Preference)
        console.log("📝 Simulating POST /toggle-exclusion...");
        await pool.query(`
            INSERT INTO faturamento_firebird_preferencias (chave_unica, excluido, pedido, nota_fiscal, codigo_item)
            VALUES ($1, $2, $3, $4, $5)
        `, [TEST_KEY, true, TEST_PEDIDO, TEST_NF, TEST_ITEM]);
        console.log("✅ Inserted preference.");

        // 3. Simulate GET (Query with Join)
        console.log("🔍 Simulating GET /detalhado...");
        const res = await pool.query(`
            SELECT 
                f.nota_fiscal,
                f.codigo_item,
                f.pedido,
                f.excluido_manualmente as local_excluded,
                p.excluido as pref_excluded,
                COALESCE(p.excluido, f.excluido_manualmente, false) as final_excluded
            FROM faturamento_firebird f
            LEFT JOIN faturamento_firebird_preferencias p 
                ON p.nota_fiscal = f.nota_fiscal
                AND p.codigo_item IS NOT DISTINCT FROM CAST(f.codigo_item AS VARCHAR)
                AND COALESCE(p.pedido, '') = COALESCE(f.pedido, '')
            WHERE f.nota_fiscal = $1 AND f.codigo_item = $2
        `, [TEST_NF, TEST_ITEM]);

        console.table(res.rows);

        if (res.rows.length > 0 && res.rows[0].final_excluded === true) {
            console.log("🎉 SUCCESS: Persistence is working in SQL logic!");
        } else {
            console.log("❌ FAILURE: Persistence failed to join.");
        }

    } catch (e) {
        console.error("❌ Error:", e);
    } finally {
        await pool.end();
    }
}

run();
