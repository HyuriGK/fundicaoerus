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
        console.log('Verificando colunas da tabela ficha_tecnica...');
        const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ficha_tecnica'");
        console.table(res.rows);
    } catch (err) {
        console.error('❌ Erro ao verificar colunas:', err.message);
    } finally {
        await pool.end();
    }
}

run();
