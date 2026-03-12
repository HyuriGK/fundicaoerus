const pool = require('../lib/db');

async function testApiLogic() {
    try {
        console.log('Testing Sync Status Alert Logic...');
        
        const syncStatusResult = await pool.query(`
            SELECT 
                screen_name, 
                last_sync_at,
                EXTRACT(EPOCH FROM (NOW() - last_sync_at))/3600 as hours_diff
            FROM sync_status
        `);

        const tasks = [];
        for (const sync of syncStatusResult.rows) {
            console.log(`Checking ${sync.screen_name}: ${Number(sync.hours_diff).toFixed(2)}h diff`);
            if (sync.hours_diff > 2) {
                const lastSync = new Date(sync.last_sync_at).toLocaleString('pt-BR');
                tasks.push({
                    id: `sync-delay-${sync.screen_name.toLowerCase()}`,
                    sector: 'Sincronização',
                    title: `Dados Desatualizados: ${sync.screen_name}`,
                    description: `A sincronização de <strong>${sync.screen_name}</strong> está atrasada.<br>Última atualização: ${lastSync} (${Math.floor(sync.hours_diff)}h atrás).`,
                    actionUrl: '#',
                    priority: 'high',
                    count: 1
                });
            }
        }

        console.log('Generated Tasks:');
        console.table(tasks);
        
        if (tasks.find(t => t.title.includes('Faturamento'))) {
            console.log('✅ Success: Faturamento alert generated.');
        } else {
            console.log('❌ Failure: Faturamento alert NOT generated.');
        }

        if (tasks.find(t => t.title.includes('Pedidos'))) {
            console.log('❌ Failure: Pedidos alert generated (should not happen for recent sync).');
        } else {
            console.log('✅ Success: No alert for Pedidos.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

testApiLogic();
