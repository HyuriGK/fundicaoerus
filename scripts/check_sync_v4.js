require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

function cleanConnectionString(str) {
    if (!str) return '';
    let cleaned = str.trim();
    if (cleaned.startsWith('psql')) cleaned = cleaned.substring(4).trim();
    return cleaned.replace(/^['"]|['"]$/g, '');
}

const pool = new Pool({
    connectionString: cleanConnectionString(process.env.DATABASE_URL),
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        const res = await pool.query(`
            SELECT pro_codigo_fic, descricao_fic, qtde_figuras, relacao_molde_metal 
            FROM ficha_tecnica 
            WHERE (descricao_fic IS NOT NULL AND descricao_fic != '') 
               OR (qtde_figuras IS NOT NULL AND qtde_figuras > 0)
            LIMIT 3
        `);
        console.log('Sample Data (PG):', JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error('Query Error:', e.message);
    } finally {
        await pool.end();
    }
}
check();
