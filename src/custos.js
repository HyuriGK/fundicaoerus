// src/custos.js
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
        // 1. Buscar Custos
        const custosRes = await client.query(`
            SELECT id, data_formatada, categoria, descricao, centro, valor 
            FROM custos_lancamentos 
            ORDER BY data_iso DESC
        `);

        // 2. Buscar Funcionários
        const funcRes = await client.query(`
            SELECT id, nome as name, setor as sector, salario as salary 
            FROM rh_funcionarios 
            ORDER BY nome ASC
        `);

        // 3. Buscar Histórico Folha
        const histRes = await client.query(`
            SELECT id, mes_referencia as month, valor_total as value, qtd_funcionarios as employees 
            FROM rh_historico_folha 
            ORDER BY created_at DESC
        `);

        // 4. Buscar Metas (Produção/Faturamento por mês)
        const metasRes = await client.query(`
            SELECT mes_referencia, producao_kg, faturamento_kg 
            FROM custos_metas
        `);

        // Transformar array de metas em Objeto para facilitar o frontend
        // Ex: { "05/2024": { producao: 10000, faturamento: 8000 } }
        const metasMap = {};
        metasRes.rows.forEach(row => {
            metasMap[row.mes_referencia] = {
                producao: parseFloat(row.producao_kg),
                faturamento: parseFloat(row.faturamento_kg)
            };
        });

        res.json({
            costs: custosRes.rows,
            employees: funcRes.rows,
            history: histRes.rows,
            metas: metasMap
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
        // --- CUSTOS GERAIS ---

        // 1. Adicionar Custo
        if (action === 'add-cost') {
            const { data_formatada, categoria, descricao, centro, valor } = req.body;
            const [d, m, y] = data_formatada.split('/');
            const data_iso = `${y}-${m}-${d}`;

            const result = await client.query(`
                INSERT INTO custos_lancamentos (data_formatada, data_iso, categoria, descricao, centro, valor)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            `, [data_formatada, data_iso, categoria, descricao, centro, valor]);
            
            return res.json({ success: true, id: result.rows[0].id });
        }

        // 2. Deletar Custo Individual
        if (action === 'delete-cost') {
            const { id } = req.body;
            await client.query('DELETE FROM custos_lancamentos WHERE id = $1', [id]);
            return res.json({ success: true });
        }

        // 3. Limpar TODOS os Custos (Ação do novo modal)
        if (action === 'clear-all-costs') {
            await client.query('TRUNCATE TABLE custos_lancamentos RESTART IDENTITY');
            return res.json({ success: true });
        }

        // --- RH / FUNCIONÁRIOS ---

        // 4. Adicionar Funcionário
        if (action === 'add-employee') {
            const { name, sector, salary } = req.body;
            const result = await client.query(`
                INSERT INTO rh_funcionarios (nome, setor, salario)
                VALUES ($1, $2, $3)
                RETURNING id
            `, [name, sector, salary]);
            return res.json({ success: true, id: result.rows[0].id });
        }

        // 5. Deletar Funcionário Individual
        if (action === 'delete-employee') {
            const { id } = req.body;
            await client.query('DELETE FROM rh_funcionarios WHERE id = $1', [id]);
            return res.json({ success: true });
        }

        // 6. Limpar TODOS os Funcionários
        if (action === 'clear-all-employees') {
            await client.query('TRUNCATE TABLE rh_funcionarios RESTART IDENTITY');
            return res.json({ success: true });
        }

        // --- HISTÓRICO FOLHA ---

        // 7. Adicionar Histórico
        if (action === 'add-history') {
            const { month, value, employees } = req.body;
            const result = await client.query(`
                INSERT INTO rh_historico_folha (mes_referencia, valor_total, qtd_funcionarios)
                VALUES ($1, $2, $3)
                RETURNING id
            `, [month, value, employees]);
            return res.json({ success: true, id: result.rows[0].id });
        }

        // 8. Deletar Histórico Individual
        if (action === 'delete-history') {
            const { id } = req.body;
            await client.query('DELETE FROM rh_historico_folha WHERE id = $1', [id]);
            return res.json({ success: true });
        }

        // --- METAS (PRODUÇÃO E FATURAMENTO) ---

        // 9. Salvar Meta (Upsert)
        if (action === 'save-meta') {
    const { mes_referencia, tipo, valor } = req.body; 
    console.log('📝 Recebendo meta:', { mes_referencia, tipo, valor });
    // tipo: 'producao' ou 'faturamento'
    
    try {
        // Verifica se já existe registro para o mês
        const check = await client.query('SELECT * FROM custos_metas WHERE mes_referencia = $1', [mes_referencia]);
        
        if (check.rows.length === 0) {
            console.log('➕ Criando novo registro para:', mes_referencia);
            // Insert inicial (se for produção salva prod, fat=0, e vice versa)
            const prodVal = tipo === 'producao' ? valor : 0;
            const fatVal = tipo === 'faturamento' ? valor : 0;
            await client.query(
                'INSERT INTO custos_metas (mes_referencia, producao_kg, faturamento_kg) VALUES ($1, $2, $3)',
                [mes_referencia, prodVal, fatVal]
            );
        } else {
            console.log('✏️ Atualizando registro existente:', mes_referencia);
            // Update
            if (tipo === 'producao') {
                await client.query('UPDATE custos_metas SET producao_kg = $1 WHERE mes_referencia = $2', [valor, mes_referencia]);
            } else {
                await client.query('UPDATE custos_metas SET faturamento_kg = $1 WHERE mes_referencia = $2', [valor, mes_referencia]);
            }
        }
        
        console.log('✅ Meta salva com sucesso');
        return res.json({ success: true, message: 'Meta salva' });
        
    } catch (error) {
        console.error('❌ Erro ao salvar meta:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message,
            details: 'Verifique se a tabela custos_metas existe'
        });
    }
}

        return res.status(400).json({ error: 'Ação inválida' });

    } catch (e) {
        console.error('Erro na rota POST /custos:', e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

module.exports = router;