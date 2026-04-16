const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// POST /save - Salva ou atualiza uma observação
router.post('/save', async (req, res) => {
    const { sync_key, observacao } = req.body;

    if (!sync_key) {
        return res.status(400).json({ error: 'Sync Key é obrigatório' });
    }

    try {
        await pool.query(`
            INSERT INTO pedidos_observacoes (sync_key, observacao, updated_at) 
            VALUES ($1, $2, NOW())
            ON CONFLICT (sync_key) 
            DO UPDATE SET observacao = EXCLUDED.observacao, updated_at = NOW()
        `, [String(sync_key), String(observacao || '')]);

        res.json({ success: true, message: 'Observação salva com sucesso' });
    } catch (err) {
        console.error('Erro ao salvar observação:', err);
        res.status(500).json({ error: 'Erro interno ao salvar observação' });
    }
});

module.exports = router;
