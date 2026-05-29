const pool = require('../lib/db');

async function run() {
    try {
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_monetary BOOLEAN NOT NULL DEFAULT FALSE
        `);
        console.log('Coluna can_view_monetary adicionada.');

        // Conceder permissão aos roles que já tinham acesso no hardcode
        const result = await pool.query(`
            UPDATE users
            SET can_view_monetary = TRUE
            WHERE role IN ('administrador', 'desenvolvedor', 'comercial', 'diretor', 'gerente comercial')
               OR name = 'Nadia Moschem'
        `);
        console.log(`${result.rowCount} usuário(s) receberam can_view_monetary = TRUE.`);
    } catch (err) {
        console.error('Erro na migração:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

run();
