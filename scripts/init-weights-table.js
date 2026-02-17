require('dotenv').config({ path: '.env.local' });
const pool = require('../lib/db');

async function init() {
    try {
        console.log('🔌 Connecting to database...');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS produto_pesos_producao (
                codigo_peca VARCHAR(255) PRIMARY KEY,
                peso NUMERIC(10, 4) NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Table "produto_pesos_producao" created/verified.');
    } catch (e) {
        console.error('❌ Error creating table:', e);
    } finally {
        await pool.end();
        console.log('🔌 Connection closed.');
    }
}

init();
