const Firebird = require('node-firebird');

const firebirdOptions = {
    host: '10.1.1.100', port: 3050, database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA', password: 'masterkey', lowercase_keys: false, pageSize: 4096
};

Firebird.attach(firebirdOptions, (err, db) => {
    if (err) throw err;
    
    // Testing query for procedures of a specific Ficha (example: 28015000)
    // The user mentioned FIC_CODIGO_FTPC is the ficha number.
    const sql = `
        SELECT FIRST 10
            FIC_CODIGO_FTPC,
            SET_CODIGO_FTPC,
            SET_EMPRESA_FTPC
        FROM FICHA_TECNICA_PROCEDIMENTO
        WHERE SET_EMPRESA_FTPC = '10'
    `;
    
    db.query(sql, (err, result) => {
        if (err) console.error(err);
        else console.log(JSON.stringify(result, null, 2));
        db.detach();
    });
});
