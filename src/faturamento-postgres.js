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
                peso_total,
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
                valorTotal: parseFloat(row.valor_total),
                pesoTotal: parseFloat(row.peso_total || 0)
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

        const { limit = 5000, startDate, endDate } = req.query;

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
                status,
                excluido_manualmente
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
            status: row.status,
            excluidoManualmente: row.excluido_manualmente
        }));

        res.json({
            success: true,
            data: dataFormatted,
            summary: {
                totalRegistros: result.rows.length,
                totalFaturado: dataFormatted.reduce((acc, curr) => acc + curr.valorTotal, 0),
                totalPeso: dataFormatted.reduce((acc, curr) => acc + curr.pesoTotal, 0)
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

// GET /api/faturamento-postgres/evolucao-mensal - Evolução anual em peso
router.get('/evolucao-mensal', async (req, res) => {
    try {
        console.log('📅 Consultando evolução mensal (Peso) do PostgreSQL...');

        const currentYear = new Date().getFullYear();

        // Query que gera todos os 12 meses do ano e faz o join com as somas
        // UPDATE: Agora usa faturamento_diario para garantir consistência
        const query = `
            WITH meses AS (
                SELECT generate_series(
                    DATE_TRUNC('year', CURRENT_DATE),
                    DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '11 months',
                    INTERVAL '1 month'
                )::DATE as mes
            )
            SELECT 
                m.mes,
                COALESCE(SUM(d.peso_total), 0) as peso_total,
                COALESCE(SUM(d.valor_total), 0) as valor_total
            FROM meses m
            LEFT JOIN faturamento_diario d
                ON DATE_TRUNC('month', d.data) = m.mes
            GROUP BY m.mes
            ORDER BY m.mes
        `;

        const result = await pool.query(query);

        res.json({
            success: true,
            data: result.rows.map(row => ({
                mes: row.mes,
                mesNome: row.mes.toLocaleString('pt-BR', { month: 'long' }),
                pesoTotal: parseFloat(row.peso_total),
                valorTotal: parseFloat(row.valor_total)
            }))
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar evolução mensal',
            error: error.message
        });
    }
});

// --- ROTA POST: Toggle Exclusão (Sincronizado) ---
router.post('/toggle-exclusion', async (req, res) => {
    const { key, excluded, nota_fiscal, serie, item_nota, codigo_item, cliente_codigo } = req.body;

    if (!key) return res.status(400).json({ error: "Chave inválida" });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Salva na tabela global de memórias
        await client.query(`
            INSERT INTO faturamento_preferencias (chave_unica, excluido)
            VALUES ($1, $2)
            ON CONFLICT (chave_unica) 
            DO UPDATE SET excluido = EXCLUDED.excluido, updated_at = CURRENT_TIMESTAMP
        `, [key, excluded]);

        // 2. Atualiza a tabela sincronizada local se os dados forem passados
        if (nota_fiscal !== undefined) {
            // Include cliente_codigo for extra safety if provided
            // And handle serie being NULL properly
            let updateQuery = `
                UPDATE faturamento_firebird 
                SET excluido_manualmente = $1 
                WHERE nota_fiscal = $2 
                  AND serie IS NOT DISTINCT FROM $3 
                  AND item_nota = $4 
                  AND codigo_item = $5
            `;
            const params = [excluded, nota_fiscal, serie, item_nota, codigo_item];

            if (cliente_codigo) {
                updateQuery += ` AND cliente_codigo = $${params.length + 1}`;
                params.push(cliente_codigo);
            }

            await client.query(updateQuery, params);
        }

        await client.query('COMMIT');
        return res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Erro ao salvar exclusão sincronizada:", error);
        return res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;
