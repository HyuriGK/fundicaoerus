/**
 * Simula EXATAMENTE o cálculo do calculateKPIs do pedidos.html
 * incluindo a deduplicação por OP via addKpi
 */
const pool = require('../lib/db');

async function simularKPIs() {
    try {
        // Buscar os mesmos dados que o frontend usa (via /api/pedidos-sync)
        const result = await pool.query(`
            SELECT data FROM firebird_sync_emissoes
        `);

        const allData = result.rows.map(r => r.data);
        
        // Buscar custom weights
        let customWeights = {};
        try {
            const wRes = await pool.query(`SELECT product_code, weight FROM product_weights`);
            wRes.rows.forEach(r => { customWeights[r.product_code] = parseFloat(r.weight); });
        } catch(e) {}

        console.log(`Total itens carregados: ${allData.length}\n`);

        // Simular calculateKPIs EXATAMENTE como pedidos.html
        let kpiAguardando = { qtd: 0, peso: 0, valor: 0 };
        let kpiMoldagem = { qtd: 0, peso: 0, valor: 0 };
        let kpiFusao = { qtd: 0, peso: 0, valor: 0 };
        let kpiAcabamento = { qtd: 0, peso: 0, valor: 0 };
        let kpiTT = { qtd: 0, peso: 0, valor: 0 };
        let kpiUsinagem = { qtd: 0, peso: 0, valor: 0 };
        let kpiQualidade = { qtd: 0, peso: 0, valor: 0 };
        let kpiExpedicao = { qtd: 0, peso: 0, valor: 0 };

        const addKpi = (kpi, qty, opKey, uW, uP) => {
            if (qty <= 0) return;
            const cleanedOP = String(opKey || '').trim();
            if (cleanedOP && cleanedOP !== '-') {
                if (!kpi._processedOPs) kpi._processedOPs = new Set();
                if (kpi._processedOPs.has(cleanedOP)) return;
                kpi._processedOPs.add(cleanedOP);
            }
            kpi.qtd += qty;
            kpi.peso += uW * qty;
            kpi.valor += uP * qty;
        };

        let totalWeight = 0;
        let skippedBilled = 0;
        let skippedNoOP = 0;
        let processed = 0;

        allData.forEach(item => {
            // Skip billed items (same as frontend)
            if (String(item.FATURADO_PPR || '').trim().toUpperCase() === 'T') {
                skippedBilled++;
                return;
            }

            processed++;

            // getItemSectorMetrics
            const saldoLib = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
            const qtdOrig = Number(item.QUANTIDADE_PPR) || 0;
            const erpFat = Number(item.QUANTIDADE_FATURADO_PPR || item.QUANTIDADE_FATURADA_PPR) || 0;

            let targetTotalQty = Math.max(
                (Number(item.OP_QUANTIDADE) || 0),
                (saldoLib + erpFat),
                qtdOrig
            );

            let cFat = Math.max(Number(item.QTY_FATURAMENTO) || 0, erpFat);
            if (String(item.FATURADO_PPR || '').trim().toUpperCase() === 'T' || (targetTotalQty > 0 && cFat >= targetTotalQty)) {
                cFat = targetTotalQty;
            }

            const rawFaturamento = Math.max(0, Number(item.QTY_FATURAMENTO) || 0);
            const rawExpedicao = Math.max(0, Number(item.QTY_EXPEDICAO) || 0);
            const rawQualidade = Math.max(0, Number(item.QTY_QUALIDADE) || 0);
            const rawUsinagem = Math.max(0, Number(item.QTY_USINAGEM) || 0);
            const rawTT = Math.max(0, Number(item.QTY_TT) || 0);
            const rawAcabamento = Math.max(0, Number(item.QTY_ACABAMENTO) || 0);
            const rawFusao = Math.max(0, Number(item.QTY_FUSAO) || 0);
            const rawMoldada = Math.max(0, Number(item.QTY_MOLDADA) || 0);

            const maxInd = Math.max(rawMoldada, rawFusao, rawAcabamento, rawTT, rawUsinagem, rawQualidade, rawExpedicao);

            if ((cFat > 0 || erpFat > 0) && targetTotalQty > Math.max(cFat, erpFat) && saldoLib <= 0) {
                targetTotalQty = Math.max(cFat, erpFat, maxInd);
            }

            const cExp  = Math.max(cFat,  rawExpedicao);
            const cQual = Math.max(cExp,  rawQualidade);
            const cUsi  = Math.max(cQual, rawUsinagem);
            const cTT   = Math.max(cUsi,  rawTT);
            const cAcab = Math.max(cTT,   rawAcabamento);
            const cFus  = Math.max(cAcab, rawFusao);
            const cMold = Math.max(cFus,  rawMoldada);

            const qExpedicao  = Math.max(0, cExp - cFat);
            const qQualidade  = Math.max(0, cQual - cExp);
            const qUsinagem   = Math.max(0, cUsi - cQual);
            const qTT         = Math.max(0, cTT - cUsi);
            const qAcabamento = Math.max(0, cAcab - cTT);
            const qFusao      = Math.max(0, cFus - cAcab);
            const qMoldada    = Math.max(0, cMold - cFus);
            const qAguardando = Math.max(0, targetTotalQty - cMold);

            // Unit weight (same as frontend)
            const prodCode = String(item.PRODUTO_PPR || '').trim();
            const originalTarget = Math.max((Number(item.OP_QUANTIDADE) || 0), qtdOrig);
            let uW = 0;
            if (item.PESO_UNIT !== undefined && item.PESO_UNIT !== null && item.PESO_UNIT !== '') {
                uW = Number(item.PESO_UNIT);
            } else if (customWeights[prodCode]) {
                uW = customWeights[prodCode];
            } else {
                uW = originalTarget > 0 ? (Number(item.PESO_LIQUIDO_NPR) || 0) / originalTarget : 0;
            }

            // Unit price
            let uP = parseFloat(item.VALOR_PPR || 0);
            if (item.PRECO_KG && parseFloat(item.PRECO_KG) > 0 && customWeights[prodCode]) {
                uP = parseFloat(item.PRECO_KG) * uW;
            }

            // Commercial balance for total weight
            let commercialBalance = 0;
            if (saldoLib > 0) commercialBalance = saldoLib;
            else commercialBalance = Math.max(0, qtdOrig - erpFat);

            totalWeight += uW * commercialBalance;

            const opKey = item.OP_PCS;

            addKpi(kpiExpedicao, qExpedicao, opKey, uW, uP);
            addKpi(kpiQualidade, qQualidade, opKey, uW, uP);
            addKpi(kpiUsinagem, qUsinagem, opKey, uW, uP);
            addKpi(kpiTT, qTT, opKey, uW, uP);
            addKpi(kpiAcabamento, qAcabamento, opKey, uW, uP);
            addKpi(kpiFusao, qFusao, opKey, uW, uP);
            addKpi(kpiMoldagem, qMoldada, opKey, uW, uP);
            addKpi(kpiAguardando, qAguardando, opKey, uW, uP);
        });

        const fundidoGroup = {
            qtd: kpiFusao.qtd + kpiAcabamento.qtd + kpiTT.qtd + kpiUsinagem.qtd + kpiQualidade.qtd + kpiExpedicao.qtd,
            peso: kpiFusao.peso + kpiAcabamento.peso + kpiTT.peso + kpiUsinagem.peso + kpiQualidade.peso + kpiExpedicao.peso,
            valor: kpiFusao.valor + kpiAcabamento.valor + kpiTT.valor + kpiUsinagem.valor + kpiQualidade.valor + kpiExpedicao.valor
        };

        console.log(`Itens processados: ${processed} (${skippedBilled} faturados ignorados)\n`);
        console.log(`=====================================================`);
        console.log(`POSIÇÃO INDUSTRIAL (Simulação exata do frontend)`);
        console.log(`=====================================================\n`);
        console.log(`Peso Total Carteira: ${totalWeight.toFixed(0)} kg\n`);

        const stages = [
            { name: 'Aguardando Moldagem', kpi: kpiAguardando, grp: kpiAguardando.peso },
            { name: 'Fusão',              kpi: kpiMoldagem,    grp: kpiMoldagem.peso },
            { name: '--- Fundido e Seguintes ---', kpi: fundidoGroup, grp: fundidoGroup.peso },
            { name: '  Acabamento (barFusao)',       kpi: kpiFusao,      grp: fundidoGroup.peso },
            { name: '  Trat. Térmico (barAcabamento)', kpi: kpiAcabamento, grp: fundidoGroup.peso },
            { name: '  Usinagem (barTT)',            kpi: kpiTT,         grp: fundidoGroup.peso },
            { name: '  Qualidade (barUsinagem)',      kpi: kpiUsinagem,   grp: fundidoGroup.peso },
            { name: '  Expedição (barQualidade)',     kpi: kpiQualidade,  grp: fundidoGroup.peso },
            { name: '  Faturamento (barExpedicao)',   kpi: kpiExpedicao,  grp: fundidoGroup.peso },
        ];

        stages.forEach(s => {
            const visualPct = s.grp > 0 ? ((s.kpi.peso / s.grp) * 100).toFixed(1) : '0.0';
            const totalPct = totalWeight > 0 ? ((s.kpi.peso / totalWeight) * 100).toFixed(1) : '0.0';
            console.log(`${s.name}`);
            console.log(`    Qtd: ${s.kpi.qtd.toFixed(0)} pçs | Peso: ${s.kpi.peso.toFixed(0)} kg | Largura barra: ${visualPct}% | % Total: ${totalPct}%`);
            console.log('');
        });

        // OPs processadas em kpiTT
        console.log(`\nOPs que entraram em kpiTT (Usinagem):`);
        if (kpiTT._processedOPs) {
            console.log(`  ${kpiTT._processedOPs.size} OPs: ${[...kpiTT._processedOPs].join(', ')}`);
        } else {
            console.log('  Nenhuma OP');
        }

    } catch (err) {
        console.error('Erro:', err);
    } finally {
        await pool.end();
    }
}

simularKPIs();
