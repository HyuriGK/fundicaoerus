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

    // Verificar registros com NUMERO_NOT não nulo
    const query = `
        SELECT FIRST 5
            nf.CODIGO_NOT,
            nf.NUMERO_NOT,
            nf.SERIE_NOT,
            nf.EMISSAO_NOT,
            nf.STATUS_NOT,
            nf.TIPO_NOT
        FROM NOTA_FISCAL nf
        WHERE nf.EMISSAO_NOT >= '2026-01-01'
            AND nf.NUMERO_NOT IS NOT NULL
            AND nf.TIPO_NOT = 'S'
            AND nf.STATUS_NOT = 'A'
    `;
    db.query(query, (err, result) => {
        if (err) {
            console.error(err);
        } else {
            console.log('Valid Invoices (2026):', result);
        }
        db.detach();
    });
});
