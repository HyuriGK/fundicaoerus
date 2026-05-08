const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

router.get('/pagamentos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.codigo_pap, p.despesa_pap, d.nome_des, p.valor_pap, p.data_baixa_pap, p.historico_pap
            FROM balanco_pagamentos p
            LEFT JOIN balanco_despesas d ON d.codigo_des = p.despesa_pap
            WHERE p.data_baixa_pap >= '2025-01-01' AND p.data_baixa_pap < '2027-01-01'
            ORDER BY p.data_baixa_pap DESC
        `);
        const data = result.rows.map(r => ({
            codigo:       r.codigo_pap,
            despesa:      r.despesa_pap,
            nomeDespesa:  r.nome_des || '',
            valor:        parseFloat(r.valor_pap) || 0,
            data:         r.data_baixa_pap ? r.data_baixa_pap.toISOString().split('T')[0] : null,
            historico:    r.historico_pap || ''
        }));
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/recebimentos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT codigo_rcp, valor_rcp, data_pagamento_rcp, historico_rcp
            FROM balanco_recebimentos
            WHERE data_pagamento_rcp >= '2025-01-01' AND data_pagamento_rcp < '2027-01-01'
            ORDER BY data_pagamento_rcp DESC
        `);
        const data = result.rows.map(r => ({
            codigo:    r.codigo_rcp,
            valor:     parseFloat(r.valor_rcp) || 0,
            data:      r.data_pagamento_rcp ? r.data_pagamento_rcp.toISOString().split('T')[0] : null,
            historico: r.historico_rcp || ''
        }));
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
