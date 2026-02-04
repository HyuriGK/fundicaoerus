require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

// Configuração do Firebird
const options = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

console.log('🔍 Explorando estrutura de faturamento no Firebird...\n');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err);
        return;
    }

    console.log('✅ Conectado ao Firebird!\n');

    // Passo 1: Procurar tabelas relacionadas a faturamento/pedidos/vendas
    const searchTerms = ['FATUR', 'PEDIDO', 'VENDA', 'NOTA', 'ITEM'];

    let query = `
        SELECT rdb$relation_name 
        FROM rdb$relations 
        WHERE rdb$view_blr IS NULL 
        AND (rdb$system_flag IS NULL OR rdb$system_flag = 0)
        AND (`;

    searchTerms.forEach((term, index) => {
        if (index > 0) query += ' OR ';
        query += `rdb$relation_name LIKE '%${term}%'`;
    });

    query += ') ORDER BY rdb$relation_name';

    db.query(query, function (err, tables) {
        if (err) {
            console.error('Erro ao buscar tabelas:', err);
            db.detach();
            return;
        }

        console.log('📊 TABELAS ENCONTRADAS RELACIONADAS A FATURAMENTO:\n');
        const tableNames = tables.map(row => row.RDB$RELATION_NAME.trim());
        tableNames.forEach((name, index) => {
            console.log(`${index + 1}. ${name}`);
        });

        console.log('\n' + '='.repeat(80) + '\n');

        // Passo 2: Analisar estrutura de cada tabela
        let currentIndex = 0;

        function analyzeNextTable() {
            if (currentIndex >= tableNames.length) {
                console.log('\n✅ Análise completa!\n');
                console.log('💡 PRÓXIMOS PASSOS:');
                console.log('1. Identifique as tabelas principais (ex: PEDIDO, ITEM_PEDIDO, NOTA_FISCAL)');
                console.log('2. Verifique quais colunas contêm: data, valor, quantidade, cliente');
                console.log('3. Vou criar uma query específica para extrair o faturamento diário\n');
                db.detach();
                return;
            }

            const tableName = tableNames[currentIndex];
            console.log(`\n📋 TABELA: ${tableName}`);
            console.log('-'.repeat(80));

            // Buscar colunas da tabela
            db.query(`
                SELECT 
                    rf.rdb$field_name as field_name,
                    f.rdb$field_type as field_type,
                    f.rdb$field_length as field_length
                FROM rdb$relation_fields rf
                JOIN rdb$fields f ON rf.rdb$field_source = f.rdb$field_name
                WHERE rf.rdb$relation_name = '${tableName}'
                ORDER BY rf.rdb$field_position
            `, function (err, columns) {
                if (err) {
                    console.error(`Erro ao ler colunas de ${tableName}:`, err.message);
                } else {
                    console.log('Colunas:');
                    columns.forEach(col => {
                        const fieldName = col.FIELD_NAME.trim();
                        const fieldType = getFieldTypeName(col.FIELD_TYPE);
                        console.log(`  - ${fieldName} (${fieldType})`);
                    });

                    // Tentar buscar 1 registro de exemplo
                    db.query(`SELECT FIRST 1 * FROM ${tableName}`, function (err, rows) {
                        if (!err && rows.length > 0) {
                            console.log('\nExemplo de dados (primeira linha):');
                            const row = rows[0];
                            Object.keys(row).forEach(key => {
                                let value = row[key];
                                if (value !== null && value !== undefined) {
                                    if (value instanceof Date) {
                                        value = value.toISOString().split('T')[0];
                                    } else if (typeof value === 'string') {
                                        value = value.trim().substring(0, 50);
                                    }
                                    console.log(`  ${key}: ${value}`);
                                }
                            });
                        }
                    });
                }

                currentIndex++;
                setTimeout(() => analyzeNextTable(), 100);
            });
        }

        analyzeNextTable();
    });
});

function getFieldTypeName(typeCode) {
    const types = {
        7: 'SMALLINT',
        8: 'INTEGER',
        9: 'QUAD',
        10: 'FLOAT',
        12: 'DATE',
        13: 'TIME',
        14: 'CHAR',
        16: 'BIGINT',
        27: 'DOUBLE',
        35: 'TIMESTAMP',
        37: 'VARCHAR',
        261: 'BLOB'
    };
    return types[typeCode] || `TIPO_${typeCode}`;
}
