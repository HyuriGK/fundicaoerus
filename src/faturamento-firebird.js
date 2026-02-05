// src/faturamento-firebird.js
const express = require('express');
const router = express.Router();
const Firebird = require('node-firebird');

// Configuração do Firebird
// TODO: Mover para .env se possível, mas mantendo hardcoded conforme padrão do projeto atual
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

            // Query baseada no script de extração validado (scripts/extrair-faturamento.js)
            // Busca dados de 2025 em diante para carregar o ano atual/recente
            const query = `
                SELECT 
                    nf.DATA_EMISSAO_NOT as DATA_FATURAMENTO,
                    nf.NUMERO_NOT as PEDIDO,
                    nf.ORDEM_COMPRA_NOT as OC,
                    nf.DESTINATARIO_NOT as COD_CLIENTE,
                    c.RAZAO_SOCIAL_CLI as CLIENTE,
                    nfp.PRODUTO_NPR as CODIGO_ITEM,
                    nfp.NOME_PRODUTO_NPR as DESCRICAO,
                    nfp.QUANTIDADE_NPR as QUANTIDADE,
                    nfp.PRECO_NPR as VALOR_UNITARIO,
                    nfp.TOTAL_NPR as VALOR_TOTAL,
                    -- Tentar buscar material e peso se disponível em joins futuros, por enquanto placeholders
                    NULL as MATERIAL,
                    0 as PESO_UN, 
                    0 as PESO_TOTAL
                FROM NOTA_FISCAL nf
                INNER JOIN NOTA_FISCAL_PRODUTO nfp 
                    ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
                    AND nf.SERIE_NOT = nfp.SERIE_NPR
                    AND nf.CODIGO_NOT = nfp.CODIGO_NPR
                LEFT JOIN CLIENTE c 
                    ON nf.CLI_EMPRESA_NOT = c.EMPRESA_CLI 
                    AND nf.CLIFOR_NOT = c.CODIGO_CLI
                WHERE nf.DATA_EMISSAO_NOT >= '2025-01-01'
                    AND nf.TIPO_NOT = 'S'
                    AND nfp.PRODUTO_NPR IS NOT NULL
                ORDER BY nf.DATA_EMISSAO_NOT DESC, nf.NUMERO_NOT DESC
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

                // Formatar dados para o padrão esperado pelo frontend (Array de Arrays)
                // Padrão: [ID, DATA, PEDIDO, OC, COD_CLI, CLI, COD, DESC, QTD, PRECO, MAT, PESO_UN, PESO_TOT, VALOR, EXCLUIDO]
                const formattedData = result.map((row, index) => {
                    const data = row.DATA_FATURAMENTO ? row.DATA_FATURAMENTO.toISOString().split('T')[0] : '';

                    return [
                        index + 1, // ID Fake
                        data,
                        row.PEDIDO,
                        row.OC ? row.OC.trim() : '',
                        row.COD_CLIENTE,
                        row.CLIENTE ? row.CLIENTE.trim() : '',
                        row.CODIGO_ITEM,
                        row.DESCRICAO ? row.DESCRICAO.trim() : '',
                        row.QUANTIDADE || 0,
                        (row.VALOR_UNITARIO || 0) / 100, // Firebird salva sem vírgula
                        row.MATERIAL || '',
                        Number(row.PESO_UN || 0),
                        Number(row.PESO_TOTAL || 0),
                        (row.VALOR_TOTAL || 0) / 100, // Firebird salva sem vírgula
                        0 // Excluído (Padrão 0)
                    ];
                });

                // Adiciona o cabeçalho fake para compatibilidade com o frontend
                formattedData.unshift(["HEADER", "DATA", "PEDIDO", "OC", "COD", "CLI", "COD", "DESC", "QTD", "PRE", "MAT", "PESO", "PESOT", "VAL", "IGN"]);

                db.detach();
                res.json(formattedData);
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
