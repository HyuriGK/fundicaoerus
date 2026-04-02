const pool = require('../lib/db');

async function init() {
    console.log('🚀 Iniciando criação das tabelas de comunicação...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Tabela de comunicações (mensagens enviadas)
        await client.query(`
            CREATE TABLE IF NOT EXISTS communications (
                id SERIAL PRIMARY KEY,
                sender_id INTEGER,
                recipient_id INTEGER, -- NULL para "Todos"
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela communications criada/verificada.');

        // Tabela de leituras (para saber quem leu o quê, especialmente útil para mensagens enviadas para "Todos")
        await client.query(`
            CREATE TABLE IF NOT EXISTS communication_reads (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                communication_id INTEGER NOT NULL REFERENCES communications(id) ON DELETE CASCADE,
                read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, communication_id)
            )
        `);
        console.log('✅ Tabela communication_reads criada/verificada.');

        await client.query('COMMIT');
        console.log('🎉 Tabelas inicializadas com sucesso!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Erro ao inicializar tabelas:', err);
    } finally {
        client.release();
        process.exit();
    }
}

init();
