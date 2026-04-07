require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const options = { host: 'Desktop-dqarv0d', port: 3050, database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb', user: 'SYSDBA', password: 'masterkey' };

Firebird.attach(options, (err, db) => {
    if (err) throw err;
    const sql = `
        SELECT 
            PP.PCP_CODIGO_PCPR AS OP_CODE, 
            PCP.STATUS_PCP, 
            PCP.QUANTIDADE_PCP,
            PCP.QUANTIDADE_PRODUZIDA_PCP,
            PCP.DATA_CONCLUSAO_PCP
        FROM PRODUCAO_PEDIDO PP 
        JOIN PRODUCAO PCP ON PCP.CODIGO_PCP = PP.PCP_CODIGO_PCPR 
        WHERE PP.PPR_CODIGO_PCPR = 644 
          AND PP.PPR_ITEM_PCPR = 2 
          AND PP.PPR_ANO_PCPR = 2025
    `;
    db.query(sql, (err, res) => {
        if (err) throw err;
        console.log("OPs no Firebird para Pedido 644/2/2025:");
        console.log(JSON.stringify(res, null, 2));
        db.detach();
    });
});
