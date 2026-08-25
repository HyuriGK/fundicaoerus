const pool = require('../../lib/db');
const { publishDashboardSnapshot } = require('../../lib/dashboard-snapshot');

async function refreshDashboardSnapshot() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const [fat, carteira, refugo, producao] = await Promise.all([
        pool.query("SELECT SUM(COALESCE(NULLIF(peso_un,0),0)*COALESCE(quantidade,0)) total FROM faturamento_firebird WHERE data_faturamento BETWEEN $1 AND $2 AND gera_financeiro IS DISTINCT FROM 'N' AND COALESCE(excluido_manualmente,false)=false", [start,end]),
        pool.query("SELECT COUNT(*) total FROM firebird_sync_emissoes WHERE data->>'STATUS_PPR' <> 'C'"),
        pool.query("SELECT SUM(quantidade*COALESCE(peso_un,0)) total FROM refugo_apontado_sync WHERE batch_id=(SELECT batch_id FROM refugos_sync_batches WHERE status='completed' ORDER BY completed_at DESC LIMIT 1) AND data_refugo BETWEEN $1 AND $2", [start,end]),
        pool.query("SELECT UPPER(TRIM(setor)) setor,SUM(quantidade*COALESCE(peso_un,0)) total FROM producao_apontada_sincronizada WHERE data_producao BETWEEN $1 AND $2 GROUP BY 1", [start,end])
    ]);
    await publishDashboardSnapshot('global', {
        faturamento: { totalKg: Number(fat.rows[0].total || 0) },
        carteira: { totalItens: Number(carteira.rows[0].total || 0) },
        refugo: { totalKg: Number(refugo.rows[0].total || 0) },
        producao: { totals: Object.fromEntries(producao.rows.map(row => [row.setor, Number(row.total || 0)])) }
    });
}

refreshDashboardSnapshot().then(() => console.log('Snapshot atualizado.')).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
