require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

// Hardcoded config
const fbOptions = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

Firebird.attach(fbOptions, function (err, db) {
    if (err) {
        console.error('❌ Firebird Connection Error:', err);
        process.exit(1);
    }
    console.log('✅ Firebird attached.');

    const query = `SELECT FIRST 1 * FROM PRODUCAO_SETOR`;

    db.query(query, (err, rows) => {
        if (err) {
            console.error('Error querying PRODUCAO_SETOR:', err);
        } else {
            console.log('✅ PRODUCAO_SETOR Columns:');
            if (rows.length > 0) {
                console.log(Object.keys(rows[0]));
                console.log('Sample Row:', rows[0]);
            } else {
                console.log('Table found but empty.');
            }
        }
        db.detach();
    });
});
