const { Firebird, options } = require('./lib/firebird-helper');

async function checkTodayOps() {
    Firebird.attach(options, (err, db) => {
        if (err) { console.error(err); return; }
        
        const query = `
            SELECT 
                P.CODIGO_PCP, P.DATA_PCP, P.STATUS_PCP,
                (SELECT FIRST 1 D.EMISSAO_PED FROM PRODUCAO_PEDIDO PP 
                 JOIN PEDIDO D ON D.CODIGO_PED = PP.PPR_CODIGO_PCPR AND D.ANO_PED = PP.PPR_ANO_PCPR
                 WHERE PP.PCP_CODIGO_PCPR = P.CODIGO_PCP) as EMISSAO_PEDIDO
            FROM PRODUCAO P
            WHERE P.DATA_PCP >= '2026-04-10'
        `;
        
        db.query(query, (err, res) => {
            if (err) console.error(err);
            else console.log(JSON.stringify(res, null, 2));
            db.detach();
        });
    });
}

checkTodayOps();
