const pool = require('../lib/db');

async function check() {
    const pedidos = await pool.query(
        `SELECT sync_key, 
                data->>'QTY_MOLDADA' as moldada,
                data->>'QTY_FUSAO' as fusao,
                data->>'QTY_ACABAMENTO' as acabamento,
                data->>'QTY_TT' as tt,
                data->>'QTY_USINAGEM' as usinagem,
                data->>'QTY_QUALIDADE' as qualidade,
                data->>'QTY_EXPEDICAO' as expedicao,
                data->>'QTY_FATURAMENTO' as faturamento
         FROM firebird_sync_pedidos WHERE data->>'OP_PCS' = '3635'`
    );
    console.log('=== OP 3635 - firebird_sync_pedidos (APÓS correção) ===');
    pedidos.rows.forEach(r => console.log(r));

    // Also check 3641
    const p2 = await pool.query(
        `SELECT sync_key, 
                data->>'QTY_MOLDADA' as moldada,
                data->>'QTY_FUSAO' as fusao,
                data->>'QTY_ACABAMENTO' as acabamento,
                data->>'QTY_TT' as tt,
                data->>'QTY_USINAGEM' as usinagem,
                data->>'QTY_QUALIDADE' as qualidade,
                data->>'QTY_EXPEDICAO' as expedicao,
                data->>'QTY_FATURAMENTO' as faturamento
         FROM firebird_sync_pedidos WHERE data->>'OP_PCS' = '3641'`
    );
    console.log('\n=== OP 3641 - firebird_sync_pedidos (VERIFICAÇÃO) ===');
    p2.rows.forEach(r => console.log(r));

    await pool.end();
}

check().catch(e => { console.error(e); process.exit(1); });
