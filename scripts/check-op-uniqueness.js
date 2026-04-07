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

    console.log('--- Checking Uniqueness of CODIGO_PCS in 2026 ---');

    db.query(`
        SELECT COUNT(*) as TOTAL, COUNT(DISTINCT CODIGO_PCS) as UNIQUE_OPS
        FROM PRODUCAO_SETOR 
        WHERE DATA_PCS >= '2026-01-01' AND DATA_PCS <= '2026-12-31'
    `, function (err, result) {
        if (err) console.error(err);
        else {
            console.log(`Total Records: ${result[0].TOTAL}`);
            console.log(`Unique OPs: ${result[0].UNIQUE_OPS}`);

            if (result[0].TOTAL > result[0].UNIQUE_OPS) {
                console.log('⚠️ CONCLUSION: CODIGO_PCS is NOT unique! Records are being collapsed.');
            } else {
                console.log('✅ CONCLUSION: CODIGO_PCS is unique.');
            }
        }
        db.detach();
    });
});
