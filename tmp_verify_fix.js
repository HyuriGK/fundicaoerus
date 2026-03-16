const pool = require('./lib/db');
async function check() {
    try {
        const query = `
            SELECT 
                f.pedido,
                f.excluido_manualmente,
                COALESCE(p.excluido, f.excluido_manualmente OR f.pedido IS NULL OR f.pedido = '' OR f.pedido = ' ') as should_be_excluded
            FROM faturamento_firebird f
            LEFT JOIN faturamento_firebird_preferencias p 
                ON p.nota_fiscal = f.nota_fiscal
                AND p.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                AND COALESCE(p.pedido, '') = COALESCE(TRIM(f.pedido), '')
                AND p.data_faturamento = f.data_faturamento
                AND p.quantidade = f.quantidade
            WHERE f.pedido IS NULL OR f.pedido = '' OR f.pedido = ' '
            LIMIT 5
        `;
        const res = await pool.query(query);
        console.log('Verification Results:', res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
check();
