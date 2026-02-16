const pool = require('../../lib/db');

/**
 * Registra uma atividade no log de auditoria.
 * @param {string} username - Nome do usuário que realizou a ação.
 * @param {string} action - O que foi feito (LOGIN, ADD, UPDATE, DELETE).
 * @param {string} table - Tabela afetada (opcional).
 * @param {object} details - Detalhes adicionativos em formato JSON (opcional).
 */
async function logActivity(username, action, table = null, details = null) {
    const query = `
        INSERT INTO audit_logs (user_name, action, table_name, details)
        VALUES ($1, $2, $3, $4)
    `;
    const values = [username, action.toUpperCase(), table, details ? JSON.stringify(details) : null];

    try {
        await pool.query(query, values);
    } catch (error) {
        console.error('❌ Erro ao gravar log de auditoria:', error);
    }
}

module.exports = { logActivity };
