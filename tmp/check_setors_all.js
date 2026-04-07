const Firebird = require('node-firebird');
const options = {
    host: 'Desktop-dqarv0d', port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA', password: 'masterkey'
};

Firebird.attach(options, (err, db) => {
    if (err) { console.error(err); process.exit(1); }
    const ids = [1,10,11,12,2,20,3,30,33,113,4,7,8,9,31,40,61,50,51,104,105,6,60,100,101];
    const sql = `SELECT CODIGO_SET, NOME_SET FROM SETOR WHERE CODIGO_SET IN (${ids.join(',')})`;
    
    db.query(sql, (err, result) => {
        db.detach();
        if (err) { console.error(err); process.exit(1); }
        console.log(JSON.stringify(result, null, 2));
    });
});
