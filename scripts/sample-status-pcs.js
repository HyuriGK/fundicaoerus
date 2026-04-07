require('dotenv').config({ path: '.env.local' });


const { Firebird, options: options } = require('../lib/firebird-helper');

Firebird.attach(options, function (err, db) {
    if (err) throw err;

    console.log('--- Sampling STATUS_PCS (2026) ---');

    const statuses = ['C', 'N', 'P'];
    const queries = statuses.map(status => {
        return new Promise((resolve, reject) => {
            db.query(`
                SELECT FIRST 3 STATUS_PCS, DATA_PCS, QUANTIDADE_PCS, CODIGO_PCS 
                FROM PRODUCAO_SETOR 
                WHERE STATUS_PCS = ? AND DATA_PCS >= '2026-01-01'
            `, [status], (err, rows) => {
                if (err) reject(err);
                else resolve({ status, rows });
            });
        });
    });

    Promise.all(queries).then(results => {
        results.forEach(res => {
            console.log(`\n--- Status '${res.status}' Samples ---`);
            console.table(res.rows);
        });
        db.detach();
    }).catch(err => {
        console.error(err);
        db.detach();
    });
});
