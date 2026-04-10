const { Pool } = require('pg');
const uri = "postgresql://neondb_owner:npg_qYnfKai9X4cx@ep-still-recipe-ah0lg56g-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const pool = new Pool({ connectionString: uri });

async function diagnose() {
    try {
        const query = `
            SELECT sync_key, data 
            FROM firebird_sync_pedidos 
            WHERE (data->>'DATA_EMISSAO_PEDIDO') LIKE '2026-04-10%' 
               OR (data->>'OP_EMISSAO') LIKE '2026-04-10%'
        `;
        const res = await pool.query(query);
        console.log(`Encontrados ${res.rows.length} registros no banco para hoje.`);
        
        if (res.rows.length > 0) {
            res.rows.forEach(row => {
                const d = row.data;
                const q = parseFloat(d.QUANTIDADE_PPR || d.OP_QUANTIDADE || 0);
                const f = parseFloat(d.QUANTIDADE_FATURADO_PPR || d.QUANTIDADE_FATURADA_PPR || 0);
                const status = d.STATUS_PPR || d.STATUS_PCP || '';
                const passFilter = (q - f > 0) && (status.trim() !== 'C');
                
                console.log(`Key: ${row.sync_key} | Q: ${q} | F: ${f} | Status: [${status}] | Pass Filter: ${passFilter}`);
            });
        }
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

diagnose();
