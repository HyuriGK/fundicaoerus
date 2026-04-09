const { Firebird, options: FIREBIRD_OPTIONS } = require('../lib/firebird-helper');

Firebird.attach(FIREBIRD_OPTIONS, (err, db) => {
    if (err) { console.error(err); process.exit(1); }
    db.query('SELECT CODIGO_SET, NOME_SET FROM SETOR', (err, rows) => {
        if (err) { console.error(err); }
        else { console.table(rows); }
        db.detach();
    });
});
