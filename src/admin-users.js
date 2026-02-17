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

// LISTAR USUÁRIOS
router.get('/', checkDevRole, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, name, role, last_login, created_at, approved FROM users ORDER BY name');
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

module.exports = router;
