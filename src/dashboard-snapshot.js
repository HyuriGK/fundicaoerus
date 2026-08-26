const express = require('express');
const router = express.Router();
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
