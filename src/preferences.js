const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// Helper to ensure table exists
// In serverless/Neon, we can't rely on app startup. Check lazily.
let tableChecked = false;

async function ensureTable() {
    if (tableChecked) return;
    try {
        console.log('🔄 Checking app_preferences table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS app_preferences (
                key TEXT PRIMARY KEY,
                value JSONB,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        tableChecked = true;
        console.log('✅ Tabela app_preferences verificada/criada.');
    } catch (err) {
        console.error('❌ Erro CRÍTICO ao verificar/criar tabela app_preferences:', err);
        throw err; // Propagate to request handler
    }
}

// GET /api/preferences/:key
router.get('/:key', async (req, res) => {
    try {
        const { key } = req.params;
        console.log(`📥 GET preference: ${key}`);

        await ensureTable();

        const result = await pool.query('SELECT value FROM app_preferences WHERE key = $1', [key]);

        if (result.rows.length > 0) {
            console.log(`✅ Preferência encontrada para ${key}`);
            res.json({ success: true, data: result.rows[0].value });
        } else {
            console.log(`ℹ️ Nenhuma preferência salva para ${key}`);
            res.json({ success: true, data: null });
        }
    } catch (error) {
        console.error('❌ Erro GET preference:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/preferences/:key
router.post('/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        console.log(`💾 SAVING preference: ${key}`, { valueSize: Array.isArray(value) ? value.length : 'unknown' });

        await ensureTable();

        await pool.query(`
            INSERT INTO app_preferences (key, value, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (key) 
            DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
        `, [key, value]);

        console.log(`✅ Preferência ${key} salva com sucesso.`);
        res.json({ success: true, message: 'Preferência salva com sucesso.' });
    } catch (error) {
        console.error('❌ Erro POST preference:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
