require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const FIREBIRD_OPTIONS = {
    host: 'Desktop-dqarv0d', port: 3050, database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA', password: 'masterkey'
};

Firebird.attach(FIREBIRD_OPTIONS, (err, db) => {
    if (err) throw err;

    const sql = `
        SELECT FIRST 30
            P.CODIGO_PPR, P.ITEM_PPR, P.ANO_PPR, P.QUANTIDADE_PPR,
            PCP.CODIGO_PCP, PCP.STATUS_PCP, PCP.DATA_CONCLUSAO_PCP,
            PCP.QUANTIDADE_PCP, PCP.QUANTIDADE_PRODUZIDA_PCP
        FROM PEDIDO_PRODUTO P
        JOIN PRODUCAO_PEDIDO PP ON P.CODIGO_PPR = PP.PPR_CODIGO_PCPR AND P.ANO_PPR = PP.PPR_ANO_PCPR AND P.ITEM_PPR = PP.PPR_ITEM_PCPR AND P.EMPRESA_PPR = PP.PPR_EMPRESA_PCPR
        JOIN PRODUCAO PCP ON PCP.CODIGO_PCP = PP.PCP_CODIGO_PCPR AND PCP.EMPRESA_PCP = PP.PCP_EMPRESA_PCPR
        WHERE P.ANO_PPR IN (2025, 2026)
        ORDER BY P.CODIGO_PPR DESC
    `;

    db.query(sql, (err, result) => {
        if (err) throw err;
        console.log('Amostra de Pedidos e OPs (Carteira Atual):');
        console.log(JSON.stringify(result, null, 2));
        db.detach();
    });
});
