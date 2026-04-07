require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

// Configuração do Firebird
const options = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

console.log('🔍 Procurando tabelas de itens de pedido...\n');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err);
        return;
    }

    // Buscar tabelas com PEDIDO e ITEM no nome
    db.query(`
        SELECT rdb$relation_name 
        FROM rdb$relations 
        WHERE rdb$view_blr IS NULL 
        AND (rdb$system_flag IS NULL OR rdb$system_flag = 0)
        AND (rdb$relation_name LIKE '%PEDIDO%' AND rdb$relation_name LIKE '%ITEM%')
        ORDER BY rdb$relation_name
    `, function (err, tables) {
        if (err) {
            console.error('Erro:', err);
            db.detach();
            return;
        }

        console.log('📋 TABELAS ENCONTRADAS:\n');
        tables.forEach(row => {
            console.log('-', row.RDB$RELATION_NAME.trim());
        });

        // Também buscar tabelas de NOTA FISCAL
        console.log('\n📋 TABELAS DE NOTA FISCAL:\n');
        db.query(`
            SELECT rdb$relation_name 
            FROM rdb$relations 
            WHERE rdb$view_blr IS NULL 
            AND (rdb$system_flag IS NULL OR rdb$system_flag = 0)
            AND rdb$relation_name LIKE '%NOTA%'
            ORDER BY rdb$relation_name
        `, function (err, notaTables) {
            if (!err) {
                notaTables.forEach(row => {
                    console.log('-', row.RDB$RELATION_NAME.trim());
                });
            }

            db.detach();
        });
    });
});
