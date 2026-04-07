require('dotenv').config({ path: '.env.local' });


const { Firebird, options: options } = require('../lib/firebird-helper');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro:', err);
        return;
    }

    // Buscar colunas da NOTA_FISCAL_PRODUTO
    db.query(`
        SELECT rf.rdb$field_name as field_name
        FROM rdb$relation_fields rf
        WHERE rf.rdb$relation_name = 'NOTA_FISCAL_PRODUTO'
        ORDER BY rf.rdb$field_position
    `, function (err, columns) {
        if (err) {
            console.error('Erro:', err);
        } else {
            console.log('COLUNAS DA NOTA_FISCAL_PRODUTO:\n');
            columns.forEach(col => {
                console.log(col.FIELD_NAME.trim());
            });
        }
        db.detach();
    });
});
