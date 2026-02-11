require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const options = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

console.log('Attaching...');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Error connecting:', err);
        return;
    }

    const testId = 38222;

    // 1. PRODUCAO_SETOR
    db.query('SELECT * FROM PRODUCAO_SETOR WHERE CODIGO_PCS = ?', [testId], function (err, result1) {
        if (err) console.error('Error 1:', err);
        else {
            console.log('PRODUCAO_SETOR (38222):');
            console.log(result1);
        }

        // 2. PRODUTO_MOVIMENTACAO
        db.query('SELECT * FROM PRODUTO_MOVIMENTACAO WHERE CODIGO_PRODUCAO_PMV = ?', [testId], function (err, result2) {
            if (err) console.error('Error 2:', err);
            else {
                console.log('PRODUTO_MOVIMENTACAO (Linked to 38222):');
                console.log(result2);
            }
            db.detach();
        });
    });
});
