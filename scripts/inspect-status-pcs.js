require('dotenv').config({ path: '.env.local' });


const { Firebird, options: options } = require('../lib/firebird-helper');

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
