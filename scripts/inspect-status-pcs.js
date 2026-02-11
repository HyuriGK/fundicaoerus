require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const options = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

Firebird.attach(options, function (err, db) {
    if (err) throw err;

    console.log('--- Analyzing STATUS_PCS in PRODUCAO_SETOR (2026) ---');

    db.query(`
        SELECT STATUS_PCS, COUNT(*) as TOTAL
        FROM PRODUCAO_SETOR 
        WHERE DATA_PCS >= '2026-01-01' AND DATA_PCS <= '2026-12-31'
        GROUP BY STATUS_PCS
    `, function (err, result) {
        if (err) console.error(err);
        else {
            console.table(result);
        }
        db.detach();
    });
});
