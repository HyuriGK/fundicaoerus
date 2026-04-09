const axios = require('axios');

async function analyze() {
    try {
        const res = await axios.get('http://localhost:3000/api/pedidos-sync');
        const data = res.data;

        console.log(`Total items from API: ${data.length}`);

        // Helper equivalent to the one in both files
        function getCommercialBalance(item) {
            const saldoLib = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
            if (saldoLib > 0) return saldoLib;
            const qtdOrig = Number(item.QUANTIDADE_PPR) || 0;
            const qtdFat = Number(item.QUANTIDADE_FATURADO_PPR || item.QUANTIDADE_FATURADA_PPR) || 0;
            return Math.max(0, qtdOrig - qtdFat);
        }

        function getCorrectedWeight(item) {
            const saldoReal = getCommercialBalance(item);
            
            // Metrics (Simplified for simulation)
            const qtdOrig = Number(item.QUANTIDADE_PPR) || 0;
            const opQty = Number(item.OP_QUANTIDADE) || 0;
            const originalTarget = Math.max(opQty, qtdOrig);

            let unitWeight = 0;
            const prodCode = String(item.PRODUTO_PPR || '').trim();

            if (item.PESO_UNIT !== undefined && item.PESO_UNIT !== null && item.PESO_UNIT !== '') {
                unitWeight = Number(item.PESO_UNIT);
            } else {
                unitWeight = originalTarget > 0 ? (Number(item.PESO_LIQUIDO_NPR) || 0) / originalTarget : 0;
            }

            return unitWeight * saldoReal;
        }

        // SIMULATION index.html (My recent change)
        const indexFiltered = data.filter(item => {
            const pCode = String(item.PRODUTO_PPR || '').trim();
            const isModelo = pCode.endsWith('1');
            const isFaturado = item.FATURADO_PPR === 'T';
            return !isModelo && !isFaturado;
        });
        const indexTotalWeight = indexFiltered.reduce((acc, item) => acc + getCorrectedWeight(item), 0);
        console.log(`index.html total: ${(indexTotalWeight / 1000).toFixed(2)} Ton (${indexFiltered.length} items)`);

        // SIMULATION pedidos.html (Initial load)
        const pedidosFiltered = data.filter(item => {
            const pCode = String(item.PRODUTO_PPR || '').trim();
            const isModelo = pCode.endsWith('1'); // isModelosHidden = true
            // In pedidos.html, it excludes 'T' by default in applyColumnFilters
            const isFaturado = item.FATURADO_PPR === 'T';
            return !isModelo && !isFaturado;
        });
        const pedidosTotalWeight = pedidosFiltered.reduce((acc, item) => acc + getCorrectedWeight(item), 0);
        console.log(`pedidos.html total: ${(pedidosTotalWeight / 1000).toFixed(2)} Ton (${pedidosFiltered.length} items)`);

        // What if we DON'T filter 'T'?
        const noFilterFiltered = data.filter(item => {
            const pCode = String(item.PRODUTO_PPR || '').trim();
            const isModelo = pCode.endsWith('1');
            return !isModelo;
        });
        const noFilterTotalWeight = noFilterFiltered.reduce((acc, item) => acc + getCorrectedWeight(item), 0);
        console.log(`No 'T' filter total: ${(noFilterTotalWeight / 1000).toFixed(2)} Ton (${noFilterFiltered.length} items)`);

        // What if we filter by status like in older versions?
        // Some previous logic filtered out items with STATUS_PED === 'B' from "Released" weight, 
        // but the main "Peso Total" KPI usually included them.

    } catch (e) {
        console.error(e.message);
    }
}

analyze();
