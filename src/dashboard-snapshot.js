const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { getDashboardSnapshot } = require('../lib/dashboard-snapshot');
const { refreshDashboardSnapshot } = require('../scripts/sync/refresh-dashboard-snapshot');

router.post('/refresh', async (req, res) => {
    try {
        await refreshDashboardSnapshot();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/auto', async (req, res) => {
    try {
        const [faturamento, carteira, refugo, producao, meta] = await Promise.all([
            getDashboardSnapshot('faturamento'),
            getDashboardSnapshot('carteira'),
            getDashboardSnapshot('refugo'),
            getDashboardSnapshot('producao_setores'),
            pool.query(`SELECT meta_peso FROM metas_faturamento WHERE mes_ano = TO_CHAR(CURRENT_DATE, 'YYYY-MM')`)
        ]);

        if (!faturamento || !carteira || !refugo || !producao) {
            return res.status(503).json({ success: false, message: 'Aguardando snapshots automáticos.' });
        }

        res.set('Cache-Control', 'no-store');
        res.json({
            success: true,
            data: {
                faturamento: faturamento.payload,
                carteira: carteira.payload,
                refugo: refugo.payload,
                producao: { totals: producao.payload.totals || {} },
                meta: { pesoKg: Number(meta.rows[0]?.meta_peso || 0) }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/:key?', async (req, res) => {
    try {
        const snapshot = await getDashboardSnapshot(req.params.key || 'global');
        if (!snapshot) return res.status(404).json({ success: false, message: 'Snapshot ainda não gerado.' });
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, data: snapshot.payload, sourceStatus: snapshot.source_status, updatedAt: snapshot.updated_at });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
