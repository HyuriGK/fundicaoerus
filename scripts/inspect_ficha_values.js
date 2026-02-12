require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const fbOptions = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
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

    // Select rows where potentially interesting columns are NOT NULL
    const query = `
        SELECT FIRST 5 
            PRO_CODIGO_FIC, 
            DESCRICAO_FIC, 
            MAT_NOMENCLATURA_FIC, 
            OBSERVACAO_TECNICA_FIC
        FROM FICHA_TECNICA
        WHERE MAT_NOMENCLATURA_FIC IS NOT NULL 
           OR DESCRICAO_FIC IS NOT NULL
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error(err);
            db.detach();
            process.exit(1);
        }

        console.log('Found rows:', result.length);
        console.log(result);

        db.detach();
        process.exit(0);
    });
});
