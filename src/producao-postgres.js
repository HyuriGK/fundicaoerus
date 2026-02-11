// src/producao-postgres.js
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// GET /api/producao-postgres
// Returns filtered production records from the synced table
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

module.exports = router;
