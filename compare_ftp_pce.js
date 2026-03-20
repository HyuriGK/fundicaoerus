const Firebird = require('node-firebird');
const options = { host: '10.1.1.100', port: 3050, database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb', user: 'SYSDBA', password: 'masterkey', lowercase_keys: false, pageSize: 4096 };
const produto = '261008000';

Firebird.attach(options, function (err, db) {
    if (err) { console.error('Connection failed:', err.message); process.exit(1); }
    
    console.log(`Checking both for product: ${produto}`);
    
    const query = `
        SELECT 
            F.SEQUENCIA_FTPC, 
            S.NOME_SET,
            (SELECT LIST(P.NOME_PCE, ', ') 
             FROM FICHA_TECNICA_PROCEDIMENTO_PCE FP
             JOIN PROCESSO P ON P.CODIGO_PCE = FP.PCE_CODIGO_FTPP
             WHERE FP.FTPC_CODIGO_FTPP = F.CODIGO_FTPC
            ) as PROCESSOS
        FROM FICHA_TECNICA_PROCEDIMENTO F
        JOIN SETOR S ON S.CODIGO_SET = F.SET_CODIGO_FTPC
        JOIN FICHA_TECNICA FT ON FT.CODIGO_FIC = F.FIC_CODIGO_FTPC
        WHERE FT.PRO_CODIGO_FIC = ? AND FT.ATIVO_FIC = 'S'
        ORDER BY F.SEQUENCIA_FTPC
    `;

    db.query(query, [produto], function (err, result) {
        if (err) { console.error('Query failed:', err.message); db.detach(); process.exit(1); }
        console.log('Comparison Result:');
        console.log(JSON.stringify(result, null, 2));
        db.detach();
    });
});
