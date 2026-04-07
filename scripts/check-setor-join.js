
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

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Connection Error:', err);
        return;
    }

    // Select first 5 rows from PRODUCAO_SETOR and try to join with SETOR
    // We check both SETOR_PCS and PCS_SETOR_PCS candidates
    const query = `
        SELECT FIRST 5 
            PS.ID_PCS,
            PS.SETOR_PCS, 
            S1.NOME_SET AS NOME_VIA_SETOR_PCS,
            PS.PCS_SETOR_PCS,
            S2.NOME_SET AS NOME_VIA_PCS_SETOR_PCS
        FROM PRODUCAO_SETOR PS
        LEFT JOIN SETOR S1 ON S1.CODIGO_SET = PS.SETOR_PCS AND S1.EMPRESA_SET = PS.SET_EMPRESA_PCS
        LEFT JOIN SETOR S2 ON S2.CODIGO_SET = PS.PCS_SETOR_PCS AND S2.EMPRESA_SET = PS.PCS_EMPRESA_PCS
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('Query Error:', err);
            db.detach();
            return;
        }

        console.log('Join Results:', result);
        db.detach();
    });
});
