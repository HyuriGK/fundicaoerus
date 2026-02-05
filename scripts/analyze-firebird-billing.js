// Script para APENAS VISUALIZAR a estrutura das tabelas de faturamento no Firebird
// NÃO FAZ NENHUMA ALTERAÇÃO, INCLUSÃO OU REMOÇÃO DE DADOS

const Firebird = require('node-firebird');

const options = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

console.log('🔍 ANÁLISE DE TABELAS DE FATURAMENTO - SOMENTE LEITURA\n');
console.log('='.repeat(80));

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err.message);
        return;
    }

    console.log('✅ Conectado ao Firebird\n');

    // Função para descrever estrutura de uma tabela
    function describeTable(tableName, callback) {
        const query = `
            SELECT 
                rf.rdb$field_name AS field_name,
                CASE f.rdb$field_type
                    WHEN 7 THEN 'SMALLINT'
                    WHEN 8 THEN 'INTEGER'
                    WHEN 10 THEN 'FLOAT'
                    WHEN 12 THEN 'DATE'
                    WHEN 13 THEN 'TIME'
                    WHEN 14 THEN 'CHAR'
                    WHEN 16 THEN 'BIGINT'
                    WHEN 27 THEN 'DOUBLE'
                    WHEN 35 THEN 'TIMESTAMP'
                    WHEN 37 THEN 'VARCHAR'
                    WHEN 261 THEN 'BLOB'
                    ELSE 'UNKNOWN'
                END AS field_type,
                f.rdb$field_length AS field_length,
                rf.rdb$null_flag AS not_null
            FROM rdb$relation_fields rf
            JOIN rdb$fields f ON rf.rdb$field_source = f.rdb$field_name
            WHERE rf.rdb$relation_name = '${tableName}'
            ORDER BY rf.rdb$field_position
        `;

        db.query(query, function (err, result) {
            if (err) {
                console.error(`❌ Erro ao descrever ${tableName}:`, err.message);
                callback();
                return;
            }

            console.log(`\n📋 TABELA: ${tableName}`);
            console.log('-'.repeat(80));
            console.log('Campo'.padEnd(35), 'Tipo'.padEnd(15), 'Tamanho'.padEnd(10), 'Obrigatório');
            console.log('-'.repeat(80));

            result.forEach(field => {
                const fieldName = field.FIELD_NAME.trim();
                const fieldType = field.FIELD_TYPE;
                const fieldLength = field.FIELD_LENGTH || '-';
                const notNull = field.NOT_NULL === 1 ? 'SIM' : 'NÃO';

                console.log(
                    fieldName.padEnd(35),
                    fieldType.padEnd(15),
                    String(fieldLength).padEnd(10),
                    notNull
                );
            });

            callback();
        });
    }

    // Função para buscar dados de exemplo
    function sampleData(tableName, callback) {
        const query = `SELECT FIRST 3 * FROM ${tableName}`;

        db.query(query, function (err, result) {
            if (err) {
                console.error(`❌ Erro ao buscar dados de ${tableName}:`, err.message);
                callback();
                return;
            }

            console.log(`\n📊 DADOS DE EXEMPLO (${tableName}):`);
            console.log('-'.repeat(80));

            if (result.length > 0) {
                console.log(`Total de registros encontrados: ${result.length}`);
                console.log('\nPrimeiro registro:');
                console.log(JSON.stringify(result[0], null, 2));
            } else {
                console.log('Nenhum registro encontrado.');
            }

            callback();
        });
    }

    // Tabelas principais de faturamento para analisar
    const tablesToAnalyze = [
        'NOTA_FISCAL',
        'NOTA_FISCAL_PRODUTO',
        'FATURAMENTO_PRODUTO_LPCP',
        'PRE_FATURAMENTO_PRODUTO_LPCP'
    ];

    let currentIndex = 0;

    function analyzeNext() {
        if (currentIndex >= tablesToAnalyze.length) {
            console.log('\n' + '='.repeat(80));
            console.log('✅ Análise concluída!');
            console.log('='.repeat(80));
            db.detach();
            return;
        }

        const tableName = tablesToAnalyze[currentIndex];
        currentIndex++;

        describeTable(tableName, () => {
            sampleData(tableName, analyzeNext);
        });
    }

    // Iniciar análise
    analyzeNext();
});
