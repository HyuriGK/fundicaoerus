require('dotenv').config({ path: '.env.local' });
const pool = require('../lib/db');

(async () => {
    try {
        console.log('Creating producao_metas table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS producao_metas (
                mes_ano VARCHAR(7) PRIMARY KEY, -- Query format YYYY-MM
                meta_peso NUMERIC(10,2) DEFAULT 0,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Table created successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error creating table:', err);
        process.exit(1);
    }
})();
