const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

const VALID_STATUSES = new Set([
    'MODELO LIBERADO PRODUZIR',
    'MODELO NÃO ESTA NA ERUS',
    'MODELO ESTA NA MODELARIA AJUSTANDO',
    'MODELO VEIO DA FASE E PRECISA SAIR PARA MODELARIA AJUSTAR'
]);

let tableReady = false;
async function ensureTable() {
    if (tableReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS pedidos_modelo_status (
            sync_key TEXT PRIMARY KEY,
            modelo_status TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_pedidos_modelo_status_sync_key ON pedidos_modelo_status(sync_key);
    `);
    tableReady = true;
}

router.post('/save', async (req, res) => {
    const { sync_key, modelo_status } = req.body;
    const status = String(modelo_status || '').trim().toUpperCase();

    if (!sync_key) return res.status(400).json({ error: 'Sync Key é obrigatório' });
    if (status && !VALID_STATUSES.has(status)) return res.status(400).json({ error: 'Status inválido' });

    try {
        await ensureTable();
        if (!status) {
            await pool.query('DELETE FROM pedidos_modelo_status WHERE sync_key = $1', [String(sync_key)]);
        } else {
            await pool.query(`
                INSERT INTO pedidos_modelo_status (sync_key, modelo_status, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (sync_key)
                DO UPDATE SET modelo_status = EXCLUDED.modelo_status, updated_at = NOW()
            `, [String(sync_key), status]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao salvar status do modelo:', err);
        res.status(500).json({ error: 'Erro interno ao salvar status do modelo' });
    }
});

module.exports = router;
