const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

router.get('/pagamentos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                codigo_pap,
                despesa_pap,
                valor_pap,
                data_baixa_pap,
                historico_pap
            FROM balanco_pagamentos
            WHERE data_baixa_pap >= '2025-01-01'
              AND data_baixa_pap < '2027-01-01'
            ORDER BY data_baixa_pap DESC
        `);

        const data = result.rows.map(r => ({
            codigo:   r.codigo_pap,
            despesa:  r.despesa_pap,
            valor:    parseFloat(r.valor_pap) || 0,
            data:     r.data_baixa_pap ? r.data_baixa_pap.toISOString().split('T')[0] : null,
            historico: r.historico_pap || ''
        }));

        res.json({ success: true, data });
    } catch (e) {
        console.error('❌ Erro /api/balanco/pagamentos:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
