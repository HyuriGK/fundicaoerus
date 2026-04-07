const Firebird = require('node-firebird');

const FIREBIRD_OPTIONS = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

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
