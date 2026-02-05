
async function testEndpoints() {
    const baseUrl = 'http://localhost:3000/api/faturamento-postgres';

    try {
        console.log('Testing /diario...');
        const resDiario = await fetch(`${baseUrl}/diario?limit=5`);
        const jsonDiario = await resDiario.json();
        console.log('Diario Status:', jsonDiario.success);
        console.log('First Row (Peso):', jsonDiario.data[0]?.pesoTotal);

        console.log('\nTesting /evolucao-mensal...');
        const resMensal = await fetch(`${baseUrl}/evolucao-mensal`);
        const jsonMensal = await resMensal.json();
        console.log('Mensal Status:', jsonMensal.success);
        console.log('Months count:', jsonMensal.data.length);
        console.log('Sample Month:', jsonMensal.data[0]);

    } catch (error) {
        console.error('Error testing endpoints:', error.message);
    }
}

testEndpoints();
