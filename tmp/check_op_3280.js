const Firebird = require('node-firebird');
const options = {
    host: '10.1.1.100', port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA', password: 'masterkey'
};

Firebird.attach(options, (err, db) => {
    if (err) { console.error(err); process.exit(1); }
    
    const sql = `
        SELECT SETOR_PCS, STATUS_PCS, SUM(QUANTIDADE_PCS) as TOTAL
        FROM PRODUCAO_SETOR 
        WHERE CODIGO_PCS = 3280 AND EMPRESA_PCS = 10
        GROUP BY SETOR_PCS, STATUS_PCS
    `;
    
    db.query(sql, (err, result) => {
        db.detach();
        if (err) { console.error(err); process.exit(1); }
        console.log(JSON.stringify(result, null, 2));
    });
});
