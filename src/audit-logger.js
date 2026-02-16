
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// POST /api/audit-logger/log
router.post('/log', async (req, res) => {
    try {
        const { user_name, action, table_name, details } = req.body;

        if (!user_name || !action) {
            return res.status(400).json({ error: 'Missing required fields: user_name, action' });
        }

        // Insert into audit_logs
        await pool.query(
            `INSERT INTO audit_logs (user_name, action, table_name, details) 
             VALUES ($1, $2, $3, $4)`,
            [user_name, action, table_name || null, details ? JSON.stringify(details) : null]
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
        const limit = parseInt(req.query.limit) || 100;
        const result = await pool.query(
            `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1`,
            [limit]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

module.exports = router;
