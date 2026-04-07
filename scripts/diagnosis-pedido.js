
require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const options = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

Firebird.attach(options, function (err, db) {
    if (err) { console.error(err); return; }

    // 1. Check NOTA_FISCAL_PRODUTO for non-null PEDIDO_NPR
    // 2. Check NOTA_FISCAL_PEDIDO (link table)

    console.log("🔍 Diagnosing PEDIDO columns for 2026 data...\n");

    const query = `
        SELECT FIRST 10
            nf.CODIGO_NOT,
            nfp.PRODUTO_NPR,
            nfp.PEDIDO_NPR,
            npe.PEDIDO_NPE,
            nf.EMISSAO_NOT
        FROM NOTA_FISCAL nf
        JOIN NOTA_FISCAL_PRODUTO nfp 
            ON nf.EMPRESA_NOT = nfp.EMPRESA_NPR 
            AND nf.SERIE_NOT = nfp.SERIE_NPR 
            AND nf.CODIGO_NOT = nfp.CODIGO_NPR
        LEFT JOIN NOTA_FISCAL_PEDIDO npe
            ON nf.EMPRESA_NOT = npe.EMPRESA_NPE
            AND nf.SERIE_NOT = npe.SERIE_NPE
            AND nf.CODIGO_NOT = npe.CODIGO_NPE
        WHERE nf.EMISSAO_NOT >= '2026-01-01'
        AND nf.TIPO_NOT = 'S'
        AND nf.STATUS_NOT = 'A'
    `;

    db.query(query, function (err, result) {
        if (err) console.error(err);
        else {
            console.log("Raw Data Sample:", result.slice(0, 3));
            console.table(result.map(r => ({
                NF: r.CODIGO_NOT,
                PROD: r.PRODUTO_NPR,
                PEDIDO_NPR: r.PEDIDO_NPR,
                PEDIDO_NPE: r.PEDIDO_NPE
            })));
        }
        db.detach();
    });
});
