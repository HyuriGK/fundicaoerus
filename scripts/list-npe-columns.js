
require('dotenv').config({ path: '.env.local' });


const { Firebird, options: options } = require('../lib/firebird-helper');

Firebird.attach(options, function (err, db) {
    if (err) { console.error('❌ Erro:', err); return; }

    db.query(`
        SELECT rf.rdb$field_name as field_name
        FROM rdb$relation_fields rf
        WHERE rf.rdb$relation_name = 'EMBARQUE'
        ORDER BY rf.rdb$field_position
    `, function (err, columns) {
        if (err) console.error('Erro:', err);
        else {
            console.log('COLUNAS DA NOTA_FISCAL_PEDIDO:\n');
            columns.forEach(col => console.log(col.FIELD_NAME.trim()));
        }
        db.detach();
    });
});
