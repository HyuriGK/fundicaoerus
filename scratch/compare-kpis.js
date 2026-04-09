const { Pool } = require('pg');

const DATABASE_URL = "postgresql://neondb_owner:npg_qYnfKai9X4cx@ep-still-recipe-ah0lg56g-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";

async function analyze() {
    const pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const result = await pool.query('SELECT data FROM firebird_sync_pedidos LIMIT 5000');
        const data = result.rows.map(r => r.data);
        
        console.log(`Total orders in DB: ${data.length}`);

        // Simulation of index.html Logic
        function getCorrectedWeight_Index(item) {
            const saldoLib = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
            let saldoReal = saldoLib;
            if (saldoLib <= 0) {
                const qO = Number(item.QUANTIDADE_PPR) || 0;
                const qF = Number(item.QUANTIDADE_FATURADO_PPR || item.QUANTIDADE_FATURADA_PPR) || 0;
                saldoReal = Math.max(0, qO - qF);
            }
            const qtdOrig = Number(item.QUANTIDADE_PPR) || 0;
            const opQty = Number(item.OP_QUANTIDADE) || 0;
            const originalTarget = opQty || qtdOrig; // Logic OR from index.html

            let unitWeight = 0;
            if (item.PESO_UNIT !== undefined && item.PESO_UNIT !== null && item.PESO_UNIT !== '') {
                unitWeight = Number(item.PESO_UNIT);
            } else {
                unitWeight = originalTarget > 0 ? (Number(item.PESO_LIQUIDO_NPR) || 0) / originalTarget : 0;
            }
            return unitWeight * saldoReal;
        }

        // Simulation of pedidos.html Logic
        function getCorrectedWeight_Pedidos(item) {
            const saldoLib = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
            let saldoReal = saldoLib;
            if (saldoLib <= 0) {
                const qO = Number(item.QUANTIDADE_PPR) || 0;
                const qF = Number(item.QUANTIDADE_FATURADO_PPR || item.QUANTIDADE_FATURADA_PPR) || 0;
                saldoReal = Math.max(0, qO - qF);
            }
            const qtdOrig = Number(item.QUANTIDADE_PPR) || 0;
            const opQty = Number(item.OP_QUANTIDADE) || 0;
            const originalTarget = Math.max(opQty, qtdOrig); // Math.max from pedidos.html

            let unitWeight = 0;
            if (item.PESO_UNIT !== undefined && item.PESO_UNIT !== null && item.PESO_UNIT !== '') {
                unitWeight = Number(item.PESO_UNIT);
            } else {
                unitWeight = originalTarget > 0 ? (Number(item.PESO_LIQUIDO_NPR) || 0) / originalTarget : 0;
            }
            return unitWeight * saldoReal;
        }

        let totalWeightIndex = 0;
        let countIndex = 0;
        let totalWeightPedidos = 0;
        let countPedidos = 0;

        data.forEach(item => {
            const pCode = String(item.PRODUTO_PPR || '').trim();
            const isModelo = pCode.endsWith('1');
            const isFaturado = item.FATURADO_PPR === 'T';

            // index.html filter
            if (!isModelo && !isFaturado) {
                totalWeightIndex += getCorrectedWeight_Index(item);
                countIndex++;
            }

            // pedidos.html filter (assuming default chartMode)
            if (!isModelo && !isFaturado) {
                totalWeightPedidos += getCorrectedWeight_Pedidos(item);
                countPedidos++;
            }
        });

        console.log(`Index Simulation: ${(totalWeightIndex / 1000).toFixed(2)} Ton (${countIndex} items)`);
        console.log(`Pedidos Simulation: ${(totalWeightPedidos / 1000).toFixed(2)} Ton (${countPedidos} items)`);

        // Check if excluding 'T' is the issue
        let totalWeightWithT = 0;
        data.forEach(item => {
            const pCode = String(item.PRODUTO_PPR || '').trim();
            if (!pCode.endsWith('1')) {
                totalWeightWithT += getCorrectedWeight_Pedidos(item);
            }
        });
        console.log(`Weight including 'T': ${(totalWeightWithT / 1000).toFixed(2)} Ton`);

        // Check for items with no delivery date that might be blocked but included in total weight
        // ...

    } finally {
        await pool.end();
    }
}

analyze();
