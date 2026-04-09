const pool = require('../lib/db');

async function findDifference() {
    // Items in pedidos but NOT in emissoes for April 2026
    const diff = await pool.query(`
        SELECT 
            p.sync_key,
            p.data->>'PRODUTO_PPR' as produto,
            p.data->>'NOME_PRODUTO_PPR' as nome,
            p.data->>'QUANTIDADE_PPR' as qtd,
            p.data->>'PESO_LIQUIDO_NPR' as peso,
            p.data->>'STATUS_PPR' as status_ppr,
            p.data->>'FATURADO_PPR' as faturado
        FROM firebird_sync_pedidos p
        WHERE EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = 4
          AND EXTRACT(YEAR FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = 2026
          AND p.sync_key NOT IN (
              SELECT sync_key FROM firebird_sync_emissoes
              WHERE EXTRACT(MONTH FROM (data->>'DATA_EMISSAO_PEDIDO')::date) = 4
              AND EXTRACT(YEAR FROM (data->>'DATA_EMISSAO_PEDIDO')::date) = 2026
          )
    `);
    
    console.log(`=== ${diff.rows.length} items in PEDIDOS but NOT in EMISSOES (Abr 2026) ===`);
    diff.rows.forEach(r => {
        console.log(`${r.sync_key} | ${r.produto} | ${String(r.nome||'').substring(0,30)} | Qtd: ${r.qtd} | Peso: ${r.peso} | Fat: ${r.faturado} | St: ${r.status_ppr}`);
    });

    await pool.end();
}

findDifference().catch(e => { console.error(e); process.exit(1); });
