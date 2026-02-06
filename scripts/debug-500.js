
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
        console.log("🔍 Running Detailed GET Query...");
        const query = `
            SELECT 
                f.data_faturamento,
                f.nota_fiscal,
                f.serie,
                f.cliente_codigo,
                f.cliente_nome,
                f.codigo_item,
                f.descricao,
                f.quantidade,
                f.valor_unitario,
                f.valor_total,
                f.peso_un,
                f.peso_total,
                f.status,
                f.pedido,
                COALESCE(p.excluido, f.excluido_manualmente, false) as excluido_manualmente
            FROM faturamento_firebird f
            LEFT JOIN faturamento_firebird_preferencias p 
                ON p.nota_fiscal = f.nota_fiscal
                AND p.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                AND COALESCE(p.pedido, '') = COALESCE(TRIM(f.pedido), '')
                AND p.data_faturamento = f.data_faturamento
                AND p.quantidade = f.quantidade
            WHERE 1=1
            ORDER BY data_faturamento DESC, nota_fiscal DESC
            LIMIT 5
        `;
        const res = await pool.query(query);
        console.log("✅ Row 0:", res.rows[0]);
    } catch (e) {
        console.error("❌ SQL Error:", e.message);
    } finally {
        await pool.end();
    }
}

run();
