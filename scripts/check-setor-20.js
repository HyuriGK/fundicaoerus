
const Firebird = require('node-firebird');

const options = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

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
