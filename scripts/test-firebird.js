require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

// --- CONFIGURAÇÃO DO FIREBIRD ---
// PREENCHA AQUI COM SEUS DADOS:
const options = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

console.log('Tentando conectar ao Firebird...');
console.log(`Host: ${options.host}:${options.port}`);
console.log(`Database: ${options.database}`);

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar no Firebird:', err);
        console.log('\nDICAS:');
        console.log('1. Verifique se o caminho do banco (.FDB) está correto.');
        console.log('2. Verifique se o Firebird está rodando.');
        console.log('3. Verifique usuário e senha (padrão: SYSDBA / masterkey).');
        return;
    }

    console.log('✅ Conectado com sucesso ao Firebird!');

    // Listar tabelas para testar
    db.query('SELECT rdb$relation_name FROM rdb$relations WHERE rdb$view_blr IS NULL AND (rdb$system_flag IS NULL OR rdb$system_flag = 0);', function (err, result) {
        if (err) {
            console.error('Erro ao listar tabelas:', err);
        } else {
            console.log('\n📊 Tabelas encontradas:');
            result.forEach(row => {
                console.log('-', row.RDB$RELATION_NAME.trim());
            });
        }

        db.detach();
        console.log('\nConexão fechada.');
    });
});
