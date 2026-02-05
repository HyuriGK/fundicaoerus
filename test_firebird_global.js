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

    // Buscar QUAISQUER registros com NUMERO_NOT
    const query = "SELECT FIRST 5 NUMERO_NOT, EMISSAO_NOT FROM NOTA_FISCAL WHERE NUMERO_NOT <> '' AND NUMERO_NOT IS NOT NULL ORDER BY EMISSAO_NOT DESC";
    db.query(query, (err, result) => {
        if (err) {
            console.error(err);
        } else {
            console.log('Results with NUMERO_NOT:', result);
        }
        db.detach();
    });
});
