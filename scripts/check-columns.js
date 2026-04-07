

const { Firebird, options: FIREBIRD_OPTIONS } = require('../lib/firebird-helper');

Firebird.attach(FIREBIRD_OPTIONS, (err, db) => {
    if (err) throw err;

    console.log('--- PAGAR columns ---');
    db.query('SELECT FIRST 1 * FROM PAGAR', (err, res) => {
        if (err) console.error(err);
        else {
            const columns = Object.keys(res[0]);
            console.log(JSON.stringify(columns));
        }

        db.detach();
    });
});
