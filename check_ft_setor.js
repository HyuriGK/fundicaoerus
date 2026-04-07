const Firebird = require('node-firebird');
const options = { host: 'Desktop-dqarv0d', port: 3050, database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb', user: 'SYSDBA', password: 'masterkey', lowercase_keys: false, pageSize: 4096 };
Firebird.attach(options, function (err, db) {
    if (err) { console.error('Connection failed:', err.message); process.exit(1); }
    const query = `
        SELECT RDB$FIELD_NAME as COLUMN_NAME 
        FROM RDB$RELATION_FIELDS 
        WHERE TRIM(RDB$RELATION_NAME) = 'FICHA_TECNICA' AND RDB$FIELD_NAME LIKE '%SETOR%'
    `;
    db.query(query, function (err, result) {
        if (err) { console.error('Query failed:', err.message); db.detach(); process.exit(1); }
        console.log('FICHA_TECNICA SETOR Columns:', result.map(r => r.COLUMN_NAME.trim()));
        db.detach();
    });
});
