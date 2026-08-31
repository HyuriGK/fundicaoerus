const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

let tableReady = false;
async function ensureTable() {
    if (tableReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS pedidos_conferencia (
            sync_key TEXT PRIMARY KEY,
            conferido BOOLEAN NOT NULL DEFAULT false,
            updated_at TIMESTAMP DEFAULT NOW(),
            updated_by TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_pedidos_conferencia_sync_key ON pedidos_conferencia(sync_key);
    `);
    tableReady = true;
}

router.post('/save', async (req, res) => {
    const { sync_key, conferido } = req.body;
    const role = String((req.user && req.user.role) || req.headers['x-role'] || '').trim().toLowerCase();
    const user = String((req.user && (req.user.user || req.user.username || req.user.name)) || '').trim();

    if (role !== 'desenvolvedor') return res.status(403).json({ error: 'Apenas desenvolvedor pode alterar conferencia' });
    if (!sync_key) return res.status(400).json({ error: 'Sync Key e obrigatorio' });

    try {
        await ensureTable();
        await pool.query(`
            INSERT INTO pedidos_conferencia (sync_key, conferido, updated_at, updated_by)
            VALUES ($1, $2, NOW(), $3)
            ON CONFLICT (sync_key)
            DO UPDATE SET conferido = EXCLUDED.conferido, updated_at = NOW(), updated_by = EXCLUDED.updated_by
        `, [String(sync_key), !!conferido, user || null]);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao salvar conferencia de pedido:', err);
        res.status(500).json({ error: 'Erro interno ao salvar conferencia' });
    }
});

router.post('/save-batch', async (req, res) => {
    const { sync_keys, conferido } = req.body;
    const role = String((req.user && req.user.role) || req.headers['x-role'] || '').trim().toLowerCase();
    const user = String((req.user && (req.user.user || req.user.username || req.user.name)) || '').trim();

    if (role !== 'desenvolvedor') return res.status(403).json({ error: 'Apenas desenvolvedor pode alterar conferencia' });
    if (!Array.isArray(sync_keys) || !sync_keys.length) return res.status(400).json({ error: 'Nenhum pedido informado' });

    try {
        await ensureTable();
        const keys = [...new Set(sync_keys.map(String).filter(Boolean))];
        await pool.query(`
            INSERT INTO pedidos_conferencia (sync_key, conferido, updated_at, updated_by)
            SELECT UNNEST($1::text[]), $2, NOW(), $3
            ON CONFLICT (sync_key)
            DO UPDATE SET conferido = EXCLUDED.conferido, updated_at = NOW(), updated_by = EXCLUDED.updated_by
        `, [keys, !!conferido, user || null]);
        res.json({ success: true, count: keys.length });
    } catch (err) {
        console.error('Erro ao salvar conferencias em lote:', err);
        res.status(500).json({ error: 'Erro interno ao salvar conferencias' });
    }
});

module.exports = router;
