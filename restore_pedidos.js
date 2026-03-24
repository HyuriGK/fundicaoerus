const fs = require('fs');
const path = 'c:/Users/brasi/Desktop/server/public/pedidos.html';
let content = fs.readFileSync(path, 'utf8');

const startMarker = 'function calculateKPIs(list) {';
const endMarker = 'function toggleProductionStage() {';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error('Markers not found', startIndex, endIndex);
    process.exit(1);
}

const calculateKPIs = `        function calculateKPIs(list) {
            // Initial Totals
            let totalWeight = 0;
            let totalValue = 0;
            let totalQty = 0;
            let releasedWeight = 0; // Com data de entrega

            // Stage KPIs (Now detailed by sector)
            let kpiAguardando = { qtd: 0, peso: 0, valor: 0 };
            let kpiMoldagem = { qtd: 0, peso: 0, valor: 0 };
            let kpiFusao = { qtd: 0, peso: 0, valor: 0 };
            let kpiAcabamento = { qtd: 0, peso: 0, valor: 0 };
            let kpiTT = { qtd: 0, peso: 0, valor: 0 };
            let kpiUsinagem = { qtd: 0, peso: 0, valor: 0 };
            let kpiQualidade = { qtd: 0, peso: 0, valor: 0 };
            let kpiExpedicao = { qtd: 0, peso: 0, valor: 0 };


            list.forEach(item => {
                const itemTotalWeight = getCorrectedWeight(item);
                const saldo = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
                const qtdOriginal = Number(item.QUANTIDADE_PPR) || 0;
                const realQty = saldo > 0 ? saldo : qtdOriginal;

                totalWeight += itemTotalWeight;

                let unitPrice = parseFloat(item.VALOR_PPR || 0);
                if (item.PRECO_KG && parseFloat(item.PRECO_KG) > 0 && customWeights[item.PRODUTO_PPR]) {
                    let unitW = realQty > 0 ? (itemTotalWeight / realQty) : 0;
                    unitPrice = parseFloat(item.PRECO_KG) * unitW;
                }
                const itemTotalValue = unitPrice * realQty;

                totalValue += itemTotalValue;
                totalQty += realQty;

                const hasDate = item.ENTREGA_PETR || item.DATA_ENTREGA_PPR;
                if (hasDate) releasedWeight += itemTotalWeight;

                // Quantities for Progress Calculation (Limited by Commercial Order)
                const totalInitialQty = Number(item.QUANTIDADE_PPR) || 0;
                const currentBalance = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
                const invoicedQty = Math.max(0, totalInitialQty - currentBalance);
                const targetTotalQty = totalInitialQty; // The Goal is the Order
                
                // 1. Get Cumulative Totals (Removed cap to allow industrial reality to show even if over order qty)
                // Hierarchy: Expedição → Qualidade → Usinagem → TT → Acabamento → Fusão → Moldada → Aguardando
                const cExp  = Number(item.QTY_EXPEDICAO) || 0;
                const cQual = Math.max(cExp,  Number(item.QTY_QUALIDADE) || 0);
                const cUsi  = Math.max(cQual, Number(item.QTY_USINAGEM) || 0);
                const cTT   = Math.max(cUsi,  Number(item.QTY_TT) || 0);
                const cAcab = Math.max(cTT,   Number(item.QTY_ACABAMENTO) || 0);
                const cFus  = Math.max(cAcab, Number(item.QTY_FUSAO) || 0);
                const cMold = Math.max(cFus,  Number(item.QTY_MOLDADA) || 0);

                // 2. Differential Logic (Current = Cumulative - Next)
                let qExpedicao   = Math.max(0, cExp - invoicedQty);
                let qQualidade   = Math.max(0, cQual - cExp);
                let qUsinagem    = Math.max(0, cUsi - cQual);
                let qTT          = Math.max(0, cTT - cUsi);
                let qAcabamento  = Math.max(0, cAcab - cTT);
                let qFusao       = Math.max(0, cFus - cAcab);
                let qMoldada     = Math.max(0, cMold - cFus);
                let qAguardando  = Math.max(0, targetTotalQty - cMold);

                // Suppress noise
                if (qExpedicao < 0.01) qExpedicao = 0;
                if (qQualidade < 0.01) qQualidade = 0;
                if (qUsinagem < 0.01) qUsinagem = 0;
                if (qTT < 0.01) qTT = 0;
                if (qAcabamento < 0.01) qAcabamento = 0;
                if (qFusao < 0.01) qFusao = 0;
                if (qMoldada < 0.01) qMoldada = 0;
                if (qAguardando < 0.01) qAguardando = 0;

                const unitW = realQty > 0 ? (itemTotalWeight / realQty) : 0;
                const valW = realQty > 0 ? (itemTotalValue / realQty) : 0;

                kpiAguardando.qtd += qAguardando;
                kpiAguardando.peso += qAguardando * unitW;
                kpiAguardando.valor += qAguardando * valW;

                kpiMoldagem.qtd += qMoldada;
                kpiMoldagem.peso += qMoldada * unitW;
                kpiMoldagem.valor += qMoldada * valW;

                kpiFusao.qtd += qFusao;
                kpiFusao.peso += qFusao * unitW;
                kpiFusao.valor += qFusao * valW;

                kpiAcabamento.qtd += qAcabamento;
                kpiAcabamento.peso += qAcabamento * unitW;
                kpiAcabamento.valor += qAcabamento * valW;

                kpiTT.qtd += qTT;
                kpiTT.peso += qTT * unitW;
                kpiTT.valor += qTT * valW;

                kpiUsinagem.qtd += qUsinagem;
                kpiUsinagem.peso += qUsinagem * unitW;
                kpiUsinagem.valor += qUsinagem * valW;

                kpiQualidade.qtd += qQualidade;
                kpiQualidade.peso += qQualidade * unitW;
                kpiQualidade.valor += qQualidade * valW;

                kpiExpedicao.qtd += qExpedicao;
                kpiExpedicao.peso += qExpedicao * unitW;
                kpiExpedicao.valor += qExpedicao * valW;
            });

            // Update DOM Elements for Total Header
            const totalWeightEl = document.getElementById('totalWeight');
            const totalValueEl = document.getElementById('totalValue');
            const totalQtyEl = document.getElementById('totalItems');
            const releasedWeightEl = document.getElementById('releasedWeight');

            if (totalWeightEl) totalWeightEl.innerText = formatNumber(totalWeight, 0);
            if (totalValueEl) totalValueEl.innerText = valorVisible ? formatCurrency(totalValue) : '-----';
            if (totalQtyEl) totalQtyEl.innerText = totalQty.toLocaleString('pt-BR');
            if (releasedWeightEl) releasedWeightEl.innerText = formatNumber(releasedWeight, 0);

            // Calculate Blocked Weight
            const blockedWeight = totalWeight - releasedWeight;
            const blockedWeightEl = document.getElementById('blockedWeight');
            if (blockedWeightEl) blockedWeightEl.innerText = formatNumber(blockedWeight, 0);

            // Update Stage Cards
            updateStageCard('groupAguardando', kpiAguardando, totalWeight);
            updateStageCard('groupMoldado', kpiMoldagem, totalWeight);
            updateStageCard('barFusao', kpiFusao, totalWeight);
            updateStageCard('barAcabamento', kpiAcabamento, totalWeight);
            updateStageCard('barTT', kpiTT, totalWeight);
            updateStageCard('barUsinagem', kpiUsinagem, totalWeight);
            updateStageCard('barQualidade', kpiQualidade, totalWeight);
            updateStageCard('barExpedicao', kpiExpedicao, totalWeight);
        }`;

const updateStageCard = `        function updateStageCard(idPrefix, data, globalTotalWeight) {
            const card = document.getElementById(idPrefix + 'Container') || document.getElementById(idPrefix);
            const totals = document.getElementById(idPrefix + 'Totals');
            const bar = document.getElementById(idPrefix.replace('group', 'bar'));

            if (!card || !totals) return;

            const percentage = globalTotalWeight > 0 ? (data.peso / globalTotalWeight) * 100 : 0;
            const valorStr = valorVisible ? formatCurrency(data.valor) : '-----';

            totals.innerText = \`\${Math.round(data.qtd)} pçs | \${formatNumber(data.peso, 0)} kg | \${valorStr}\`;
            
            if (bar) {
                bar.style.width = percentage + '%';
            } else if (idPrefix.includes('group')) {
                const innerBar = card.querySelector('.bar-segment');
                if (innerBar) innerBar.style.width = percentage + '%';
            }
        }`;

const applyColumnFilters = `        function applyColumnFilters() {
            const inputs = document.querySelectorAll('.filter-input-table');

            const isHistorical = document.getElementById('recordsModal').classList.contains('hide-op-column');

            const fieldMap = {
                '0': 'CODIGO_PPR',
                '1': isHistorical ? 'DATA_EMISSAO_PEDIDO' : 'ENTREGA_PETR',
                '2': 'NOME_CLIENTE',
                '3': 'PRODUTO_PPR',
                '4': 'NOME_PRODUTO_PPR',
                '5': 'QUANTIDADE_PPR',
                '6': 'PESO_UNIT',
                '7': 'PESO_LIQUIDO_NPR',
                '8': 'VALOR_TOTAL',
                '9': 'OP_PCS'
            };

            const filters = {};
            inputs.forEach(inp => {
                const fieldName = fieldMap[inp.dataset.col];
                if (fieldName) {
                    filters[fieldName] = inp.value.trim().toLowerCase();
                }
            });

            const filterOC = document.getElementById('filterOC')?.value.trim().toLowerCase() || '';
            const filterMaterial = document.getElementById('filterMaterial')?.value.trim().toLowerCase() || '';
            const filterLote = document.getElementById('filterLote')?.value.trim().toLowerCase() || '';
            const filterDateStart = document.getElementById('filterDateStart')?.value || '';
            const filterDateEnd = document.getElementById('filterDateEnd')?.value || '';
            const filterEmissionStart = document.getElementById('filterEmissionStart')?.value || '';
            const filterEmissionEnd = document.getElementById('filterEmissionEnd')?.value || '';

            const filtered = allData.filter(item => {
                if (isModelosHidden) {
                    const prodCode = String(item.PRODUTO_PPR || '').trim();
                    if (prodCode.endsWith('1')) return false;
                }

                if (activeChartFilters.month !== null) {
                    let dateField = (chartMode === 'emission_pending') ? item.DATA_EMISSAO_PEDIDO : item.ENTREGA_PETR;
                    if (!dateField) return false;
                    const d = new Date(dateField);
                    if (d.getMonth() !== activeChartFilters.month) return false;
                    const yearEl = document.getElementById('chartYearFilter');
                    const selectedYear = yearEl ? (parseInt(yearEl.value) || new Date().getFullYear()) : new Date().getFullYear();
                    if (d.getFullYear() !== selectedYear) return false;
                }

                if (activeChartFilters.client !== null) {
                    if (item.ID_CLIENTE_CORE != activeChartFilters.client) return false;
                }

                if (filterOC && !String(item.ORDEM_COMPRA_PPR || '').toLowerCase().includes(filterOC)) return false;
                if (filterMaterial && !String(item.NOME_MATERIAL || '').toLowerCase().includes(filterMaterial)) return false;
                if (filterLote && !String(item.LOTE_PCS || '').toLowerCase().includes(filterLote)) return false;

                if (filterDateStart || filterDateEnd) {
                    const entregaDate = item.ENTREGA_PETR ? new Date(item.ENTREGA_PETR) : (item.DATA_ENTREGA_PPR ? new Date(item.DATA_ENTREGA_PPR) : null);
                    if (!entregaDate) return false;
                    entregaDate.setHours(0, 0, 0, 0);
                    if (filterDateStart && entregaDate < getLocalMidnight(filterDateStart)) return false;
                    if (filterDateEnd && entregaDate > getLocalMidnight(filterDateEnd)) return false;
                }

                if (filterEmissionStart || filterEmissionEnd) {
                    const emissionDate = item.DATA_EMISSAO_PEDIDO ? new Date(item.DATA_EMISSAO_PEDIDO) : null;
                    if (!emissionDate) return false;
                    emissionDate.setHours(0, 0, 0, 0);
                    if (filterEmissionStart && emissionDate < getLocalMidnight(filterEmissionStart)) return false;
                    if (filterEmissionEnd && emissionDate > getLocalMidnight(filterEmissionEnd)) return false;
                }

                const filtersPassed = Object.entries(filters).every(([key, value]) => {
                    if (!value) return true;
                    if (key === 'CODIGO_PPR') {
                        if (value === 'block') return !item.ENTREGA_PETR && !item.DATA_ENTREGA_PPR;
                        return String(item[key]) === value;
                    }
                    if (key === 'PESO_LIQUIDO_NPR') return item[key] == value.replace(',', '.');
                    if (key === 'PESO_UNIT') {
                        const qtd = Number(item.QUANTIDADE_PPR) || 0;
                        let uW = qtd > 0 ? ((Number(item.PESO_LIQUIDO_NPR) || 0) / qtd) : 0;
                        if (uW === 0 && customWeights[item.PRODUTO_PPR]) uW = customWeights[item.PRODUTO_PPR];
                        return formatNumber(uW) === value;
                    }
                    let itemVal = String(item[key] || '');
                    if ((key === 'ENTREGA_PETR' || key === 'DATA_EMISSAO_PEDIDO') && item[key]) itemVal += ' ' + new Date(item[key]).toLocaleDateString();
                    return itemVal.toLowerCase().includes(value);
                });

                if (!filtersPassed) return false;

                if (activeChartFilters.stage) {
                    const s = activeChartFilters.stage;
                    const totalInitialQty = Number(item.QUANTIDADE_PPR) || 0;
                    const currentBalance = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
                    const invoicedQty = Math.max(0, totalInitialQty - currentBalance);

                    const cExp  = Number(item.QTY_EXPEDICAO) || 0;
                    const cQual = Math.max(cExp,  Number(item.QTY_QUALIDADE) || 0);
                    const cUsi  = Math.max(cQual, Number(item.QTY_USINAGEM) || 0);
                    const cTT   = Math.max(cUsi,  Number(item.QTY_TT) || 0);
                    const cAcab = Math.max(cTT,   Number(item.QTY_ACABAMENTO) || 0);
                    const cFus  = Math.max(cAcab, Number(item.QTY_FUSAO) || 0);
                    const cMold = Math.max(cFus,  Number(item.QTY_MOLDADA) || 0);

                    let qExpedicao   = Math.max(0, cExp - invoicedQty);
                    let qQualidade   = Math.max(0, cQual - cExp);
                    let qUsinagem    = Math.max(0, cUsi - cQual);
                    let qTT          = Math.max(0, cTT - cUsi);
                    let qAcabamento  = Math.max(0, cAcab - cTT);
                    let qFusao       = Math.max(0, cFus - cAcab);
                    let qMoldada     = Math.max(0, cMold - cFus);
                    let qAguardando  = Math.max(0, totalInitialQty - cMold);

                    if (qExpedicao < 0.01) qExpedicao = 0;
                    if (qQualidade < 0.01) qQualidade = 0;
                    if (qUsinagem < 0.01) qUsinagem = 0;
                    if (qTT < 0.01) qTT = 0;
                    if (qAcabamento < 0.01) qAcabamento = 0;
                    if (qFusao < 0.01) qFusao = 0;
                    if (qMoldada < 0.01) qMoldada = 0;
                    if (qAguardando < 0.01) qAguardando = 0;

                    if (s === 'aguardando') return qAguardando > 0.01;
                    if (s === 'moldagem') return qMoldada > 0.01;
                    if (s === 'fusao') return qFusao > 0.01;
                    if (s === 'acabamento') return qAcabamento > 0.01;
                    if (s === 'tt') return qTT > 0.01;
                    if (s === 'usinagem') return qUsinagem > 0.01;
                    if (s === 'qualidade') return qQualidade > 0.01;
                    if (s === 'expedicao') return qExpedicao > 0.01;
                }
                
                if (item.FATURADO_PPR === 'T') return false;
                return true; 
            });

            currentFilteredData = filtered; 
            renderTable(filtered);
            if (typeof calculateKPIs === 'function') calculateKPIs(filtered);
            updateCharts(filtered);
        }`;

const newBlock = calculateKPIs + "\\n\\n" + updateStageCard + "\\n\\n" + applyColumnFilters + "\\n\\n";

const prefix = content.substring(0, startIndex);
const suffix = content.substring(endIndex);

fs.writeFileSync(path, prefix + newBlock + suffix);
console.log('Restoration completed');
