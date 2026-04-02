const pool = require('./lib/db');
async function test() {
    try {
        console.log('Testing connection...');
        const countRes = await pool.query('SELECT count(*) FROM producao_apontada_sincronizada');
        console.log('Count:', countRes.rows[0].count);
        
        console.log('Testing limit 10 query...');
        const start = Date.now();
        const dataRes = await pool.query('SELECT * FROM producao_apontada_sincronizada LIMIT 10');
        const end = Date.now();
        console.log('Limit 10 took:', end - start, 'ms');
        
        console.log('Checking indexes...');
        const idxRes = await pool.query(`
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'producao_apontada_sincronizada'
        `);
        console.log('Indexes:', JSON.stringify(idxRes.rows, null, 2));

    } catch (e) {
        console.error('Test failed:', e);
    } finally {
        await pool.end();
        process.exit();
    }
}
test();
