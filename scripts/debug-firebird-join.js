require('dotenv').config({ path: '.env.local' });


const { Firebird, options: options } = require('../lib/firebird-helper');

console.log('Attaching...');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Error connecting:', err);
        return;
    }

    const query = `
        SELECT COUNT(*) as CNT
        FROM PRODUTO_MOVIMENTACAO pmv
        WHERE pmv.DATA_PMV >= '2026-01-01'
        AND pmv.CODIGO_PRODUCAO_PMV IS NOT NULL
    `;

    console.log('Running count query...');
    db.query(query, function (err, result) {
        if (err) console.error('Error:', err);
        else console.log('Count 2026:', result);
        db.detach();
    });
});
