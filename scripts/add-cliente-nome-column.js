require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL.replace(/^psql\s+'|'$/g, ''),
    ssl: { rejectUnauthorized: false }
});

console.log('🔧 Adicionando coluna cliente_nome...\n');

async function addColumn() {
    const client = await pgPool.connect();

    try {
        // Adicionar coluna se não existir
        await client.query(`
            ALTER TABLE faturamento_firebird 
            ADD COLUMN IF NOT EXISTS cliente_nome VARCHAR(500)
        `);

        console.log('✅ Coluna cliente_nome adicionada com sucesso!');

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        client.release();
        await pgPool.end();
    }
}

addColumn();
