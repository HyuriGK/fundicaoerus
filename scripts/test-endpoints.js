// Script simples para testar os endpoints do Firebird
const http = require('http');

function testEndpoint(path, name) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'GET'
        };

        console.log(`\n🔍 Testando: ${name}`);
        console.log(`URL: http://localhost:3000${path}`);

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log(`✅ Status: ${res.statusCode}`);
                    console.log(`📊 Resposta:`, JSON.stringify(json, null, 2).substring(0, 500));
                    resolve(json);
                } catch (e) {
                    console.log(`❌ Erro ao parsear JSON:`, e.message);
                    reject(e);
                }
            });
        });

        req.on('error', (e) => {
            console.log(`❌ Erro na requisição:`, e.message);
            reject(e);
        });

        req.setTimeout(30000, () => {
            console.log('⏱️ Timeout de 30s atingido');
            req.destroy();
            reject(new Error('Timeout'));
        });

        req.end();
    });
}

async function runTests() {
    console.log('🧪 TESTANDO ENDPOINTS DO FIREBIRD\n');
    console.log('='.repeat(80));

    try {
        // Teste 1: Estatísticas
        await testEndpoint('/api/faturamento-firebird/estatisticas?dataInicio=2026-01-01', 'Estatísticas Gerais');

        // Teste 2: Faturamento Diário
        await testEndpoint('/api/faturamento-firebird/diario?dataInicio=2026-02-01', 'Faturamento Diário');

        // Teste 3: Top Produtos
        await testEndpoint('/api/faturamento-firebird/top-produtos?dataInicio=2026-01-01&limit=5', 'Top 5 Produtos');

        console.log('\n' + '='.repeat(80));
        console.log('✅ Todos os testes concluídos com sucesso!');

    } catch (error) {
        console.log('\n' + '='.repeat(80));
        console.log('❌ Erro durante os testes:', error.message);
    }
}

runTests();
