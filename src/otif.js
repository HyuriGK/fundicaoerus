const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// Mesma lógica de isServiceClient do faturamentos.html
const SERVICE_CLIENTS = ['IMEPEL INDUSTRIA MECANICA LTDA', 'STEELROOL INDUSTRIA METALURGICA', 'SPILROD FUNDICAO DE FERRO E ACO LTDA'];
const SERVICE_CODES   = ['257'];
function isServiceClient(clienteCodigo, clienteNome) {
    const code = String(clienteCodigo || '').trim();
    const name = (clienteNome || '').trim().toUpperCase();
    if (SERVICE_CODES.includes(code)) return true;
    return SERVICE_CLIENTS.some(sc => name === sc || name.includes(sc));
}

function fmtDate(val) {
    if (!val) return null;
    const d = new Date(val);
    if (isNaN(d)) return null;
    return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
}

function utcDay(val) {
    if (!val) return null;
    const d = new Date(val);
    if (isNaN(d)) return null;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// GET /api/otif?ano=2026
router.get('/', async (req, res) => {
    try {
        const { ano } = req.query;
        const anoFiltro = parseInt(ano) || new Date().getFullYear();
        const hoje = new Date();

        // Buscar faturamento detalhado (mesma query do faturamentos.html)
        const [fatRes, assertRes, pedRes] = await Promise.all([
            pool.query(`
                SELECT
                    f.data_faturamento,
                    f.nota_fiscal,
                    f.cliente_codigo,
                    f.cliente_nome,
                    f.codigo_item,
                    f.descricao,
                    f.quantidade,
                    f.pedido,
                    COALESCE(p.excluido, f.excluido_manualmente OR f.pedido IS NULL OR f.pedido = '' OR f.pedido = ' ') as excluido_manualmente
                FROM faturamento_firebird f
                LEFT JOIN faturamento_firebird_preferencias p
                    ON p.nota_fiscal = f.nota_fiscal
                    AND p.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                    AND COALESCE(p.pedido, '') = COALESCE(TRIM(f.pedido), '')
                    AND p.data_faturamento = f.data_faturamento
                    AND p.quantidade = f.quantidade
                WHERE EXTRACT(YEAR FROM f.data_faturamento) = $1
                ORDER BY f.data_faturamento DESC, f.nota_fiscal DESC
            `, [anoFiltro]),
            pool.query(`SELECT data FROM firebird_sync_assertividade`),
            pool.query(`SELECT data->>'PEDIDO_NUM' as ped, data->>'PRODUTO_PPR' as prod, data->>'DATA_EMISSAO_PEDIDO' as emissao, data->>'OP_ENTREGA' as entrega FROM firebird_sync_pedidos WHERE data->>'PEDIDO_NUM' IS NOT NULL AND data->>'PRODUTO_PPR' IS NOT NULL`),
        ]);

        // Mapa assertividade: pedido_codItem exato e fallback por pedido (para data prometida)
        const assertExact = {};
        const assertByPed = {};
        for (const row of assertRes.rows) {
            const r = row.data;
            if (!r.PPR_CODIGO_PETR) continue;
            const ped = String(r.PPR_CODIGO_PETR);
            const cod = String(r.PRO_CODIGO_PETR || '');
            assertExact[`${ped}_${cod}`] = r;
            if (!assertByPed[ped]) assertByPed[ped] = [];
            assertByPed[ped].push(r);
        }

        // Mapa pedidos: pedido_produto -> { emissao, entrega }
        const pedidosMap = {};
        for (const row of pedRes.rows) {
            const { ped, prod, emissao, entrega } = row;
            if (!ped || !prod) continue;
            const k = `${ped}_${prod}`;
            if (!pedidosMap[k]) pedidosMap[k] = { emissao: emissao || null, entrega: entrega || null };
        }

        let inFullCount = 0;
        // pedProdKey -> { emissao, dataPromessa, qtdAcum, qtdPed, ultimaDataFat, mesIdx, cliente }
        const pedAcum = {};
        const porMes     = {};
        const porCliente = {};
        const linhas     = [];

        for (const f of fatRes.rows) {
            // Aplicar mesmos filtros do faturamentos.html
            if (f.excluido_manualmente) continue;
            if (isServiceClient(f.cliente_codigo, f.cliente_nome)) continue;

            const dataFat = utcDay(f.data_faturamento);
            if (!dataFat) continue;

            // Excluir meses futuros
            if (dataFat.getUTCFullYear() > hoje.getFullYear()) continue;
            if (dataFat.getUTCFullYear() === hoje.getFullYear() && dataFat.getUTCMonth() > hoje.getMonth()) continue;

            // Cruzar com assertividade: tenta exato (pedido+cod_item), depois fallback por pedido
            const pedidoStr  = String(f.pedido || '').trim();
            const codItemStr = String(f.codigo_item || '').trim();
            const kExact = `${pedidoStr}_${codItemStr}`;
            let r = assertExact[kExact];
            if (!r && assertByPed[pedidoStr]) {
                // Fallback: pegar o registro do pedido com data de entrega mais próxima da data de faturamento
                const candidates = assertByPed[pedidoStr];
                if (candidates.length === 1) {
                    r = candidates[0];
                } else {
                    // Escolher o item com ENTREGA_PETR mais próxima (depois ou antes) da data de faturamento
                    const dataFatMs = dataFat ? dataFat.getTime() : 0;
                    r = candidates.reduce((best, cur) => {
                        const dBest = best.ENTREGA_PETR ? Math.abs(new Date(best.ENTREGA_PETR).getTime() - dataFatMs) : Infinity;
                        const dCur  = cur.ENTREGA_PETR  ? Math.abs(new Date(cur.ENTREGA_PETR).getTime()  - dataFatMs) : Infinity;
                        return dCur < dBest ? cur : best;
                    });
                }
            }

            const pedProdKey   = `${pedidoStr}_${codItemStr}`;
            const pedEntry     = pedidosMap[pedProdKey];
            const dataEmissao  = utcDay((pedEntry && pedEntry.emissao) || (r ? r.DATA_PETR : null));
            // Data prometida: assertividade (ENTREGA_PETR) primeiro, fallback OP_ENTREGA
            const dataPromessa = utcDay((r ? r.ENTREGA_PETR : null) || (pedEntry && pedEntry.entrega));
            const qtdFat       = parseFloat(f.quantidade) || 0;
            const qtdPed       = r ? (parseFloat(r.QUANTIDADE_PPR) || 0) : 0;

            const inFull = qtdPed > 0 ? qtdFat >= qtdPed : qtdFat > 0;
            if (inFull) inFullCount++;

            const mesIdx = dataFat.getUTCMonth();
            const cliente = (f.cliente_nome || 'Desconhecido').trim();

            // Acumular por pedido+item para On Time e prazo médio por entrega completa
            if (!pedAcum[pedProdKey]) {
                pedAcum[pedProdKey] = { emissao: dataEmissao, dataPromessa, qtdAcum: 0, qtdPed, ultimaDataFat: null, mesIdx, cliente };
            }
            pedAcum[pedProdKey].qtdAcum += qtdFat;
            if (!pedAcum[pedProdKey].ultimaDataFat || dataFat > pedAcum[pedProdKey].ultimaDataFat)
                pedAcum[pedProdKey].ultimaDataFat = dataFat;

            const onTimeLinha = dataFat && dataPromessa ? dataFat <= dataPromessa : false;
            const diasAtraso  = (!onTimeLinha && dataFat && dataPromessa) ? Math.round((dataFat - dataPromessa) / 86400000) : 0;

            linhas.push({
                pedido:       pedidoStr || '—',
                codigoItem:   codItemStr || '—',
                cliente,
                produto:      (f.descricao || '').trim(),
                dataEmissao:  fmtDate((pedEntry && pedEntry.emissao) || (r ? r.DATA_PETR : null)),
                dataPromessa: fmtDate(r ? r.ENTREGA_PETR : null),
                dataFaturada: fmtDate(f.data_faturamento),
                qtdFat,
                qtdPed:       qtdPed || null,
                onTime:       onTimeLinha,
                inFull,
                otif:         onTimeLinha && inFull,
                diasAtraso,
            });
        }

        // KPIs e gráficos por pedido completo
        let onTimeCount = 0, otifCount = 0, atrasosCount = 0, prazoTotalDias = 0, prazoCount = 0;
        for (const v of Object.values(pedAcum)) {
            const completo = v.qtdPed > 0 ? v.qtdAcum >= v.qtdPed : v.qtdAcum > 0;
            if (!completo) continue; // pedido ainda não completamente faturado no período

            const onTime = v.ultimaDataFat && v.dataPromessa ? v.ultimaDataFat <= v.dataPromessa : false;
            if (onTime) onTimeCount++;
            else atrasosCount++;
            if (onTime) otifCount++; // inFull sempre true para pedido completo

            if (v.emissao && v.ultimaDataFat) {
                prazoTotalDias += Math.round((v.ultimaDataFat - v.emissao) / 86400000);
                prazoCount++;
            }

            if (!porMes[v.mesIdx]) porMes[v.mesIdx] = { label: MESES[v.mesIdx], total: 0, onTime: 0, inFull: 0, otif: 0 };
            porMes[v.mesIdx].total++;
            if (onTime) { porMes[v.mesIdx].onTime++; porMes[v.mesIdx].otif++; }
            porMes[v.mesIdx].inFull++;

            if (!porCliente[v.cliente]) porCliente[v.cliente] = { total: 0, onTime: 0, inFull: 0, otif: 0 };
            porCliente[v.cliente].total++;
            if (onTime) { porCliente[v.cliente].onTime++; porCliente[v.cliente].otif++; }
            porCliente[v.cliente].inFull++;
        }

        // Ordenar por data faturada decrescente
        linhas.sort((a, b) => {
            const da = a.dataFaturada ? a.dataFaturada.split('/').reverse().join('') : '';
            const db = b.dataFaturada ? b.dataFaturada.split('/').reverse().join('') : '';
            return db.localeCompare(da);
        });

        const totalLinhas = linhas.length;
        const total = onTimeCount + atrasosCount; // pedidos completamente faturados

        const mesesOrdenados = Object.keys(porMes).map(Number).sort((a, b) => a - b).map(idx => ({
            ...porMes[idx],
            pctOtif:   porMes[idx].total > 0 ? Math.round((porMes[idx].otif   / porMes[idx].total) * 100) : 0,
            pctOnTime: porMes[idx].total > 0 ? Math.round((porMes[idx].onTime / porMes[idx].total) * 100) : 0,
            pctInFull: porMes[idx].total > 0 ? Math.round((porMes[idx].inFull / porMes[idx].total) * 100) : 0,
        }));

        const clientesOrdenados = Object.entries(porCliente).map(([nome, v]) => ({
            nome, ...v,
            pctOtif:   v.total > 0 ? Math.round((v.otif   / v.total) * 100) : 0,
            pctOnTime: v.total > 0 ? Math.round((v.onTime / v.total) * 100) : 0,
            pctInFull: v.total > 0 ? Math.round((v.inFull / v.total) * 100) : 0,
        })).sort((a, b) => b.total - a.total).slice(0, 15);

        res.json({
            success: true,
            kpis: {
                total: totalLinhas,
                otif:         total > 0 ? Math.round((otifCount   / total) * 100) : 0,
                onTime:       total > 0 ? Math.round((onTimeCount  / total) * 100) : 0,
                inFull:       total > 0 ? Math.round((inFullCount  / total) * 100) : 0,
                atrasos: atrasosCount,
                prazoMedio: prazoCount > 0 ? Math.round(prazoTotalDias / prazoCount) : null,
                otifCount, onTimeCount, inFullCount,
            },
            porMes: mesesOrdenados,
            porCliente: clientesOrdenados,
            linhas,
        });
    } catch (error) {
        console.error('Erro ao calcular OTIF:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao calcular OTIF.' });
    }
});

module.exports = router;
