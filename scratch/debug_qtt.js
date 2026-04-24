/**
 * Debug final: verificar os 396 itens não-faturados para qTT
 */
const pool = require('../lib/db');

async function debug() {
    try {
        const result = await pool.query(`
            SELECT data FROM firebird_sync_emissoes
            WHERE COALESCE(data->>'FATURADO_PPR', '') != 'T'
        `);

        console.log(`Itens não-faturados: ${result.rows.length}\n`);

        let countWithQTT = 0;
        let countWithOP = 0;
        let countQTTgt0 = 0;
        let itemsQTTgt0 = [];
        const processedOPs = new Set();

        result.rows.forEach(r => {
            const item = r.data;
            const op = String(item.OP_PCS || '').trim();
            const hasOP = op && op !== '-' && op !== '';
            if (hasOP) countWithOP++;

            const saldoLib = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
            const qtdOrig = Number(item.QUANTIDADE_PPR) || 0;
            const erpFat = Number(item.QUANTIDADE_FATURADO_PPR || item.QUANTIDADE_FATURADA_PPR) || 0;

            let targetTotalQty = Math.max(
                (Number(item.OP_QUANTIDADE) || 0),
                (saldoLib + erpFat),
                qtdOrig
            );

            let cFat = Math.max(Number(item.QTY_FATURAMENTO) || 0, erpFat);
            if (targetTotalQty > 0 && cFat >= targetTotalQty) cFat = targetTotalQty;

            const rawExpedicao = Math.max(0, Number(item.QTY_EXPEDICAO) || 0);
            const rawQualidade = Math.max(0, Number(item.QTY_QUALIDADE) || 0);
            const rawUsinagem = Math.max(0, Number(item.QTY_USINAGEM) || 0);
            const rawTT = Math.max(0, Number(item.QTY_TT) || 0);

            const maxInd = Math.max(
                Number(item.QTY_MOLDADA) || 0, Number(item.QTY_FUSAO) || 0,
                Number(item.QTY_ACABAMENTO) || 0, rawTT, rawUsinagem, rawQualidade, rawExpedicao
            );

            if ((cFat > 0 || erpFat > 0) && targetTotalQty > Math.max(cFat, erpFat) && saldoLib <= 0) {
                targetTotalQty = Math.max(cFat, erpFat, maxInd);
            }

            const cExp  = Math.max(cFat,  rawExpedicao);
            const cQual = Math.max(cExp,  rawQualidade);
            const cUsi  = Math.max(cQual, rawUsinagem);
            const cTT   = Math.max(cUsi,  rawTT);

            const qTT = Math.max(0, cTT - cUsi);

            if (rawTT > 0) countWithQTT++;
            if (qTT > 0) {
                countQTTgt0++;
                
                // Check if OP was already processed (dedup)
                const isNewOP = !processedOPs.has(op);
                if (hasOP) processedOPs.add(op);

                itemsQTTgt0.push({
                    op: op || '(sem OP)',
                    cod: item.PRODUTO_PPR,
                    rawTT, rawUsinagem, rawQualidade, rawExpedicao,
                    cFat, cUsi, cTT, qTT,
                    isNewOP,
                    erpFat, saldoLib
                });
            }
        });

        console.log(`Itens com OP: ${countWithOP}`);
        console.log(`Itens com rawTT > 0: ${countWithQTT}`);
        console.log(`Itens com qTT > 0 (ANTES dedup): ${countQTTgt0}`);
        console.log(`Itens com qTT > 0 (APÓS dedup por OP): ${itemsQTTgt0.filter(i => i.isNewOP).length}\n`);

        if (itemsQTTgt0.length > 0) {
            console.log(`--- Todos os itens com qTT > 0 ---\n`);
            itemsQTTgt0.forEach(i => {
                const dupLabel = i.isNewOP ? '✅ NOVA' : '❌ DUPLICADA';
                console.log(`OP ${i.op} (${dupLabel}) | ${i.cod} | qTT=${i.qTT}`);
                console.log(`  rawTT=${i.rawTT} rawUsin=${i.rawUsinagem} rawQual=${i.rawQualidade} rawExp=${i.rawExpedicao}`);
                console.log(`  cFat=${i.cFat} cUsi=${i.cUsi} cTT=${i.cTT} | erpFat=${i.erpFat} saldoLib=${i.saldoLib}`);
            });
        } else {
            console.log(`❌ NENHUM item com qTT > 0!`);
            console.log(`\n--- Debug: Exemplos de itens com rawTT > 0 mas qTT = 0 ---\n`);
            
            let debugCount = 0;
            result.rows.forEach(r => {
                if (debugCount >= 10) return;
                const item = r.data;
                const rawTT = Math.max(0, Number(item.QTY_TT) || 0);
                if (rawTT <= 0) return;

                const saldoLib = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
                const qtdOrig = Number(item.QUANTIDADE_PPR) || 0;
                const erpFat = Number(item.QUANTIDADE_FATURADO_PPR || item.QUANTIDADE_FATURADA_PPR) || 0;
                let targetTotalQty = Math.max((Number(item.OP_QUANTIDADE) || 0), (saldoLib + erpFat), qtdOrig);

                let cFat = Math.max(Number(item.QTY_FATURAMENTO) || 0, erpFat);
                if (targetTotalQty > 0 && cFat >= targetTotalQty) cFat = targetTotalQty;

                const rawExpedicao = Math.max(0, Number(item.QTY_EXPEDICAO) || 0);
                const rawQualidade = Math.max(0, Number(item.QTY_QUALIDADE) || 0);
                const rawUsinagem = Math.max(0, Number(item.QTY_USINAGEM) || 0);

                const maxInd = Math.max(Number(item.QTY_MOLDADA)||0, Number(item.QTY_FUSAO)||0, Number(item.QTY_ACABAMENTO)||0, rawTT, rawUsinagem, rawQualidade, rawExpedicao);
                if ((cFat > 0 || erpFat > 0) && targetTotalQty > Math.max(cFat, erpFat) && saldoLib <= 0) {
                    targetTotalQty = Math.max(cFat, erpFat, maxInd);
                }

                const cExp  = Math.max(cFat,  rawExpedicao);
                const cQual = Math.max(cExp,  rawQualidade);
                const cUsi  = Math.max(cQual, rawUsinagem);
                const cTT   = Math.max(cUsi,  rawTT);
                const qTT = Math.max(0, cTT - cUsi);

                console.log(`OP ${item.OP_PCS} | ${item.PRODUTO_PPR} | FATURADO=${item.FATURADO_PPR}`);
                console.log(`  rawTT=${rawTT} rawUsin=${rawUsinagem} rawQual=${rawQualidade} rawExp=${rawExpedicao}`);
                console.log(`  erpFat=${erpFat} cFat=${cFat} cExp=${cExp} cQual=${cQual} cUsi=${cUsi} cTT=${cTT}`);
                console.log(`  qTT=${qTT} ← ${qTT === 0 ? 'ZERO porque cUsi >= rawTT' : 'TEM SALDO'}`);
                console.log(`  saldoLib=${saldoLib} qtdOrig=${qtdOrig} target=${targetTotalQty}`);
                console.log('');
                debugCount++;
            });
        }

    } catch (err) {
        console.error('Erro:', err);
    } finally {
        await pool.end();
    }
}

debug();
