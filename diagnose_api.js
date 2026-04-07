const firebird = require('node-firebird');
const options = {
    host: 'Desktop-dqarv0d', port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA', password: 'masterkey',
    lowercase_keys: false, role: null, pageSize: 4096
};

firebird.attach(options, function (err, dbConn) {
    if (err) { console.error('Connection error', err); process.exit(1); }

    const runQuery = (q) => {
        return new Promise((resolve) => {
            dbConn.query(q, (err, res) => {
                if (err) {
                    console.error('QUERY ERR:', err.message);
                    resolve([]);
                } else resolve(res || []);
            });
        });
    };

    const q1 = `SELECT FIRST 1 COALESCE(FORN.RAZAO_SOCIAL_FRN, 'DESCONHECIDO') AS NOME, SUM(C.TOTAL_PRODUTOS_COM) AS TOTAL FROM COMPRA C LEFT JOIN FORNECEDOR FORN ON C.FORNECEDOR_COM = FORN.FOR_CODIGO_FRN WHERE EXTRACT(YEAR FROM C.EMISSAO_COM) IN (2025, 2026) GROUP BY 1 ORDER BY 2 DESC`;
    const q2 = `SELECT FIRST 1 COALESCE(DES.NOME_DES, 'NAO CATEGORIZADO') AS NOME, SUM(C.TOTAL_PRODUTOS_COM) AS TOTAL FROM COMPRA C LEFT JOIN DESPESA DES ON C.DESPESA_COM = DES.CODIGO_DES WHERE EXTRACT(YEAR FROM C.EMISSAO_COM) IN (2025, 2026) GROUP BY 1 ORDER BY 2 DESC`;
    const q3 = `SELECT FIRST 1 COALESCE(CC.NOME_CTU, 'GERAL / NAO ALOCADO') AS NOME, SUM(PAG.VALOR_PARCELA_PAG) AS TOTAL FROM PAGAR PAG LEFT JOIN CENTRO_CUSTO CC ON PAG.CTU_CODIGO_PAG = CC.CODIGO_CTU WHERE PAG.ANO_PAG IN (2025, 2026) GROUP BY 1 ORDER BY 2 DESC`;
    const q4 = `SELECT FIRST 1 COALESCE(PRO.NOME_PRO, 'DIVERSOS') AS NOME, SUM(CP.VALOR_TOTAL_CPO) AS TOTAL FROM COMPRA_PRODUTO CP JOIN COMPRA C ON CP.COM_ID_CPR = C.ID_COM LEFT JOIN PRODUTO PRO ON CP.PRODUTO_CPO = PRO.CODIGO_PRO WHERE EXTRACT(YEAR FROM C.EMISSAO_COM) IN (2025, 2026) GROUP BY 1 ORDER BY 2 DESC`;

    (async () => {
        console.log('Testing q1...'); const res1 = await runQuery(q1); console.log(res1);
        console.log('Testing q2...'); const res2 = await runQuery(q2); console.log(res2);
        console.log('Testing q3...'); const res3 = await runQuery(q3); console.log(res3);
        console.log('Testing q4...'); const res4 = await runQuery(q4); console.log(res4);
        dbConn.detach();
    })();
});
