// Migration: add setor column to producao_funcionarios, update unique constraint
require('dotenv').config({ path: '.env.local' });
const pool = require('../lib/db');

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Add setor column if not exists
        await client.query(`
            ALTER TABLE producao_funcionarios
            ADD COLUMN IF NOT EXISTS setor VARCHAR(100) NOT NULL DEFAULT 'GERAL'
        `);

        // Drop old unique constraint on mes_ano only (may have various names)
        const constraintRes = await client.query(`
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'producao_funcionarios'::regclass
            AND contype = 'u'
        `);
        for (const row of constraintRes.rows) {
            await client.query(`ALTER TABLE producao_funcionarios DROP CONSTRAINT IF EXISTS "${row.conname}"`);
        }

        // Add new unique constraint on (mes_ano, setor)
        await client.query(`
            ALTER TABLE producao_funcionarios
            ADD CONSTRAINT producao_funcionarios_mes_ano_setor_key UNIQUE (mes_ano, setor)
        `);

        // Migrate existing rows: set setor = 'MOLDAGEM GERAL' for legacy rows (setor = 'GERAL')
        await client.query(`
            UPDATE producao_funcionarios SET setor = 'MOLDAGEM GERAL' WHERE setor = 'GERAL'
        `);

        await client.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
