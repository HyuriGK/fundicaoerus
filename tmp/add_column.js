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
        console.log('Alterando tipo da coluna tinta_refrataria_fic...');
        await pool.query("ALTER TABLE ficha_tecnica ALTER COLUMN tinta_refrataria_fic TYPE VARCHAR(100)");
        console.log('✅ Tipo alterado com sucesso.');
    } catch (err) {
        console.error('❌ Erro ao adicionar coluna:', err.message);
    } finally {
        await pool.end();
    }
}

run();
