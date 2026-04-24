/**
 * Lista detalhada: OPs aguardando Usinagem (qTT > 0)
 * = peças que passaram pelo Tratamento Térmico mas ainda não pela Usinagem
 */

const pool = require('../lib/db');

async function listAguardandoUsinagem() {
    try {
        const result = await pool.query(`
            SELECT 
                sync_key,
                data->>'OP_PCS' as op,
                data->>'PRODUTO_PPR' as cod_produto,
                data->>'NOME_PRODUTO_PPR' as nome_produto,
                data->>'NOME_CLIENTE' as cliente,
                COALESCE((data->>'QUANTIDADE_PPR')::numeric, 0) as qtd_original,
                COALESCE((data->>'SALDO_LIBERADO_FATURAR_PPR')::numeric, 0) as saldo_lib,
                COALESCE((data->>'QUANTIDADE_FATURADO_PPR')::numeric, 0) as qtd_faturada,
                COALESCE((data->>'OP_QUANTIDADE')::numeric, 0) as op_quantidade,
                COALESCE((data->>'QTY_MOLDADA')::numeric, 0) as raw_moldada,
                COALESCE((data->>'QTY_FUSAO')::numeric, 0) as raw_fusao,
                COALESCE((data->>'QTY_ACABAMENTO')::numeric, 0) as raw_acabamento,
                COALESCE((data->>'QTY_TT')::numeric, 0) as raw_tt,
                COALESCE((data->>'QTY_USINAGEM')::numeric, 0) as raw_usinagem,
                COALESCE((data->>'QTY_QUALIDADE')::numeric, 0) as raw_qualidade,
                COALESCE((data->>'QTY_EXPEDICAO')::numeric, 0) as raw_expedicao,
                COALESCE((data->>'QTY_FATURAMENTO')::numeric, 0) as raw_faturamento,
                COALESCE((data->>'PESO_LIQUIDO_NPR')::numeric, 0) as peso_liquido,
                data->>'FATURADO_PPR' as faturado,
                data->>'ENTREGA_PETR' as entrega_pcp,
                data->>'DATA_ENTREGA_PPR' as entrega_pedido
            FROM firebird_sync_emissoes
            WHERE COALESCE(data->>'FATURADO_PPR', '') != 'T'
              AND data->>'OP_PCS' IS NOT NULL
              AND data->>'OP_PCS' != ''
              AND data->>'OP_PCS' != '-'
        `);

        const aguardando = [];
        const opsProcessed = new Set();

        for (const item of result.rows) {
            const saldoLib = parseFloat(item.saldo_lib) || 0;
            const qtdOrig = parseFloat(item.qtd_original) || 0;
            const erpFat = parseFloat(item.qtd_faturada) || 0;
            const opQtd = parseFloat(item.op_quantidade) || 0;

            let targetTotalQty = Math.max(opQtd, saldoLib + erpFat, qtdOrig);

            const rawFaturamento = Math.max(0, parseFloat(item.raw_faturamento) || 0);
            const rawExpedicao = Math.max(0, parseFloat(item.raw_expedicao) || 0);
            const rawQualidade = Math.max(0, parseFloat(item.raw_qualidade) || 0);
            const rawUsinagem = Math.max(0, parseFloat(item.raw_usinagem) || 0);
            const rawTT = Math.max(0, parseFloat(item.raw_tt) || 0);
            const rawAcabamento = Math.max(0, parseFloat(item.raw_acabamento) || 0);
            const rawFusao = Math.max(0, parseFloat(item.raw_fusao) || 0);
            const rawMoldada = Math.max(0, parseFloat(item.raw_moldada) || 0);

            let cFat = Math.max(rawFaturamento, erpFat);
            const maxInd = Math.max(rawMoldada, rawFusao, rawAcabamento, rawTT, rawUsinagem, rawQualidade, rawExpedicao);
            if ((cFat > 0 || erpFat > 0) && targetTotalQty > Math.max(cFat, erpFat) && saldoLib <= 0) {
                targetTotalQty = Math.max(cFat, erpFat, maxInd);
            }
            if (targetTotalQty > 0 && cFat >= targetTotalQty) cFat = targetTotalQty;

            const cExp  = Math.max(cFat,  rawExpedicao);
            const cQual = Math.max(cExp,  rawQualidade);
            const cUsi  = Math.max(cQual, rawUsinagem);
            const cTT   = Math.max(cUsi,  rawTT);

            const qTT = Math.max(0, cTT - cUsi);

            if (qTT > 0) {
                // Deduplicar por OP (mesmo comportamento do frontend)
                if (opsProcessed.has(item.op)) continue;
                opsProcessed.add(item.op);

                const pesoUnit = qtdOrig > 0 ? (parseFloat(item.peso_liquido) || 0) / qtdOrig : 0;
                const pesoAguardando = pesoUnit * qTT;
                const entrega = item.entrega_pcp || item.entrega_pedido || null;
                const entregaStr = entrega ? new Date(entrega).toLocaleDateString('pt-BR') : 'Sem data';

                aguardando.push({
                    op: item.op,
                    cod: item.cod_produto,
                    nome: item.nome_produto || '-',
                    cliente: item.cliente || '-',
                    qTT,
                    rawTT,
                    rawUsinagem,
                    rawQualidade,
                    rawExpedicao,
                    pesoUnit,
                    pesoAguardando,
                    entrega: entregaStr,
                    opQtd: opQtd || qtdOrig
                });
            }
        }

        // Ordenar por quantidade aguardando (maior primeiro)
        aguardando.sort((a, b) => b.qTT - a.qTT);

        let totalPcs = 0;
        let totalPeso = 0;

        console.log(`\n=================================================================`);
        console.log(`  PEÇAS AGUARDANDO USINAGEM (passaram TT, não passaram Usinagem)`);
        console.log(`=================================================================\n`);

        aguardando.forEach((i, idx) => {
            totalPcs += i.qTT;
            totalPeso += i.pesoAguardando;
            console.log(`${idx + 1}. OP ${i.op} — ${i.qTT} pçs aguardando (${i.pesoAguardando.toFixed(1)} kg)`);
            console.log(`   Cód: ${i.cod} | ${i.nome.substring(0, 60)}`);
            console.log(`   Cliente: ${i.cliente}`);
            console.log(`   Entrega: ${i.entrega} | Qtd OP: ${i.opQtd}`);
            console.log(`   TT: ${i.rawTT} → Usinagem: ${i.rawUsinagem} | Qualidade: ${i.rawQualidade} | Expedição: ${i.rawExpedicao}`);
            console.log('');
        });

        console.log(`=================================================================`);
        console.log(`  TOTAL: ${aguardando.length} OPs | ${totalPcs} peças | ${totalPeso.toFixed(1)} kg`);
        console.log(`=================================================================\n`);

    } catch (err) {
        console.error('Erro:', err);
    } finally {
        await pool.end();
    }
}

listAguardandoUsinagem();
