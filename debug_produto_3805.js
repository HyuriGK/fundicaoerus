
require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');
const fbOptions = { host: '10.1.1.100', port: 3050, database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb', user: 'SYSDBA', password: 'masterkey', lowercase_keys: false, pageSize: 4096 };

Firebird.attach(fbOptions, (err, db) => {
    if (err) throw err;
    db.query('SELECT * FROM PRODUTO WHERE CODIGO_PRO = 225302200', (err, rows) => {
        if (err) throw err;
        if (rows && rows.length > 0) {
            const r = rows[0];
            for (const k in r) {
                if (r[k] !== null && r[k] !== '') {
                    console.log(`${k}: ${r[k]}`);
                }
            }
        }
        db.detach();
    });
});
