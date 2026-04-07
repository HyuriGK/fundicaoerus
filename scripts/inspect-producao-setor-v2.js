require('dotenv').config({ path: '.env.local' });
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

    console.log('--- Columns of PRODUCAO_SETOR ---');
    db.query(`
        SELECT RDB$FIELD_NAME 
        FROM RDB$RELATION_FIELDS 
        WHERE RDB$RELATION_NAME = 'PRODUCAO_SETOR'
    `, function (err, result) {
        if (err) console.error(err);
        else console.log(result.map(r => r.RDB$FIELD_NAME.trim()).join(', '));

        console.log('\n--- Sample Row from PRODUCAO_SETOR ---');
        db.query(`
            SELECT FIRST 1 * FROM PRODUCAO_SETOR
        `, function (err, rows) {
            if (err) console.error(err);
            else console.log(JSON.stringify(rows[0], null, 2));

            db.detach();
        });
    });
});
