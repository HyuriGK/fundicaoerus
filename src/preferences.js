const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// SQL Schema for reference
const CREATE_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS app_preferences (
        key TEXT PRIMARY KEY,
        value JSONB,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`;

// GET /api/preferences/:key
router.get('/:key', async (req, res) => {
    const { key } = req.params;

    try {
        // Attempt 1: Direct Select
        const result = await pool.query('SELECT value FROM app_preferences WHERE key = $1', [key]);
        return sendResponse(res, result);

    } catch (error) {
        // If table doesn't exist (Postgres Code 42P01), create it and retry
        if (error.code === '42P01') {
            console.log('⚠️ Tabela não encontrada. Criando app_preferences...');
            try {
                await pool.query(CREATE_TABLE_SQL);
                // Attempt 2: Select after Create
                const retryResult = await pool.query('SELECT value FROM app_preferences WHERE key = $1', [key]);
                return sendResponse(res, retryResult);
            } catch (createError) {
                console.error('❌ Erro ao criar tabela no retry:', createError);
                return res.status(500).json({ success: false, error: 'Falha ao criar tabela: ' + createError.message });
            }
        }

        console.error('❌ Erro GET preference:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/preferences/:key
router.post('/:key', async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;

    const upsertQuery = `
        INSERT INTO app_preferences (key, value, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (key) 
        DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
    `;

    try {
        // Attempt 1: Direct Upsert
        await pool.query(upsertQuery, [key, value]);
        res.json({ success: true, message: 'Salvo com sucesso' });

    } catch (error) {
        // If table doesn't exist (Postgres Code 42P01), create it and retry
        if (error.code === '42P01') {
            console.log('⚠️ Tabela não encontrada (POST). Criando app_preferences...');
            try {
                await pool.query(CREATE_TABLE_SQL);
                // Attempt 2: Upsert after Create
                await pool.query(upsertQuery, [key, value]);
                return res.json({ success: true, message: 'Salvo com sucesso após criação da tabela' });
            } catch (createError) {
                console.error('❌ Erro ao criar tabela no retry (POST):', createError);
                return res.status(500).json({ success: false, error: 'Falha ao criar tabela: ' + createError.message });
            }
        }

        console.error('❌ Erro POST preference:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

function sendResponse(res, result) {
    if (result.rows.length > 0) {
        res.json({ success: true, data: result.rows[0].value });
    } else {
        res.json({ success: true, data: null });
    }
}

module.exports = router;
