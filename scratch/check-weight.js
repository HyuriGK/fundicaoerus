async function check() {
    try {
        const res = await fetch('http://localhost:3000/api/pedidos-sync?carteiraOnly=true');
        const data = await res.json();
        
        let totalWeight = 0;
        let tWeight = 0;
        let tCount = 0;
        
        data.forEach(item => {
            const prodCode = String(item.PRODUTO_PPR || '').trim();
            const isModelo = prodCode.endsWith('1');
            const isFaturado = item.FATURADO_PPR === 'T';
            
            // Simulation of getCorrectedWeight logic
            const qOrig = Number(item.QUANTIDADE_PPR) || 0;
            const qFat = Number(item.QUANTIDADE_FATURADA_PPR) || 0;
            const saldoLib = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
            const balance = saldoLib > 0 ? saldoLib : Math.max(0, qOrig - qFat);
            
            let unitWeight = 0;
            if (item.PESO_UNIT) unitWeight = Number(item.PESO_UNIT);
            else unitWeight = qOrig > 0 ? (Number(item.PESO_LIQUIDO_NPR) || 0) / qOrig : 0;
            
            const itemWeight = unitWeight * balance;
            
            if (!isModelo) {
                totalWeight += itemWeight;
                if (isFaturado) {
                    tWeight += itemWeight;
                    tCount++;
                }
            }
        });
        
        console.log(`Total Weight (No models): ${(totalWeight/1000).toFixed(2)}t`);
        console.log(`Weight of 'T' items (No models): ${(tWeight/1000).toFixed(2)}t`);
        console.log(`Count of 'T' items: ${tCount}`);
        console.log(`Weight without 'T': ${((totalWeight - tWeight)/1000).toFixed(2)}t`);
        
    } catch (e) {
        console.error(e.message);
    }
}

check();
