const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkEmissions() {
    try {
        const query = `
            SELECT 
                "CODIGO_ORDEM_PEDIDO_PPR", 
                "DATA_EMISSAO_PEDIDO", 
                "FATURADO_PPR", 
                "SALDO_LIBERADO_FATURAR_PPR", 
                "QUANTIDADE_PPR", 
                "QUANTIDADE_FATURADO_PPR",
                "CLIENTE_NPR"
            FROM firebird_sync_pedidos 
            WHERE ("DATA_EMISSAO_PEDIDO"::date = '2026-04-10')
        `;
        const res = await pool.query(query);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkEmissions();
