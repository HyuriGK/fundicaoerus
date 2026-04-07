const Firebird = require('node-firebird');
const options = {
    host: 'Desktop-dqarv0d', port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA', password: 'masterkey'
};

Firebird.attach(options, (err, db) => {
    if (err) { console.error(err); process.exit(1); }
    
    const sql = `
        SELECT SETOR_PCS, STATUS_PCS, SUM(QUANTIDADE_PCS) as TOTAL
        FROM PRODUCAO_SETOR 
        WHERE CODIGO_PCS = 3235 AND EMPRESA_PCS = 10
        GROUP BY SETOR_PCS, STATUS_PCS
    `;
    
    db.query(sql, (err, result) => {
        db.detach();
        if (err) { console.error(err); process.exit(1); }
        console.log(JSON.stringify(result, null, 2));
    });
});
