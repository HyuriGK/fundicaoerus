require('dotenv').config({ path: '.env.local' });
const pool = require('../lib/db');

async function run() {
    const r = await pool.query(
        "SELECT conname, contype FROM pg_constraint WHERE conrelid = 'producao_funcionarios'::regclass"
    );
    console.log('Constraints:', JSON.stringify(r.rows));
    const cols = await pool.query(
        "SELECT column_name, data_type, column_default, is_nullable FROM information_schema.columns WHERE table_name = 'producao_funcionarios' ORDER BY ordinal_position"
    );
    console.log('Columns:', JSON.stringify(cols.rows));
    await pool.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
