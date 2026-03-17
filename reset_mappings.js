const pool = require('./lib/db');

async function resetMappings() {
    try {
        console.log('🗑️ Apagando todos os mapeamentos de centros de custo...');
        const result = await pool.query('TRUNCATE TABLE centro_custos_mapeamento');
        console.log('✅ Todos os mapeamentos foram resetados com sucesso.');
    } catch (e) {
        console.error('❌ Erro ao resetar mapeamentos:', e.message);
    } finally {
        process.exit();
    }
}

resetMappings();
