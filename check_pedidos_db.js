const pool = require('./lib/db');
async function test() {
    try {
        const query = `
            SELECT 
                data->>'OP_PCS' as op, 
                data->>'DATA_EMISSAO_PEDIDO' as emissao, 
                data->>'PRODUTO_PPR' as produto, 
                data->>'NOME_CLIENTE' as cliente 
            FROM firebird_sync_pedidos 
            WHERE data->>'DATA_EMISSAO_PEDIDO' LIKE '2026-04-10%'
        `;
        const res = await pool.query(query);
        console.log(`Encontrados ${res.rows.length} pedidos emitidos no dia 10 de Abril:`);
        console.table(res.rows.slice(0, 50));
    } catch(e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
test();
