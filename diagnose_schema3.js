const firebird = require('node-firebird');
const options = {
    host: 'Desktop-dqarv0d', port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA', password: 'masterkey',
    lowercase_keys: false, role: null, pageSize: 4096
};

firebird.attach(options, function (err, db) {
    if (err) throw err;
    db.query(`
        SELECT RDB$FIELD_NAME 
        FROM RDB$RELATION_FIELDS 
        WHERE TRIM(RDB$RELATION_NAME) = 'PAGAR'
    `, function (err, result) {
        if (err) throw err;
        console.log('PAGAR Columns:', result.map(r => r.RDB$FIELD_NAME.trim()).filter(c => c.includes('DATA') || c.includes('NUM') || c.includes('DOC')));
        db.detach();
    });
});
