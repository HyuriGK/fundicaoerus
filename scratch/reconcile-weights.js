// Simulation of getCommercialBalance from shared-utils.js
function getCommercialBalance(item) {
    if (String(item.FATURADO_PPR || '').trim().toUpperCase() === 'T') return 0;
    const saldoLib = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
    if (saldoLib > 0) return saldoLib;
    const qOrig = Number(item.QUANTIDADE_PPR) || 0;
    const qFat = Number(item.QUANTIDADE_FATURADO_PPR || item.QUANTIDADE_FATURADA_PPR) || 0;
    return Math.max(0, qOrig - qFat);
}

// Simulation of getCorrectedWeight from shared-utils.js
function getCorrectedWeight(item, weightsMap = {}) {
    const balance = getCommercialBalance(item);
    const prodCode = String(item.PRODUTO_PPR || '').trim();
    let unitWeight = 0;
    
    if (item.PESO_UNIT) unitWeight = Number(item.PESO_UNIT);
    else if (weightsMap[prodCode]) unitWeight = weightsMap[prodCode];
    else {
        const qOrig = Number(item.QUANTIDADE_PPR) || 0;
        const opQ = Number(item.OP_QUANTIDADE) || 0;
        const target = Math.max(qOrig, opQ);
        unitWeight = target > 0 ? (Number(item.PESO_LIQUIDO_NPR) || 0) / target : 0;
    }
    return unitWeight * balance;
}

async function reconcile() {
    try {
        const weightsRes = await fetch('http://localhost:3000/api/weights/list');
        const weights = await weightsRes.json();

        const resFull = await fetch('http://localhost:3000/api/pedidos-sync');
        const resCarteira = await fetch('http://localhost:3000/api/pedidos-sync?carteiraOnly=true');
        
        const dataFull = await resFull.json();
        const dataCarteira = await resCarteira.json();

        const calculate = (data, name) => {
            const filtered = data.filter(item => {
                const pCode = String(item.PRODUTO_PPR || '').trim();
                const isModelo = pCode.endsWith('1');
                const isFaturado = String(item.FATURADO_PPR || '').trim().toUpperCase() === 'T';
                return !isModelo && !isFaturado;
            });
            const weight = filtered.reduce((acc, item) => acc + getCorrectedWeight(item, weights), 0);
            console.log(`${name}: ${(weight/1000).toFixed(2)}t (${filtered.length} items)`);
            
            // Debug top 5 items
            filtered.sort((a,b) => getCorrectedWeight(b, weights) - getCorrectedWeight(a, weights));
            console.log("Top 5 Items:");
            filtered.slice(0, 5).forEach(i => {
                console.log(` - Pedido ${i.CODIGO_PPR} | Produto ${i.PRODUTO_PPR} | Peso: ${(getCorrectedWeight(i, weights)/1000).toFixed(2)}t | Status: ${i.STATUS_PPR}`);
            });
            
            return weight;
        };

        console.log("--- Weight Reconciliation ---");
        calculate(dataFull, "Index Logic (Full fetch)");
        calculate(dataCarteira, "Unified Logic (Carteira fetch)");

    } catch (e) {
        console.error("Error:", e.message);
    }
}

reconcile();
