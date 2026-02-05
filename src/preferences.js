const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// Ensure table exists
(async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS app_preferences (
                key TEXT PRIMARY KEY,
                value JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela app_preferences verificada/criada.');
    } catch (err) {
        console.error('❌ Erro ao verificar tabela app_preferences:', err);
    }
})();

// GET /api/preferences/:key
router.get('/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const result = await pool.query('SELECT value FROM app_preferences WHERE key = $1', [key]);

        if (result.rows.length > 0) {
            res.json({ success: true, data: result.rows[0].value });
        } else {
            res.json({ success: true, data: null });
        }
    } catch (error) {
        console.error('Erro ao buscar preferência:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/preferences/:key
router.post('/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        await pool.query(`
            INSERT INTO app_preferences (key, value, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (key) 
            DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
        `, [key, value]);

        res.json({ success: true, message: 'Preferência salva com sucesso.' });
    } catch (error) {
        console.error('Erro ao salvar preferência:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
