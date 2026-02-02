// routes/custos.js
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// Middleware de Log
router.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - [CUSTOS] ${req.method} ${req.originalUrl}`);
    next();
});

// --- LEITURA (GET) ---
router.get('/', async (req, res) => {
    const client = await pool.connect();
    try {
        // Buscar Custos
        const custosRes = await client.query(`
            SELECT id, data_formatada, categoria, descricao, centro, valor 
            FROM custos_lancamentos 
            ORDER BY data_iso DESC
        `);

        // Buscar Funcionários
        const funcRes = await client.query(`
            SELECT id, nome as name, setor as sector, salario as salary 
            FROM rh_funcionarios 
            ORDER BY nome ASC
        `);

        // Buscar Histórico Folha
        const histRes = await client.query(`
            SELECT id, mes_referencia as month, valor_total as value, qtd_funcionarios as employees 
            FROM rh_historico_folha 
            ORDER BY created_at DESC
        `);

        res.json({
            costs: custosRes.rows,
            employees: funcRes.rows,
            history: histRes.rows
        });

    } catch (e) {
        console.error('Erro ao buscar dados de custos:', e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// --- ESCRITA (POST) ---
router.post('/', async (req, res) => {
    const { action } = req.query;
    const client = await pool.connect();

    try {
        // 1. Adicionar Custo
        if (action === 'add-cost') {
            const { data_formatada, categoria, descricao, centro, valor } = req.body;
            
            // Converter DD/MM/YYYY para YYYY-MM-DD para salvar no campo data_iso
            const [d, m, y] = data_formatada.split('/');
            const data_iso = `${y}-${m}-${d}`;

            const result = await client.query(`
                INSERT INTO custos_lancamentos (data_formatada, data_iso, categoria, descricao, centro, valor)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            `, [data_formatada, data_iso, categoria, descricao, centro, valor]);
            
            return res.json({ success: true, id: result.rows[0].id });
        }

        // 2. Deletar Custo
        if (action === 'delete-cost') {
            const { id } = req.body;
            await client.query('DELETE FROM custos_lancamentos WHERE id = $1', [id]);
            return res.json({ success: true });
        }

        // 3. Adicionar Funcionário
        if (action === 'add-employee') {
            const { name, sector, salary } = req.body;
            const result = await client.query(`
                INSERT INTO rh_funcionarios (nome, setor, salario)
                VALUES ($1, $2, $3)
                RETURNING id
            `, [name, sector, salary]);
            return res.json({ success: true, id: result.rows[0].id });
        }

        // 4. Deletar Funcionário
        if (action === 'delete-employee') {
            const { id } = req.body;
            await client.query('DELETE FROM rh_funcionarios WHERE id = $1', [id]);
            return res.json({ success: true });
        }

        // 5. Adicionar Histórico de Folha
        if (action === 'add-history') {
            const { month, value, employees } = req.body;
            const result = await client.query(`
                INSERT INTO rh_historico_folha (mes_referencia, valor_total, qtd_funcionarios)
                VALUES ($1, $2, $3)
                RETURNING id
            `, [month, value, employees]);
            return res.json({ success: true, id: result.rows[0].id });
        }

        // 6. Deletar Histórico
        if (action === 'delete-history') {
            const { id } = req.body;
            await client.query('DELETE FROM rh_historico_folha WHERE id = $1', [id]);
            return res.json({ success: true });
        }

        // 7. Limpar Banco (Cuidado!)
        if (action === 'clear-database') {
            await client.query('BEGIN');
            await client.query('TRUNCATE TABLE custos_lancamentos RESTART IDENTITY');
            await client.query('TRUNCATE TABLE rh_funcionarios RESTART IDENTITY');
            await client.query('TRUNCATE TABLE rh_historico_folha RESTART IDENTITY');
            await client.query('COMMIT');
            return res.json({ success: true });
        }

        return res.status(400).json({ error: 'Ação inválida' });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Erro na rota POST /custos:', e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

module.exports = router;