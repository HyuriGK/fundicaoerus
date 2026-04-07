const Firebird = require('node-firebird');
const options = {
    host: 'Desktop-dqarv0d', port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA', password: 'masterkey',
    lowercase_keys: false, role: null, pageSize: 4096
};

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Connection failed:', err.message);
        process.exit(1);
    }
    
    // Find an OP that HAS processes
    const findOpWithProc = `
        SELECT FIRST 5 
            CODIGO_PRP
        FROM PRODUCAO_PROCESSO
    `;

    db.query(findOpWithProc, function (err, ops) {
        if (err) {
            console.error('Find OP failed:', err.message);
            db.detach();
            process.exit(1);
        }
        
        console.log('Ops with Processes:', ops);
        
        if (ops.length === 0) {
            console.log('No OPs with processes found in PRODUCAO_PROCESSO.');
            db.detach();
            process.exit(0);
        }

        const opId = ops[0].CODIGO_PRP;
        console.log(`\nFetching processes for OP: ${opId}`);

        const queryProc = `
            SELECT 
                PP.SEQUENCIA_PRP, 
                P.NOME_PCE as "nome"
            FROM PRODUCAO_PROCESSO PP
            JOIN PROCESSO P ON P.CODIGO_PCE = PP.PROCESSO_PRP
            WHERE PP.CODIGO_PRP = ?
            ORDER BY PP.SEQUENCIA_PRP
        `;

        db.query(queryProc, [opId], function (err, processes) {
            if (err) {
                console.error('Query processes failed:', err.message);
                db.detach();
                process.exit(1);
            }
            
            console.log('Production Processes:');
            console.log(JSON.stringify(processes, null, 2));
            db.detach();
        });
    });
});
