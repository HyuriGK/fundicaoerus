require('dotenv').config({ path: '.env.local' });
const pool = require('./lib/db');

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('Iniciando migração...');

        // 1. Adicionar colunas na tabela carteira se não existirem
        await client.query(`
            ALTER TABLE carteira 
            ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT FALSE;
        `);
        console.log('Coluna is_new verificada/adicionada.');

        // 2. Criar tabela de lista CC
        await client.query(`
            CREATE TABLE IF NOT EXISTS carteira_cc_list (
                email TEXT PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Tabela carteira_cc_list verificada/criada.');

        console.log('Migração concluída com sucesso!');
    } catch (err) {
        console.error('Erro na migração:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

runMigration();
