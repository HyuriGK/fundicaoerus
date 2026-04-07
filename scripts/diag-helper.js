const { options } = require('../lib/firebird-helper');
console.log('--- DIAGNÓSTICO DE CONEXÃO ---');
console.log('Host:', options.host);
console.log('Port:', options.port);
console.log('User:', options.user ? 'DEFINIDO (OK)' : 'NÃO DEFINIDO (ERRO)');
console.log('Pass:', options.password ? 'DEFINIDO (OK)' : 'NÃO DEFINIDO (ERRO)');
console.log('WireCrypt:', options.wireCrypt);
console.log('---------------------------');
process.exit(0);
