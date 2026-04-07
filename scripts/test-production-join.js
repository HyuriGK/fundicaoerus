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
    pageSize: 4096
};

console.log('Testing JOIN between PRODUCAO_SETOR and PRODUCAO_SETOR_PECA...');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Error connecting:', err);
        return;
    }

    // Try to guess the join keys based on naming convention
    // PRODUCAO_SETOR (PCS) -> likely CODIGO_PCS
    // PRODUCAO_SETOR_PECA (PCSP) -> likely PCS_ID_CODIGO_PCSP pointing to CODIGO_PCS

    const query = `
        SELECT FIRST 5
            pcs.CODIGO_PCS,
            pcs.DATA_HORA_FIM_PCS,
            pcsp.PRO_CODIGO_PCSP,
            pcsp.QUANTIDADE_PCSP,
            pcs.KG_TOTAL_PCS
        FROM PRODUCAO_SETOR pcs
        INNER JOIN PRODUCAO_SETOR_PECA pcsp ON pcs.CODIGO_PCS = pcsp.PCS_ID_CODIGO_PCSP
        WHERE pcs.DATA_HORA_FIM_PCS > '2024-01-01'
        ORDER BY pcs.DATA_HORA_FIM_PCS DESC
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('Error querying:', err);
        } else {
            console.log('\nSample Production Records:');
            console.log(result);
        }

        db.detach();
    });
});
