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
                COALESCE(FORN.RAZAO_SOCIAL_FRN, 'DESCONHECIDO') AS NOME,
                SUM(C.TOTAL_PRODUTOS_COM) AS TOTAL
            FROM COMPRA C
            LEFT JOIN FORNECEDOR FORN ON C.FORNECEDOR_COM = FORN.FOR_CODIGO_FRN
            WHERE EXTRACT(YEAR FROM C.EMISSAO_COM) IN (2025, 2026)
            GROUP BY 1
            ORDER BY 2 DESC
        `;

        const queryTipos = `
            SELECT FIRST 20 
                COALESCE(DES.NOME_DES, 'NAO CATEGORIZADO') AS NOME,
                SUM(C.TOTAL_PRODUTOS_COM) AS TOTAL
            FROM COMPRA C
            LEFT JOIN DESPESA DES ON C.DESPESA_COM = DES.CODIGO_DES
            WHERE EXTRACT(YEAR FROM C.EMISSAO_COM) IN (2025, 2026)
            GROUP BY 1
            ORDER BY 2 DESC
        `;

        const querySetores = `
            SELECT FIRST 20 
                COALESCE(CC.NOME_CTU, 'GERAL / NAO ALOCADO') AS NOME,
                SUM(PAG.VALOR_PARCELA_PAG) AS TOTAL
            FROM PAGAR PAG
            LEFT JOIN CENTRO_CUSTO CC ON PAG.CTU_CODIGO_PAG = CC.CODIGO_CTU
            WHERE PAG.ANO_PAG IN (2025, 2026)
            GROUP BY 1
            ORDER BY 2 DESC
        `;

        const queryMateriais = `
            SELECT FIRST 20 
                COALESCE(PRO.NOME_PRO, 'DIVERSOS') AS NOME,
                SUM(CP.VALOR_PRODUTOS_CPR) AS TOTAL
            FROM COMPRA_PRODUTO CP
            JOIN COMPRA C ON CP.COM_ID_CPR = C.ID_COM
            LEFT JOIN PRODUTO PRO ON CP.PRODUTO_CPR = PRO.CODIGO_PRO
            WHERE EXTRACT(YEAR FROM C.EMISSAO_COM) IN (2025, 2026)
            GROUP BY 1
            ORDER BY 2 DESC
        `;

        const runQuery = (q, name) => {
            return new Promise((resolve) => {
                dbConn.query(q, (err, res) => {
                    if (err) {
                        console.error(`[API Custos] Erro na query ${name}:`, err.message);
                        resolve([]); // Fallback para não quebrar todo o dashboard
                    } else {
                        resolve(res || []);
                    }
                });
            });
        };

        const fornecedores = await runQuery(queryFornecedores, 'Fornecedores');
        const tipos = await runQuery(queryTipos, 'Tipos');
        const setores = await runQuery(querySetores, 'Setores');
        const materiais = await runQuery(queryMateriais, 'Materiais');

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
