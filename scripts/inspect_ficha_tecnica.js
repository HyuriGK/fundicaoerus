require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const fbOptions = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

Firebird.attach(fbOptions, function (err, db) {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    // Select one row to see columns
    db.query('SELECT FIRST 1 * FROM FICHA_TECNICA', function (err, result) {
        if (err) {
            console.error(err);
            db.detach();
            process.exit(1);
        }

        if (result.length > 0) {
            console.log('Columns in FICHA_TECNICA:');
            console.log(Object.keys(result[0]));
            console.log('Sample Data:');
            console.log(result[0]);
        } else {
            console.log('No data in FICHA_TECNICA');
        }

        db.detach();
        process.exit(0);
    });
});
