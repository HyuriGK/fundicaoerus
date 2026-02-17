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

async function migrate() {
    try {
        console.log('Iniciando migração...');
        // Adicionar coluna approved se não existir
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT FALSE;
        `);
        console.log('Coluna approved adicionada.');

        // Atualizar usuários existentes para TRUE (para não bloquear ninguém atual)
        await pool.query(`
            UPDATE users SET approved = TRUE WHERE approved IS FALSE;
        `);
        console.log('Usuários existentes aprovados.');

    } catch (err) {
        console.error('Erro na migração:', err);
    } finally {
        await pool.end();
    }
}

migrate();
