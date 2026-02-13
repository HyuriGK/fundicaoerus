
const express = require('express');
const router = express.Router();
const Firebird = require('node-firebird');

// Configuração do Firebird (Mesma do faturamento-firebird.js)
// Configuração do Firebird
const firebirdOptions = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null, // Explicitamente null para garantir
    pageSize: 4096
};

// GET /api/pedidos-firebird/emissao-mensal
// Retorna o valor e peso total de pedidos emitidos por mês/ano
router.get('/emissao-mensal', async (req, res) => {
    let dbConn = null;
    try {
        console.log('📊 [API] Recebida requisição para histórico de emissão.');

        const { anoInicio } = req.query;
        const startYear = parseInt(anoInicio) || 2024;

        // Promisify attach para usar async/await e facilitar tratamento de erro
        const db = await new Promise((resolve, reject) => {
            Firebird.attach(firebirdOptions, (err, db) => {
                if (err) reject(err);
                else resolve(db);
            });
        });

        dbConn = db; // Salva referência para detach no finally

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

        // Promisify query
        const result = await new Promise((resolve, reject) => {
            db.query(query, (err, res) => {
                if (err) reject(err);
                else resolve(res);
            });
        });

        console.log(`✅ [API] Sucesso! ${result.length} registros encontrados.`);

        const dataFormatted = result.map(row => ({
            ano: row.ANO,
            mes: row.MES,
            totalPedidos: row.TOTAL_PEDIDOS,
            totalValor: row.TOTAL_VALOR,
            totalPeso: row.TOTAL_PESO_LIQUIDO,
            totalPesoBruto: row.TOTAL_PESO_BRUTO
        }));

        res.json(dataFormatted);

    } catch (error) {
        console.error('❌ [API] Erro ao buscar emissão:', error);
        res.status(500).json({ error: 'Erro interno no servidor', details: error.message });
    } finally {
        if (dbConn) {
            try {
                dbConn.detach();
            } catch (e) {
                console.warn('⚠️ Erro ao fechar conexão Firebird:', e.message);
            }
        }
    }
});

module.exports = router;
