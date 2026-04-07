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

Firebird.attach(FIREBIRD_OPTIONS, (err, db) => {
    if (err) {
        console.error('Erro ao conectar:', err);
        return;
    }

    // Try to find OPs that look "Encerradas"
    // We'll look for non-null conclusion date, or faturada qty = quantity
    const sql = `
        SELECT FIRST 20 
            CODIGO_PCP, STATUS_PCP, DATA_CONCLUSAO_PCP, 
            QUANTIDADE_PCP, QUANTIDADE_PRODUZIDA_PCP, QUANTIDADE_FATURADA_PCP,
            QUANTIDADE_CANCELADA_PCP, QUANTIDADE_A_FATURAR_PCP
        FROM PRODUCAO 
        WHERE DATA_CONCLUSAO_PCP IS NOT NULL 
           OR QUANTIDADE_A_FATURAR_PCP = 0
           OR STATUS_PCP NOT IN ('N', 'P')
        ORDER BY DATA_PCP DESC
    `;

    db.query(sql, (err, result) => {
        if (err) {
            console.error('Erro na query:', err);
        } else {
            console.log('Amostras de OPs possivelmente ENCERRADAS:');
            console.log(JSON.stringify(result, null, 2));
        }
        db.detach();
    });
});
