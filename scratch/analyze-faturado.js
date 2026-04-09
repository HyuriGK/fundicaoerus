const { Firebird, options: FIREBIRD_OPTIONS } = require('../lib/firebird-helper');

Firebird.attach(FIREBIRD_OPTIONS, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err);
        return;
    }

    const query = `
        SELECT DISTINCT P.FATURADO_PPR, COUNT(*) as QTD
        FROM PEDIDO_PRODUTO P
        WHERE P.ANO_PPR IN (2025, 2026)
        GROUP BY 1
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('Erro na query:', err);
        } else {
            console.log('--- Faturado em PEDIDO_PRODUTO (FATURADO_PPR) ---');
            console.table(result);
        }
        db.detach();
    });
});
