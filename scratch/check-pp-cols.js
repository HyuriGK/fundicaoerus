const { Firebird, options: FIREBIRD_OPTIONS } = require('../lib/firebird-helper');

Firebird.attach(FIREBIRD_OPTIONS, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err);
        return;
    }

    const query = `
        SELECT rdb$field_name as FIELD_NAME 
        FROM rdb$relation_fields 
        WHERE rdb$relation_name = 'PEDIDO_PRODUTO' 
        ORDER BY rdb$field_position
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('Erro na query:', err);
            db.detach();
            return;
        }

        console.log('--- Colunas de PEDIDO_PRODUTO ---');
        result.forEach(row => {
            const f = row.FIELD_NAME.trim();
            if (f.includes('FATURADO') || f.includes('QUANTIDADE')) {
                console.log(f);
            }
        });

        db.detach();
    });
});
