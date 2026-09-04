
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

function getDeviceDetails(req, details) {
    const ua = String((details && details.user_agent) || req.headers['user-agent'] || '');
    const deviceType = (details && details.device_type) || (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) ? 'mobile' : 'desktop');
    return {
        device_type: deviceType === 'mobile' ? 'mobile' : 'desktop',
        viewport: details && details.viewport ? details.viewport : null,
        user_agent: ua
    };
}

// POST /api/audit-logger/log
router.post('/log', async (req, res) => {
    try {
        const { action, table_name, details } = req.body;
        const userName = String(req.user?.name || req.user?.user || '').trim();

        if (!userName || !action) {
            return res.status(400).json({ error: 'Missing required fields: user_name, action' });
        }

        const enrichedDetails = details && typeof details === 'object'
            ? { ...details, ...getDeviceDetails(req, details) }
            : getDeviceDetails(req, null);

        // Insert into audit_logs
        await pool.query(
            `INSERT INTO audit_logs (user_name, action, table_name, details) 
             VALUES ($1, $2, $3, $4)`,
            [userName, String(action).slice(0, 100), table_name ? String(table_name).slice(0, 255) : null, JSON.stringify(enrichedDetails)]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error logging activity:', error);
        res.status(500).json({ error: 'Failed to log activity' });
    }
});

// GET /api/audit-logger/recent (Optional: for admin view)
router.get('/recent', async (req, res) => {
    try {
        const requestedLimit = String(req.query.limit || '100').toLowerCase();
        const result = requestedLimit === 'all'
            ? await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC')
            : await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1', [parseInt(requestedLimit) || 100]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

module.exports = router;
