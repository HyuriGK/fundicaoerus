const Firebird = require('node-firebird');
const options = {
    host: 'Desktop-dqarv0d', port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA', password: 'masterkey',
    lowercase_keys: false, role: null, pageSize: 4096, wireCrypt: true
};

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Connection failed:', err.message);
        process.exit(1);
    }
    
    const query = `
        SELECT FIRST 5 
            PP.PRODUTO_PRP, 
            PP.PROCESSO_PRP,
            P.NOME_PCE
        FROM PRODUTO_PROCESSO PP
        JOIN PROCESSO P ON P.CODIGO_PCE = PP.PROCESSO_PRP
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('Query failed:', err.message);
            db.detach();
            process.exit(1);
        }
        
        console.log('Result from PRODUTO_PROCESSO:', result);
        db.detach();
    });
});
