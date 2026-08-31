const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const OBSERVACOES_PERMITIDAS = new Set([
    'AGUARD. APROVAÇÃO DE AMOSTRA',
    'BLOQUEIO COMERCIAL',
    'SEM FICHA TÉCNICA',
    'AGUARD. RETORNO COMERCIAL',
    'RODANDO AMOSTRA',
    'MODELO NÃO CHEGOU'
]);
const EDIT_ROLES = new Set(['ppcp', 'desenvolvedor']);

async function ensureHistoryTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS pedidos_observacoes_historico (
            id BIGSERIAL PRIMARY KEY,
            sync_key TEXT NOT NULL,
            observacao TEXT NOT NULL,
            started_at TIMESTAMP NOT NULL DEFAULT NOW(),
            ended_at TIMESTAMP,
            updated_by TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_pedidos_observacoes_historico_sync_key
            ON pedidos_observacoes_historico (sync_key, started_at DESC);
    `);
}

// POST /save - Salva ou atualiza uma observação
router.post('/save', async (req, res) => {
    const { sync_key, observacao } = req.body;
    const role = String((req.user && req.user.role) || req.headers['x-role'] || '').trim().toLowerCase();

    if (!sync_key) {
        return res.status(400).json({ error: 'Sync Key é obrigatório' });
    }
    if (!EDIT_ROLES.has(role)) {
        return res.status(403).json({ error: 'Sem permissão para alterar observação' });
    }

    const valor = String(observacao || '').trim().toUpperCase();
    if (valor && !OBSERVACOES_PERMITIDAS.has(valor)) {
        return res.status(400).json({ error: 'Observação inválida' });
    }

    if (valor === 'SEM FICHA TÉCNICA') {
        const ficha = await pool.query(`
            SELECT 1
            FROM firebird_sync_emissoes p
            JOIN ficha_tecnica f ON f.pro_codigo_fic = p.data->>'PRODUTO_PPR'
            WHERE p.sync_key = $1
            LIMIT 1
        `, [String(sync_key)]);
        if (ficha.rowCount) {
            return res.status(409).json({ error: 'Este item já possui ficha técnica' });
        }
    }

    const user = String((req.user && (req.user.user || req.user.username || req.user.name)) || '').trim();
    const client = await pool.connect();
    try {
        await ensureHistoryTable();
        await client.query('BEGIN');
        const current = await client.query(
            'SELECT observacao, updated_at FROM pedidos_observacoes WHERE sync_key = $1 FOR UPDATE',
            [String(sync_key)]
        );
        const previous = String(current.rows[0]?.observacao || '').trim().toUpperCase();
        if (previous !== valor) {
            const closed = await client.query(`
                UPDATE pedidos_observacoes_historico
                SET ended_at = NOW()
                WHERE sync_key = $1 AND ended_at IS NULL
            `, [String(sync_key)]);
            if (previous && !closed.rowCount) {
                await client.query(`
                    INSERT INTO pedidos_observacoes_historico (sync_key, observacao, started_at, ended_at, updated_by)
                    VALUES ($1, $2, $3, NOW(), $4)
                `, [String(sync_key), previous, current.rows[0].updated_at, user || null]);
            }
            if (valor) {
                await client.query(`
                    INSERT INTO pedidos_observacoes_historico (sync_key, observacao, started_at, updated_by)
                    VALUES ($1, $2, NOW(), $3)
                `, [String(sync_key), valor, user || null]);
            }
        }
        await client.query(`
            INSERT INTO pedidos_observacoes (sync_key, observacao, updated_at) 
            VALUES ($1, $2, NOW())
            ON CONFLICT (sync_key) 
            DO UPDATE SET observacao = EXCLUDED.observacao, updated_at = NOW()
        `, [String(sync_key), valor]);
        await client.query('COMMIT');
        res.json({ success: true, message: 'Observação salva com sucesso' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erro ao salvar observação:', err);
        res.status(500).json({ error: 'Erro interno ao salvar observação' });
    } finally {
        client.release();
    }
});

router.get('/history/:syncKey', async (req, res) => {
    const syncKey = String(req.params.syncKey || '').trim();
    if (!syncKey) return res.status(400).json({ error: 'Sync Key é obrigatório' });
    try {
        await ensureHistoryTable();
        await pool.query(`
            INSERT INTO pedidos_observacoes_historico (sync_key, observacao, started_at)
            SELECT o.sync_key, UPPER(TRIM(o.observacao)), o.updated_at
            FROM pedidos_observacoes o
            WHERE o.sync_key = $1
              AND TRIM(o.observacao) <> ''
              AND NOT EXISTS (
                  SELECT 1 FROM pedidos_observacoes_historico h WHERE h.sync_key = o.sync_key
              )
        `, [syncKey]);
        const result = await pool.query(`
            SELECT observacao, started_at, ended_at, updated_by
            FROM pedidos_observacoes_historico
            WHERE sync_key = $1
            ORDER BY started_at ASC
        `, [syncKey]);
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar histórico de observações:', err);
        res.status(500).json({ error: 'Erro interno ao buscar histórico' });
    }
});

module.exports = router;
