
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
        await pool.query('ALTER TABLE faturamento_firebird_preferencias ADD COLUMN IF NOT EXISTS nota_fiscal INTEGER;');
        await pool.query('ALTER TABLE faturamento_firebird_preferencias ADD COLUMN IF NOT EXISTS codigo_item VARCHAR(50);');

        // Create index for performance
        await pool.query('CREATE INDEX IF NOT EXISTS idx_fff_pref_composite ON faturamento_firebird_preferencias (nota_fiscal, codigo_item);');

        console.log('✅ Added nota_fiscal and codigo_item columns to preferences table.');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

run();
