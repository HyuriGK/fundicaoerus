require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const FIREBIRD_OPTIONS = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

Firebird.attach(FIREBIRD_OPTIONS, function (err, db) {
    if (err) { console.error(err); return; }

    const query = `
        SELECT R.RDB$FIELD_NAME 
        FROM RDB$RELATION_FIELDS R
        WHERE R.RDB$RELATION_NAME = 'PEDIDO'
        AND (R.RDB$FIELD_NAME LIKE '%STATUS%' OR R.RDB$FIELD_NAME LIKE '%BLOQ%' OR R.RDB$FIELD_NAME LIKE '%SIT%')
    `;

    db.query(query, function (err, result) {
        if (err) console.error(err);
        else {
            const columns = result.map(r => r.RDB$FIELD_NAME.trim());
            console.log('Columns found:', columns);
        }
        db.detach();
    });
});
