const express = require('express');
const router = express.Router();
const { getDashboardSnapshot } = require('../lib/dashboard-snapshot');

router.get('/', async (req, res) => {
    try {
        const snapshot = await getDashboardSnapshot('global');
        if (!snapshot) return res.status(404).json({ success: false, message: 'Snapshot ainda não gerado.' });
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, data: snapshot.payload, sourceStatus: snapshot.source_status, updatedAt: snapshot.updated_at });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
