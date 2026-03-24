require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
function cleanConnectionString(str) { if (!str) return ''; let cleaned = str.trim(); if (cleaned.startsWith('psql')) cleaned = cleaned.substring(4).trim(); return cleaned.replace(/^['"]|['"]$/g, ''); }
const pool = new Pool({ connectionString: cleanConnectionString(process.env.DATABASE_URL), ssl: { rejectUnauthorized: false } });

async function verify() {
    try {
        const res = await pool.query(`
            SELECT data 
            FROM firebird_sync_pedidos 
            WHERE data->>'CODIGO_PPR' = '644' 
              AND data->>'ITEM_PPR' = '2' 
              AND data->>'ANO_PPR' = '2025'
        `);

        if (res.rows.length > 0) {
            console.log('Dados no Postgres para Pedido 644/2/2025:');
            // We want to see OP_PCS, STATUS_PCP, DATA_CONCLUSAO_PCP, etc.
            const d = res.rows[0].data;
            console.log('OP_PCS:', d.OP_PCS);
            console.log('STATUS_PCP:', d.STATUS_PCP);
            console.log('DATA_CONCLUSAO_PCP:', d.DATA_CONCLUSAO_PCP);
            console.log('QTY_MOLDADA (Agregada):', d.QTY_MOLDADA);
        } else {
            console.log('Pedido 644/2/2025 não encontrado.');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
verify();
