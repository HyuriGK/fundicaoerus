const fetch = require('node-fetch'); // Needs to run in an environment with fetch or use a local mock

async function debugWeights() {
    const pRes = await fetch('http://localhost:3000/api/pedidos-sync');
    const pData = await pRes.json();
    
    let customWeightsMap = {};
    const wRes = await fetch('http://localhost:3000/api/weights/list');
    if (wRes.ok) customWeightsMap = await wRes.json();

    function getItemSectorMetrics(item) {
        const saldoLib = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
        const qtdOrig  = Number(item.QUANTIDADE_PPR) || 0;
        const erpFat   = Number(item.QUANTIDADE_FATURADA_PPR) || 0;
        let targetTotalQty = (Number(item.OP_QUANTIDADE) || 0) || (saldoLib > 0 ? (saldoLib + erpFat) : qtdOrig);
        let cFat = Number(item.QTY_FATURAMENTO) || 0;
        if (item.FATURADO_PPR === 'T' || (targetTotalQty > 0 && erpFat >= targetTotalQty)) {
            cFat = targetTotalQty;
        }
        const maxInd = Math.max(
            Number(item.QTY_MOLDADA)    || 0,
            Number(item.QTY_FUSAO)      || 0,
            Number(item.QTY_ACABAMENTO) || 0,
            Number(item.QTY_TT)         || 0,
            Number(item.QTY_USINAGEM)   || 0,
            Number(item.QTY_QUALIDADE)  || 0,
            Number(item.QTY_EXPEDICAO)  || 0
        );
        if ((cFat > 0 || erpFat > 0) && targetTotalQty > Math.max(cFat, erpFat)) {
            targetTotalQty = Math.max(cFat, erpFat, maxInd);
        }
        const cExp  = Math.max(cFat,  Number(item.QTY_EXPEDICAO) || 0);
        const cQual = Math.max(cExp,  Number(item.QTY_QUALIDADE) || 0);
        const cUsi  = Math.max(cQual, Number(item.QTY_USINAGEM) || 0);
        const cTT   = Math.max(cUsi,  Number(item.QTY_TT) || 0);
        const cAcab = Math.max(cTT,   Number(item.QTY_ACABAMENTO) || 0);
        const cFus  = Math.max(cAcab, Number(item.QTY_FUSAO) || 0);
        const cMold = Math.max(cFus,  Number(item.QTY_MOLDADA) || 0);

        const res = {
            qExpedicao:  Math.max(0, cExp - cFat),
            qQualidade:  Math.max(0, cQual - cExp),
            qUsinagem:   Math.max(0, cUsi - cQual),
            qTT:         Math.max(0, cTT - cUsi),
            qAcabamento: Math.max(0, cAcab - cTT),
            qFusao:      Math.max(0, cFus - cAcab),
            qMoldada:    Math.max(0, cMold - cFus),
            qAguardando: Math.max(0, targetTotalQty - cMold),
            targetTotalQty,
            originalTarget: (Number(item.OP_QUANTIDADE) || 0) || qtdOrig
        };
        res.totalBalance = res.qExpedicao + res.qQualidade + res.qUsinagem + res.qTT + res.qAcabamento + res.qFusao + res.qMoldada + res.qAguardando;
        for (let k in res) {
            if (typeof res[k] === 'number' && res[k] < 0.01) res[k] = 0;
        }
        return res;
    }

    function getCorrectedWeight(item) {
        const metrics = getItemSectorMetrics(item);
        const saldoReal = metrics.totalBalance;
        const qtdOriginal = metrics.originalTarget;
        let unitWeight = 0;
        const prodCode = String(item.PRODUTO_PPR || '').trim();
        if (item.PESO_UNIT !== undefined && item.PESO_UNIT !== null && item.PESO_UNIT !== '') {
            unitWeight = Number(item.PESO_UNIT);
        } else if (customWeightsMap[prodCode]) {
            unitWeight = customWeightsMap[prodCode];
        } else {
            unitWeight = qtdOriginal > 0 ? (Number(item.PESO_LIQUIDO_NPR) || 0) / qtdOriginal : 0;
        }
        return unitWeight * saldoReal;
    }

    const filtered = pData.filter(item => {
        const pCode = String(item.PRODUTO_PPR || '').trim();
        return !pCode.endsWith('1');
    });

    const totalKg = filtered.reduce((acc, item) => acc + getCorrectedWeight(item), 0);
    console.log('Total Kg:', totalKg);
    console.log('Total Ton:', totalKg / 1000);
}

debugWeights();
