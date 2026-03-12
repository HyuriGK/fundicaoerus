// src/producao-postgres.js
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// GET /api/producao-postgres
// Returns filtered productio records from the synced table
router.get('/', async (req, res) => {
    try {
        // 2. Verificar tarefas (registros com peso zero na tabela sincronizada)
        if (req.query.action === 'check-tasks') {
            const queryTasks = `
                SELECT 
                    COUNT(*) as count
                FROM producao_apontada_sincronizada t
                LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
                WHERE COALESCE(NULLIF(t.peso_un, 0), p.peso, 0) = 0
            `;
            const resultTasks = await pool.query(queryTasks);
            const count = parseInt(resultTasks.rows[0].count);
            
            let description = `Existem ${count} registros vinculados a peças sem peso definido.`;
            
            if (count > 0) {
                // Fetch sample of 2 records
                const sampleQuery = `
                    SELECT 
                        TO_CHAR(t.data_producao, 'DD/MM/YYYY') as data,
                        t.codigo_peca,
                        t.produto
                    FROM producao_apontada_sincronizada t
                    LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
                    WHERE COALESCE(NULLIF(t.peso_un, 0), p.peso, 0) = 0
                    LIMIT 2
                `;
                const sampleResult = await pool.query(sampleQuery);
                const samples = sampleResult.rows.map(r => `• ${r.data} - ${r.codigo_peca}: ${r.produto.substring(0, 30)}...`);
                description += `<br><br><strong>Exemplos:</strong><br>${samples.join('<br>')}`;
                if (count > 2) description += `<br>... e mais ${count - 2} registros.`;
            }

            return res.status(200).json({ 
                count: count,
                tasks: [
                    {
                        id: 'zero-weight',
                        title: 'Pesos Unitários Zerados',
                        description: description,
                        actionUrl: 'apontamentos_produtivos.html?filter=zero-weight',
                        priority: 'high',
                        count: count
                    }
                ].filter(t => t.count > 0)
            });
        }

        const { startDate, endDate, sector, search, limit = 100000 } = req.query;

        let query = `
            SELECT 
                t.id,
                TO_CHAR(t.data_producao, 'YYYY-MM-DD') as data,
                t.setor,
                t.produto,
                t.liga,
                t.op,
                t.codigo_peca,
                -- Lógica de Prioridade: ERP > 0 ? ERP : Custom
                COALESCE(NULLIF(t.peso_un, 0), p.peso, 0) as peso_un,
                t.quantidade,
                -- Recalcula Total
                (t.quantidade * COALESCE(NULLIF(t.peso_un, 0), p.peso, 0)) as peso_total,
                -- Metadados para UI
                t.peso_un as peso_erp,
                p.peso as peso_custom
            FROM producao_apontada_sincronizada t
            LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (startDate) {
            query += ` AND t.data_producao >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND t.data_producao <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        if (sector && sector !== 'Todos') {
            query += ` AND t.setor = $${paramIndex}`;
            params.push(sector);
            paramIndex++;
        }

        if (search) {
            query += ` AND (LOWER(t.produto) LIKE $${paramIndex} OR LOWER(t.liga) LIKE $${paramIndex} OR LOWER(t.codigo_peca) LIKE $${paramIndex})`;
            params.push(`%${search.toLowerCase()}%`);
            paramIndex++;
        }

        query += ` ORDER BY t.data_producao DESC, t.id DESC LIMIT $${paramIndex}`;
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
                pesoErp: parseFloat(row.peso_erp || 0),
                pesoCustom: parseFloat(row.peso_custom || 0),
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
                SUM(t.quantidade) as total_qty,
                SUM(t.quantidade * COALESCE(NULLIF(t.peso_un, 0), p.peso, 0)) as total_weight
            FROM producao_apontada_sincronizada t
            LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (startDate) {
            query += ` AND t.data_producao >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND t.data_producao <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        if (sector && sector !== 'Todos') {
            query += ` AND t.setor = $${paramIndex}`;
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
router.post('/peso', async (req, res) => {
    const { codigo_peca, peso } = req.body;

    if (!codigo_peca || peso === undefined) {
        return res.status(400).json({ success: false, error: 'Código da peça e peso são obrigatórios' });
    }

    try {
        await pool.query(`
            INSERT INTO produto_pesos_producao (codigo_peca, peso, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (codigo_peca) 
            DO UPDATE SET peso = EXCLUDED.peso, updated_at = CURRENT_TIMESTAMP
        `, [String(codigo_peca), parseFloat(peso)]);

        res.json({ success: true, message: 'Peso salvo com sucesso' });
    } catch (error) {
        console.error('❌ Error saving custom weight:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
