const firebird = require('node-firebird');
const options = {
    host: '10.1.1.100', port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
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

    const q4 = `SELECT FIRST 1 COALESCE(PRO.NOME_PRO, 'DIVERSOS') AS NOME, SUM(CP.VALOR_PRODUTOS_CPR) AS TOTAL FROM COMPRA_PRODUTO CP JOIN COMPRA C ON CP.COM_ID_CPR = C.ID_COM LEFT JOIN PRODUTO PRO ON CP.PRODUTO_CPR = PRO.CODIGO_PRO WHERE EXTRACT(YEAR FROM C.EMISSAO_COM) IN (2025, 2026) GROUP BY 1 ORDER BY 2 DESC`;

    (async () => {
        console.log('Testing q4...'); const res4 = await runQuery(q4); console.log(res4);
        dbConn.detach();
    })();
});
