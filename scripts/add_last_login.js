const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const pool = require('../lib/db');

async function migrate() {
    try {
        console.log('🔌 Conectando ao banco de dados...');
        const client = await pool.connect();

        console.log('🔍 Verificando se a coluna last_login existe...');
        const res = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name='last_login';
        `);

        if (res.rows.length === 0) {
            console.log('🆕 Coluna não encontrada. Adicionando last_login...');
            await client.query(`
                ALTER TABLE users 
                ADD COLUMN last_login TIMESTAMP;
            `);
            console.log('✅ Sucesso! Coluna last_login adicionada.');
        } else {
            console.log('ℹ️ Coluna last_login já existe. Nenhuma alteração necessária.');
        }

        client.release();
    } catch (err) {
        console.error('❌ Erro na migração:', err);
    } finally {
        await pool.end();
    }
}

migrate();
