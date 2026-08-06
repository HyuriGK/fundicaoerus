const pool = require('../lib/db');

async function run() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS clientes_bloqueio_crm (
            empresa INTEGER NOT NULL,
            codigo INTEGER NOT NULL,
            bloqueado BOOLEAN NOT NULL DEFAULT FALSE,
            motivo_bloqueio TEXT,
            updated_by TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (empresa, codigo)
        )
    `);
    console.log('Tabela clientes_bloqueio_crm pronta no Neon PostgreSQL.');
}

run()
    .catch(error => {
        console.error('Erro ao preparar bloqueio de clientes:', error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
