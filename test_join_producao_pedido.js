
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
        SELECT FIRST 5 
            pr.CODIGO_PCP, 
            pr.PEDIDO_PCP,
            pe.CODIGO_PED,
            pe.RAZAO_SOCIAL_PED
        FROM PRODUCAO pr
        LEFT JOIN PEDIDO pe ON pe.CODIGO_PED = pr.PEDIDO_PCP
        WHERE pr.PEDIDO_PCP IS NOT NULL
          AND pr.DATA_PCP >= '2025-01-01'
    `;

    db.query(query, (err, rows) => {
        if (err) console.error(err);
        else {
            console.log('Join Result Samples:');
            console.table(rows);
        }
        db.detach();
    });
});
