const { Firebird, options: FIREBIRD_OPTIONS } = require('../lib/firebird-helper');

Firebird.attach(FIREBIRD_OPTIONS, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err);
        return;
    }

    const query = `
        SELECT DISTINCT P.STATUS_PPR, COUNT(*) as QTD
        FROM PEDIDO_PRODUTO P
        WHERE P.ANO_PPR IN (2025, 2026)
        GROUP BY 1
    `;

    const query2 = `
        SELECT DISTINCT D.STATUS_PED, COUNT(*) as QTD
        FROM PEDIDO D
        WHERE D.ANO_PED IN (2025, 2026)
        GROUP BY 1
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('Erro na query 1:', err);
        } else {
            console.log('--- Status em PEDIDO_PRODUTO (STATUS_PPR) ---');
            console.table(result);
        }

        db.query(query2, function (err, result2) {
            if (err) {
                console.error('Erro na query 2:', err);
            } else {
                console.log('--- Status em PEDIDO (STATUS_PED) ---');
                console.table(result2);
            }
            db.detach();
        });
    });
});
