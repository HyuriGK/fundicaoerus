require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const FIREBIRD_OPTIONS = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096, wireCrypt: true
};

Firebird.attach(FIREBIRD_OPTIONS, function (err, db) {
    if (err) { console.error(err); return; }

    // Check if PRODUCAO_SETOR has data for recent OPs (e.g. 3819, 3826 from previous step)
    const q1 = `
        SELECT PCS.CODIGO_PCS, PCS.SETOR_PCS, PCS.STATUS_PCS, PCS.DATA_PCS
        FROM PRODUCAO_SETOR PCS
        WHERE PCS.CODIGO_PCS IN (3819, 3826, 3825, 3824)
    `;

    db.query(q1, function (err, result) {
        if (err) { console.error(err); }
        else {
            console.log('=== Checking PRODUCAO_SETOR for Recent OPs ===');
            if (result.length === 0) console.log('No sector records found for recent OPs.');
            result.forEach(r => {
                console.log(`OP=${r.CODIGO_PCS} Setor=${r.SETOR_PCS} Status=${r.STATUS_PCS} Date=${r.DATA_PCS}`);
            });
        }
        db.detach();
    });
});
