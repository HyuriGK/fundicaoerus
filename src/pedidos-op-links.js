const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { logActivity } = require('./lib/logger');

// Rota para confirmar ou rejeitar um vínculo sugerido
router.post('/confirm', async (req, res) => {
    const { sync_key, op, status, user } = req.body;

    if (!sync_key || !op || !status) {
        return res.status(400).json({ error: 'Campos sync_key, op e status são obrigatórios.' });
    }

    try {
        console.log(`🔗 Processando vínculo: ${sync_key} -> OP ${op} (${status})`);
        
        const query = `
            INSERT INTO pedidos_op_links (sync_key, op, status, confirmed_by, confirmed_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (sync_key) 
            DO UPDATE SET 
                op = EXCLUDED.op,
                status = EXCLUDED.status,
                confirmed_by = EXCLUDED.confirmed_by,
                confirmed_at = NOW();
        `;
        
        await pool.query(query, [sync_key, op, status, user || 'Sistema']);

        logActivity(user || req.user && req.user.name || 'Sistema', 'VINCULO_OP', 'pedidos_op_links', { sync_key, op, status });

        res.json({ success: true, message: `Vínculo ${status} com sucesso.` });
    } catch (error) {
        console.error('❌ Erro ao salvar vínculo:', error);
        res.status(500).json({ error: 'Erro interno ao salvar vínculo.' });
    }
});

// Rota para buscar todos os vínculos manuais
router.get('/list', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM pedidos_op_links');
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Erro ao buscar vínculos:', error);
        res.status(500).json({ error: 'Erro interno ao buscar vínculos.' });
    }
});

module.exports = router;
