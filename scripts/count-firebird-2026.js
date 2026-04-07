require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const options = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096, wireCrypt: true
};

Firebird.attach(options, function (err, db) {
    if (err) throw err;

    console.log('--- Counting 2026 Records in PRODUCAO_SETOR ---');

    // Query 1: Standard String Date
    const q1 = "SELECT COUNT(*) as TOTAL FROM PRODUCAO_SETOR WHERE DATA_PCS >= '2026-01-01' AND DATA_PCS <= '2026-12-31'";

    db.query(q1, function (err, result) {
        if (err) console.error('Query 1 Error:', err);
        else console.log(`Method 1 (String Range): ${result[0].TOTAL}`);

        // Query 2: Extract Year (if supported by this Firebird version, usually EXTRACT(YEAR FROM ...))
        const q2 = "SELECT COUNT(*) as TOTAL FROM PRODUCAO_SETOR WHERE EXTRACT(YEAR FROM DATA_PCS) = 2026";

        db.query(q2, function (err2, result2) {
            if (err2) {
                console.error('Method 2 Error (EXTRACT):', err2.message);
            } else {
                console.log(`Method 2 (Extract Year): ${result2[0].TOTAL}`);
            }
            db.detach();
        });
    });
});
