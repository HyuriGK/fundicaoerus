const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// GET /api/otif?ano=2026&mes=all
router.get('/', async (req, res) => {
    try {
        const { ano, mes } = req.query;
        const anoFiltro = parseInt(ano) || new Date().getFullYear();

        const result = await pool.query(`
            SELECT data, updated_at
            FROM firebird_sync_assertividade
            ORDER BY updated_at DESC
        `);

        const registros = result.rows.map(r => r.data);

        // Filtrar por ano e mês
        const filtrados = registros.filter(r => {
            if (!r.DATA_PETR) return false;
            const d = new Date(r.DATA_PETR);
            if (isNaN(d)) return false;
            if (d.getFullYear() !== anoFiltro) return false;
            if (mes && mes !== 'all') {
                if (d.getMonth() + 1 !== parseInt(mes)) return false;
            }
            return true;
        });

        // Para cada registro:
        // ON TIME: DATA_PETR <= ENTREGA_PETR
        // IN FULL: QUANTIDADE_FATURADA_PETR >= QUANTIDADE_PPR (ou seja, entregou tudo)
        // OTIF: on_time AND in_full

        const total = filtrados.length;
        let onTimeCount = 0;
        let inFullCount = 0;
        let otifCount = 0;
        let atrasosCount = 0;

        // KPIs por mês
        const porMes = {};
        // KPIs por cliente
        const porCliente = {};

        const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

        for (const r of filtrados) {
            const dataFat = new Date(r.DATA_PETR);
            const dataEntrega = r.ENTREGA_PETR ? new Date(r.ENTREGA_PETR) : null;
            const qtdFat = parseFloat(r.QUANTIDADE_FATURADA_PETR) || 0;
            const qtdPed = parseFloat(r.QUANTIDADE_PPR) || 0;

            const onTime = dataEntrega ? dataFat <= dataEntrega : false;
            // Se não temos qtdPed, considera in_full apenas se qtdFat > 0
            const inFull = qtdPed > 0 ? qtdFat >= qtdPed : qtdFat > 0;
            const isOtif = onTime && inFull;

            if (onTime) onTimeCount++;
            if (inFull) inFullCount++;
            if (isOtif) otifCount++;
            if (!onTime) atrasosCount++;

            // Agrupamento por mês
            const mesIdx = dataFat.getMonth(); // 0-11
            const mesLabel = MESES[mesIdx];
            if (!porMes[mesIdx]) {
                porMes[mesIdx] = { label: mesLabel, total: 0, onTime: 0, inFull: 0, otif: 0 };
            }
            porMes[mesIdx].total++;
            if (onTime) porMes[mesIdx].onTime++;
            if (inFull) porMes[mesIdx].inFull++;
            if (isOtif) porMes[mesIdx].otif++;

            // Agrupamento por cliente
            const cliente = (r.NOME_CLIENTE || 'Desconhecido').trim();
            if (!porCliente[cliente]) {
                porCliente[cliente] = { total: 0, onTime: 0, inFull: 0, otif: 0 };
            }
            porCliente[cliente].total++;
            if (onTime) porCliente[cliente].onTime++;
            if (inFull) porCliente[cliente].inFull++;
            if (isOtif) porCliente[cliente].otif++;
        }

        // Ordenar meses
        const mesesOrdenados = Object.keys(porMes)
            .map(Number)
            .sort((a, b) => a - b)
            .map(idx => ({
                ...porMes[idx],
                pctOtif: porMes[idx].total > 0 ? Math.round((porMes[idx].otif / porMes[idx].total) * 100) : 0,
                pctOnTime: porMes[idx].total > 0 ? Math.round((porMes[idx].onTime / porMes[idx].total) * 100) : 0,
                pctInFull: porMes[idx].total > 0 ? Math.round((porMes[idx].inFull / porMes[idx].total) * 100) : 0,
            }));

        // Top clientes por total de entregas (max 15)
        const clientesOrdenados = Object.entries(porCliente)
            .map(([nome, v]) => ({
                nome,
                ...v,
                pctOtif: v.total > 0 ? Math.round((v.otif / v.total) * 100) : 0,
                pctOnTime: v.total > 0 ? Math.round((v.onTime / v.total) * 100) : 0,
                pctInFull: v.total > 0 ? Math.round((v.inFull / v.total) * 100) : 0,
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 15);

        res.json({
            success: true,
            kpis: {
                total,
                otif: total > 0 ? Math.round((otifCount / total) * 100) : 0,
                onTime: total > 0 ? Math.round((onTimeCount / total) * 100) : 0,
                inFull: total > 0 ? Math.round((inFullCount / total) * 100) : 0,
                atrasos: atrasosCount,
                otifCount,
                onTimeCount,
                inFullCount,
            },
            porMes: mesesOrdenados,
            porCliente: clientesOrdenados,
        });
    } catch (error) {
        console.error('Erro ao calcular OTIF:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao calcular OTIF.' });
    }
});

module.exports = router;
