require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const url = process.env.DATABASE_URL.replace(/^['"]/, '').replace(/['"]$/, '');
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function check() {
    try {
        const res = await pool.query('SELECT count(*) FROM ficha_tecnica WHERE relacao_molde_metal IS NOT NULL');
        console.log('Relacao Count (PG):', res.rows[0].count);
        const res2 = await pool.query('SELECT count(*) FROM ficha_tecnica WHERE cliente_nome IS NOT NULL');
        console.log('Cliente Name Count (PG):', res2.rows[0].count);
        const res3 = await pool.query('SELECT count(*) FROM ficha_tecnica');
        console.log('Total Records (PG):', res3.rows[0].count);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
