require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

// --- CONFIGURAÇÃO (Recuperada do teste anterior) ---
const options = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

console.log('🔍 Procurando tabela de PEDIDOS...');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err);
        return;
    }

    // 1. Listar todas as tabelas com "PEDID" no nome
    db.query("SELECT rdb$relation_name FROM rdb$relations WHERE rdb$relation_name LIKE '%PEDIDO%'", function (err, result) {
        if (err) {
            console.error('Erro ao listar tabelas:', err);
            db.detach();
            return;
        }

        const tables = result.map(row => row.RDB$RELATION_NAME.trim());
        console.log('\nTabelas encontradas:', tables);

        // 2. Tentar identificar a principal
        // Geralmente é "PEDIDO" ou "PEDIDOS"
        const targetTable = tables.find(t => t === 'PEDIDO') || tables.find(t => t === 'PEDIDOS') || tables[0];

        if (!targetTable) {
            console.log('❌ Nenhuma tabela de pedido encontrada.');
            db.detach();
            return;
        }

        console.log(`\n📋 Analisando estrutura da tabela: ${targetTable}`);

        // 3. Ler 1 linha para pegar as colunas
        db.query(`SELECT FIRST 1 * FROM ${targetTable}`, function (err, rows) {
            if (err) {
                console.error(`Erro ao ler tabela ${targetTable}:`, err.message);
            } else if (rows.length === 0) {
                console.log(`A tabela ${targetTable} está vazia, mas existe.`);
            } else {
                const columns = Object.keys(rows[0]);
                console.log('Colunas:', columns.join(', '));

                // Verificar ANO_PPR
                if (columns.includes('ANO_PPR')) {
                    console.log('\n✅ Coluna ANO_PPR encontrada!');
                } else {
                    console.log('\n⚠️ Coluna ANO_PPR NÃO encontrada nesta tabela.');
                }
            }
            db.detach();
        });
    });
});
