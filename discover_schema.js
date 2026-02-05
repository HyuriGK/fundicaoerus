const Firebird = require('node-firebird');

const options = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey'
};

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Error connecting:', err);
        process.exit(1);
    }

    // List columns containing PRECO or UNITARIO in NOTA_FISCAL_PRODUTO
    const query = `
        SELECT RDB$FIELD_NAME AS FIELD_NAME
        FROM RDB$RELATION_FIELDS 
        WHERE RDB$RELATION_NAME = 'NOTA_FISCAL_PRODUTO'
        AND (RDB$FIELD_NAME LIKE '%PRECO%' OR RDB$FIELD_NAME LIKE '%UNITARIO%')
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('Error querying columns:', err);
        } else {
            console.log('Price/Unit columns of NOTA_FISCAL_PRODUTO:');
            result.forEach(row => {
                console.log(String(row.FIELD_NAME).trim());
            });
        }
        db.detach();
    });
});
