const { Pool } = require('pg');
const uri = "postgresql://neondb_owner:npg_qYnfKai9X4cx@ep-still-recipe-ah0lg56g-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const pool = new Pool({ connectionString: uri });

async function verifyDetailedRecords() {
    try {
        const query = `
            SELECT data 
            FROM firebird_sync_pedidos 
            WHERE (data->>'DATA_EMISSAO_PEDIDO') LIKE '2026-04-10%' 
               OR (data->>'OP_EMISSAO') LIKE '2026-04-10%'
        `;
        const res = await pool.query(query);
        
        const records = res.rows.map(r => {
            const item = r.data;
            return {
                OP: item.OP_PCS || 'S/ OP',
                Pedido: item.PEDIDO_NUM || 'S/ Pedido',
                Cliente: item.NOME_CLIENTE || 'N/A',
                Produto: item.NOME_PRODUTO_PPR || 'N/A',
                Qtd: item.OP_QUANTIDADE || item.QUANTIDADE_PPR || 0,
                Status: item.STATUS_PCP || item.STATUS_PPR || 'N/A'
            };
        });

        console.table(records);
        console.log(`Total: ${records.length} registros`);
        
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

verifyDetailedRecords();
