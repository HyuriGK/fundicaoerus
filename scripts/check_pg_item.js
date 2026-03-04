require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const url = process.env.DATABASE_URL.replace(/^['"]/, '').replace(/['"]$/, '');
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function checkItem() {
    try {
        const res = await pool.query('SELECT * FROM ficha_tecnica WHERE relacao_molde_metal IS NOT NULL LIMIT 1');
        if (res.rows.length > 0) {
            console.log('Sample Item with Relationship:', JSON.stringify(res.rows[0], null, 2));
        } else {
            console.log('No items with relationship data found in Postgres yet.');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
checkItem();
