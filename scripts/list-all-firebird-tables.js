require('dotenv').config({ path: '.env.local' });

const fs = require('fs');

const { Firebird, options: options } = require('../lib/firebird-helper');

console.log('Connecting to Firebird...');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Error connecting:', err);
        return;
    }

    // List ALL tables
    const query = `
        SELECT rdb$relation_name 
        FROM rdb$relations 
        WHERE rdb$view_blr IS NULL 
        AND (rdb$system_flag IS NULL OR rdb$system_flag = 0)
        ORDER BY rdb$relation_name
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('Error querying tables:', err);
        } else {
            const tables = result.map(row => row.RDB$RELATION_NAME.trim());
            console.log(`Found ${tables.length} tables.`);
            fs.writeFileSync('firebird_tables_list.txt', tables.join('\n'));
            console.log('Saved to firebird_tables_list.txt');
        }

        db.detach();
    });
});
