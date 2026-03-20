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
    
    // Find a Ficha Tecnica that HAS procedures
    const findFichaWithProc = `
        SELECT FIRST 5 
            F.CODIGO_FIC, 
            F.PRO_CODIGO_FIC,
            P.NOME_PRO
        FROM FICHA_TECNICA F
        JOIN PRODUTO P ON P.CODIGO_PRO = F.PRO_CODIGO_FIC
        WHERE EXISTS (SELECT 1 FROM FICHA_TECNICA_PROCEDIMENTO WHERE FIC_CODIGO_FTPC = F.CODIGO_FIC)
    `;

    db.query(findFichaWithProc, function (err, fichas) {
        if (err) {
            console.error('Find Ficha failed:', err.message);
            db.detach();
            process.exit(1);
        }
        
        console.log('Fichas with Procedures:', fichas);
        
        if (fichas.length === 0) {
            console.log('No fichas with procedures found.');
            db.detach();
            process.exit(0);
        }

        const fichaId = fichas[0].CODIGO_FIC;
        const productName = fichas[0].NOME_PRO;
        console.log(`\nFetching route for Product: ${productName} (FICHA ID: ${fichaId})`);

        const queryRoute = `
            SELECT 
                F.SEQUENCIA_FTPC, 
                S.NOME_SET 
            FROM FICHA_TECNICA_PROCEDIMENTO F
            JOIN SETOR S ON S.CODIGO_SET = F.SET_CODIGO_FTPC
            WHERE F.FIC_CODIGO_FTPC = ?
            ORDER BY F.SEQUENCIA_FTPC
        `;

        db.query(queryRoute, [fichaId], function (err, route) {
            if (err) {
                console.error('Query route failed:', err.message);
                db.detach();
                process.exit(1);
            }
            
            console.log('Production Route:');
            console.log(JSON.stringify(route, null, 2));
            db.detach();
        });
    });
});
