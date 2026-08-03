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
    const linkStatus = String(item.LINK_STATUS || '').trim().toLowerCase();
    const linkedOp = linkStatus === 'sugerido' ? '' : String(item.OP_PCS || '').trim();
    const opQty = Number(item.OP_QUANTIDADE) || 0;
    let targetTotalQty = (linkedOp && linkedOp !== '-' && opQty > 0)
        ? opQty
        : Math.max(
            opQty,
            (saldoLib + erpFat),
            qtdOrig
        );
    const ignoreSuggestedOp = linkStatus === 'sugerido';

    // REFUGOS POR SETOR (peças que morreram em cada etapa)
    const refugoMoldagem  = ignoreSuggestedOp ? 0 : Math.max(0, Number(item.REFUGO_MOLDAGEM)  || 0);
    const refugoFusao     = ignoreSuggestedOp ? 0 : Math.max(0, Number(item.REFUGO_FUSAO)     || 0);
    const refugoAcabamento= ignoreSuggestedOp ? 0 : Math.max(0, Number(item.REFUGO_ACABAMENTO)|| 0);
    const refugoTT        = ignoreSuggestedOp ? 0 : Math.max(0, Number(item.REFUGO_TT)        || 0);
    const refugoUsinagem  = ignoreSuggestedOp ? 0 : Math.max(0, Number(item.REFUGO_USINAGEM)  || 0);
    const refugoQualidade = ignoreSuggestedOp ? 0 : Math.max(0, Number(item.REFUGO_QUALIDADE) || 0);
    const refugoExpedicao = ignoreSuggestedOp ? 0 : Math.max(0, Number(item.REFUGO_EXPEDICAO) || 0);

    // PRODUZIDO por setor (líquido de refugo — o que pode avançar para o próximo setor)
    const rawFaturamento = ignoreSuggestedOp ? 0 : Math.max(0, Number(item.QTY_FATURAMENTO) || 0);
    const rawExpedicao   = ignoreSuggestedOp ? 0 : Math.max(0, Number(item.QTY_EXPEDICAO)   || 0);
    const rawQualidade   = ignoreSuggestedOp ? 0 : Math.max(0, (Number(item.QTY_QUALIDADE)   || 0) - refugoQualidade);
    const rawUsinagem    = ignoreSuggestedOp ? 0 : Math.max(0, (Number(item.QTY_USINAGEM)    || 0) - refugoUsinagem);
    const rawTT          = ignoreSuggestedOp ? 0 : Math.max(0, (Number(item.QTY_TT)          || 0) - refugoTT);
    const rawAcabamento  = ignoreSuggestedOp ? 0 : Math.max(0, (Number(item.QTY_ACABAMENTO)  || 0) - refugoAcabamento);
    const rawFusao       = ignoreSuggestedOp ? 0 : Math.max(0, (Number(item.QTY_FUSAO)       || 0) - refugoFusao);
    const rawMoldada     = ignoreSuggestedOp ? 0 : Math.max(0, (Number(item.QTY_MOLDADA)     || 0) - refugoMoldagem);

    // APONTADO por setor (bruto, sem deduzir refugo — barreira de entrada no setor)
    // Peça apontada em X já saiu da fila do setor anterior, independente do resultado
    const apontadoFusao      = ignoreSuggestedOp ? 0 : Math.max(0, Number(item.QTY_FUSAO)      || 0);
    const apontadoAcabamento = ignoreSuggestedOp ? 0 : Math.max(0, Number(item.QTY_ACABAMENTO) || 0);
    const apontadoTT         = ignoreSuggestedOp ? 0 : Math.max(0, Number(item.QTY_TT)         || 0);
    const apontadoUsinagem   = ignoreSuggestedOp ? 0 : Math.max(0, Number(item.QTY_USINAGEM)   || 0);
    const apontadoQualidade  = ignoreSuggestedOp ? 0 : Math.max(0, Number(item.QTY_QUALIDADE)  || 0);

    const maxInd = Math.max(rawMoldada, rawFusao, rawAcabamento, rawTT, rawUsinagem, rawQualidade, rawExpedicao);

    // Faturamento consolidado
    // Só propaga erpFat pela cadeia se esta OP/item tem evidência de peças próprias faturadas.
    // Caso contrário, o faturamento pertence a OPs anteriores do mesmo pedido.
    const hasOwnBilling = rawFaturamento > 0 || rawExpedicao > 0;
    const chainErpFat = hasOwnBilling ? erpFat : 0;

    let cFat = Math.max(rawFaturamento, chainErpFat);

    if (String(item.FATURADO_PPR || '').trim().toUpperCase() === 'T' || (targetTotalQty > 0 && cFat >= targetTotalQty)) {
        cFat = targetTotalQty;
    }

    // Ghost residue suppression
    if ((cFat > 0 || chainErpFat > 0) && targetTotalQty > Math.max(cFat, chainErpFat) && saldoLib <= 0) {
        targetTotalQty = Math.max(cFat, chainErpFat, maxInd);
    }

    // Cadeia de saída (PRODUZIDO) — quanto pode avançar para o setor seguinte
    const cExp  = Math.max(cFat,  rawExpedicao);
    const cQual = Math.max(cExp,  rawQualidade);
    const cUsi  = Math.max(cQual, rawUsinagem);
    const cTT   = Math.max(cUsi,  rawTT);
    const cAcab = Math.max(cTT,   rawAcabamento);
    const cFus  = Math.max(cAcab, rawFusao);

    // Cadeia de entrada (APONTADO) — quantas peças já entraram em cada setor
    // cAcabIn é capado em apontadoFusao: garante cFusIn = apontadoFusao sempre,
    // tornando qMoldada imune a inconsistências de dados nos setores downstream
    const cExpIn  = cExp;
    const cQualIn = Math.max(cExpIn,  apontadoQualidade);
    const cUsiIn  = Math.max(cQualIn, apontadoUsinagem);
    const cTTIn   = Math.max(cUsiIn,  apontadoTT);
    const cAcabIn = Math.min(apontadoFusao, Math.max(cTTIn, apontadoAcabamento));
    const cFusIn  = Math.max(cAcabIn, apontadoFusao); // = apontadoFusao sempre
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
        originalTarget: qtdOrig
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
function getPositiveNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : 0;
}

function getErpUnitWeight(item) {
    return getPositiveNumber(item.PESO_PRODUTO);
}

function getResolvedUnitWeight(item, weightsMap = {}, targetQty) {
    const fixedUnit = getPositiveNumber(item.PESO_UNIT);
    if (fixedUnit > 0) return fixedUnit;

    const prodCode = String(item.PRODUTO_PPR || '').trim();
    const erpUnit = getErpUnitWeight(item);
    if (erpUnit > 0) return erpUnit;

    const customUnit = getPositiveNumber(weightsMap[prodCode]);
    return customUnit > 0 ? customUnit : 0;
}

function getCorrectedWeight(item, weightsMap = {}) {
    const commercialBalance = getCommercialBalance(item);
    const metrics = getItemSectorMetrics(item);

    // Em modo emission_total, usa QUANTIDADE_PPR como denominador (igual ao gráfico de emissão)
    const isEmissionTotal = typeof window !== 'undefined' && typeof chartMode !== 'undefined' && chartMode === 'emission_total';
    const originalTarget = isEmissionTotal
        ? (Number(item.QUANTIDADE_PPR) || 0)
        : metrics.originalTarget;

    const unitWeight = getResolvedUnitWeight(item, weightsMap, originalTarget);

    return unitWeight * commercialBalance;
}

// Export for Node environments (like analysis scripts) if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getCommercialBalance, getItemSectorMetrics, getCorrectedWeight, getResolvedUnitWeight, getErpUnitWeight };
}
