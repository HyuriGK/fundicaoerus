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
        WHERE TRIM(RDB$RELATION_NAME) = 'FORNECEDOR'
    `, function (err, result) {
        if (err) throw err;
        console.log('FORNECEDOR Columns:');
        console.log(result.map(r => r.RDB$FIELD_NAME.trim()).filter(c => c.includes('NOME') || c.includes('RAZAO')));

        db.query(`
            SELECT RDB$FIELD_NAME 
            FROM RDB$RELATION_FIELDS 
            WHERE TRIM(RDB$RELATION_NAME) = 'COMPRA_PRODUTO'
        `, function (err, result2) {
            console.log('COMPRA_PRODUTO Columns:');
            console.log(result2.map(r => r.RDB$FIELD_NAME.trim()).filter(c => c.includes('COMPRA') || c.includes('COM')));
            db.detach();
        });
    });
});
