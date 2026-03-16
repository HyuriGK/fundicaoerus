const pool = require('./lib/db');
async function check() {
    try {
        const res = await pool.query("SELECT pedido, excluido_manualmente FROM faturamento_firebird WHERE pedido IS NULL OR pedido = '' OR pedido = ' ' LIMIT 5");
        console.log('Sample data (No Pedido):', res.rows);
        
        const cols = await pool.query("SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_name = 'faturamento_firebird' AND column_name = 'excluido_manualmente'");
        console.log('Column info:', cols.rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
check();
