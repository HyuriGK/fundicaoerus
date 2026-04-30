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

function parseDate(val) {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d) ? null : d;
}

// GET /api/otif?ano=2026
router.get('/', async (req, res) => {
    try {
        const { ano } = req.query;
        const anoFiltro = parseInt(ano) || new Date().getFullYear();

        const [assertRes, fatRes] = await Promise.all([
            pool.query(`SELECT data FROM firebird_sync_assertividade ORDER BY (data->>'DATA_PETR') ASC`),
            pool.query(`SELECT pedido, codigo_item, data_faturamento FROM faturamento_firebird WHERE data_faturamento IS NOT NULL`),
        ]);

        // Mapa pedido+codigo_item -> data_faturamento real
        const fatMap = {};
        for (const f of fatRes.rows) {
            if (f.pedido && f.codigo_item) {
                const k = `${f.pedido}_${f.codigo_item}`;
                // Manter a mais recente se houver múltiplas
                if (!fatMap[k] || new Date(f.data_faturamento) > new Date(fatMap[k])) {
                    fatMap[k] = f.data_faturamento;
                }
            }
        }

        const registros = assertRes.rows.map(r => r.data);

        const filtrados = registros.filter(r => {
            if (!r.DATA_PETR) return false;
            const d = new Date(r.DATA_PETR);
            return !isNaN(d) && d.getUTCFullYear() === anoFiltro;
        });

        let onTimeCount = 0, inFullCount = 0, otifCount = 0, atrasosCount = 0;
        const porMes = {};
        const porCliente = {};
        const linhas = [];

        for (const r of filtrados) {
            const dataEmissao  = parseDate(r.DATA_PETR);
            const dataPromessa = parseDate(r.ENTREGA_PETR);
            const qtdFat       = parseFloat(r.QUANTIDADE_FATURADA_PETR) || 0;
            const qtdPed       = parseFloat(r.QUANTIDADE_PPR) || 0;

            // Buscar data de faturamento real via nota fiscal
            const fatKey = `${r.PPR_CODIGO_PETR}_${r.PRO_CODIGO_PETR}`;
            const dataFatReal = parseDate(fatMap[fatKey]) || dataEmissao;

            // Comparar apenas datas (ignorar horário — UTC midnight)
            const dataFatDay      = dataFatReal  ? new Date(Date.UTC(dataFatReal.getUTCFullYear(),  dataFatReal.getUTCMonth(),  dataFatReal.getUTCDate()))  : null;
            const dataPromessaDay = dataPromessa ? new Date(Date.UTC(dataPromessa.getUTCFullYear(), dataPromessa.getUTCMonth(), dataPromessa.getUTCDate())) : null;

            const onTime = dataFatDay && dataPromessaDay ? dataFatDay <= dataPromessaDay : false;
            const inFull = qtdPed > 0 ? qtdFat >= qtdPed : qtdFat > 0;
            const isOtif = onTime && inFull;
            const diasAtraso = (!onTime && dataFatDay && dataPromessaDay)
                ? Math.round((dataFatDay - dataPromessaDay) / 86400000)
                : 0;

            if (onTime)   onTimeCount++;
            if (inFull)   inFullCount++;
            if (isOtif)   otifCount++;
            if (!onTime)  atrasosCount++;

            const mesIdx = dataFatReal.getUTCMonth();
            if (!porMes[mesIdx]) porMes[mesIdx] = { label: MESES[mesIdx], total: 0, onTime: 0, inFull: 0, otif: 0 };
            porMes[mesIdx].total++;
            if (onTime)  porMes[mesIdx].onTime++;
            if (inFull)  porMes[mesIdx].inFull++;
            if (isOtif)  porMes[mesIdx].otif++;

            const cliente = (r.NOME_CLIENTE || 'Desconhecido').trim();
            if (!porCliente[cliente]) porCliente[cliente] = { total: 0, onTime: 0, inFull: 0, otif: 0 };
            porCliente[cliente].total++;
            if (onTime)  porCliente[cliente].onTime++;
            if (inFull)  porCliente[cliente].inFull++;
            if (isOtif)  porCliente[cliente].otif++;

            linhas.push({
                pedido:       r.PPR_CODIGO_PETR,
                codigoItem:   r.PRO_CODIGO_PETR,
                cliente,
                produto:      (r.NOME_PRODUTO_PPR || '').trim(),
                dataPromessa: fmtDate(r.ENTREGA_PETR),
                dataFaturada: fmtDate(fatMap[fatKey] || null),
                qtdFat,
                qtdPed:       qtdPed || null,
                onTime,
                inFull,
                otif: isOtif,
                diasAtraso,
            });
        }

        const total = filtrados.length;

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
