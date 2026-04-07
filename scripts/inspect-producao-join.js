require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const options = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

Firebird.attach(options, function (err, db) {
    if (err) throw err;

    const opCode = 120; // From previous sample

    console.log(`--- Fetching PRODUCAO where CODIGO_PCP = ${opCode} ---`);
    db.query(`
        SELECT 
            CODIGO_PCP, 
            PRODUTO_PCP, 
            NOME_PECA_PCP, 
            PESO_LIQUIDO_PCP,
            PESO_BRUTO_PCP
        FROM PRODUCAO 
        WHERE CODIGO_PCP = ?
    `, [opCode], function (err, rows) {
        if (err) console.error(err);
        else {
            if (rows.length > 0) {
                console.log('MATCH FOUND!');
                console.log(JSON.stringify(rows[0], null, 2));
            } else {
                console.log('NO MATCH for CODIGO_PCP = ' + opCode);

                // Try joining by ID if Code doesn't work?
                // But user said "CODIGO_PCS" is the OP number.
            }
            db.detach();
        }
    });
});
