const pool = require('../lib/db');

async function main() {
  const result = await pool.query(`
    SELECT
      sync_key,
      data->>'CODIGO_PPR' AS pedido,
      data->>'ITEM_PPR' AS item,
      data->>'PRODUTO_PPR' AS produto,
      data->>'DATA_ENTREGA_PPR' AS data_entrega_ppr,
      data->>'ENTREGA_PETR' AS entrega_petr,
      data->>'ENTREGA_PED' AS entrega_ped,
      data->>'OP_ENTREGA' AS op_entrega,
      data->>'DATA_EMISSAO_PEDIDO' AS emissao
    FROM firebird_sync_emissoes
    WHERE data->>'CODIGO_PPR' = $1
    ORDER BY sync_key
    LIMIT 20
  `, ['817']);

  console.log(JSON.stringify(result.rows, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => pool.end());
