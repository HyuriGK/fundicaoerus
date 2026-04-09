const axios = require('axios');

async function analyze() {
    try {
        console.log("Fetching pedidos-sync...");
        const res = await axios.get('http://localhost:3000/api/pedidos-sync');
        const data = res.data;

        console.log("Fetching weights...");
        const wRes = await axios.get('http://localhost:3000/api/weights/list');
        const customWeights = wRes.data;

        // Shared Utils local implementation (simplified for analysis)
        function getCommercialBalance(item) {
            const saldoLib = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
            if (saldoLib > 0) return saldoLib;
            const qtdOrig = Number(item.QUANTIDADE_PPR) || 0;
            const qtdFat = Number(item.QUANTIDADE_FATURADO_PPR || item.QUANTIDADE_FATURADA_PPR) || 0;
            return Math.max(0, qtdOrig - qtdFat);
        }

        function getCorrectedWeight(item, weightsMap = {}) {
            const commercialBalance = getCommercialBalance(item);
            const qtdOrig = Number(item.QUANTIDADE_PPR) || 0;
            const opQty = Number(item.OP_QUANTIDADE) || 0;
            const originalTarget = Math.max(opQty, qtdOrig);

            let unitWeight = 0;
            const prodCode = String(item.PRODUTO_PPR || '').trim();

            if (item.PESO_UNIT !== undefined && item.PESO_UNIT !== null && item.PESO_UNIT !== '' && Number(item.PESO_UNIT) > 0) {
                unitWeight = Number(item.PESO_UNIT);
            } else if (weightsMap[prodCode]) {
                unitWeight = weightsMap[prodCode];
            } else {
                unitWeight = originalTarget > 0 ? (Number(item.PESO_LIQUIDO_NPR) || 0) / originalTarget : 0;
            }
            return unitWeight * commercialBalance;
        }

        // Calculation 1: Like index.html (Excludes models and faturados)
        const filteredIndex = data.filter(item => {
            const pCode = String(item.PRODUTO_PPR || '').trim();
            const isModelo = pCode.endsWith('1');
            const isFaturado = item.FATURADO_PPR === 'T';
            return !isModelo && !isFaturado;
        });

        const totalIndex = filteredIndex.reduce((acc, item) => acc + getCorrectedWeight(item, customWeights), 0);

        // Calculation 2: Like original pedidos.html (Excludes ONLY models)
        const filteredPedidosOld = data.filter(item => {
            const pCode = String(item.PRODUTO_PPR || '').trim();
            const isModelo = pCode.endsWith('1');
            return !isModelo;
        });
        const totalPedidosOld = filteredPedidosOld.reduce((acc, item) => acc + getCorrectedWeight(item, customWeights), 0);

        console.log("-----------------------------------------");
        console.log(`Total Like Index: ${(totalIndex/1000).toFixed(2)} ton`);
        console.log(`Total Like Pedidos (Old): ${(totalPedidosOld/1000).toFixed(2)} ton`);
        console.log("-----------------------------------------");
        
        // Find discrepancy items
        const diff = filteredPedidosOld.filter(p => !filteredIndex.some(i => i.CODIGO_PPR === p.CODIGO_PPR && i.PRODUTO_PPR === p.PRODUTO_PPR));
        console.log(`Items included in Pedidos but not Index: ${diff.length}`);
        
        let diffWeight = 0;
        diff.forEach(d => {
            const w = getCorrectedWeight(d, customWeights);
            diffWeight += w;
            if (w > 100) {
                console.log(`- Item ${d.CODIGO_PPR} / ${d.PRODUTO_PPR}: Weight: ${w.toFixed(2)} kg (FATURADO_PPR: ${d.FATURADO_PPR})`);
            }
        });
        console.log(`Total Diff Weight: ${(diffWeight/1000).toFixed(2)} ton`);

    } catch (err) {
        console.error(err.message);
    }
}

analyze();
