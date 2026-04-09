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
    let targetTotalQty = Math.max(
        (Number(item.OP_QUANTIDADE) || 0),
        (saldoLib + erpFat),
        qtdOrig
    );

    // Current Billed (Consolidated: Industrial Pointing OR ERP Billing)
    let cFat = Math.max(
        Number(item.QTY_FATURAMENTO) || 0,
        erpFat
    );
    
    if (String(item.FATURADO_PPR || '').trim().toUpperCase() === 'T' || (targetTotalQty > 0 && cFat >= targetTotalQty)) {
        cFat = targetTotalQty;
    }

    // Raw ERP pointings per sector (EXACT factory floor values - "Produzido no Setor")
    const rawFaturamento = Math.max(0, Number(item.QTY_FATURAMENTO) || 0);
    const rawExpedicao   = Math.max(0, Number(item.QTY_EXPEDICAO)   || 0);
    const rawQualidade   = Math.max(0, Number(item.QTY_QUALIDADE)   || 0);
    const rawUsinagem    = Math.max(0, Number(item.QTY_USINAGEM)    || 0);
    const rawTT          = Math.max(0, Number(item.QTY_TT)          || 0);
    const rawAcabamento  = Math.max(0, Number(item.QTY_ACABAMENTO)  || 0);
    const rawFusao       = Math.max(0, Number(item.QTY_FUSAO)       || 0);
    const rawMoldada     = Math.max(0, Number(item.QTY_MOLDADA)     || 0);

    const maxInd = Math.max(rawMoldada, rawFusao, rawAcabamento, rawTT, rawUsinagem, rawQualidade, rawExpedicao);

    // Ghost residue suppression
    if ((cFat > 0 || erpFat > 0) && targetTotalQty > Math.max(cFat, erpFat) && saldoLib <= 0) {
        targetTotalQty = Math.max(cFat, erpFat, maxInd);
    }

    // Aguardando = peças que ainda não entraram na produção
    const qAguardando = Math.max(0, targetTotalQty - Math.max(rawMoldada, cFat));

    const res = {
        // PRODUZIDO NO SETOR (Espelho real do ERP - sem subtração entre etapas)
        qExpedicao:  rawExpedicao,
        qQualidade:  rawQualidade,
        qUsinagem:   rawUsinagem,
        qTT:         rawTT,
        qAcabamento: rawAcabamento,
        qFusao:      rawFusao,
        qMoldada:    rawMoldada,
        qAguardando: qAguardando,
        
        // APONTADOS BRUTOS (compatibilidade - mesmos valores que q*)
        rawFaturamento,
        rawExpedicao,
        rawQualidade,
        rawUsinagem,
        rawTT,
        rawAcabamento,
        rawFusao,
        rawMoldada,

        targetTotalQty,
        originalTarget: Math.max((Number(item.OP_QUANTIDADE) || 0), qtdOrig)
    };

    // Total balance = saldo comercial (para cálculos de peso e valor da carteira)
    res.totalBalance = getCommercialBalance(item);

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
