require('dotenv').config({ path: '.env.local' });
const pool = require('../../lib/db');

async function createAuditLogsTable() {
    const query = `
        CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            user_name VARCHAR(100) NOT NULL,
            action VARCHAR(50) NOT NULL,
            table_name VARCHAR(50),
            details JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_name);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
    `;

    try {
        await pool.query(query);
        console.log('✅ Tabela audit_logs criada com sucesso!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro ao criar tabela audit_logs:', error);
        process.exit(1);
    }
}

createAuditLogsTable();
