const pool = require('./lib/db');
async function test() {
    try {
        const query = `
            SELECT 
                data->>'OP_PCS' as op, 
                data->>'PRODUTO_PPR' as produto,
                data->>'NOME_PRODUTO_PPR' as nome_produto,
                (data->>'QUANTIDADE_PPR')::numeric as qtd_original,
                COALESCE((data->>'PESO_LIQUIDO_NPR')::numeric, 0) as peso_liq,
                (data->>'STATUS_PPR') as status_ppr,
                (data->>'FATURADO_PPR') as faturado
            FROM firebird_sync_emissoes 
            WHERE data->>'DATA_EMISSAO_PEDIDO' LIKE '2026-04-02%'
        `;
        const res = await pool.query(query);
        console.log(`Encontrados ${res.rows.length} itens no dia 02 de Abril:`);
        
        let totalGeneral = 0;
        let totalPending = 0;

        res.rows.forEach(r => {
            const qtd = r.qtd_original || 0;
            const wUn = qtd > 0 ? (r.peso_liq / qtd) : 0;
            const itemWeight = wUn * qtd;
            totalGeneral += itemWeight;

            console.log(`- Pedido/OP ${r.op || 'S/OP'} | Produto: ${r.produto} - Qt: ${qtd} - Peso Liq: ${r.peso_liq} => Peso Item: ${itemWeight.toFixed(2)} | Fat: ${r.faturado} | Status: ${r.status_ppr}`);
        });

        console.log(`\nSoma Geral Calculada: ${totalGeneral.toFixed(2)} kg`);
    } catch(e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
test();
