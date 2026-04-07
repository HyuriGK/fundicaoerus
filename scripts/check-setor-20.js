


const { Firebird, options: options } = require('../lib/firebird-helper');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Connection Error:', err);
        return;
    }

    const query = `
        SELECT * FROM SETOR WHERE CODIGO_SET = 20
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('Query Error:', err);
            db.detach();
            return;
        }

        console.log('Setor 20:', result);
        db.detach();
    });
});
