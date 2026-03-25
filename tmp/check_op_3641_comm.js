const Firebird = require('node-firebird');
const options = {
    host: '10.1.1.100', port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA', password: 'masterkey'
};

Firebird.attach(options, (err, db) => {
    if (err) { console.error(err); process.exit(1); }
    
    // Join using PRODUCAO_PEDIDO to link OP (PCP_CODIGO_PCPR) to Pedido (PPR_CODIGO_PCPR)
    const sql = `
        SELECT 
            P.QUANTIDADE_PPR, 
            P.SALDO_LIBERADO_FATURAR_PPR 
        FROM PEDIDO_PRODUTO P 
        JOIN PRODUCAO_PEDIDO PP ON PP.PPR_CODIGO_PCPR = P.CODIGO_PPR 
                               AND PP.PPR_ANO_PCPR = P.ANO_PPR 
                               AND PP.PPR_ITEM_PCPR = P.ITEM_PPR 
                               AND PP.PPR_EMPRESA_PCPR = P.EMPRESA_PPR
        WHERE PP.PCP_CODIGO_PCPR = 3641 AND PP.PCP_EMPRESA_PCPR = 10
    `;
    
    db.query(sql, (err, result) => {
        db.detach();
        if (err) { console.error(err); process.exit(1); }
        console.log(JSON.stringify(result, null, 2));
    });
});
