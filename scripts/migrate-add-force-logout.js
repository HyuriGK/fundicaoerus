const pool = require('../lib/db');

async function run() {
    try {
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS force_logout BOOLEAN NOT NULL DEFAULT FALSE`);
        console.log('Coluna force_logout adicionada.');
    } catch (err) {
        console.error('Erro na migração:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

run();
