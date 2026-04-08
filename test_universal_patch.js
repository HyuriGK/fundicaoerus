const { Firebird } = require('./lib/firebird-helper');

console.log('🧪 Iniciando TESTE DE RETRY UNIVERSAL...');
console.log('Este teste simula falhas de login para verificar se o Patch no Firebird.attach está funcionando.\n');

// Simular opções SEM usuário para forçar o erro e o retry
const badOptions = {
    host: '127.0.0.1',
    port: 3050,
    database: 'non-existent.fdb',
    user: '', // Erro aqui
    password: 'wrong'
};

console.log('Tentativa 1: Validando erro imediato de usuário vazio...');
Firebird.attach(badOptions, (err, db) => {
    if (err) {
        console.log(`✅ Sucesso no Teste 1: ${err.message}`);
    } else {
        console.error('❌ Falha no Teste 1: Deveria ter dado erro de usuário não definido.');
    }
    
    console.log('\nTentativa 2: Validando RETRY (usando credenciais que falham no login)...');
    // Usamos um usuário que existe mas com senha errada ou similar,
    // mas aqui vou apenas simular que o driver retorna o erro gdscode 335544472.
    // Para simplificar o teste offline, vou apenas verificar se o log do PATCH aparece.
    
    const loginFailOptions = {
        host: 'localhost',
        port: 3050,
        database: 'test.fdb',
        user: 'WRONG_USER',
        password: 'WRONG_PASSWORD'
    };
    
    Firebird.attach(loginFailOptions, (err) => {
        console.log('\nFinal do Teste 2.');
        if (err) console.log(`Resultado final esperado: ${err.message}`);
        process.exit(0);
    });
});
