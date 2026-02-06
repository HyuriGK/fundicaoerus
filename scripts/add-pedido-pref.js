
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

// Fix: Handle "psql 'url'" format if present
let url = process.env.DATABASE_URL;
if (url.startsWith("psql '")) {
    url = url.substring(6, url.length - 1);
}

const pool = new Pool({
    connectionString: url
});

async function run() {
    try {
        await pool.query('ALTER TABLE faturamento_firebird_preferencias ADD COLUMN IF NOT EXISTS pedido VARCHAR(50);');
        console.log('✅ Added pedido column to preferences table.');
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await pool.end();
    }
}

run();
