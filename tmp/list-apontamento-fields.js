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
    db.query(`SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'APONTAMENTO'`, function(err, rows) {
        if (err) throw err;
        console.log('APONTAMENTO:');
        console.table(rows);
        db.query(`SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'PRODUCAO_SETOR_MAPA'`, function(err, rows2) {
            console.log('PRODUCAO_SETOR_MAPA:');
            console.table(rows2);
            db.detach();
        });
    });
});
