const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function fmtDate(val) {
    if (!val) return null;
    const d = new Date(val);
    if (isNaN(d)) return null;
    return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
}

function parseUTC(val) {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d) ? null : d;
}

function utcDay(d) {
    if (!d) return null;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// GET /api/otif?ano=2026
router.get('/', async (req, res) => {
    try {
        const { ano } = req.query;
        const anoFiltro = parseInt(ano) || new Date().getFullYear();
        const hoje = new Date();

        const [assertRes, fatRes] = await Promise.all([
            pool.query(`SELECT data FROM firebird_sync_assertividade`),
            pool.query(`
                SELECT pedido, codigo_item, data_faturamento
                FROM faturamento_firebird
                WHERE data_faturamento IS NOT NULL
                  AND EXTRACT(YEAR FROM data_faturamento) = $1
            `, [anoFiltro]),
        ]);

        // Mapa pedido+codigo_item -> data_faturamento mais recente no ano filtrado
        const fatMap = {};
        for (const f of fatRes.rows) {
            if (f.pedido == null || f.codigo_item == null) continue;
            const k = `${f.pedido}_${f.codigo_item}`;
            if (!fatMap[k] || new Date(f.data_faturamento) > new Date(fatMap[k])) {
                fatMap[k] = f.data_faturamento;
            }
        }

        const assertMap = {};
        for (const row of assertRes.rows) {
            const r = row.data;
            if (!r.PPR_CODIGO_PETR || !r.PRO_CODIGO_PETR) continue;
            const k = `${r.PPR_CODIGO_PETR}_${r.PRO_CODIGO_PETR}`;
            assertMap[k] = r;
        }

        let onTimeCount = 0, inFullCount = 0, otifCount = 0, atrasosCount = 0;
        const porMes = {};
        const porCliente = {};
        const linhas = [];

        for (const [k, dataFatRaw] of Object.entries(fatMap)) {
            const dataFatReal = parseUTC(dataFatRaw);
            if (!dataFatReal) continue;

            // Excluir meses futuros
            const fatYear  = dataFatReal.getUTCFullYear();
            const fatMonth = dataFatReal.getUTCMonth();
            if (fatYear > hoje.getFullYear()) continue;
            if (fatYear === hoje.getFullYear() && fatMonth > hoje.getMonth()) continue;

            const r = assertMap[k]; // pode não existir se pedido não foi sincronizado
            const dataEmissao  = r ? parseUTC(r.DATA_PETR)     : null;
            const dataPromessa = r ? parseUTC(r.ENTREGA_PETR)  : null;
            const qtdFat       = r ? (parseFloat(r.QUANTIDADE_FATURADA_PETR) || 0) : 0;
            const qtdPed       = r ? (parseFloat(r.QUANTIDADE_PPR) || 0) : 0;
            const cliente      = r ? (r.NOME_CLIENTE || 'Desconhecido').trim() : 'Desconhecido';
            const produto      = r ? (r.NOME_PRODUTO_PPR || '').trim() : '';
            const [pedidoStr, codItemStr] = k.split('_');

            const dataFatDay      = utcDay(dataFatReal);
            const dataPromessaDay = utcDay(dataPromessa);

            const onTime = dataFatDay && dataPromessaDay ? dataFatDay <= dataPromessaDay : false;
            const inFull = qtdPed > 0 ? qtdFat >= qtdPed : qtdFat > 0;
            const isOtif = onTime && inFull;
            const diasAtraso = (!onTime && dataFatDay && dataPromessaDay)
                ? Math.round((dataFatDay - dataPromessaDay) / 86400000) : 0;

            if (onTime)  onTimeCount++;
            if (inFull)  inFullCount++;
            if (isOtif)  otifCount++;
            if (!onTime) atrasosCount++;

            const mesIdx = fatMonth;
            if (!porMes[mesIdx]) porMes[mesIdx] = { label: MESES[mesIdx], total: 0, onTime: 0, inFull: 0, otif: 0 };
            porMes[mesIdx].total++;
            if (onTime)  porMes[mesIdx].onTime++;
            if (inFull)  porMes[mesIdx].inFull++;
            if (isOtif)  porMes[mesIdx].otif++;

            if (!porCliente[cliente]) porCliente[cliente] = { total: 0, onTime: 0, inFull: 0, otif: 0 };
            porCliente[cliente].total++;
            if (onTime)  porCliente[cliente].onTime++;
            if (inFull)  porCliente[cliente].inFull++;
            if (isOtif)  porCliente[cliente].otif++;

            linhas.push({
                pedido:       pedidoStr,
                codigoItem:   codItemStr,
                cliente,
                produto,
                dataEmissao:  fmtDate(dataEmissao),
                dataPromessa: fmtDate(dataPromessa),
                dataFaturada: fmtDate(dataFatRaw),
                qtdFat,
                qtdPed:       qtdPed || null,
                onTime,
                inFull,
                otif: isOtif,
                diasAtraso,
            });
        }

        const total = linhas.length;

        const mesesOrdenados = Object.keys(porMes).map(Number).sort((a,b) => a-b).map(idx => ({
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
        })).sort((a,b) => b.total - a.total).slice(0, 15);

        // Ordenar linhas por data faturada decrescente
        linhas.sort((a, b) => {
            const da = a.dataFaturada ? a.dataFaturada.split('/').reverse().join('') : '';
            const db = b.dataFaturada ? b.dataFaturada.split('/').reverse().join('') : '';
            return db.localeCompare(da);
        });

        res.json({
            success: true,
            kpis: { total, otif: total > 0 ? Math.round((otifCount/total)*100) : 0, onTime: total > 0 ? Math.round((onTimeCount/total)*100) : 0, inFull: total > 0 ? Math.round((inFullCount/total)*100) : 0, atrasos: atrasosCount, otifCount, onTimeCount, inFullCount },
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
