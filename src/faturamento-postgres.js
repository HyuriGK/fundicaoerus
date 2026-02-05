// src/faturamento-postgres.js
// API para servir dados de faturamento do PostgreSQL (sincronizados do Firebird)
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// GET /api/faturamento-postgres/diario - Faturamento agrupado por dia
router.get('/diario', async (req, res) => {
    try {
        console.log('📊 Consultando faturamento diário do PostgreSQL...');

        const { limit = 90 } = req.query;

        const query = `
            SELECT 
                data,
                total_notas,
                total_itens,
                quantidade_total,
                valor_total,
                atualizado_em
            FROM faturamento_diario
            ORDER BY data DESC
            LIMIT $1
        `;

        const result = await pool.query(query, [parseInt(limit)]);

        console.log(`✅ ${result.rows.length} dias encontrados`);

        res.json({
            success: true,
            data: result.rows.map(row => ({
                data: row.data,
                totalNotas: parseInt(row.total_notas),
                totalItens: parseInt(row.total_itens),
                quantidadeTotal: parseFloat(row.quantidade_total),
                valorTotal: parseFloat(row.valor_total)
            }))
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar faturamento diário',
            error: error.message
        });
    }
});

// GET /api/faturamento-postgres/top-produtos - Top produtos mais vendidos
router.get('/top-produtos', async (req, res) => {
    try {
        console.log('🏆 Consultando top produtos do PostgreSQL...');

        const { limit = 10 } = req.query;

        const query = `
            SELECT 
                codigo_produto,
                descricao,
                total_vendas,
                quantidade_total,
                valor_total,
                atualizado_em
            FROM faturamento_top_produtos
            ORDER BY valor_total DESC
            LIMIT $1
        `;

        const result = await pool.query(query, [parseInt(limit)]);

        console.log(`✅ ${result.rows.length} produtos encontrados`);

        res.json({
            success: true,
            data: result.rows.map(row => ({
                codigoProduto: row.codigo_produto,
                descricao: row.descricao,
                totalVendas: parseInt(row.total_vendas),
                quantidadeTotal: parseFloat(row.quantidade_total),
                valorTotal: parseFloat(row.valor_total)
            }))
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar top produtos',
            error: error.message
        });
    }
});

// GET /api/faturamento-postgres/estatisticas - Estatísticas gerais
router.get('/estatisticas', async (req, res) => {
    try {
        console.log('📈 Consultando estatísticas do PostgreSQL...');

        const query = `
            SELECT 
                total_notas,
                total_clientes,
                total_itens,
                quantidade_total,
                valor_total,
                ticket_medio,
                primeira_nota,
                ultima_nota,
                atualizado_em
            FROM faturamento_estatisticas
            WHERE periodo = 'ultimos_90_dias'
            LIMIT 1
        `;

        const result = await pool.query(query);

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    totalNotas: 0,
                    totalClientes: 0,
                    totalItens: 0,
                    quantidadeTotal: 0,
                    valorTotal: 0,
                    ticketMedio: 0,
                    primeiraNota: null,
                    ultimaNota: null
                }
            });
        }

        const stats = result.rows[0];

        console.log(`✅ Estatísticas: R$ ${parseFloat(stats.valor_total).toFixed(2)}`);

        res.json({
            success: true,
            data: {
                totalNotas: parseInt(stats.total_notas),
                totalClientes: parseInt(stats.total_clientes),
                totalItens: parseInt(stats.total_itens),
                quantidadeTotal: parseFloat(stats.quantidade_total),
                valorTotal: parseFloat(stats.valor_total),
                ticketMedio: parseFloat(stats.ticket_medio),
                primeiraNota: stats.primeira_nota,
                ultimaNota: stats.ultima_nota
            }
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar estatísticas',
            error: error.message
        });
    }
});

// GET /api/faturamento-postgres/detalhado - Dados detalhados (Notas + Itens)
router.get('/detalhado', async (req, res) => {
    try {
        console.log('📝 Consultando faturamento detalhado do PostgreSQL...');

        const { limit = 2000, startDate, endDate } = req.query;

        let query = `
            SELECT 
                data_faturamento,
                nota_fiscal,
                serie,
                cliente_codigo,
                cliente_nome,
                codigo_item,
                descricao,
                quantidade,
                valor_unitario,
                valor_total,
                peso_un,
                peso_total,
                status
            FROM faturamento_firebird
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (startDate) {
            query += ` AND data_faturamento >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND data_faturamento <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        query += ` ORDER BY data_faturamento DESC, nota_fiscal DESC LIMIT $${paramIndex}`;
        params.push(parseInt(limit));

        const result = await pool.query(query, params);

        console.log(`✅ ${result.rows.length} registros detalhados encontrados`);

        // Formatar para o frontend
        const dataFormatted = result.rows.map(row => ({
            data: row.data_faturamento ? row.data_faturamento.toISOString().split('T')[0] : null,
            notaFiscal: row.nota_fiscal,
            serie: row.serie,
            clienteCodigo: row.cliente_codigo,
            clienteNome: row.cliente_nome,
            codigoItem: row.codigo_item,
            descricao: row.descricao,
            quantidade: parseFloat(row.quantidade || 0),
            valorUnitario: parseFloat(row.valor_unitario || 0),
            valorTotal: parseFloat(row.valor_total || 0),
            pesoUn: parseFloat(row.peso_un || 0),
            pesoTotal: parseFloat(row.peso_total || 0),
            status: row.status
        }));

        res.json({
            success: true,
            data: dataFormatted,
            summary: {
                totalRegistros: result.rows.length,
                totalFaturado: dataFormatted.reduce((acc, curr) => acc + curr.valorTotal, 0)
            }
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar faturamento detalhado',
            error: error.message
        });
    }
});

module.exports = router;
