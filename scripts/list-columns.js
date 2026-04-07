require('dotenv').config({ path: '.env.local' });


const { Firebird, options: FIREBIRD_OPTIONS } = require('../lib/firebird-helper');

Firebird.attach(FIREBIRD_OPTIONS, function (err, db) {
    if (err) { console.error(err); return; }

    const tableName = process.argv[2] ? process.argv[2].toUpperCase() : 'PEDIDO';
    console.log(`Listing columns for table: ${tableName}`);

    const query = `
        SELECT R.RDB$FIELD_NAME 
        FROM RDB$RELATION_FIELDS R
        WHERE R.RDB$RELATION_NAME = '${tableName}'
        ORDER BY R.RDB$FIELD_POSITION
    `;

    db.query(query, function (err, result) {
        if (err) console.error(err);
        else {
            const columns = result.map(r => r.RDB$FIELD_NAME.trim());
            console.log(columns.join('\n'));
        }
        db.detach();
    });
});
