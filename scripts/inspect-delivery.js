require('dotenv').config({ path: '.env.local' });


const { Firebird, options: options } = require('../lib/firebird-helper');

console.log('🔍 Analisando PEDIDO_PRODUTO_ENTREGA...');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro:', err);
        return;
    }

    db.query('SELECT FIRST 1 * FROM PEDIDO_PRODUTO_ENTREGA', function (err, rows) {
        if (err) {
            console.error('Erro:', err.message);
        } else if (rows.length === 0) {
            console.log('Tabela vazia.');
        } else {
            console.log('Colunas:', Object.keys(rows[0]).join(', '));
        }
        db.detach();
    });
});
