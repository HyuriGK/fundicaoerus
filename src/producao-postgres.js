// src/producao-postgres.js
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// GET /api/producao-postgres
// Returns filtered productio records from the synced table
router.get('/', async (req, res) => {
    try {
        const { startDate, endDate, sector, search, limit = 10000 } = req.query;

        let query = `
            SELECT 
                id,
                TO_CHAR(data_producao, 'YYYY-MM-DD') as data,
                setor,
                produto,
                liga,
                op,
                codigo_peca,
                peso_un,
                quantidade,
                peso_total
            FROM producao_apontada_sincronizada
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (startDate) {
            query += ` AND data_producao >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND data_producao <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        if (sector && sector !== 'Todos') {
            query += ` AND setor = $${paramIndex}`;
            params.push(sector);
            paramIndex++;
        }

        if (search) {
            query += ` AND (LOWER(produto) LIKE $${paramIndex} OR LOWER(liga) LIKE $${paramIndex})`;
            params.push(`%${search.toLowerCase()}%`);
            paramIndex++;
        }

        query += ` ORDER BY data_producao DESC, id DESC LIMIT $${paramIndex}`;
        params.push(parseInt(limit));

        const result = await pool.query(query, params);

        res.json({
            success: true,
            data: result.rows.map(row => ({
                id: row.id,
                data: row.data, // YYYY-MM-DD
                setor: row.setor,
                produto: row.produto,
                liga: row.liga || '',
                op: row.op || '',
                codigo_peca: row.codigo_peca || '',
                pesoUn: parseFloat(row.peso_un),
                quantidade: parseFloat(row.quantidade),
                pesoTotal: parseFloat(row.peso_total)
            }))
        });

    } catch (error) {
        console.error('❌ Error fetching production data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/producao-postgres/stats
// Returns summary statistics for the filtered period
router.get('/stats', async (req, res) => {
    try {
        const { startDate, endDate, sector } = req.query;

        let query = `
            SELECT 
                COUNT(*) as total_records,
                SUM(quantidade) as total_qty,
                SUM(peso_total) as total_weight
            FROM producao_apontada_sincronizada
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (startDate) {
            query += ` AND data_producao >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND data_producao <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        if (sector && sector !== 'Todos') {
            query += ` AND setor = $${paramIndex}`;
            params.push(sector);
            paramIndex++;
        }

        const result = await pool.query(query, params);
        const row = result.rows[0];

        res.json({
            success: true,
            stats: {
                totalRecords: parseInt(row.total_records || 0),
                totalQty: parseFloat(row.total_qty || 0),
                totalWeight: parseFloat(row.total_weight || 0)
            }
        });

    } catch (error) {
        console.error('❌ Error fetching stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/producao-postgres/meta
// Returns the goal for a specific month/year (format YYYY-MM)
router.get('/meta', async (req, res) => {
    try {
        const { mes_ano } = req.query; // Expected format: 'YYYY-MM'

        if (!mes_ano) {
            return res.status(400).json({ success: false, error: 'mes_ano is required' });
        }

        const result = await pool.query(
            'SELECT meta_peso FROM producao_metas WHERE mes_ano = $1',
            [mes_ano]
        );

        const meta = result.rows.length > 0 ? parseFloat(result.rows[0].meta_peso) : 0;

        res.json({
            success: true,
            meta: meta
        });

    } catch (error) {
        console.error('❌ Error fetching meta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/producao-postgres/meta
// Sets or updates the goal for a specific month/year
router.post('/meta', async (req, res) => {
    try {
        const { mes_ano, meta } = req.body;

        if (!mes_ano || meta === undefined) {
            return res.status(400).json({ success: false, error: 'mes_ano and meta are required' });
        }

        await pool.query(`
            INSERT INTO producao_metas (mes_ano, meta_peso, atualizado_em)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (mes_ano) 
            DO UPDATE SET 
                meta_peso = EXCLUDED.meta_peso,
                atualizado_em = CURRENT_TIMESTAMP
        `, [mes_ano, meta]);

        res.json({ success: true });

    } catch (error) {
        console.error('❌ Error saving meta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
