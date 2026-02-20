const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// GET /api/custos-detalhados
// Retorna os custos agrupados dinamicamente baseados no Mês e Ano
router.get('/', async (req, res) => {
    try {
        const { mes, ano } = req.query;
        console.log(`📊 [API] Recebida requisição Custos Agrupados (Mês: ${mes || 'Todos'}, Ano: ${ano || 'Todos'})`);

        let query = `
            SELECT categoria, nome, SUM(valor) as total 
            FROM custos_registros
            WHERE 1=1
        `;
        const params = [];

        if (mes) {
            params.push(Number(mes));
            query += ` AND mes = $${params.length}`;
        }
        if (ano) {
            params.push(Number(ano));
            query += ` AND ano = $${params.length}`;
        }

        query += ` GROUP BY categoria, nome ORDER BY total DESC`;

        const { rows } = await pool.query(query, params);

        const fetchCategory = (categoryName) => {
            return rows
                .filter(r => r.categoria === categoryName)
                .map(r => ({ nome: r.nome, total: Number(r.total) || 0 }))
                .slice(0, 20); // Top 20 no frontend
        }

        res.json({
            success: true,
            data: {
                fornecedores: fetchCategory('fornecedores'),
                tipos: fetchCategory('tipos'),
                setores: fetchCategory('setores'),
                materiais: fetchCategory('materiais')
            }
        });

    } catch (error) {
        console.error('❌ [API Custos] Erro ao agrupar custos detalhados no Postgres:', error);
        res.status(500).json({ success: false, error: 'Erro interno ao agregar dados de custos.' });
    }
});

// GET /api/custos-detalhados/registros
// Retorna a lista detalhada de comprovantes/tickets para uma categoria e nome específico
router.get('/registros', async (req, res) => {
    try {
        const { categoria, nome, mes, ano } = req.query;
        console.log(`🔍 [API] Detalhando Registros -> Categoria: ${categoria} | Nome: ${nome} | Mês: ${mes} | Ano: ${ano}`);

        if (!categoria || !nome) {
            return res.status(400).json({ success: false, error: 'Parâmetros "categoria" e "nome" são obrigatórios.' });
        }

        let query = `
            SELECT data_emissao, documento, valor, produto 
            FROM custos_registros
            WHERE categoria = $1 AND nome = $2
        `;
        const params = [categoria, nome];

        if (mes) {
            params.push(Number(mes));
            query += ` AND mes = $${params.length}`;
        }
        if (ano) {
            params.push(Number(ano));
            query += ` AND ano = $${params.length}`;
        }

        query += ` ORDER BY data_emissao DESC, valor DESC`;

        const { rows } = await pool.query(query, params);

        res.json({
            success: true,
            data: rows.map(r => ({
                data_emissao: r.data_emissao,
                documento: r.documento,
                valor: Number(r.valor) || 0
            }))
        });

    } catch (error) {
        console.error('❌ [API Custos - Registros] Erro ao buscar registros:', error);
        res.status(500).json({ success: false, error: 'Erro interno ao buscar detalhamento de registros.' });
    }
});

module.exports = router;
