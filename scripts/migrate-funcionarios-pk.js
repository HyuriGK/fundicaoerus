// Migration: drop single-column PK on mes_ano, replace with composite PK (mes_ano, setor)
require('dotenv').config({ path: '.env.local' });
const pool = require('../lib/db');

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Drop old primary key (only on mes_ano)
        await client.query('ALTER TABLE producao_funcionarios DROP CONSTRAINT producao_funcionarios_pkey');
        // Drop the unique constraint we added (will replace with PK)
        await client.query('ALTER TABLE producao_funcionarios DROP CONSTRAINT IF EXISTS producao_funcionarios_mes_ano_setor_key');
        // Add composite primary key
        await client.query('ALTER TABLE producao_funcionarios ADD PRIMARY KEY (mes_ano, setor)');
        await client.query('COMMIT');
        console.log('Migration completed.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}
migrate();
