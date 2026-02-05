const Firebird = require('node-firebird');

const firebirdOptions = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false
};

Firebird.attach(firebirdOptions, (err, db) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    const query = "SELECT COUNT(*) FROM NOTA_FISCAL WHERE EMISSAO_NOT >= '2026-01-01'";
    db.query(query, (err, result) => {
        if (err) {
            console.error(err);
        } else {
            console.log('Count 2026:', result[0].COUNT);
        }
        db.detach();
    });
});
