const firebird = require('node-firebird');
const options = {
    host: '10.1.1.100', port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA', password: 'masterkey',
    lowercase_keys: false, role: null, pageSize: 4096
};

firebird.attach(options, function (err, db) {
    if (err) throw err;
    console.log('Connected to Firebird.');

    const qFornecedor = `
        SELECT FIRST 5 
            COALESCE(FORN.NOME_FOR, 'DESCONHECIDO') AS NOME,
            SUM(C.TOTAL_PRODUTOS_COM) AS TOTAL
        FROM COMPRA C
        LEFT JOIN FORNECEDOR FORN ON C.FORNECEDOR_COM = FORN.FOR_CODIGO_FRN
        WHERE EXTRACT(YEAR FROM C.EMISSAO_COM) IN (2025, 2026)
        GROUP BY 1
        ORDER BY TOTAL DESC
    `;

    const qDespesa = `
        SELECT FIRST 5 
            COALESCE(DES.NOME_DES, 'NAO CATEGORIZADO') AS NOME,
            SUM(C.TOTAL_PRODUTOS_COM) AS TOTAL
        FROM COMPRA C
        LEFT JOIN DESPESA DES ON C.DESPESA_COM = DES.CODIGO_DES
        WHERE EXTRACT(YEAR FROM C.EMISSAO_COM) IN (2025, 2026)
        GROUP BY 1
        ORDER BY TOTAL DESC
    `;

    db.query(qFornecedor, (err, res) => {
        if (err) console.error('Erro Fornecedor:', err.message);
        else { console.log('Top Fornecedores (COMPRA):'); console.table(res); }

        db.query(qDespesa, (err, res2) => {
            if (err) console.error('Erro Despesa:', err.message);
            else { console.log('Top Despesas (COMPRA):'); console.table(res2); }
            db.detach();
        });
    });
});
