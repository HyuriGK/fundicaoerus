const pool = require('../lib/db');
require('dotenv').config({ path: '.env.local' });

async function migrate() {
    try {
        console.log('🚀 Criando tabela pedidos_op_links...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pedidos_op_links (
                id SERIAL PRIMARY KEY,
                sync_key TEXT UNIQUE NOT NULL,
                op TEXT NOT NULL,
                status TEXT NOT NULL, -- 'confirmado', 'rejeitado'
                confirmed_by TEXT,
                confirmed_at TIMESTAMP DEFAULT NOW(),
                created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_pedidos_op_links_sync_key ON pedidos_op_links(sync_key);
        `);
        console.log('✅ Tabela pedidos_op_links criada com sucesso.');
    } catch (err) {
        console.error('❌ Erro na migração:', err);
    } finally {
        await pool.end();
    }
}

migrate();
