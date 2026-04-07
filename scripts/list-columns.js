require('dotenv').config({ path: '.env.local' });
const { Firebird, attachWithRetry } = require('../lib/firebird-helper');

async function run() {
    let db;
    try {
        db = await attachWithRetry();
        const tableName = process.argv[2] ? process.argv[2].toUpperCase() : 'PEDIDO';
        console.log(`Listing columns for table: ${tableName}`);

        const query = `
            SELECT R.RDB$FIELD_NAME 
            FROM RDB$RELATION_FIELDS R
            WHERE R.RDB$RELATION_NAME = '${tableName}'
            ORDER BY R.RDB$FIELD_POSITION
        `;

        const result = await new Promise((resolve, reject) => {
            db.query(query, function (err, res) {
                if (err) reject(err);
                else resolve(res);
            });
        });

        const columns = result.map(r => r.RDB$FIELD_NAME.trim());
        console.log(columns.join('\n'));

        db.detach();
    } catch (err) {
        console.error('❌ Erro:', err);
        if (db) db.detach();
    }
}

run();
