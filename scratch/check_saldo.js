const pool = require('../lib/db');
(async()=>{
    const r = await pool.query(`
        SELECT 
            data->>'OP_PCS' as op, 
            data->>'FATURADO_PPR' as fat, 
            COALESCE((data->>'SALDO_LIBERADO_FATURAR_PPR')::numeric,0) as saldo_lib,
            COALESCE((data->>'QUANTIDADE_PPR')::numeric,0) as qtd_orig,
            COALESCE((data->>'QUANTIDADE_FATURADO_PPR')::numeric,0) as qtd_fat
        FROM firebird_sync_emissoes 
        WHERE data->>'OP_PCS' IN ('2515','2435','2057','1430','2693','1431','3712','2114','3848')
    `);
    r.rows.forEach(x => {
        const saldoReal = x.qtd_orig - x.qtd_fat;
        console.log(`OP ${x.op} | FATURADO=${x.fat} | saldoLib=${x.saldo_lib} | qtdOrig=${x.qtd_orig} | qtdFat=${x.qtd_fat} | saldoComercial=${Math.max(0, saldoReal)}`);
    });
    await pool.end();
})();
