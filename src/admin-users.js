const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { logActivity } = require('./lib/logger');

// Middleware para verificar se é desenvolvedor
const checkDevRole = async (req, res, next) => {
    // Em uma implementação real com sessão/token, validaríamos aqui.
    // Como o front envia o role no localStorage, aqui vamos confiar (por enquanto)
    // ou idealmente validaríamos um token JWT. 
    // Para simplificar e manter compatível com o auth.js atual:
    // Vamos assumir que apenas quem tem acesso a essa rota via front é dev.
    // Mas por segurança, vamos pedir um header 'x-role'
    const role = req.headers['x-role'];
    if (role !== 'desenvolvedor') {
        return res.status(403).json({ success: false, message: 'Acesso negado.' });
    }
    next();
};

// LISTAR USUÁRIOS (com última atividade do audit_logs)
router.get('/', checkDevRole, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.id, u.username, u.name, u.role, u.last_login, u.created_at, u.approved,
                la.last_activity_at,
                la.last_activity_page
            FROM users u
            LEFT JOIN LATERAL (
                SELECT created_at AS last_activity_at, table_name AS last_activity_page
                FROM audit_logs
                WHERE user_name = u.name
                  AND table_name IN (
                    'index.html',
                    'apontamentos_produtivos.html',
                    'amostras.html',
                    'producao_apontada.html',
                    'acabamento_externo.html',
                    'usinagem_externo.html',
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
                    'custos.html'
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
        await pool.query('UPDATE users SET role = $1 WHERE username = $2', [role.toLowerCase(), username]);
        const adminUser = req.headers['x-user'] || 'Admin'; // Idealmente pegaríamos do req.user
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
        await pool.query('DELETE FROM users WHERE username = $1', [username]);
        const adminUser = req.headers['x-user'] || 'Admin';
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
        await pool.query('UPDATE users SET approved = TRUE WHERE username = $1', [username]);
        const adminUser = req.headers['x-user'] || 'Admin';
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
        await pool.query('UPDATE users SET approved = FALSE WHERE username = $1', [username]);
        const adminUser = req.headers['x-user'] || 'Admin';
        logActivity(adminUser, 'BLOCK_USER', 'users', { affected_user: username });
        res.json({ success: true, message: 'Usuário bloqueado com sucesso.' });
    } catch (error) {
        console.error('Erro ao bloquear usuário:', error);
        res.status(500).json({ success: false, message: 'Erro ao bloquear usuário.' });
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
