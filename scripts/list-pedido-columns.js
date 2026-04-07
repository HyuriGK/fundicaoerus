require('dotenv').config({ path: '.env.local' });


const { Firebird, options: FIREBIRD_OPTIONS } = require('../lib/firebird-helper');

console.log('🔍 Listando colunas da tabela PEDIDO...\n');

Firebird.attach(FIREBIRD_OPTIONS, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err);
        return;
    }

    console.log('✅ Conectado ao Firebird\n');

    // Listar todas as colunas da tabela PEDIDO
    const query = `
        SELECT 
            rdb$field_name as FIELD_NAME
        FROM rdb$relation_fields
        WHERE rdb$relation_name = 'PEDIDO'
        ORDER BY rdb$field_position
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('Erro na query:', err);
            db.detach();
            return;
        }

        console.log(`📋 Colunas da tabela PEDIDO (${result.length} colunas):\n`);

        result.forEach((row, index) => {
            const fieldName = row.FIELD_NAME.trim();
            console.log(`${(index + 1).toString().padStart(3)}. ${fieldName}`);
        });

        console.log('\n🔍 Colunas relacionadas a DATA:');
        const dataCols = result.filter(r => r.FIELD_NAME.includes('DATA') || r.FIELD_NAME.includes('EMISSAO'));
        dataCols.forEach(row => {
            console.log(`   → ${row.FIELD_NAME.trim()}`);
        });

        db.detach();
    });
});
