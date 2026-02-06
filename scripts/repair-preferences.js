
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

// Fix database URL
let url = process.env.DATABASE_URL;
if (url.startsWith("psql '")) {
    url = url.substring(6, url.length - 1);
}

const pool = new Pool({ connectionString: url });

async function run() {
    try {
        console.log("🛠️ Repairing 'faturamento_firebird_preferencias'...");

        // Try to fill NULL data_faturamento and quantidade by matching Nota + Item + Pedido
        const updateRes = await pool.query(`
            UPDATE faturamento_firebird_preferencias p
            SET 
                data_faturamento = f.data_faturamento,
                quantidade = f.quantidade
            FROM faturamento_firebird f
            WHERE p.nota_fiscal = f.nota_fiscal
            AND p.codigo_item = f.codigo_item
            AND COALESCE(p.pedido, '') = COALESCE(f.pedido, '')
            AND (p.data_faturamento IS NULL OR p.quantidade IS NULL)
        `);

        console.log(`✅ Repaired ${updateRes.rowCount} historical records with Date and Quantity.`);

        // Also check if any f.excluido_manualmente needs to be pre-set as a "cache"
        const syncRes = await pool.query(`
            UPDATE faturamento_firebird f
            SET excluido_manualmente = p.excluido
            FROM faturamento_firebird_preferencias p
            WHERE p.nota_fiscal = f.nota_fiscal
            AND p.codigo_item = f.codigo_item
            AND COALESCE(p.pedido, '') = COALESCE(f.pedido, '')
            AND p.data_faturamento = f.data_faturamento
            AND p.quantidade = f.quantidade
            AND f.excluido_manualmente != p.excluido
        `);
        console.log(`✅ Synced ${syncRes.rowCount} 'excluido_manualmente' flags in main table.`);

    } catch (e) {
        console.error("❌ Error during repair:", e);
    } finally {
        await pool.end();
    }
}

run();
