const express = require('express');
const Firebird = require('node-firebird');
const cors = require('cors');

const app = express();
const PORT = 3006;

// CORS para permitir acesso do frontend
app.use(cors());

// Configuração do Firebird
const firebirdOptions = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

// Endpoint isolado
app.get('/api/emissao-mensal', async (req, res) => {
    let dbConn = null;
    try {
        console.log(`[Micro-Service] Recebida requisição em ${new Date().toISOString()}`);

        const { anoInicio } = req.query;
        const startYear = parseInt(anoInicio) || 2024;

        // Conectar
        const db = await new Promise((resolve, reject) => {
            Firebird.attach(firebirdOptions, (err, db) => {
                if (err) reject(err);
                else resolve(db);
            });
        });

        dbConn = db;

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

        const result = await new Promise((resolve, reject) => {
            db.query(query, (err, res) => {
                if (err) reject(err);
                else resolve(res);
            });
        });

        console.log(`[Micro-Service] Sucesso! ${result.length} registros.`);

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
        console.error('[Micro-Service] Erro:', error);
        res.status(500).json({ error: 'Erro no micro-serviço' });
    } finally {
        if (dbConn) {
            try {
                dbConn.detach();
            } catch (e) { console.error('Erro ao fechar conexão', e); }
        }
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Micro-Serviço de Emissão rodando na porta ${PORT}`);
});
