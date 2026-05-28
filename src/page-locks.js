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
    const { page_id, is_locked, lock_reason } = req.body;

    if (!page_id) {
        return res.status(400).json({ success: false, message: 'ID da página é obrigatório.' });
    }

    const reason = is_locked ? (lock_reason || 'maintenance') : null;

    try {
        await pool.query(`
            INSERT INTO page_locks (page_id, is_locked, lock_reason)
            VALUES ($1, $2, $3)
            ON CONFLICT (page_id)
            DO UPDATE SET is_locked = EXCLUDED.is_locked, lock_reason = EXCLUDED.lock_reason, updated_at = CURRENT_TIMESTAMP
        `, [page_id, is_locked, reason]);

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
        // Calcular estimativa baseada na média das últimas 3 sincronizações
        const historyResult = await pool.query(
            `SELECT duration_ms FROM sync_history
             WHERE page_id = $1
             ORDER BY created_at DESC LIMIT 10`,
            [page_id]
        );

        let estimatedMs = 120000; // Default: 2 minutos
        if (historyResult.rows.length > 0) {
            const sum = historyResult.rows.reduce((acc, r) => acc + r.duration_ms, 0);
            estimatedMs = Math.round(sum / historyResult.rows.length);
        }

        const now = new Date();

        await pool.query(`ALTER TABLE page_locks ADD COLUMN IF NOT EXISTS sync_progress INT DEFAULT 0`);
        await pool.query(`
            INSERT INTO page_locks (page_id, is_locked, lock_reason, sync_started_at, sync_estimated_ms, sync_progress)
            VALUES ($1, true, 'sync', $2, $3, 0)
            ON CONFLICT (page_id)
            DO UPDATE SET is_locked = true, lock_reason = 'sync',
                          sync_started_at = $2, sync_estimated_ms = $3, sync_progress = 0,
                          updated_at = CURRENT_TIMESTAMP
        `, [page_id, now, estimatedMs]);

        console.log(`🔒 Sync lock ativado: ${page_id} (estimativa: ${Math.round(estimatedMs / 1000)}s)`);
        res.json({
            success: true,
            message: `Página ${page_id} bloqueada para sincronização.`,
            estimated_ms: estimatedMs
        });
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
        // Buscar o horário de início do sync para calcular a duração real
        const lockResult = await pool.query(
            'SELECT sync_started_at FROM page_locks WHERE page_id = $1',
            [page_id]
        );

        const now = new Date();
        let durationMs = 0;

        if (lockResult.rows.length > 0 && lockResult.rows[0].sync_started_at) {
            const startedAt = new Date(lockResult.rows[0].sync_started_at);
            durationMs = now.getTime() - startedAt.getTime();

            // Registrar no histórico
            await pool.query(
                `INSERT INTO sync_history (page_id, started_at, finished_at, duration_ms)
                 VALUES ($1, $2, $3, $4)`,
                [page_id, startedAt, now, durationMs]
            );
        }

        // Desbloquear a página
        await pool.query(`
            UPDATE page_locks 
            SET is_locked = false, lock_reason = NULL, 
                sync_started_at = NULL, sync_estimated_ms = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE page_id = $1
        `, [page_id]);

        console.log(`🔓 Sync lock removido: ${page_id} (duração real: ${Math.round(durationMs / 1000)}s)`);
        res.json({
            success: true,
            message: `Página ${page_id} desbloqueada após sincronização.`,
            duration_ms: durationMs
        });
    } catch (error) {
        console.error('Erro ao remover sync lock:', error);
        res.status(500).json({ success: false, message: 'Erro ao desbloquear página.' });
    }
});

// GET: Retorna última sincronização concluída por página
router.get('/last-sync', async (req, res) => {
    // Mapeamento screen_name (sync_status) → page_id
    const screenToPage = {
        'Faturamento':  'faturamentos.html',
        'Pedidos':      'pedidos.html',
        'Industrial':   'pedidos.html',
        'Produção':     'pedidos.html',
        'Emissões':     'pedidos.html',
        'Refugos':      'refugos.html',
        'Custos':       'custos.html',
        'Devoluções':   'devolucoes.html',
        'Assertividade':'comparativo.html',
        'Balanco':      'balanco.html',
    };
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS sync_history (
            id SERIAL PRIMARY KEY, page_id VARCHAR(255),
            started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
            duration_ms INT, created_at TIMESTAMPTZ DEFAULT NOW()
        )`);

        // Fonte primária: sync_history (populada pelo lock/unlock)
        const histResult = await pool.query(`
            SELECT DISTINCT ON (page_id) page_id, finished_at
            FROM sync_history ORDER BY page_id, finished_at DESC
        `);
        const byPage = {};
        histResult.rows.forEach(r => { byPage[r.page_id] = r.finished_at; });

        // Fallback: sync_status (populada diretamente pelos scripts)
        const ssResult = await pool.query(`SELECT screen_name, last_sync_at FROM sync_status`);
        ssResult.rows.forEach(r => {
            const page = screenToPage[r.screen_name];
            if (page && !byPage[page]) byPage[page] = r.last_sync_at;
            // Se já existe mas sync_status é mais recente, usa o mais recente
            if (page && byPage[page] && new Date(r.last_sync_at) > new Date(byPage[page]))
                byPage[page] = r.last_sync_at;
        });

        const data = Object.entries(byPage).map(([page_id, finished_at]) => ({ page_id, finished_at }));
        res.json({ success: true, data });
    } catch (error) {
        console.error('Erro last-sync:', error);
        res.status(500).json({ success: false, data: [] });
    }
});

// POST: Atualiza progresso real da sincronização (chamado pelo sync-forever)
router.post('/sync-progress', async (req, res) => {
    const { page_id, progress } = req.body;
    if (!page_id || progress === undefined) {
        return res.status(400).json({ success: false });
    }
    try {
        await pool.query(
            `UPDATE page_locks SET sync_progress = $2 WHERE page_id = $1 AND is_locked = true`,
            [page_id, Math.min(100, Math.max(0, parseInt(progress) || 0))]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

module.exports = router;

