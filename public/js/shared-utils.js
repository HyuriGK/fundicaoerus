/**
 * Shared Utilities for Weight and Industrial Metrics Calculation
 * Synchronized across Dashboard (index.html) and Orders (pedidos.html)
 */

/**
 * Calculates the current commercial balance of an item.
 * Prioritizes the ERP's 'SALDO_LIBERADO_FATURAR_PPR'.
 */
function getCommercialBalance(item) {
    // Se estivermos visualizando o histórico completo (Gráfico de Emissão Geral)
    // O Saldo Comercial da peça não diz respeito a quanto "falta entregar" (0 se faturado)
    // Mas sim ao total bruto emitido no pedido originalmente!
    if (typeof window !== 'undefined' && typeof chartMode !== 'undefined' && chartMode === 'emission_total') {
        return Number(item.QUANTIDADE_PPR) || 0;
    }

    // 0. Safety filter: If marked as totally billed ('T'), commercial balance is 0.
    if (String(item.FATURADO_PPR || '').trim().toUpperCase() === 'T') {
        return 0;
    }

    // New: Support for OP-based data from sync-master.js
    // If we have OP_QUANTIDADE but no billing saldo fields, assume the OP quantity is the pending balance
    if (item.OP_QUANTIDADE !== undefined && item.SALDO_LIBERADO_FATURAR_PPR === undefined && item.QUANTIDADE_FATURADO_PPR === undefined) {
        return Number(item.OP_QUANTIDADE) || 0;
    }

    const qtdDesistencia = Number(item.QUANTIDADE_DESISTENCIA_PPR) || 0;

    const saldoLib = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
    if (saldoLib > 0) return Math.max(0, saldoLib - qtdDesistencia);

    // Fallback: Total quantity - Billed quantity - Desistência
    const qtdOrig = Number(item.QUANTIDADE_PPR) || 0;
    const qtdFat = Number(item.QUANTIDADE_FATURADO_PPR || item.QUANTIDADE_FATURADA_PPR) || 0;
    return Math.max(0, qtdOrig - qtdFat - qtdDesistencia);
}

/**
 * Calculates industrial metrics (balances per sector) for a given item.
 * Logic synchronized with the Orders Dashboard.
 */
function getItemSectorMetrics(item) {
    const saldoLib = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
    const qtdOrig = Number(item.QUANTIDADE_PPR) || 0;
    const erpFat = Number(item.QUANTIDADE_FATURADO_PPR || item.QUANTIDADE_FATURADA_PPR) || 0;
    
    // Target Total Quantity
    let targetTotalQty = Math.max(
        (Number(item.OP_QUANTIDADE) || 0),
        (saldoLib + erpFat),
        qtdOrig
    );

    // Faturamento consolidado
    let cFat = Math.max(
        Number(item.QTY_FATURAMENTO) || 0,
        erpFat
    );
    
    if (String(item.FATURADO_PPR || '').trim().toUpperCase() === 'T' || (targetTotalQty > 0 && cFat >= targetTotalQty)) {
        cFat = targetTotalQty;
    }

    // REFUGOS POR SETOR (peças que morreram em cada etapa)
    const refugoMoldagem  = Math.max(0, Number(item.REFUGO_MOLDAGEM)  || 0);
    const refugoFusao     = Math.max(0, Number(item.REFUGO_FUSAO)     || 0);
    const refugoAcabamento= Math.max(0, Number(item.REFUGO_ACABAMENTO)|| 0);
    const refugoTT        = Math.max(0, Number(item.REFUGO_TT)        || 0);
    const refugoUsinagem  = Math.max(0, Number(item.REFUGO_USINAGEM)  || 0);
    const refugoQualidade = Math.max(0, Number(item.REFUGO_QUALIDADE) || 0);
    const refugoExpedicao = Math.max(0, Number(item.REFUGO_EXPEDICAO) || 0);

    // PRODUZIDO por setor (líquido de refugo — o que pode avançar para o próximo setor)
    const rawFaturamento = Math.max(0, Number(item.QTY_FATURAMENTO) || 0);
    const rawExpedicao   = Math.max(0, Number(item.QTY_EXPEDICAO)   || 0);
    const rawQualidade   = Math.max(0, (Number(item.QTY_QUALIDADE)   || 0) - refugoQualidade);
    const rawUsinagem    = Math.max(0, (Number(item.QTY_USINAGEM)    || 0) - refugoUsinagem);
    const rawTT          = Math.max(0, (Number(item.QTY_TT)          || 0) - refugoTT);
    const rawAcabamento  = Math.max(0, (Number(item.QTY_ACABAMENTO)  || 0) - refugoAcabamento);
    const rawFusao       = Math.max(0, (Number(item.QTY_FUSAO)       || 0) - refugoFusao);
    const rawMoldada     = Math.max(0, (Number(item.QTY_MOLDADA)     || 0) - refugoMoldagem);

    // APONTADO por setor (bruto, sem deduzir refugo — barreira de entrada no setor)
    // Peça apontada em X já saiu da fila do setor anterior, independente do resultado
    const apontadoExpedicao  = Math.max(0, Number(item.QTY_EXPEDICAO)  || 0); // já é bruto (igual rawExpedicao)
    const apontadoQualidade  = Math.max(0, Number(item.QTY_QUALIDADE)  || 0);
    const apontadoUsinagem   = Math.max(0, Number(item.QTY_USINAGEM)   || 0);
    const apontadoTT         = Math.max(0, Number(item.QTY_TT)         || 0);
    const apontadoAcabamento = Math.max(0, Number(item.QTY_ACABAMENTO) || 0);
    const apontadoFusao      = Math.max(0, Number(item.QTY_FUSAO)      || 0);

    const maxInd = Math.max(rawMoldada, rawFusao, rawAcabamento, rawTT, rawUsinagem, rawQualidade, rawExpedicao);

    // Ghost residue suppression
    if ((cFat > 0 || erpFat > 0) && targetTotalQty > Math.max(cFat, erpFat) && saldoLib <= 0) {
        targetTotalQty = Math.max(cFat, erpFat, maxInd);
    }

    // Cadeia de saída (PRODUZIDO) — quanto pode avançar para o setor seguinte
    const cExp  = Math.max(cFat,  rawExpedicao);
    const cQual = Math.max(cExp,  rawQualidade);
    const cUsi  = Math.max(cQual, rawUsinagem);
    const cTT   = Math.max(cUsi,  rawTT);
    const cAcab = Math.max(cTT,   rawAcabamento);
    const cFus  = Math.max(cAcab, rawFusao);

    // Cadeia de entrada (APONTADO) — quantas peças já entraram em cada setor
    // Usada como barreira para calcular o saldo do setor anterior
    const cExpIn  = cExp; // rawExpedicao já é bruto (sem refugo), igual a apontadoExpedicao
    const cQualIn = Math.max(cExpIn,  apontadoQualidade);
    const cUsiIn  = Math.max(cQualIn, apontadoUsinagem);
    const cTTIn   = Math.max(cUsiIn,  apontadoTT);
    const cAcabIn = Math.max(cTTIn,   apontadoAcabamento);
    const cFusIn  = Math.max(cAcabIn, apontadoFusao);
    const cMold   = Math.max(cFusIn,  rawMoldada);

    const res = {
        // SALDO POR SETOR: PRODUZIDO do setor atual − APONTADO do setor seguinte
        qExpedicao:  Math.max(0, cExp  - cFat),
        qQualidade:  Math.max(0, cQual - cExpIn),
        qUsinagem:   Math.max(0, cUsi  - cQualIn),
        qTT:         Math.max(0, cTT   - cUsiIn),
        qAcabamento: Math.max(0, cAcab - cTTIn),
        qFusao:      Math.max(0, cFus  - cAcabIn),
        qMoldada:    Math.max(0, cMold - cFusIn),
        qAguardando: Math.max(0, targetTotalQty - cMold),

        // REFUGOS POR SETOR
        refugoMoldagem, refugoFusao, refugoAcabamento, refugoTT,
        refugoUsinagem, refugoQualidade, refugoExpedicao,

        // APONTADOS BRUTOS (raw* = produzido no setor já líquido de refugo)
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

    // Total balance = saldo comercial
    res.totalBalance = getCommercialBalance(item);

    // Threshold filter
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
