const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// Middleware de verificação de Desenvolvedor
const checkDev = (req, res, next) => {
    const role = req.headers['x-role'] || '';
    if (role.toLowerCase() === 'desenvolvedor' || role.toLowerCase() === 'admin') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Acesso negado. Apenas desenvolvedores.' });
    }
};

// GET: Lista todos os bloqueios ativos
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM page_locks');
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Erro ao buscar bloqueios:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar bloqueios' });
    }
});

// POST: Alterna o bloqueio de uma página
router.post('/toggle', checkDev, async (req, res) => {
    const { page_id, is_locked } = req.body;

    if (!page_id) {
        return res.status(400).json({ success: false, message: 'ID da página é obrigatório.' });
    }

    try {
        await pool.query(`
            INSERT INTO page_locks (page_id, is_locked)
            VALUES ($1, $2)
            ON CONFLICT (page_id) 
            DO UPDATE SET is_locked = EXCLUDED.is_locked, updated_at = CURRENT_TIMESTAMP
        `, [page_id, is_locked]);

        res.json({ success: true, message: `Página ${page_id} ${is_locked ? 'bloqueada' : 'desbloqueada'} com sucesso.` });
    } catch (error) {
        console.error('Erro ao alternar bloqueio:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar bloqueio' });
    }
});

module.exports = router;
