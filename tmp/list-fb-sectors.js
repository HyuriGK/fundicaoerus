const Firebird = require('node-firebird');
require('dotenv').config({ path: '.env.local' });

const FIREBIRD_OPTIONS = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

Firebird.attach(FIREBIRD_OPTIONS, function(err, db) {
    if (err) throw err;
    db.query('SELECT CODIGO_SET, NOME_SET FROM SETOR ORDER BY CODIGO_SET', function(err, rows) {
        if (err) throw err;
        console.table(rows);
        db.detach();
    });
});
