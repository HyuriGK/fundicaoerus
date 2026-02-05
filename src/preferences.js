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

// GET /api/preferences/debug
router.get('/debug', async (req, res) => {
    const report = {
        connection: 'pending',
        tableExists: 'pending',
        rows: 0,
        error: null,
        env: {
            hasDbUrl: !!process.env.DATABASE_URL
        }
    };

    try {
        // 1. Test basic connection
        await pool.query('SELECT 1');
        report.connection = 'success';

        // 2. Test table existence
        try {
            const countResult = await pool.query('SELECT COUNT(*) FROM app_preferences');
            report.tableExists = 'yes';
            report.rows = countResult.rows[0].count;
        } catch (tableErr) {
            report.tableExists = 'no';
            report.tableError = tableErr.message;
            report.tableErrorCode = tableErr.code;

            // Try to create if missing
            if (tableErr.code === '42P01') {
                try {
                    await pool.query(CREATE_TABLE_SQL);
                    report.createdTable = 'success';
                } catch (createErr) {
                    report.createdTable = 'failed';
                    report.createError = createErr.message;
                }
            }
        }

        res.json(report);

    } catch (err) {
        report.connection = 'failed';
        report.error = err.message;
        report.stack = err.stack;
        res.status(500).json(report);
    }
});

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

    console.log(`💾 POST /preferences/${key}`);
    console.log('📦 Body Type:', typeof req.body);
    console.log('📦 Value Type:', typeof value);
    if (Array.isArray(value)) console.log('📦 Value is Array len:', value.length);

    // Validate input
    if (value === undefined) {
        return res.status(400).json({
            success: false,
            error: 'Missing "value" in request body. Body received: ' + JSON.stringify(req.body)
        });
    }

    // Explicit cast to ::jsonb to avoid ambiguity
    // Pass strictly stringified JSON if needed, but pg usually handles objects.
    // However, explicit casting $2::jsonb helps postgres understand the intent.
    const upsertQuery = `
        INSERT INTO app_preferences (key, value, updated_at)
        VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
        ON CONFLICT (key) 
        DO UPDATE SET value = $2::jsonb, updated_at = CURRENT_TIMESTAMP
    `;

    try {
        // Use JSON.stringify for safety when dealing with possible ambigous array types in pg
        await pool.query(upsertQuery, [key, JSON.stringify(value)]);
        res.json({ success: true, message: 'Salvo com sucesso' });

    } catch (error) {
        if (error.code === '42P01') {
            console.log('⚠️ Tabela não encontrada (POST). Criando app_preferences...');
            try {
                await pool.query(CREATE_TABLE_SQL);
                await pool.query(upsertQuery, [key, JSON.stringify(value)]);
                return res.json({ success: true, message: 'Salvo com sucesso após criação da tabela' });
            } catch (createError) {
                console.error('❌ Erro ao criar tabela no retry (POST):', createError);
                return res.status(500).json({
                    success: false,
                    error: 'Falha ao criar tabela: ' + createError.message,
                    originalError: error.message
                });
            }
        }

        console.error('❌ Erro POST preference:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack, // Return stack to help debug
            details: 'Failed to execute query'
        });
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
