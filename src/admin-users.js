const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { logActivity } = require('./lib/logger');
const { requireRole } = require('../lib/middleware');

const checkDevRole = requireRole('desenvolvedor', 'admin');

(async () => {
    try {
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_monetary BOOLEAN NOT NULL DEFAULT FALSE');
    } catch (error) {
        console.error('Erro ao verificar coluna can_view_monetary:', error);
    }
})();

// LISTAR USUÁRIOS (com última atividade do audit_logs)
router.get('/', checkDevRole, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                u.id, u.username, u.name, u.role, u.last_login, u.created_at, u.approved,
                u.can_view_monetary,
                la.last_activity_at,
                la.last_activity_page,
                la.last_activity_device
            FROM users u
            LEFT JOIN LATERAL (
                SELECT created_at AS last_activity_at, table_name AS last_activity_page, details->>'device_type' AS last_activity_device
                FROM audit_logs
                WHERE user_name = u.name
                  AND table_name IN (
                    'users',
                    'index.html',
                    'apontamentos_produtivos.html',
                    'amostras.html',
                    'producao_apontada.html',
                    'acabamento_externo.html',
                    'usinagem_externa.html',
                    'faturamentos.html',
                    'faturamento_detalhado.html',
                    'controle_dureza.html',
                    'clientes.html',
                    'aderencia.html',
                    'refugos.html',
                    'pedidos.html',
                    'carteira.html',
                    'fichatecmoldagem.html',
                    'fichatecfusao.html',
                    'fichatecacabamento.html',
                    'custos.html',
                    'centrocusto.html'
                  )
                ORDER BY created_at DESC
                LIMIT 1
            ) la ON true
            ORDER BY u.name
        `);
        res.json({ success: true, users: result.rows });
    } catch (error) {
        console.error('Erro ao listar usuários:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar usuários.' });
    }
});

// ATUALIZAR ROLE
router.put('/:username/role', checkDevRole, async (req, res) => {
    const { username } = req.params;
    const { role } = req.body;

    if (!role) {
        return res.status(400).json({ success: false, message: 'Role não fornecido.' });
    }

    try {
        const result = await pool.query('UPDATE users SET role = $1 WHERE username = $2 RETURNING username, role', [role.toLowerCase(), username]);
        if (!result.rows.length) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        const adminUser = req.user.name || 'Admin'; // Idealmente pegaríamos do req.user
        logActivity(adminUser, 'UPDATE_ROLE', 'users', { affected_user: username, new_role: role });
        res.json({ success: true, message: 'Permissão atualizada com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar role:', error);
        res.status(500).json({ success: false, message: 'Erro ao atualizar permissão.' });
    }
});

// DELETAR USUÁRIO (BANIR)
router.delete('/:username', checkDevRole, async (req, res) => {
    const { username } = req.params;

    try {
        // Prevenir deletar a si mesmo ou usuários protegidos se necessário
        // Aqui apenas deletamos direto
        const result = await pool.query('DELETE FROM users WHERE username = $1 RETURNING username', [username]);
        if (!result.rows.length) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        const adminUser = req.user.name || 'Admin';
        logActivity(adminUser, 'BAN_USER', 'users', { affected_user: username });
        res.json({ success: true, message: 'Usuário banido com sucesso.' });
    } catch (error) {
        console.error('Erro ao deletar usuário:', error);
        res.status(500).json({ success: false, message: 'Erro ao banir usuário.' });
    }
});

// APROVAR USUÁRIO
router.put('/:username/approve', checkDevRole, async (req, res) => {
    const { username } = req.params;

    try {
        const result = await pool.query('UPDATE users SET approved = TRUE WHERE username = $1 RETURNING username', [username]);
        if (!result.rows.length) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        const adminUser = req.user.name || 'Admin';
        logActivity(adminUser, 'APPROVE_USER', 'users', { affected_user: username });
        res.json({ success: true, message: 'Usuário aprovado com sucesso.' });
    } catch (error) {
        console.error('Erro ao aprovar usuário:', error);
        res.status(500).json({ success: false, message: 'Erro ao aprovar usuário.' });
    }
});

// BLOQUEAR USUÁRIO
router.put('/:username/block', checkDevRole, async (req, res) => {
    const { username } = req.params;

    try {
        const result = await pool.query('UPDATE users SET approved = FALSE WHERE username = $1 RETURNING username', [username]);
        if (!result.rows.length) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        const adminUser = req.user.name || 'Admin';
        logActivity(adminUser, 'BLOCK_USER', 'users', { affected_user: username });
        res.json({ success: true, message: 'Usuário bloqueado com sucesso.' });
    } catch (error) {
        console.error('Erro ao bloquear usuário:', error);
        res.status(500).json({ success: false, message: 'Erro ao bloquear usuário.' });
    }
});

// KICK (FORÇAR LOGOUT)
router.put('/:username/kick', checkDevRole, async (req, res) => {
    const { username } = req.params;
    try {
        const result = await pool.query('UPDATE users SET force_logout = TRUE WHERE username = $1 RETURNING username', [username]);
        if (!result.rows.length) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        const adminUser = req.user.name || 'Admin';
        logActivity(adminUser, 'KICK_USER', 'users', { affected_user: username });
        res.json({ success: true, message: `Usuário ${username} será desconectado.` });
    } catch (error) {
        console.error('Erro ao kickar usuário:', error);
        res.status(500).json({ success: false, message: 'Erro ao desconectar usuário.' });
    }
});

// TOGGLE PERMISSÃO MONETÁRIA
router.put('/:username/monetary', checkDevRole, async (req, res) => {
    const { username } = req.params;
    const { can_view_monetary } = req.body;

    if (typeof can_view_monetary !== 'boolean') {
        return res.status(400).json({ success: false, message: 'can_view_monetary deve ser boolean.' });
    }

    try {
        const result = await pool.query('UPDATE users SET can_view_monetary = $1 WHERE username = $2 RETURNING username, can_view_monetary', [can_view_monetary, username]);
        if (!result.rows.length) return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        const adminUser = req.user.name || 'Admin';
        logActivity(adminUser, 'UPDATE_MONETARY_PERM', 'users', { affected_user: username, can_view_monetary });
        res.json({ success: true, message: `Permissão monetária ${can_view_monetary ? 'habilitada' : 'desabilitada'} para ${username}.` });
    } catch (error) {
        console.error('Erro ao atualizar permissão monetária:', error);
        res.status(500).json({ success: false, message: 'Erro ao atualizar permissão.' });
    }
});

// LISTAR LOGS DE AUDITORIA
router.get('/logs', checkDevRole, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200');
        res.json({ success: true, logs: result.rows });
    } catch (error) {
        console.error('Erro ao listar logs:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar logs de auditoria.' });
    }
});

// LISTAR LOGS DE UM USUÁRIO ESPECÍFICO
router.get('/:username/logs', checkDevRole, async (req, res) => {
    const { username } = req.params;
    const limitParam = req.query.limit;

    try {
        const userResult = await pool.query('SELECT name FROM users WHERE username = $1', [username]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        }

        const displayName = userResult.rows[0].name;

        const query = limitParam === 'all'
            ? 'SELECT * FROM audit_logs WHERE user_name = $1 ORDER BY created_at DESC'
            : `SELECT * FROM audit_logs WHERE user_name = $1 ORDER BY created_at DESC LIMIT ${parseInt(limitParam) || 100}`;

        const result = await pool.query(query, [displayName]);

        res.json({ success: true, logs: result.rows });
    } catch (error) {
        console.error('Erro ao listar logs do usuário:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar logs do usuário.' });
    }
});

module.exports = router;
