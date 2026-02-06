
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
        console.log("🔍 Checking Faturamento Data (Source)...");
        const fatRes = await pool.query(`
            SELECT id, nota_fiscal, codigo_item, pedido, 
            CAST(nota_fiscal AS TEXT) || '-' || COALESCE(TRIM(CAST(codigo_item AS TEXT)), '') || '-' || COALESCE(TRIM(pedido), '') as generated_key
            FROM faturamento_firebird 
            WHERE nota_fiscal = 34731
            LIMIT 5
        `);
        console.table(fatRes.rows);

        console.log("\n🔍 Checking Preferences Data (Stored Keys)...");
        const prefRes = await pool.query(`
            SELECT chave_unica, excluido, pedido 
            FROM faturamento_firebird_preferencias 
            ORDER BY updated_at DESC 
            LIMIT 10
        `);
        console.table(prefRes.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

run();
