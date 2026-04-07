require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const tableName = process.argv[2];

if (!tableName) {
    console.error('Usage: node inspect-table-columns.js <TABLE_NAME>');
    process.exit(1);
}

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

console.log(`Inspecting table: ${tableName}...`);

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Error connecting:', err);
        return;
    }

    const query = `
        SELECT 
            r.RDB$FIELD_NAME AS FIELD_NAME,
            t.RDB$TYPE_NAME AS FIELD_TYPE
        FROM RDB$RELATION_FIELDS r
        LEFT JOIN RDB$FIELDS f ON r.RDB$FIELD_SOURCE = f.RDB$FIELD_NAME
        LEFT JOIN RDB$TYPES t ON f.RDB$FIELD_TYPE = t.RDB$TYPE
        WHERE r.RDB$RELATION_NAME = ?
        ORDER BY r.RDB$FIELD_POSITION
    `;

    db.query(query, [tableName], function (err, result) {
        if (err) {
            console.error('Error querying columns:', err);
        } else {
            console.log('\nColumns:');
            result.forEach(row => {
                // Also try to get cleaner type info if possible, but field name is most important
                console.log(`- ${row.FIELD_NAME.trim()}`);
            });

            // Also try to get 1 row of data to see values
            console.log('\nSample Data (First 1 row):');
            db.query(`SELECT FIRST 1 * FROM ${tableName}`, function (err, rows) {
                if (err) console.error('Error fetching sample:', err.message);
                else console.log(rows[0]);

                db.detach();
            });
        }
    });
});
