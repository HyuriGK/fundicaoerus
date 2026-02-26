
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

    const query = `
        SELECT 
            CODIGO_PED, 
            ANO_PED, 
            EMPRESA_PED, 
            CLIENTE_PED, 
            RAZAO_SOCIAL_PED 
        FROM PEDIDO 
        WHERE CODIGO_PED = 403
    `;

    db.query(query, (err, rows) => {
        if (err) console.error(err);
        else {
            console.log('PEDIDO 403 variants:');
            console.table(rows);
        }
        db.detach();
    });
});
