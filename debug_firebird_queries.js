const firebird = require('node-firebird');
const options = {
    host: '10.1.1.100', port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA', password: 'masterkey',
    lowercase_keys: false, role: null, pageSize: 4096
};

firebird.attach(options, function (err, db) {
    if (err) throw err;
    console.log('Connected.');

    const queries = [
        "SELECT FIRST 1 COALESCE(FORN.NOME_FOR, 'DESCONHECIDO') AS NOME, SUM(PAG.VALOR_PARCELA_PAG) AS TOTAL FROM PAGAR PAG LEFT JOIN FORNECEDOR FORN ON PAG.FORNECEDOR_PAG = FORN.CODIGO_FOR WHERE PAG.ANO_PAG IN (2025, 2026) GROUP BY 1 ORDER BY TOTAL DESC",
        "SELECT FIRST 1 COALESCE(DES.NOME_DES, 'NAO CATEGORIZADO') AS NOME, SUM(PAG.VALOR_PARCELA_PAG) AS TOTAL FROM PAGAR PAG LEFT JOIN DESPESA DES ON PAG.DESPESA_PAG = DES.CODIGO_DES WHERE PAG.ANO_PAG IN (2025, 2026) GROUP BY 1 ORDER BY TOTAL DESC",
        "SELECT FIRST 1 COALESCE(CC.NOME_CTU, 'GERAL / NAO ALOCADO') AS NOME, SUM(PAG.VALOR_PARCELA_PAG) AS TOTAL FROM PAGAR PAG LEFT JOIN CENTRO_CUSTO CC ON PAG.CTU_CODIGO_PAG = CC.CODIGO_CTU WHERE PAG.ANO_PAG IN (2025, 2026) GROUP BY 1 ORDER BY TOTAL DESC",
        "SELECT FIRST 1 COALESCE(PRO.NOME_PRO, 'DIVERSOS') AS NOME, SUM(CP.VALOR_TOTAL_CPO) AS TOTAL FROM COMPRA_PRODUTO CP JOIN COMPRA C ON CP.COMPRA_CPO = C.ID_COM LEFT JOIN PRODUTO PRO ON CP.PRODUTO_CPO = PRO.CODIGO_PRO WHERE EXTRACT(YEAR FROM C.ENTRADA_COM) IN (2025, 2026) GROUP BY 1 ORDER BY TOTAL DESC"
    ];

    let i = 0;
    function next() {
        if (i >= queries.length) return db.detach();
        console.log('Testing query', i);
        db.query(queries[i], (err, res) => {
            if (err) console.error('Error in query', i, err.message);
            else console.log('Query', i, 'OK');
            i++;
            next();
        });
    }
    next();
});
