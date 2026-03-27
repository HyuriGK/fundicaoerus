const pool = require('../lib/db');

async function checkPriorities() {
    try {
        console.log('--- ANALYZING ORDER BALANCE PRIORITIES ---');
        
        const query = `
            SELECT 
                (data->>'CODIGO_PPR') as pedido,
                (data->>'SALDO_LIBERADO_FATURAR_PPR') as saldo_lib,
                (data->>'QUANTIDADE_PPR') as qtd_ppr,
                (data->>'QUANTIDADE_FATURADO_PPR') as qtd_fat,
                (data->>'QUANTIDADE_FATURADA_PPR') as qtd_fat_alt
            FROM firebird_sync_pedidos
            LIMIT 2000
        `;
        
        const result = await pool.query(query);
        let p1Count = 0;
        let p2Count = 0;
        let p2Samples = [];

        result.rows.forEach(r => {
            const saldoLib = Number(r.saldo_lib) || 0;
            if (saldoLib > 0) {
                p1Count++;
            } else {
                const qtdOrig = Number(r.qtd_ppr) || 0;
                const qtdFat = Number(r.qtd_fat || r.qtd_fat_alt) || 0;
                const balance = Math.max(0, qtdOrig - qtdFat);
                if (balance > 0) {
                    p2Count++;
                    if (p2Samples.length < 5) p2Samples.push(r.pedido);
                }
            }
        });

        console.log(`\nResults:`);
        console.log(`Using Priority 1 (Saldo Liberado > 0): ${p1Count}`);
        console.log(`Using Priority 2 (Qtd - Fat > 0): ${p2Count}`);
        if (p2Samples.length > 0) {
            console.log(`Samples using Priority 2: ${p2Samples.join(', ')}`);
        }

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        process.exit();
    }
}

checkPriorities();
