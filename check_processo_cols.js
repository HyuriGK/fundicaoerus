const Firebird = require('node-firebird');
const options = { host: 'Desktop-dqarv0d', port: 3050, database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb', user: 'SYSDBA', password: 'masterkey', lowercase_keys: false, pageSize: 4096, wireCrypt: true };
Firebird.attach(options, function (err, db) {
    if (err) { console.error('Connection failed:', err.message); process.exit(1); }
    const query = `
        SELECT RDB$FIELD_NAME as COLUMN_NAME 
        FROM RDB$RELATION_FIELDS 
        WHERE TRIM(RDB$RELATION_NAME) = 'PROCESSO'
        ORDER BY RDB$FIELD_POSITION
    `;
    db.query(query, function (err, result) {
        if (err) { console.error('Query failed:', err.message); db.detach(); process.exit(1); }
        console.log('PROCESSO Columns:', result.map(r => r.COLUMN_NAME.trim()));
        db.detach();
    });
});
