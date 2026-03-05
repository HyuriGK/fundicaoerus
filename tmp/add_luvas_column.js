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
        console.log('Adicionando coluna detalhes_luvas...');
        await pool.query("ALTER TABLE ficha_tecnica ADD COLUMN IF NOT EXISTS detalhes_luvas TEXT");
        console.log('✅ Coluna detalhes_luvas adicionada com sucesso ou já existente.');
    } catch (err) {
        console.error('❌ Erro ao adicionar coluna:', err.message);
    } finally {
        await pool.end();
    }
}

run();
