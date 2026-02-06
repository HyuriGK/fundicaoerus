
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log('Querying faturamento_firebird...');
        const res = await pool.query('SELECT quota_fiscal, nota_fiscal, serie, item_nota, codigo_item, excluido_manualmente FROM faturamento_firebird LIMIT 10');
        console.log('Rows:', JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

run();
