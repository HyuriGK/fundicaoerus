// src/producao-postgres.js
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// GET /api/producao-postgres
// Returns filtered productio records from the synced table
router.get('/', async (req, res) => {
    try {
        // 2. Verificar tarefas (registros com peso zero na tabela sincronizada - Agrupado por Setor)
        if (req.query.action === 'check-tasks') {
            const tasks = [];
            let totalCount = 0;

            // --- TAREFAS DE PRODUÇÃO ---
            const queryGrouped = `
                SELECT 
                    t.setor,
                    COUNT(*) as count
                FROM producao_apontada_sincronizada t
                LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
                WHERE COALESCE(NULLIF(t.peso_un, 0), p.peso, 0) = 0
                GROUP BY t.setor
                ORDER BY count DESC
            `;
            const resultGrouped = await pool.query(queryGrouped);
            
            for (const row of resultGrouped.rows) {
                const count = parseInt(row.count);
                totalCount += count;
                
                // Fetch a sample of 2 records for this specific sector
                const sampleQuery = `
                    SELECT 
                        TO_CHAR(t.data_producao, 'DD/MM/YYYY') as data,
                        t.codigo_peca,
                        t.produto
                    FROM producao_apontada_sincronizada t
                    LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
                    WHERE COALESCE(NULLIF(t.peso_un, 0), p.peso, 0) = 0
                    AND t.setor = $1
                    LIMIT 2
                `;
                const sampleResult = await pool.query(sampleQuery, [row.setor]);
                const samples = sampleResult.rows.map(r => `• ${r.data} - ${r.codigo_peca}: ${r.produto.substring(0, 30)}...`);
                
                let desc = `Existem ${count} registros sem peso definido no setor <strong>${row.setor}</strong>.`;
                if (samples.length > 0) {
                    desc += `<br><br><strong>Amostras:</strong><br>${samples.join('<br>')}`;
                }

                tasks.push({
                    id: `prod-zero-weight-${row.setor.replace(/\s+/g, '-').toLowerCase()}`,
                    type: 'production',
                    sector: row.setor,
                    title: `Produção: Pesos Zerados - ${row.setor}`,
                    description: desc,
                    actionUrl: `apontamentos_produtivos.html?filter=zero-weight&sector=${encodeURIComponent(row.setor)}`,
                    priority: 'high',
                    count: count
                });
            }

            // --- TAREFAS DE PEDIDOS (CARTEIRA) ---
            const queryOrderZero = `
                SELECT 
                    COUNT(*) as count
                FROM firebird_sync_pedidos p
                -- Join with carteira to only check active orders
                INNER JOIN (
                    SELECT DISTINCT pedido, codigo FROM carteira
                ) c ON (p.data->>'CODIGO_PPR') = c.pedido AND (p.data->>'PRODUTO_PPR') = c.codigo
                WHERE (p.data->>'OP_PCS') IS NOT NULL AND (p.data->>'OP_PCS') <> ''
                AND COALESCE(CAST(NULLIF(p.data->>'PESO_LIQUIDO_NPR', '') AS NUMERIC), 0) = 0
            `;
            const resultOrderZero = await pool.query(queryOrderZero);
            const orderCount = parseInt(resultOrderZero.rows[0].count);

            if (orderCount > 0) {
                totalCount += orderCount;

                // Fetch samples for orders
                const orderSamplesQuery = `
                    SELECT 
                        p.data->>'CODIGO_PPR' as pedido,
                        p.data->>'PRODUTO_PPR' as produto_cod,
                        p.data->>'NOME_PRODUTO_PPR' as produto_nome
                    FROM firebird_sync_pedidos p
                    INNER JOIN (
                        SELECT DISTINCT pedido, codigo FROM carteira
                    ) c ON (p.data->>'CODIGO_PPR') = c.pedido AND (p.data->>'PRODUTO_PPR') = c.codigo
                    WHERE (p.data->>'OP_PCS') IS NOT NULL AND (p.data->>'OP_PCS') <> ''
                    AND COALESCE(CAST(NULLIF(p.data->>'PESO_LIQUIDO_NPR', '') AS NUMERIC), 0) = 0
                    LIMIT 2
                `;
                const orderSamplesResult = await pool.query(orderSamplesQuery);
                const orderSamples = orderSamplesResult.rows.map(r => `• Pedido ${r.pedido}: ${r.produto_cod} - ${r.produto_nome.substring(0, 25)}...`);

                let orderDesc = `Existem ${orderCount} itens na carteira de pedidos com peso unitário zerado.`;
                if (orderSamples.length > 0) {
                    orderDesc += `<br><br><strong>Amostras:</strong><br>${orderSamples.join('<br>')}`;
                }

                tasks.push({
                    id: `order-zero-weight`,
                    type: 'order',
                    sector: 'COMERCIAL',
                    title: `Carteira: Pesos Zerados`,
                    description: orderDesc,
                    actionUrl: `pedidos.html?filter=zero-weight`,
                    priority: 'high',
                    count: orderCount
                });
            }

            return res.status(200).json({ 
                count: totalCount,
                tasks: tasks
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
