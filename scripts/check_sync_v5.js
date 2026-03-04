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
            LIMIT 5
        `);
        console.log('Descriptions Found:', res.rows.length);
        if (res.rows.length > 0) {
            console.log('Sample Item:', JSON.stringify(res.rows[0], null, 2));
        } else {
            // Let's check why its empty
            const all = await pool.query('SELECT count(*) FROM ficha_tecnica');
            console.log('Total items in PG:', all.rows[0].count);
            const anyRel = await pool.query('SELECT count(*) FROM ficha_tecnica WHERE relacao_molde_metal IS NOT NULL AND relacao_molde_metal != \'0.000\'');
            console.log('Items with Relacao != 0:', anyRel.rows[0].count);
        }
    } catch (e) {
        console.error('Query Error:', e.message);
    } finally {
        await pool.end();
    }
}
check();
