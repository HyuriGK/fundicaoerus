
require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const fbOptions = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

Firebird.attach(fbOptions, function (err, db) {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    db.query('SELECT FIRST 1 * FROM PRODUCAO', (err, rows) => {
        if (err) console.error(err);
        else if (rows.length > 0) {
            console.log('PRODUCAO Columns:', Object.keys(rows[0]).join(', '));
        }

        db.query('SELECT FIRST 1 * FROM CLIENTE', (err, rows) => {
            if (err) console.error(err);
            else if (rows.length > 0) {
                console.log('CLIENTE Columns:', Object.keys(rows[0]).join(', '));
            }
            db.detach();
        });
    });
});
