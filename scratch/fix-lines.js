const fs = require('fs');
const filePath = 'public/pedidos.html';
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\r\n');

// Fix line 4103 (0-indexed: 4102) - the corrupted pendingChart function header
const line4103 = lines[4102];
console.log('Before line 4103:', JSON.stringify(line4103).substring(0, 200));

// Replace the corrupted line with proper multi-line content
const fixedLines = [
    '        function updatePendingChart() {',
    '            // Usar allData para consistência com o gráfico Geral',
    '            const pendingList = allData;'
];

lines.splice(4102, 1, ...fixedLines);

// Now fix line 4425 (the historical chart corrupted line)
// After splice, the line numbers shifted by 2
const historicalLineIdx = lines.findIndex((l, i) => i > 4400 && l.includes('selectedMonth === \'Todos\'') && l.includes('\\r\\n'));
if (historicalLineIdx >= 0) {
    console.log('Found corrupted historical line at:', historicalLineIdx + 1);
    console.log('Content preview:', lines[historicalLineIdx].substring(0, 200));
    
    const fixedHistorical = [
        '                    if (selectedMonth === \'Todos\') {',
        '                        if (titleEl) titleEl.innerText = \'Gráfico de Emissão de Pedidos\';',
        '                        ',
        '                        // Usar allData (mesma fonte do gráfico Pendente)',
        '                        const weightData = Array(12).fill(0);',
        '                        const valueData = Array(12).fill(0);',
        '',
        '                        allData.forEach(item => {',
        '                            const d = item.DATA_EMISSAO_PEDIDO ? toLocalDate(item.DATA_EMISSAO_PEDIDO) : null;',
        '                            if (d && d.getFullYear() === selectedYear) {',
        '                                const qOriginal = parseFloat(item.QUANTIDADE_PPR) || 0;',
        '                                const prodCode = String(item.PRODUTO_PPR || \'\').trim();',
        '                                let wUn = 0;',
        '                                if (customWeights[prodCode]) {',
        '                                    wUn = customWeights[prodCode];',
        '                                } else {',
        '                                    wUn = qOriginal > 0 ? (parseFloat(item.PESO_LIQUIDO_NPR) || 0) / qOriginal : 0;',
        '                                }',
        '                                let vUn = parseFloat(item.VALOR_PPR || 0);',
        '                                if (item.PRECO_KG && parseFloat(item.PRECO_KG) > 0 && customWeights[prodCode]) {',
        '                                    vUn = parseFloat(item.PRECO_KG) * wUn;',
        '                                }',
        '                                weightData[d.getMonth()] += wUn * qOriginal;',
        '                                valueData[d.getMonth()] += vUn * qOriginal;',
        '                            }',
        '                        });',
        '',
        '                        if (chartHistorical) chartHistorical.destroy();',
        '                        chartHistorical = new Chart(ctx, {',
        '                            type: \'bar\',',
        '                            data: {',
        '                                labels: monthLabels,',
        '                                datasets: [{',
        '                                    label: \'Peso (kg)\',',
        '                                    data: weightData,',
        '                                    backgroundColor: chartColorAmber,',
        '                                    borderRadius: 4,',
        '                                    extraData: valueData',
        '                                }]',
        '                            },',
        '                            options: getHistoricalOptions(\'kg\', false)',
        '                        });',
        '                    } else {',
        '                        // SELECTED A SPECIFIC MONTH -> SHOW DAILY VIEW',
        '                        const mIdx = parseInt(selectedMonth);',
        '                        const monthName = monthLabels[mIdx - 1];',
        '',
        '                        // Usar allData (mesma fonte do gráfico Pendente)',
        '                        const dailyMap = {};',
        '                        let totalMonthWeight = 0;',
        '                        let totalMonthValue = 0;',
        '',
        '                        allData.forEach(item => {',
        '                            const d = item.DATA_EMISSAO_PEDIDO ? toLocalDate(item.DATA_EMISSAO_PEDIDO) : null;',
        '                            if (d && d.getFullYear() === selectedYear && (d.getMonth() + 1) === mIdx) {',
        '                                const dayNum = d.getDate();',
        '                                if (!dailyMap[dayNum]) dailyMap[dayNum] = { peso: 0, valor: 0 };',
        '                                ',
        '                                const qOriginal = parseFloat(item.QUANTIDADE_PPR) || 0;',
        '                                const prodCode = String(item.PRODUTO_PPR || \'\').trim();',
        '                                let wUn = 0;',
        '                                if (customWeights[prodCode]) {',
        '                                    wUn = customWeights[prodCode];',
        '                                } else {',
        '                                    wUn = qOriginal > 0 ? (parseFloat(item.PESO_LIQUIDO_NPR) || 0) / qOriginal : 0;',
        '                                }',
        '                                const itemWeight = wUn * qOriginal;',
        '                                ',
        '                                let vUn = parseFloat(item.VALOR_PPR || 0);',
        '                                if (item.PRECO_KG && parseFloat(item.PRECO_KG) > 0 && customWeights[prodCode]) {',
        '                                    vUn = parseFloat(item.PRECO_KG) * wUn;',
        '                                }',
        '                                const itemValue = vUn * qOriginal;',
        '',
        '                                dailyMap[dayNum].peso += itemWeight;',
        '                                dailyMap[dayNum].valor += itemValue;',
        '                                totalMonthWeight += itemWeight;',
        '                                totalMonthValue += itemValue;',
        '                            }',
        '                        });'
    ];

    lines.splice(historicalLineIdx, 1, ...fixedHistorical);
    console.log('Historical chart fixed.');
} else {
    console.log('Historical corrupted line not found, checking...');
    // Search broader
    for (let i = 4400; i < 4450; i++) {
        if (lines[i] && lines[i].includes('\\r\\n')) {
            console.log('Found \\r\\n at line', i+1, ':', lines[i].substring(0, 150));
        }
    }
}

content = lines.join('\r\n');
fs.writeFileSync(filePath, content, 'utf8');
console.log('File saved. Total lines:', lines.length);
