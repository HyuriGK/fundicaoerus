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

    // Testar join
    const query = `
        SELECT FIRST 5
            nf.NUMERO_NOT,
            nfp.PRODUTO_NPR
        FROM NOTA_FISCAL nf
        INNER JOIN NOTA_FISCAL_PRODUTO nfp 
            ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
            AND nf.SERIE_NOT = nfp.SERIE_NPR
            AND nf.CODIGO_NOT = nfp.CODIGO_NPR
        WHERE nf.EMISSAO_NOT >= '2026-01-01'
            AND nf.TIPO_NOT = 'S'
            AND nf.STATUS_NOT = 'A'
    `;
    db.query(query, (err, result) => {
        if (err) {
            console.error(err);
        } else {
            console.log('Results (2026):', result);
        }
        db.detach();
    });
});
