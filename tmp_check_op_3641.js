require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/DATABASE_URL="psql '(.*?)'"/);
const connectionString = match ? match[1] : process.env.DATABASE_URL;

const pgPool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function checkOP() {
    try {
        const res = await pgPool.query("SELECT data FROM firebird_sync_pedidos WHERE (data->>'OP_PCS') = '3641'");
        if (res.rows.length === 0) {
            console.log('OP 3641 not found in sync table.');
        } else {
            console.log('OP 3641 Data:', JSON.stringify(res.rows[0].data, null, 2));
        }
    } catch (err) {
        console.error(err);
    } finally {
        await pgPool.end();
    }
}

checkOP();
