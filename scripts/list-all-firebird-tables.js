require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');
const fs = require('fs');

const options = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

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
