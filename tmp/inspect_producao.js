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

    // Query to get columns of PRODUCAO
    const sql = `
        SELECT R.RDB$FIELD_NAME AS COLUMN_NAME
        FROM RDB$RELATION_FIELDS R
        WHERE R.RDB$RELATION_NAME = 'PRODUCAO'
        ORDER BY R.RDB$FIELD_POSITION
    `;

    db.query(sql, (err, result) => {
        if (err) {
            console.error('Erro na query:', err);
        } else {
            console.log('Colunas da tabela PRODUCAO:');
            result.forEach(row => {
                console.log(row.COLUMN_NAME.trim());
            });

            // Also get some sample data to see status values
            const sampleSql = "SELECT FIRST 10 * FROM PRODUCAO ORDER BY DATA_PCP DESC";
            db.query(sampleSql, (err, samples) => {
                if (err) {
                    console.error('Erro ao buscar amostras:', err);
                } else {
                    console.log('\nAmostras de dados (primeiras 10):');
                    console.log(JSON.stringify(samples, null, 2));
                }
                db.detach();
            });
        }
    });
});
