require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const options = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096, wireCrypt: true
};

console.log('Connecting to Firebird to find production tables...');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Error connecting:', err);
        return;
    }

    const query = `
        SELECT rdb$relation_name 
        FROM rdb$relations 
        WHERE rdb$view_blr IS NULL 
        AND (rdb$system_flag IS NULL OR rdb$system_flag = 0)
        AND (
            rdb$relation_name LIKE '%PROD%' OR 
            rdb$relation_name LIKE '%APONT%' OR 
            rdb$relation_name LIKE '%MOV%' OR
            rdb$relation_name LIKE '%ORDEM%'
        )
        ORDER BY rdb$relation_name
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('Error querying tables:', err);
        } else {
            console.log('\nPotentially relevant tables:');
            result.forEach(row => {
                console.log('-', row.RDB$RELATION_NAME.trim());
            });
        }

        db.detach();
        console.log('\nDone.');
    });
});
