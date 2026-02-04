// src/faturamento-firebird.js
const express = require('express');
const router = express.Router();
const Firebird = require('node-firebird');

// Configuração do Firebird
const firebirdOptions = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

// GET /api/faturamento-firebird - Buscar dados de faturamento do Firebird
router.get('/', async (req, res) => {
    try {
        console.log('📊 Consultando faturamento do Firebird...');

        // Conectar ao Firebird
        Firebird.attach(firebirdOptions, function (err, db) {
            if (err) {
                console.error('❌ Erro ao conectar no Firebird:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Erro ao conectar no banco Firebird',
                    error: err.message
                });
            }

            // Query otimizada para buscar faturamento de 2026
            const query = `
                SELECT FIRST 1000
                    nf.EMISSAO_NOT as DATA_FATURAMENTO,
                    nf.NUMERO_NOT as NOTA_FISCAL,
                    nf.DESTINATARIO_NOT as CLIENTE_CODIGO,
                    nfp.PRODUTO_NPR as CODIGO_ITEM,
                    nfp.NOME_PRODUTO_NPR as DESCRICAO,
                    nfp.QUANTIDADE_NPR as QUANTIDADE,
                    nfp.PRECO_NPR as VALOR_UNITARIO,
                    nfp.TOTAL_NPR as VALOR_TOTAL,
                    nf.SERIE_NOT as SERIE,
                    nf.STATUS_NOT as STATUS
                FROM NOTA_FISCAL nf
                INNER JOIN NOTA_FISCAL_PRODUTO nfp 
                    ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
                    AND nf.SERIE_NOT = nfp.SERIE_NPR
                    AND nf.CODIGO_NOT = nfp.CODIGO_NPR
                WHERE nf.EMISSAO_NOT >= '2026-01-01'
                    AND nf.EMISSAO_NOT < '2027-01-01'
                    AND nf.TIPO_NOT = 'S'
                    AND nfp.PRODUTO_NPR IS NOT NULL
                ORDER BY nf.EMISSAO_NOT DESC, nf.NUMERO_NOT DESC
            `;

            db.query(query, function (err, result) {
                if (err) {
                    console.error('❌ Erro ao consultar:', err);
                    db.detach();
                    return res.status(500).json({
                        success: false,
                        message: 'Erro ao consultar dados',
                        error: err.message
                    });
                }

                console.log(`✅ ${result.length} registros encontrados`);

                // Formatar dados
                const dataFormatted = result.map(row => ({
                    data: row.DATA_FATURAMENTO ? row.DATA_FATURAMENTO.toISOString().split('T')[0] : null,
                    notaFiscal: row.NOTA_FISCAL,
                    clienteCodigo: row.CLIENTE_CODIGO,
                    codigoItem: row.CODIGO_ITEM,
                    descricao: row.DESCRICAO ? row.DESCRICAO.trim() : null,
                    quantidade: row.QUANTIDADE || 0,
                    valorUnitario: (row.VALOR_UNITARIO || 0) / 100,
                    valorTotal: (row.VALOR_TOTAL || 0) / 100,
                    serie: row.SERIE ? row.SERIE.trim() : null,
                    status: row.STATUS ? row.STATUS.trim() : null
                }));

                // Calcular totais
                const totalFaturado = dataFormatted.reduce((sum, row) => sum + row.valorTotal, 0);
                const totalItens = dataFormatted.length;

                db.detach();

                res.json({
                    success: true,
                    data: dataFormatted,
                    summary: {
                        totalRegistros: totalItens,
                        totalFaturado: totalFaturado,
                        dataConsulta: new Date().toISOString()
                    }
                });
            });
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
