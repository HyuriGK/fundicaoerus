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

    // List all columns for NOTA_FISCAL
    const query = `
        SELECT RDB$FIELD_NAME AS FIELD_NAME
        FROM RDB$RELATION_FIELDS 
        WHERE RDB$RELATION_NAME = 'NOTA_FISCAL'
        ORDER BY RDB$FIELD_ID
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('Error querying columns:', err);
        } else {
            console.log('Columns of NOTA_FISCAL:');
            result.forEach(row => {
                console.log(String(row.FIELD_NAME).trim());
            });
        }
        db.detach();
    });
});
