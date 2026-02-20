const express = require('express');
const router = express.Router();
const Firebird = require('node-firebird');

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

// GET /api/custos-detalhados-firebird
// Retorna os custos do Firebird agregados (Fornecedores, Tipos, Setores, Materiais) filtrados restritamente para os anos de 2025 e 2026.
router.get('/', async (req, res) => {
    let dbConn = null;
    try {
        console.log('📊 [API] Recebida requisicao para detalhamento de Custos (2025-2026).');

        const db = await new Promise((resolve, reject) => {
            Firebird.attach(firebirdOptions, (err, db) => {
                if (err) reject(err);
                else resolve(db);
            });
        });

        dbConn = db;

        const queryFornecedores = `
            SELECT FIRST 20 
                COALESCE(FORN.NOME_FOR, 'DESCONHECIDO') AS NOME,
                SUM(PAG.VALOR_PARCELA_PAG) AS TOTAL
            FROM PAGAR PAG
            LEFT JOIN FORNECEDOR FORN ON PAG.FORNECEDOR_PAG = FORN.CODIGO_FOR
            WHERE PAG.ANO_PAG IN (2025, 2026)
            GROUP BY COALESCE(FORN.NOME_FOR, 'DESCONHECIDO')
            ORDER BY TOTAL DESC
        `;

        const queryTipos = `
            SELECT FIRST 20 
                COALESCE(DES.NOME_DES, 'NAO CATEGORIZADO') AS NOME,
                SUM(PAG.VALOR_PARCELA_PAG) AS TOTAL
            FROM PAGAR PAG
            LEFT JOIN DESPESA DES ON PAG.DESPESA_PAG = DES.CODIGO_DES
            WHERE PAG.ANO_PAG IN (2025, 2026)
            GROUP BY COALESCE(DES.NOME_DES, 'NAO CATEGORIZADO')
            ORDER BY TOTAL DESC
        `;

        const querySetores = `
            SELECT FIRST 20 
                COALESCE(CC.NOME_CTU, 'GERAL / NAO ALOCADO') AS NOME,
                SUM(PAG.VALOR_PARCELA_PAG) AS TOTAL
            FROM PAGAR PAG
            LEFT JOIN CENTRO_CUSTO CC ON PAG.CTU_CODIGO_PAG = CC.CODIGO_CTU
            WHERE PAG.ANO_PAG IN (2025, 2026)
            GROUP BY COALESCE(CC.NOME_CTU, 'GERAL / NAO ALOCADO')
            ORDER BY TOTAL DESC
        `;

        const queryMateriais = `
            SELECT FIRST 20 
                COALESCE(PRO.NOME_PRO, 'DIVERSOS') AS NOME,
                SUM(CP.VALOR_TOTAL_CPO) AS TOTAL
            FROM COMPRA_PRODUTO CP
            JOIN COMPRA C ON CP.COMPRA_CPO = C.ID_COM
            LEFT JOIN PRODUTO PRO ON CP.PRODUTO_CPO = PRO.CODIGO_PRO
            WHERE EXTRACT(YEAR FROM C.ENTRADA_COM) IN (2025, 2026)
            GROUP BY COALESCE(PRO.NOME_PRO, 'DIVERSOS')
            ORDER BY TOTAL DESC
        `;

        const runQuery = (q) => {
            return new Promise((resolve, reject) => {
                dbConn.query(q, (err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });
        };

        const [fornecedores, tipos, setores, materiais] = await Promise.all([
            runQuery(queryFornecedores),
            runQuery(queryTipos),
            runQuery(querySetores),
            runQuery(queryMateriais)
        ]);

        res.json({
            success: true,
            data: {
                fornecedores: fornecedores.map(r => ({ nome: r.NOME, total: r.TOTAL || 0 })),
                tipos: tipos.map(r => ({ nome: r.NOME, total: r.TOTAL || 0 })),
                setores: setores.map(r => ({ nome: r.NOME, total: r.TOTAL || 0 })),
                materiais: materiais.map(r => ({ nome: r.NOME, total: r.TOTAL || 0 }))
            }
        });

    } catch (error) {
        console.error('❌ [API Custos] Erro ao buscar custos detalhados:', error);
        res.status(500).json({ success: false, error: 'Erro interno no servidor ao buscar dados do ERP.' });
    } finally {
        if (dbConn) {
            try { dbConn.detach(); } catch (e) { }
        }
    }
});

module.exports = router;
