


const { Firebird, options: options } = require('../lib/firebird-helper');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Connection Error:', err);
        return;
    }

    console.log('Connected to Firebird');

    // Query to get one row
    db.query('SELECT FIRST 1 * FROM PRODUCAO_SETOR', function (err, result) {
        if (err) {
            console.error('Query Error:', err);
            db.detach();
            return;
        }

        if (result.length > 0) {
            console.log('Keys in PRODUCAO_SETOR:', Object.keys(result[0]));
            // console.log('Sample Row:', result[0]); // Commented out to reduce noise, just need keys
        } else {
            console.log('No rows found in PRODUCAO_SETOR');
        }

        db.detach();
    });
});
