require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL.replace(/^psql\s+'|'$/g, ''),
    ssl: { rejectUnauthorized: false }
});

console.log('🔧 Criando tabela de clientes ocultos...\n');

async function createTable() {
    const client = await pgPool.connect();

    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS faturamento_clientes_ocultos (
                id SERIAL PRIMARY KEY,
                cliente_codigo INTEGER UNIQUE NOT NULL,
                cliente_nome VARCHAR(500),
                criado_em TIMESTAMP DEFAULT NOW()
            )
        `);

        console.log('✅ Tabela faturamento_clientes_ocultos criada com sucesso!');

    } catch (error) {
        console.error('❌ Erro:', error.message);
    } finally {
        client.release();
        await pgPool.end();
    }
}

createTable();
