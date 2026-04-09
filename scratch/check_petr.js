const { Firebird, options } = require('../lib/firebird-helper');

Firebird.attach(options, (err, db) => {
    if (err) { console.error(err); process.exit(1); }
    
    db.query('SELECT FIRST 1 * FROM PRODUCAO_PETR_VINCULO', (err, rows) => {
        if (err || !rows.length) {
            console.log('PRODUCAO_PETR_VINCULO seems empty or error:', err);
        } else {
            console.log('Columns:', Object.keys(rows[0]).join(', '));
            console.log('Sample:', rows[0]);
        }
        db.detach();
    });
});
