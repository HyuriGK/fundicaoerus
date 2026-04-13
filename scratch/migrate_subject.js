const pool = require('../lib/db');

async function migrate() {
    try {
        console.log('Migrando banco de dados...');
        await pool.query('ALTER TABLE communications ADD COLUMN IF NOT EXISTS subject VARCHAR(100)');
        console.log('Sucesso: Coluna "subject" adicionada.');
        process.exit(0);
    } catch (err) {
        console.error('Erro na migração:', err);
        process.exit(1);
    }
}

migrate();
