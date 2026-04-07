const Firebird = require('node-firebird');
const options = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096, wireCrypt: true
};

Firebird.attach(options, function (err, db) {
    if (err) { console.error(err); return; }

    // Quick query for columns
    const sql = `
        SELECT TRIM(RDB$RELATION_NAME) as TABELA, TRIM(RDB$FIELD_NAME) as COLUNA 
        FROM RDB$RELATION_FIELDS 
        WHERE RDB$RELATION_NAME IN ('FICHA_TECNICA', 'PRODUTO')
        ORDER BY RDB$RELATION_NAME, RDB$FIELD_POSITION
    `;

    db.query(sql, function (err, result) {
        if (err) { console.error(err); } else {
            result.forEach(row => {
                console.log(`${row.TABELA}: ${row.COLUNA}`);
            });
        }
        db.detach();
    });
});
