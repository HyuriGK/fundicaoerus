const Firebird = require('node-firebird');
require('dotenv').config({ path: '.env.local' });

const FIREBIRD_OPTIONS = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

Firebird.attach(FIREBIRD_OPTIONS, function(err, db) {
    if (err) throw err;
    const query = `
        SELECT PS.SETOR_PCS, PS.QUANTIDADE_PCS, PS.STATUS_PCS, PS.DATA_PCS, PS.ID_PCS, S.NOME_SET
        FROM PRODUCAO_SETOR PS
        JOIN PRODUCAO_PEDIDO PP ON PS.CODIGO_PCS = PP.PCP_CODIGO_PCPR AND PS.EMPRESA_PCS = PP.PCP_EMPRESA_PCPR
        LEFT JOIN SETOR S ON S.CODIGO_SET = PS.SETOR_PCS
        WHERE PP.PPR_CODIGO_PCPR = 182 AND PP.PPR_ANO_PCPR = 2026 AND PP.PPR_ITEM_PCPR = 1
        ORDER BY PS.ID_PCS
    `;
    db.query(query, function(err, rows) {
        if (err) throw err;
        console.table(rows);
        db.detach();
    });
});
