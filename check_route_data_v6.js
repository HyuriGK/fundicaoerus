const Firebird = require('node-firebird');
const options = {
    host: 'Desktop-dqarv0d', port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA', password: 'masterkey',
    lowercase_keys: false, role: null, pageSize: 4096
};

const opCode = 4090; // From user screenshot

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Connection failed:', err.message);
        process.exit(1);
    }
    
    const query = `
        SELECT 
            PP.SEQUENCIA_PPCD, 
            S.NOME_SET
        FROM PRODUCAO_PROCEDIMENTO PP
        JOIN SETOR S ON S.CODIGO_SET = PP.SET_CODIGO_PPCD
        WHERE PP.PCP_CODIGO_PPCD = ?
        ORDER BY PP.SEQUENCIA_PPCD
    `;

    console.log(`Checking procedure for OP: ${opCode}`);
    db.query(query, [opCode], function (err, result) {
        if (err) {
            console.error('Query failed:', err.message);
            db.detach();
            process.exit(1);
        }
        
        console.log('Result from PRODUCAO_PROCEDIMENTO:', result);
        db.detach();
    });
});
