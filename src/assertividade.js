const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// Route to fetch synchronized assertiveness data
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                sync_key, 
                data,
                updated_at 
            FROM firebird_sync_assertividade 
            ORDER BY updated_at DESC
            LIMIT 2000
        `);

        // Extract JSONB to root level
        const assertividade = result.rows.map(row => ({
            ...row.data,
            _sync_updated_at: row.updated_at
        }));

        res.json(assertividade);
    } catch (error) {
        console.error('Erro ao buscar dados de assertividade sincronizados:', error);
        res.status(500).json({ error: 'Erro interno ao buscar dados de assertividade.' });
    }
});

module.exports = router;
