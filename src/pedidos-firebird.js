
const express = require('express');
const router = express.Router();
const Firebird = require('node-firebird');

// Configuração do Firebird (Mesma do faturamento-firebird.js)
const firebirdOptions = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

// Configuração de Pool (Melhor para múltiplas requisições)
const pool = Firebird.pool(5, firebirdOptions); // Max 5 conexões

// GET /api/pedidos-firebird/emissao-mensal
// Retorna o valor e peso total de pedidos emitidos por mês/ano
router.get('/emissao-mensal', async (req, res) => {
    try {
        console.log('📊 Consultando histórico de emissão de pedidos do Firebird...');

        // Pega data de início ou assume 2024 (para histórico relevante)
        const { anoInicio } = req.query;
        const startYear = parseInt(anoInicio) || 2024;

        console.log(`🔍 [Total Emission] Querying Firebird for orders since ${startYear}...`);

        // Usar pool.get() em vez de attach()
        pool.get(function (err, db) {
            if (err) {
                console.error('❌ Erro ao obter conexão do pool Firebird:', err);
                return res.status(500).json({ error: 'Erro de conexão com Firebird', details: err.message });
            }

            // Query para agrupar por Ano/Mês da emissão
            const query = `
                SELECT 
                    EXTRACT(YEAR FROM p.EMISSAO_PED) as ANO,
                    EXTRACT(MONTH FROM p.EMISSAO_PED) as MES,
                    COUNT(p.CODIGO_PED) as TOTAL_PEDIDOS,
                    SUM(p.TOTAL_PEDIDO_PED) as TOTAL_VALOR,
                    SUM(COALESCE(p.PESO_LIQUIDO_PED, 0)) as TOTAL_PESO_LIQUIDO,
                    SUM(COALESCE(p.PESO_BRUTO_PED, 0)) as TOTAL_PESO_BRUTO
                FROM PEDIDO p
                WHERE EXTRACT(YEAR FROM p.EMISSAO_PED) >= ${startYear}
                  AND p.STATUS_PED <> 'C' 
                GROUP BY 1, 2
                ORDER BY 1 DESC, 2 DESC
            `;

            db.query(query, function (err, result) {
                // IMPORTANTE: Liberar conexão de volta para o pool
                db.detach();

                if (err) {
                    console.error('❌ Erro na query de emissão:', err);
                    return res.status(500).json({ error: 'Erro na consulta SQL', details: err.message });
                }

                console.log(`✅ ${result.length} meses encontrados.`);

                // Formatar retorno
                const dataFormatted = result.map(row => ({
                    ano: row.ANO,
                    mes: row.MES,
                    totalPedidos: row.TOTAL_PEDIDOS,
                    totalValor: row.TOTAL_VALOR,
                    totalPeso: row.TOTAL_PESO_LIQUIDO,
                    totalPesoBruto: row.TOTAL_PESO_BRUTO
                }));

                res.json(dataFormatted);
            });
        });

    } catch (error) {
        console.error('❌ Erro geral no endpoint:', error);
        res.status(500).json({ error: 'Erro interno no servidor' });
    }
});

module.exports = router;
