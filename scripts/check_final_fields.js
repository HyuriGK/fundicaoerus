require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL.replace(/^['"]|['"]$/g, ''), ssl: { rejectUnauthorized: false } });

async function check() {
    try {
        const res = await pool.query('SELECT pro_codigo_fic, qtde_figuras, relacao_molde_metal FROM ficha_tecnica WHERE qtde_figuras > 0 OR relacao_molde_metal > 0 LIMIT 5');
        console.log('Sample Data:', JSON.stringify(res.rows, null, 2));
    } finally {
        await pool.end();
    }
}
check();
