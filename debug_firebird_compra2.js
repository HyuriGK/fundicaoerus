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

    // COMPRA joined with FORNECEDOR (Using EMISSAO_COM, TOTAL_PRODUTOS_COM)
    const q1 = "SELECT FIRST 1 COALESCE(FORN.RAZAO_SOCIAL_FRN, 'DESCONHECIDO') AS NOME, SUM(C.TOTAL_PRODUTOS_COM) AS TOTAL FROM COMPRA C LEFT JOIN FORNECEDOR FORN ON C.FORNECEDOR_COM = FORN.FOR_CODIGO_FRN WHERE EXTRACT(YEAR FROM C.EMISSAO_COM) IN (2025, 2026) GROUP BY 1 ORDER BY TOTAL DESC";

    // COMPRA joined with DESPESA 
    const q2 = "SELECT FIRST 1 COALESCE(DES.NOME_DES, 'NAO CATEGORIZADO') AS NOME, SUM(C.TOTAL_PRODUTOS_COM) AS TOTAL FROM COMPRA C LEFT JOIN DESPESA DES ON C.DESPESA_COM = DES.CODIGO_DES WHERE EXTRACT(YEAR FROM C.EMISSAO_COM) IN (2025, 2026) GROUP BY 1 ORDER BY TOTAL DESC";

    db.query(q1, (err, r1) => {
        if (err) console.error('Q1 ERR:', err); else console.log('Q1 OK:', r1);
        db.query(q2, (err, r2) => {
            if (err) console.error('Q2 ERR:', err); else console.log('Q2 OK:', r2);
            db.detach();
        });
    });
});
