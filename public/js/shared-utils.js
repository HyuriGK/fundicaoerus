/**
 * Shared Utilities for Weight and Industrial Metrics Calculation
 * Synchronized across Dashboard (index.html) and Orders (pedidos.html)
 */

/**
 * Calculates the current commercial balance of an item.
 * Prioritizes the ERP's 'SALDO_LIBERADO_FATURAR_PPR'.
 */
function getCommercialBalance(item) {
    // 0. Safety filter: If marked as totally billed ('T'), commercial balance is 0.
    if (String(item.FATURADO_PPR || '').trim().toUpperCase() === 'T') {
        return 0;
    }

    const saldoLib = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
    if (saldoLib > 0) return saldoLib;
    
    // Fallback: Total quantity - Billed quantity (if SALDO_LIBERADO is 0 or missing)
    const qtdOrig = Number(item.QUANTIDADE_PPR) || 0;
    const qtdFat = Number(item.QUANTIDADE_FATURADO_PPR || item.QUANTIDADE_FATURADA_PPR) || 0;
    return Math.max(0, qtdOrig - qtdFat);
}

/**
 * Calculates industrial metrics (balances per sector) for a given item.
 * Logic synchronized with the Orders Dashboard.
 */
function getItemSectorMetrics(item) {
    const saldoLib = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
    const qtdOrig = Number(item.QUANTIDADE_PPR) || 0;
    const erpFat = Number(item.QUANTIDADE_FATURADO_PPR || item.QUANTIDADE_FATURADA_PPR) || 0;
    
    // Target Total Quantity: Max between OP, Commercial Balance + Billed, or Original.
    // This ensures that if production was requested above the original order, we reflect it.
    let targetTotalQty = Math.max(
        (Number(item.OP_QUANTIDADE) || 0),
        (saldoLib + erpFat),
        qtdOrig
    );

    // Current Billed (Consolidated: Industrial Pointing OR ERP Billing)
    // This ensures that if the ERP billed it, the industrial sectors are cleared.
    let cFat = Math.max(
        Number(item.QTY_FATURAMENTO) || 0,
        erpFat
    );
    
    // Force enclosure if marked as fully billed 'T' or if consolidated billing covers the target
    if (String(item.FATURADO_PPR || '').trim().toUpperCase() === 'T' || (targetTotalQty > 0 && cFat >= targetTotalQty)) {
        cFat = targetTotalQty;
    }

    // Physical production levels (Sectors)
    const maxInd = Math.max(
        Number(item.QTY_MOLDADA)    || 0,
        Number(item.QTY_FUSAO)      || 0,
        Number(item.QTY_ACABAMENTO) || 0,
        Number(item.QTY_TT)         || 0,
        Number(item.QTY_USINAGEM)   || 0,
        Number(item.QTY_QUALIDADE)  || 0,
        Number(item.QTY_EXPEDICAO)  || 0
    );

    // Ghost residue suppression: If billing started and balance is commercial-only (saldoLib <= 0),
    // cap the meta at the physical max to avoid 'Aguardando' noise.
    if ((cFat > 0 || erpFat > 0) && targetTotalQty > Math.max(cFat, erpFat) && saldoLib <= 0) {
        targetTotalQty = Math.max(cFat, erpFat, maxInd);
    }

    // Tier calculation (Cumulative levels for visual bars)
    const cExp  = Math.max(cFat,  Number(item.QTY_EXPEDICAO) || 0);
    const cQual = Math.max(cExp,  Number(item.QTY_QUALIDADE) || 0);
    const cUsi  = Math.max(cQual, Number(item.QTY_USINAGEM) || 0);
    const cTT   = Math.max(cUsi,  Number(item.QTY_TT) || 0);
    const cAcab = Math.max(cTT,   Number(item.QTY_ACABAMENTO) || 0);
    const cFus  = Math.max(cAcab, Number(item.QTY_FUSAO) || 0);
    const cMold = Math.max(cFus,  Number(item.QTY_MOLDADA) || 0);

    const res = {
        // SALDOS (Localized balance)
        qExpedicao:  Math.max(0, cExp - cFat),
        qQualidade:  Math.max(0, cQual - cExp),
        qUsinagem:   Math.max(0, cUsi - cQual),
        qTT:         Math.max(0, cTT - cUsi),
        qAcabamento: Math.max(0, cAcab - cTT),
        qFusao:      Math.max(0, cFus - cAcab),
        qMoldada:    Math.max(0, cMold - cFus),
        qAguardando: Math.max(0, targetTotalQty - cMold),
        
        // APONTADOS BRUTOS (As per ERP pointings)
        rawFaturamento: Math.max(0, Number(item.QTY_FATURAMENTO) || 0),
        rawExpedicao:   Math.max(0, Number(item.QTY_EXPEDICAO)   || 0),
        rawQualidade:   Math.max(0, Number(item.QTY_QUALIDADE)   || 0),
        rawUsinagem:    Math.max(0, Number(item.QTY_USINAGEM)    || 0),
        rawTT:          Math.max(0, Number(item.QTY_TT)          || 0),
        rawAcabamento:  Math.max(0, Number(item.QTY_ACABAMENTO)  || 0),
        rawFusao:       Math.max(0, Number(item.QTY_FUSAO)       || 0),
        rawMoldada:     Math.max(0, Number(item.QTY_MOLDADA)     || 0),

        targetTotalQty,
        originalTarget: Math.max((Number(item.OP_QUANTIDADE) || 0), qtdOrig)
    };

    res.totalBalance = res.qExpedicao + res.qQualidade + res.qUsinagem + res.qTT + res.qAcabamento + res.qFusao + res.qMoldada + res.qAguardando;

    // Threshold filter (suppress noise < 0.01 units)
    for (let k in res) {
        if (typeof res[k] === 'number' && res[k] < 0.01) res[k] = 0;
    }

    return res;
}

/**
 * Calculates the corrected weight based on custom weights map and industry metrics.
 */
function getCorrectedWeight(item, weightsMap = {}) {
    const commercialBalance = getCommercialBalance(item);
    const metrics = getItemSectorMetrics(item);
    const originalTarget = metrics.originalTarget;

    let unitWeight = 0;
    const prodCode = String(item.PRODUTO_PPR || '').trim();

    // 1. Priority: Fixed PESO_UNIT if present in the data item
    if (item.PESO_UNIT !== undefined && item.PESO_UNIT !== null && item.PESO_UNIT !== '' && Number(item.PESO_UNIT) > 0) {
        unitWeight = Number(item.PESO_UNIT);
    } 
    // 2. Secondary: Custom Weights Map (Manual overwrites)
    else if (weightsMap[prodCode]) {
        unitWeight = weightsMap[prodCode];
    } 
    // 3. Fallback: Calculated from Net Weight / Original Target
    else {
        unitWeight = originalTarget > 0 ? (Number(item.PESO_LIQUIDO_NPR) || 0) / originalTarget : 0;
    }

    return unitWeight * commercialBalance;
}

// Export for Node environments (like analysis scripts) if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getCommercialBalance, getItemSectorMetrics, getCorrectedWeight };
}
