const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

function checkDevPermission(req, res, next) {
    const role = String((req.user && req.user.role) || req.headers['x-role'] || '').toLowerCase();
    if (role !== 'desenvolvedor' && role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Acesso negado.' });
    }
    next();
}

async function ensureTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS role_permissions (
            role VARCHAR NOT NULL,
            page_key VARCHAR NOT NULL,
            allowed BOOLEAN NOT NULL DEFAULT true,
            PRIMARY KEY (role, page_key)
        )
    `);
}

// GET — public, used by sidebar to enforce visibility
router.get('/', async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureTable(client);
        const result = await client.query('SELECT role, page_key, allowed FROM role_permissions');
        res.json(result.rows);
    } catch (e) {
        console.error('Erro GET permissions:', e);
        res.status(500).json({ error: e.message });
    } finally { client.release(); }
});

// POST — desenvolvedor only, upserts one permission
router.post('/', checkDevPermission, async (req, res) => {

    const { role, page_key, allowed } = req.body;
    if (!role || !page_key || typeof allowed !== 'boolean')
        return res.status(400).json({ error: 'Missing fields' });
    if (role === 'desenvolvedor')
        return res.status(400).json({ error: 'Cannot modify desenvolvedor permissions' });

    const client = await pool.connect();
    try {
        await ensureTable(client);
        await client.query(
            `INSERT INTO role_permissions (role, page_key, allowed) VALUES ($1, $2, $3)
             ON CONFLICT (role, page_key) DO UPDATE SET allowed = $3`,
            [role, page_key, allowed]
        );
        res.json({ success: true });
    } catch (e) {
        console.error('Erro POST permissions:', e);
        res.status(500).json({ error: e.message });
    } finally { client.release(); }
});

module.exports = router;
