
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
        console.log("📊 Inspecting column types for JOIN compatibility...");
        const res = await pool.query(`
            SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
            FROM information_schema.columns 
            WHERE table_name IN ('faturamento_firebird', 'faturamento_firebird_preferencias')
            AND column_name IN ('nota_fiscal', 'codigo_item', 'pedido', 'data_faturamento', 'quantidade')
            ORDER BY column_name, table_name;
        `);
        console.table(res.rows);
    } catch (e) {
        console.error("❌ Error:", e);
    } finally {
        await pool.end();
    }
}

run();
