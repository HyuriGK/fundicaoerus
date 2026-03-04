require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL.replace(/^['"]|['"]$/g, ''), ssl: { rejectUnauthorized: false } });

async function check() {
    try {
        const res = await pool.query(`
            SELECT pro_codigo_fic, descricao_fic, qtde_figuras, relacao_molde_metal 
            FROM ficha_tecnica 
            WHERE (descricao_fic IS NOT NULL AND descricao_fic != '') 
               OR qtde_figuras > 0 
            LIMIT 3
        `);
        console.log('Sample Data (PG):', JSON.stringify(res.rows, null, 2));
    } finally {
        await pool.end();
    }
}
check();
