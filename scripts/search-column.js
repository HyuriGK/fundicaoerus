require('dotenv').config({ path: '.env.local' });
const { Firebird, options } = require('../lib/firebird-helper');

const searchTerm = process.argv[2] || 'ANO_PPR';

console.log(`🔍 Procurando por coluna "${searchTerm}" em todas as tabelas...`);

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err);
        process.exit(1);
    }

    const query = `
        SELECT TRIM(R.RDB$RELATION_NAME) as TABLE_NAME, TRIM(F.RDB$FIELD_NAME) as FIELD_NAME
        FROM RDB$RELATION_FIELDS F
        JOIN RDB$RELATIONS R ON F.RDB$RELATION_NAME = R.RDB$RELATION_NAME
        WHERE F.RDB$FIELD_NAME LIKE '%${searchTerm}%'
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('❌ Erro na busca:', err);
        } else if (result.length === 0) {
            console.log(`❌ Nenhuma coluna com nome parecido com "${searchTerm}" encontrada.`);
        } else {
            console.log('\n✅ Encontrado nas seguintes tabelas:');
            result.forEach(row => {
                console.log(`- Tabela: ${row.TABLE_NAME} | Coluna: ${row.FIELD_NAME}`);
            });
        }
        db.detach();
    });
});
