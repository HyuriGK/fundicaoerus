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

console.log('🔍 Analisando estrutura das tabelas...\n');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro:', err);
        return;
    }

    // Analisar NOTA_FISCAL
    db.query('SELECT FIRST 1 * FROM NOTA_FISCAL', function (err, rows) {
        if (!err && rows.length > 0) {
            console.log('📋 COLUNAS DA TABELA NOTA_FISCAL:');
            console.log(Object.keys(rows[0]).join(', '));
            console.log('\n');
        }

        // Analisar NOTA_FISCAL_PRODUTO
        db.query('SELECT FIRST 1 * FROM NOTA_FISCAL_PRODUTO', function (err, rows) {
            if (!err && rows.length > 0) {
                console.log('📋 COLUNAS DA TABELA NOTA_FISCAL_PRODUTO:');
                console.log(Object.keys(rows[0]).join(', '));
                console.log('\n');
            }

            // Analisar CLIENTE
            db.query('SELECT FIRST 1 * FROM CLIENTE', function (err, rows) {
                if (!err && rows.length > 0) {
                    console.log('📋 COLUNAS DA TABELA CLIENTE:');
                    console.log(Object.keys(rows[0]).join(', '));
                }

                db.detach();
            });
        });
    });
});
