const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

function cleanConnectionString(str) {
    if (!str) return '';
    let cleaned = str.trim();
    if (cleaned.startsWith('psql')) cleaned = cleaned.substring(4).trim();
    return cleaned.replace(/^['"]|['"]$/g, '');
}

async function run() {
    const pool = new Pool({
        connectionString: cleanConnectionString(process.env.DATABASE_URL),
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('Verificando se há dados na coluna detalhes_luvas...');
        const res = await pool.query("SELECT pro_codigo_fic, detalhes_luvas FROM ficha_tecnica WHERE detalhes_luvas IS NOT NULL AND detalhes_luvas <> '' LIMIT 5");
        console.table(res.rows);
    } catch (err) {
        console.error('❌ Erro ao verificar dados:', err.message);
    } finally {
        await pool.end();
    }
}

run();
