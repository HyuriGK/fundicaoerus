
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

// Fix database URL wrapper if present
let url = process.env.DATABASE_URL;
if (url.startsWith("psql '")) {
    url = url.substring(6, url.length - 1);
}

const pool = new Pool({ connectionString: url });

async function run() {
    try {
        console.log("🛠️ Starting Schema Fix for 'faturamento_firebird_preferencias'...");

        // 1. Ensure Columns Exist
        await pool.query(`
            ALTER TABLE faturamento_firebird_preferencias 
            ADD COLUMN IF NOT EXISTS pedido VARCHAR(50),
            ADD COLUMN IF NOT EXISTS nota_fiscal INTEGER,
            ADD COLUMN IF NOT EXISTS codigo_item VARCHAR(50),
            ADD COLUMN IF NOT EXISTS data_faturamento DATE,
            ADD COLUMN IF NOT EXISTS quantidade DECIMAL(15,3)
        `);
        console.log("✅ Columns verified/added.");

        // 2. Repair Missing Data (Matching by Chave Unica if possible, or Note+Item+Pedido)
        // Note: The Chave Unica usually follows "Nota-Item-Pedido-Data-Quant" or "Nota-Item-Pedido"
        // Let's try to parse the Chave Unica for those that have NULL data_faturamento

        console.log("🔍 Attempting to repair records with missing Date/Quantity...");

        // Strategy: Match NULLs against the faturamento_firebird table
        const repairRes = await pool.query(`
            UPDATE faturamento_firebird_preferencias p
            SET 
                data_faturamento = f.data_faturamento,
                quantidade = f.quantidade,
                nota_fiscal = COALESCE(p.nota_fiscal, f.nota_fiscal),
                codigo_item = COALESCE(p.codigo_item, f.codigo_item),
                pedido = COALESCE(p.pedido, f.pedido)
            FROM faturamento_firebird f
            WHERE (p.nota_fiscal = f.nota_fiscal OR p.chave_unica LIKE f.nota_fiscal || '-%')
            AND (p.codigo_item = f.codigo_item OR p.chave_unica LIKE '%-' || f.codigo_item || '-%')
            AND (p.data_faturamento IS NULL OR p.quantidade IS NULL)
            AND f.data_faturamento IS NOT NULL
        `);

        console.log(`✅ Repaired ${repairRes.rowCount} records.`);

        // 3. Final Sync Check: Update faturamento_firebird to match preferences
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
        console.log(`✅ Synced ${syncRes.rowCount} flags to main billing table.`);

    } catch (e) {
        console.error("❌ Error during migration:", e);
    } finally {
        await pool.end();
    }
}

run();
