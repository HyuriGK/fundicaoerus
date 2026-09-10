const pool=require('../lib/db'); Promise.all([
 pool.query("SELECT data->>'QTY_MOLDADA' mold,data->>'QTY_FECHAMENTO_MANUAL' fech,data->>'OP_QUANTIDADE' qty FROM firebird_sync_pedidos WHERE sync_key='OP-5710'"),
 pool.query("SELECT setor_codigo,setor,produzido FROM producao_roteiro_operacional_sync WHERE op='5710' ORDER BY sequencia")
]).then(x=>console.log(JSON.stringify(x.map(y=>y.rows)))).finally(()=>pool.end());
