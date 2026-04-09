const { Firebird, options: FIREBIRD_OPTIONS } = require('../lib/firebird-helper');

Firebird.attach(FIREBIRD_OPTIONS, (err, db) => {
    if (err) { console.error(err); process.exit(1); }
    
    const query = `
        SELECT FIRST 5
            P.CODIGO_PPR, P.ITEM_PPR, P.ANO_PPR,
            PP.PCP_CODIGO_PCPR AS OP_VINCULADA,
            PS.SETOR_PCS, S.NOME_SET, PS.QUANTIDADE_PCS
        FROM PEDIDO_PRODUTO P
        JOIN PRODUCAO_PEDIDO PP ON PP.PPR_CODIGO_PCPR = P.CODIGO_PPR AND PP.PPR_ANO_PCPR = P.ANO_PPR AND PP.PPR_ITEM_PCPR = P.ITEM_PPR AND PP.PPR_EMPRESA_PCPR = P.EMPRESA_PPR
        JOIN PRODUCAO_SETOR PS ON PS.CODIGO_PCS = PP.PCP_CODIGO_PCPR AND PS.EMPRESA_PCS = PP.PCP_EMPRESA_PCPR
        JOIN SETOR S ON S.CODIGO_SET = PS.SETOR_PCS
        WHERE P.ANO_PPR = 2025
    `;

    db.query(query, (err, rows) => {
        if (err) { console.error(err); }
        else { console.table(rows); }
        db.detach();
    });
});
