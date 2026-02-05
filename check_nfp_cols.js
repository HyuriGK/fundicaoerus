const Firebird = require('node-firebird');
require('dotenv').config({ path: '.env.local' });

const options = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false
};

Firebird.attach(options, (err, db) => {
    if (err) throw err;
    db.query('SELECT FIRST 1 * FROM NOTA_FISCAL_PRODUTO', (err, result) => {
        if (err) throw err;
        console.log(Object.keys(result[0]));
        db.detach();
    });
});
