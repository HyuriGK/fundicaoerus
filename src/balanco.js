const express = require('express');
const router = express.Router();
const { Firebird, options: firebirdOptions } = require('../lib/firebird-helper');

router.get('/pagamentos', (req, res) => {
    Firebird.attach(firebirdOptions, (err, db) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        const query = `
            SELECT
                p.CODIGO_PAP,
                p.DESPESA_PAP,
                p.VALOR_PAP,
                p.DATA_BAIXA_PAP,
                p.HISTORICO_CAIXA_PAP
            FROM PAGAR_PAGAMENTO p
            WHERE p.DATA_BAIXA_PAP >= '2025-01-01'
              AND p.DATA_BAIXA_PAP < '2027-01-01'
              AND p.DATA_BAIXA_PAP IS NOT NULL
            ORDER BY p.DATA_BAIXA_PAP DESC
        `;

        db.query(query, (err, rows) => {
            db.detach();
            if (err) return res.status(500).json({ success: false, error: err.message });

            const data = (rows || []).map(r => ({
                codigo: r.CODIGO_PAP,
                despesa: r.DESPESA_PAP,
                valor: parseFloat(r.VALOR_PAP) || 0,
                data: r.DATA_BAIXA_PAP ? new Date(r.DATA_BAIXA_PAP).toISOString().split('T')[0] : null,
                historico: r.HISTORICO_CAIXA_PAP || ''
            }));

            res.json({ success: true, data });
        });
    });
});

module.exports = router;
