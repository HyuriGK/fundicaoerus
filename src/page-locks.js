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

// POST: Alterna o bloqueio de uma página (manual, via admin)
router.post('/toggle', checkDev, async (req, res) => {
    const { page_id, is_locked } = req.body;

    if (!page_id) {
        return res.status(400).json({ success: false, message: 'ID da página é obrigatório.' });
    }

    try {
        await pool.query(`
            INSERT INTO page_locks (page_id, is_locked, lock_reason)
            VALUES ($1, $2, $3)
            ON CONFLICT (page_id) 
            DO UPDATE SET is_locked = EXCLUDED.is_locked, lock_reason = EXCLUDED.lock_reason, updated_at = CURRENT_TIMESTAMP
        `, [page_id, is_locked, is_locked ? 'manual' : null]);

        res.json({ success: true, message: `Página ${page_id} ${is_locked ? 'bloqueada' : 'desbloqueada'} com sucesso.` });
    } catch (error) {
        console.error('Erro ao alternar bloqueio:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar bloqueio' });
    }
});

// POST: Bloquear página durante sincronização (chamado pelos scripts .bat)
router.post('/sync-lock', async (req, res) => {
    const { page_id } = req.body;

    if (!page_id) {
        return res.status(400).json({ success: false, message: 'page_id é obrigatório.' });
    }

    try {
        await pool.query(`
            INSERT INTO page_locks (page_id, is_locked, lock_reason)
            VALUES ($1, true, 'sync')
            ON CONFLICT (page_id) 
            DO UPDATE SET is_locked = true, lock_reason = 'sync', updated_at = CURRENT_TIMESTAMP
        `, [page_id]);

        console.log(`🔒 Sync lock ativado: ${page_id}`);
        res.json({ success: true, message: `Página ${page_id} bloqueada para sincronização.` });
    } catch (error) {
        console.error('Erro ao ativar sync lock:', error);
        res.status(500).json({ success: false, message: 'Erro ao bloquear página.' });
    }
});

// POST: Desbloquear página após sincronização (chamado pelos scripts .bat)
router.post('/sync-unlock', async (req, res) => {
    const { page_id } = req.body;

    if (!page_id) {
        return res.status(400).json({ success: false, message: 'page_id é obrigatório.' });
    }

    try {
        await pool.query(`
            UPDATE page_locks 
            SET is_locked = false, lock_reason = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE page_id = $1
        `, [page_id]);

        console.log(`🔓 Sync lock removido: ${page_id}`);
        res.json({ success: true, message: `Página ${page_id} desbloqueada após sincronização.` });
    } catch (error) {
        console.error('Erro ao remover sync lock:', error);
        res.status(500).json({ success: false, message: 'Erro ao desbloquear página.' });
    }
});

module.exports = router;

