
const Firebird = require('node-firebird');

const options = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096, wireCrypt: true
};

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Connection Error:', err);
        return;
    }

    // Query to get one row
    db.query('SELECT FIRST 1 * FROM SETOR', function (err, result) {
        if (err) {
            console.error('Query Error:', err);
            db.detach();
            return;
        }

        if (result.length > 0) {
            console.log('Keys in SETOR:', Object.keys(result[0]));
            console.log('Sample Row:', result[0]);
        } else {
            console.log('No rows found in SETOR');
        }

        db.detach();
    });
});
