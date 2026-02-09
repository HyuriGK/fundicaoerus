require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const FIREBIRD_OPTIONS = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

Firebird.attach(FIREBIRD_OPTIONS, function (err, db) {
    if (err) { console.error(err); return; }

    // Attempt to join PRODUCAO_SETOR (PCS) with PEDIDO_PRODUTO (P)
    // Hypotheses for FK: 
    // 1. PCS.PPR_CODIGO_PCS = P.CODIGO_PPR
    // 2. PCS.PED_CODIGO_PCS = P.CODIGO_PPR (if linked to order)
    // 3. PCS.PPCD_CODIGO_PCS ?

    // Let's try to select some rows from PRODUCAO_SETOR and see the values of columns that look like keys
    const query = `
        SELECT FIRST 10
            PCS.SEQUENCIA_PCS,
            PCS.ID_CODIGO_PCS,
            PCS.DATA_PCS,
            P.ID_PPR,
            P.CODIGO_PPR,
            P.PRODUTO_PPR
        FROM
            PRODUCAO_SETOR PCS
        JOIN
            PEDIDO_PRODUTO P ON PCS.ID_CODIGO_PCS = P.ID_PPR
        WHERE
            PCS.DATA_PCS > '2025-01-01'
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('Error with ID_CODIGO_PCS:', err.message);
        } else {
            console.log('Join ID_CODIGO_PCS Check:', result);
        }
        db.detach();
    });
});
