
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

// Fix database URL
let url = process.env.DATABASE_URL;
if (url.startsWith("psql '")) {
    url = url.substring(6, url.length - 1);
}

const pool = new Pool({ connectionString: url });

async function run() {
    try {
        console.log("🔍 Diagnosing Mismatches between Preferences and Faturamento...");

        // Find Preferences that DO NOT have a matching row in faturamento_firebird
        const res = await pool.query(`
            SELECT 
                p.chave_unica, p.nota_fiscal, p.codigo_item, p.pedido, p.data_faturamento, p.quantidade,
                (SELECT COUNT(*) FROM faturamento_firebird f WHERE f.nota_fiscal = p.nota_fiscal) as nf_found_count,
                (SELECT COUNT(*) FROM faturamento_firebird f WHERE f.nota_fiscal = p.nota_fiscal AND f.data_faturamento = p.data_faturamento) as nf_date_found_count
            FROM faturamento_firebird_preferencias p
            LEFT JOIN faturamento_firebird f
                ON p.nota_fiscal = f.nota_fiscal
                AND p.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                AND COALESCE(p.pedido, '') = COALESCE(TRIM(f.pedido), '')
                AND p.data_faturamento = f.data_faturamento
                AND p.quantidade = f.quantidade
            WHERE f.nota_fiscal IS NULL
            LIMIT 10
        `);

        if (res.rows.length === 0) {
            console.log("✅ All preferences matched successfully!");
        } else {
            console.log(`❌ Found ${res.rows.length} orphans (preferences with no matching faturamento record).`);
            console.table(res.rows);

            // Detailed check for the first orphan
            const o = res.rows[0];
            console.log("\n🕵️ Deep dive on first orphan:");
            const details = await pool.query(`
                SELECT nota_fiscal, codigo_item, pedido, data_faturamento, quantidade
                FROM faturamento_firebird
                WHERE nota_fiscal = $1
            `, [o.nota_fiscal]);
            console.log(`Related rows in faturamento_firebird for NF ${o.nota_fiscal}:`);
            console.table(details.rows);
        }
    } catch (e) {
        console.error("❌ Error:", e);
    } finally {
        await pool.end();
    }
}

run();
