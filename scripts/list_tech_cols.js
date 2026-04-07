

const { Firebird, options: options } = require('../lib/firebird-helper');

const tables = ['FICHA_TECNICA', 'PRODUTO', 'PRODUTOS'];

Firebird.attach(options, function (err, db) {
    if (err) throw err;

    let processed = 0;
    tables.forEach(table => {
        db.query(`SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = ?`, [table], function (err, result) {
            console.log(`\n--- COLUMNS FOR ${table} ---`);
            if (err) {
                console.log('Error or Table not found');
            } else {
                result.forEach(row => {
                    console.log(row.RDB$FIELD_NAME.trim());
                });
            }
            processed++;
            if (processed === tables.length) {
                db.detach();
            }
        });
    });
});
