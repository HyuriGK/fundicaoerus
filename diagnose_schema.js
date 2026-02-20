const firebird = require('node-firebird');
const options = {
    host: '10.1.1.100', port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA', password: 'masterkey',
    lowercase_keys: false, role: null, pageSize: 4096
};

firebird.attach(options, function (err, db) {
    if (err) throw err;
    db.query(`
        SELECT RDB$FIELD_NAME 
        FROM RDB$RELATION_FIELDS 
        WHERE TRIM(RDB$RELATION_NAME) = 'COMPRA_PRODUTO'
    `, function (err, result) {
        if (err) throw err;
        console.log('COMPRA_PRODUTO Columns:');
        console.log(result.map(r => r.RDB$FIELD_NAME.trim()).filter(c => c.includes('PRO') || c.includes('PRD') || c.includes('ID')));
        db.detach();
    });
});
