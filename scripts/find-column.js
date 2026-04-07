require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const options = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

console.log('🔍 Varrendo todas as tabelas procurando por ANO_PPR...');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err);
        return;
    }

    // Query para listar todas as colunas de todas as tabelas
    const query = `
        SELECT R.RDB$RELATION_NAME as TABLE_NAME, F.RDB$FIELD_NAME as FIELD_NAME
        FROM RDB$RELATION_FIELDS F
        JOIN RDB$RELATIONS R ON F.RDB$RELATION_NAME = R.RDB$RELATION_NAME
        WHERE F.RDB$FIELD_NAME LIKE '%PEDIDO%'
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('Erro na busca:', err);
        } else if (result.length === 0) {
            console.log('❌ Nenhuma coluna com nome parecido com "ANO_PPR" encontrada.');
        } else {
            console.log('\n✅ Encontrado nas seguintes tabelas:');
            result.forEach(row => {
                console.log(`- Tabela: ${row.TABLE_NAME.trim()} | Coluna: ${row.FIELD_NAME.trim()}`);
            });
        }
        db.detach();
    });
});
