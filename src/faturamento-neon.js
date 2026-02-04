// src/faturamento-neon.js
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// GET /api/faturamento-neon - Buscar dados de faturamento do Neon
router.get('/', async (req, res) => {
    try {
        console.log('📊 Consultando faturamento do Neon...');

        // Query para buscar faturamento de 2026
        const query = `
            SELECT 
                data_faturamento,
                nota_fiscal,
                cliente_codigo,
                codigo_item,
                descricao,
                quantidade,
                valor_unitario,
                valor_total,
                serie,
                status
            FROM faturamento_firebird
            WHERE data_faturamento >= '2026-01-01'
                AND data_faturamento < '2027-01-01'
            ORDER BY data_faturamento DESC, nota_fiscal DESC
            LIMIT 1000
        `;

        const result = await pool.query(query);

        console.log(`✅ ${result.rows.length} registros encontrados`);

        // Formatar dados
        const dataFormatted = result.rows.map(row => ({
            data: row.data_faturamento ? row.data_faturamento.toISOString().split('T')[0] : null,
            notaFiscal: row.nota_fiscal,
            clienteCodigo: row.cliente_codigo,
            codigoItem: row.codigo_item,
            descricao: row.descricao,
            quantidade: parseFloat(row.quantidade || 0),
            valorUnitario: parseFloat(row.valor_unitario || 0),
            valorTotal: parseFloat(row.valor_total || 0),
            serie: row.serie,
            status: row.status
        }));

        // Calcular totais
        const totalFaturado = dataFormatted.reduce((sum, row) => sum + row.valorTotal, 0);
        const totalItens = dataFormatted.length;

        res.json({
            success: true,
            data: dataFormatted,
            summary: {
                totalRegistros: totalItens,
                totalFaturado: totalFaturado,
                dataConsulta: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Erro no endpoint:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao processar requisição',
            error: error.message
        });
    }
});

module.exports = router;
