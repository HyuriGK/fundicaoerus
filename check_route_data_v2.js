const Firebird = require('node-firebird');
const options = {
    host: '10.1.1.100', port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA', password: 'masterkey',
    lowercase_keys: false, role: null, pageSize: 4096
};

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Connection failed:', err.message);
        process.exit(1);
    }
    
    const query = `
        SELECT FIRST 10
            F.FIC_CODIGO_FTMP,
            M.NOME_MODP
        FROM FICHA_TECNICA_MODULO_PRODUCAO F
        JOIN MODULO_PRODUCAO M ON M.CODIGO_MODP = F.MODP_CODIGO_FTMP
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('Query failed:', err.message);
            db.detach();
            process.exit(1);
        }
        
        console.log('Production Modules for Fichas:');
        console.log(JSON.stringify(result, null, 2));
        db.detach();
    });
});
