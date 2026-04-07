const Firebird = require('node-firebird');
const options = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

Firebird.attach(options, function (err, db) {
    if (err) throw err;
    const codigoPro = 273000400; // CODIGO_PRO
    const idPro = 40286;        // ID_PRO
    db.query("SELECT * FROM PRODUTO_MATERIAL WHERE PRODUTO_PMT = ?", [idPro], (err, resID) => {
        if (err) throw err;
        console.log('--- LINK CHECK BY ID_PRO ---');
        console.log(resID && resID.length > 0 ? 'MATCH!' : 'No match');
        db.query("SELECT * FROM PRODUTO_MATERIAL WHERE PRODUTO_PMT = ?", [codigoPro], (err, resCode) => {
            if (err) throw err;
            console.log('--- LINK CHECK BY CODIGO_PRO ---');
            console.log(resCode && resCode.length > 0 ? 'MATCH!' : 'No match');
            db.detach();
        });
    });
});
