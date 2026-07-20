// src/faturamento-firebird.js
const express = require('express');
const router = express.Router();
// Configuração do Firebird
const { Firebird, options: firebirdOptions } = require('../lib/firebird-helper');

// Função auxiliar para converter valores de centavos para reais
function centavosParaReais(valor) {
    return (valor || 0) / 100;
}

// Função auxiliar para formatar data
function formatarData(data) {
    return data ? data.toISOString().split('T')[0] : null;
}

function firebirdQuery(db, query, params = []) {
    return new Promise((resolve, reject) => {
        db.query(query, params, (err, result) => err ? reject(err) : resolve(result));
    });
}

function parseDateParam(value, fallback) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : fallback;
}

// GET /api/faturamento-firebird/entradas-fornecedor-itens
router.get('/entradas-fornecedor-itens', async (req, res) => {
    const dataInicio = parseDateParam(req.query.dataInicio, '2026-01-01');
    const dataFim = parseDateParam(req.query.dataFim, new Date().toISOString().slice(0, 10));
    const fornecedor = String(req.query.fornecedor || '1809').trim();
    const fornecedorNome = String(req.query.fornecedorNome || 'FEZER').trim().toUpperCase();
    const cnpj = String(req.query.cnpj || '83056960').replace(/\D/g, '');

    Firebird.attach(firebirdOptions, async (err, db) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Erro ao conectar no banco Firebird', error: err.message });
        }

        try {
            const params = [dataInicio, dataFim];
            const filtrosFornecedor = [];

            if (/^\d+$/.test(fornecedor)) {
                params.push(Number(fornecedor));
                filtrosFornecedor.push(`nf.DESTINATARIO_NOT = ?`);
            }

            if (fornecedorNome) {
                params.push(`%${fornecedorNome}%`);
                filtrosFornecedor.push(`UPPER(nf.RAZAO_SOCIAL_NOT) LIKE ?`);
            }

            if (cnpj) {
                params.push(`%${cnpj}%`);
                filtrosFornecedor.push(`REPLACE(REPLACE(REPLACE(nf.CNPJ_CPF_NOT, '.', ''), '/', ''), '-', '') LIKE ?`);
            }

            if (!filtrosFornecedor.length) {
                return res.status(400).json({ success: false, message: 'Informe código, nome ou CNPJ do fornecedor.' });
            }

            const query = `
                SELECT
                    nf.CODIGO_NOT,
                    nf.NUMERO_NOT,
                    nf.SERIE_NOT,
                    nf.EMISSAO_NOT,
                    nf.DATA_ENT_NOT,
                    nf.DESTINATARIO_NOT,
                    nf.RAZAO_SOCIAL_NOT,
                    nf.CNPJ_CPF_NOT,
                    nf.TOTAL_NOT,
                    nfp.ITEM_NPR,
                    nfp.PRODUTO_NPR,
                    nfp.NOME_PRODUTO_NPR,
                    nfp.QUANTIDADE_NPR,
                    nfp.PRECO_NPR,
                    nfp.TOTAL_NPR,
                    nfp.CFOP_NPR
                FROM NOTA_FISCAL nf
                INNER JOIN NOTA_FISCAL_PRODUTO nfp
                    ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR
                    AND nf.SERIE_NOT = nfp.SERIE_NPR
                    AND nf.CODIGO_NOT = nfp.CODIGO_NPR
                WHERE nf.DATA_ENT_NOT >= ?
                    AND nf.DATA_ENT_NOT < DATEADD(1 DAY TO CAST(? AS DATE))
                    AND nf.STATUS_NOT = 'A'
                    AND nfp.STATUS_NPR = 'A'
                    AND (${filtrosFornecedor.join(' OR ')})
                ORDER BY nf.DATA_ENT_NOT DESC, nf.CODIGO_NOT DESC, nfp.ITEM_NPR
            `;

            const result = await firebirdQuery(db, query, params);
            const notasMap = new Map();

            result.forEach(row => {
                const nota = row.NUMERO_NOT || row.CODIGO_NOT;
                const serie = row.SERIE_NOT ? String(row.SERIE_NOT).trim() : '';
                const key = `${row.CODIGO_NOT}|${serie}`;

                if (!notasMap.has(key)) {
                    notasMap.set(key, {
                        codigo: row.CODIGO_NOT,
                        numero: nota,
                        serie,
                        emissao: formatarData(row.EMISSAO_NOT),
                        entrada: formatarData(row.DATA_ENT_NOT),
                        fornecedorCodigo: row.DESTINATARIO_NOT,
                        fornecedorNome: row.RAZAO_SOCIAL_NOT ? String(row.RAZAO_SOCIAL_NOT).trim() : '',
                        cnpjCpf: row.CNPJ_CPF_NOT ? String(row.CNPJ_CPF_NOT).trim() : '',
                        total: Number(row.TOTAL_NOT || 0),
                        itens: []
                    });
                }

                notasMap.get(key).itens.push({
                    item: row.ITEM_NPR,
                    codigo: row.PRODUTO_NPR,
                    descricao: row.NOME_PRODUTO_NPR ? String(row.NOME_PRODUTO_NPR).trim() : '',
                    quantidade: Number(row.QUANTIDADE_NPR || 0),
                    valorUnitario: Number(row.PRECO_NPR || 0),
                    valorTotal: Number(row.TOTAL_NPR || 0),
                    cfop: row.CFOP_NPR ? String(row.CFOP_NPR).trim() : ''
                });
            });

            const notas = Array.from(notasMap.values());
            res.json({
                success: true,
                data: notas,
                summary: {
                    totalNotas: notas.length,
                    totalItens: result.length,
                    totalGeral: notas.reduce((sum, nota) => sum + nota.total, 0),
                    filtros: { dataInicio, dataFim, fornecedor, fornecedorNome, cnpj }
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Erro ao consultar notas de entrada', error: error.message });
        } finally {
            db.detach();
        }
    });
});

// GET /api/faturamento-firebird - Buscar dados de faturamento do Firebird
router.get('/', async (req, res) => {
    try {
        const { dataInicio, dataFim } = req.query;

        console.log('📊 Consultando faturamento do Firebird...');
        console.log('Período:', dataInicio || '2026-01-01', 'até', dataFim || '2027-01-01');

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

            // Query otimizada para buscar faturamento
            const inicio = dataInicio || '2026-01-01';
            const fim = dataFim || '2027-01-01';

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
                WHERE nf.EMISSAO_NOT >= '${inicio}'
                    AND nf.EMISSAO_NOT < '${fim}'
                    AND nf.TIPO_NOT = 'S'
                    AND nf.STATUS_NOT = 'A'
                    AND nfp.STATUS_NPR = 'A'
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
                    data: formatarData(row.DATA_FATURAMENTO),
                    notaFiscal: row.NOTA_FISCAL,
                    clienteCodigo: row.CLIENTE_CODIGO,
                    codigoItem: row.CODIGO_ITEM,
                    descricao: row.DESCRICAO ? row.DESCRICAO.trim() : null,
                    quantidade: row.QUANTIDADE || 0,
                    valorUnitario: centavosParaReais(row.VALOR_UNITARIO),
                    valorTotal: centavosParaReais(row.VALOR_TOTAL),
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

// GET /api/faturamento-firebird/diario - Faturamento agrupado por dia
router.get('/diario', async (req, res) => {
    try {
        const { dataInicio, dataFim } = req.query;

        console.log('📊 Consultando faturamento diário do Firebird...');

        Firebird.attach(firebirdOptions, function (err, db) {
            if (err) {
                console.error('❌ Erro ao conectar no Firebird:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Erro ao conectar no banco Firebird',
                    error: err.message
                });
            }

            const inicio = dataInicio || '2026-01-01';
            const fim = dataFim || '2027-01-01';

            const query = `
                SELECT 
                    CAST(nf.EMISSAO_NOT AS DATE) as DATA_FATURAMENTO,
                    COUNT(DISTINCT nf.NUMERO_NOT) as TOTAL_NOTAS,
                    COUNT(nfp.PRODUTO_NPR) as TOTAL_ITENS,
                    SUM(nfp.QUANTIDADE_NPR) as QUANTIDADE_TOTAL,
                    SUM(nfp.TOTAL_NPR) as VALOR_TOTAL_CENTAVOS
                FROM NOTA_FISCAL nf
                INNER JOIN NOTA_FISCAL_PRODUTO nfp 
                    ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
                    AND nf.SERIE_NOT = nfp.SERIE_NPR
                    AND nf.CODIGO_NOT = nfp.CODIGO_NPR
                WHERE nf.EMISSAO_NOT >= '${inicio}'
                    AND nf.EMISSAO_NOT < '${fim}'
                    AND nf.TIPO_NOT = 'S'
                    AND nf.STATUS_NOT = 'A'
                    AND nfp.STATUS_NPR = 'A'
                GROUP BY CAST(nf.EMISSAO_NOT AS DATE)
                ORDER BY DATA_FATURAMENTO DESC
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

                console.log(`✅ ${result.length} dias encontrados`);

                const dataFormatted = result.map(row => ({
                    data: formatarData(row.DATA_FATURAMENTO),
                    totalNotas: row.TOTAL_NOTAS || 0,
                    totalItens: row.TOTAL_ITENS || 0,
                    quantidadeTotal: row.QUANTIDADE_TOTAL || 0,
                    valorTotal: centavosParaReais(row.VALOR_TOTAL_CENTAVOS)
                }));

                db.detach();

                res.json({
                    success: true,
                    data: dataFormatted,
                    summary: {
                        totalDias: dataFormatted.length,
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

// GET /api/faturamento-firebird/top-produtos - Top produtos mais vendidos
router.get('/top-produtos', async (req, res) => {
    try {
        const { dataInicio, dataFim, limit } = req.query;
        const topLimit = parseInt(limit) || 10;

        console.log(`📊 Consultando top ${topLimit} produtos do Firebird...`);

        Firebird.attach(firebirdOptions, function (err, db) {
            if (err) {
                console.error('❌ Erro ao conectar no Firebird:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Erro ao conectar no banco Firebird',
                    error: err.message
                });
            }

            const inicio = dataInicio || '2026-01-01';
            const fim = dataFim || '2027-01-01';

            const query = `
                SELECT FIRST ${topLimit}
                    nfp.PRODUTO_NPR as CODIGO_PRODUTO,
                    nfp.NOME_PRODUTO_NPR as DESCRICAO,
                    COUNT(*) as TOTAL_VENDAS,
                    SUM(nfp.QUANTIDADE_NPR) as QUANTIDADE_TOTAL,
                    SUM(nfp.TOTAL_NPR) as VALOR_TOTAL_CENTAVOS
                FROM NOTA_FISCAL nf
                INNER JOIN NOTA_FISCAL_PRODUTO nfp 
                    ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
                    AND nf.SERIE_NOT = nfp.SERIE_NPR
                    AND nf.CODIGO_NOT = nfp.CODIGO_NPR
                WHERE nf.EMISSAO_NOT >= '${inicio}'
                    AND nf.EMISSAO_NOT < '${fim}'
                    AND nf.TIPO_NOT = 'S'
                    AND nf.STATUS_NOT = 'A'
                    AND nfp.STATUS_NPR = 'A'
                    AND nfp.PRODUTO_NPR IS NOT NULL
                GROUP BY nfp.PRODUTO_NPR, nfp.NOME_PRODUTO_NPR
                ORDER BY VALOR_TOTAL_CENTAVOS DESC
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

                console.log(`✅ ${result.length} produtos encontrados`);

                const dataFormatted = result.map(row => ({
                    codigoProduto: row.CODIGO_PRODUTO,
                    descricao: row.DESCRICAO ? row.DESCRICAO.trim() : 'Sem descrição',
                    totalVendas: row.TOTAL_VENDAS || 0,
                    quantidadeTotal: row.QUANTIDADE_TOTAL || 0,
                    valorTotal: centavosParaReais(row.VALOR_TOTAL_CENTAVOS)
                }));

                db.detach();

                res.json({
                    success: true,
                    data: dataFormatted,
                    summary: {
                        totalProdutos: dataFormatted.length,
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

// GET /api/faturamento-firebird/estatisticas - Estatísticas gerais
router.get('/estatisticas', async (req, res) => {
    try {
        const { dataInicio, dataFim } = req.query;

        console.log('📊 Consultando estatísticas do Firebird...');

        Firebird.attach(firebirdOptions, function (err, db) {
            if (err) {
                console.error('❌ Erro ao conectar no Firebird:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Erro ao conectar no banco Firebird',
                    error: err.message
                });
            }

            const inicio = dataInicio || '2026-01-01';
            const fim = dataFim || '2027-01-01';

            const query = `
                SELECT 
                    COUNT(DISTINCT nf.NUMERO_NOT) as TOTAL_NOTAS,
                    COUNT(DISTINCT nf.DESTINATARIO_NOT) as TOTAL_CLIENTES,
                    COUNT(nfp.PRODUTO_NPR) as TOTAL_ITENS,
                    SUM(nfp.QUANTIDADE_NPR) as QUANTIDADE_TOTAL,
                    SUM(nfp.TOTAL_NPR) as VALOR_TOTAL_CENTAVOS,
                    AVG(nfp.TOTAL_NPR) as TICKET_MEDIO_ITEM,
                    MIN(nf.EMISSAO_NOT) as PRIMEIRA_NOTA,
                    MAX(nf.EMISSAO_NOT) as ULTIMA_NOTA
                FROM NOTA_FISCAL nf
                INNER JOIN NOTA_FISCAL_PRODUTO nfp 
                    ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
                    AND nf.SERIE_NOT = nfp.SERIE_NPR
                    AND nf.CODIGO_NOT = nfp.CODIGO_NPR
                WHERE nf.EMISSAO_NOT >= '${inicio}'
                    AND nf.EMISSAO_NOT < '${fim}'
                    AND nf.TIPO_NOT = 'S'
                    AND nf.STATUS_NOT = 'A'
                    AND nfp.STATUS_NPR = 'A'
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

                console.log('✅ Estatísticas calculadas');

                if (result.length > 0) {
                    const stats = result[0];

                    const dataFormatted = {
                        totalNotas: stats.TOTAL_NOTAS || 0,
                        totalClientes: stats.TOTAL_CLIENTES || 0,
                        totalItens: stats.TOTAL_ITENS || 0,
                        quantidadeTotal: stats.QUANTIDADE_TOTAL || 0,
                        valorTotal: centavosParaReais(stats.VALOR_TOTAL_CENTAVOS),
                        ticketMedio: centavosParaReais(stats.TICKET_MEDIO_ITEM),
                        primeiraNota: formatarData(stats.PRIMEIRA_NOTA),
                        ultimaNota: formatarData(stats.ULTIMA_NOTA)
                    };

                    db.detach();

                    res.json({
                        success: true,
                        data: dataFormatted,
                        summary: {
                            dataConsulta: new Date().toISOString()
                        }
                    });
                } else {
                    db.detach();
                    res.json({
                        success: true,
                        data: null,
                        message: 'Nenhum dado encontrado para o período'
                    });
                }
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
