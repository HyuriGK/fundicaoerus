const pool = require('../../lib/db');
const { publishDashboardSnapshot } = require('../../lib/dashboard-snapshot');

(async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const scrap = await pool.query(`SELECT UPPER(TRIM(COALESCE(r.motivo,'NAO INFORMADO'))) motivo,SUM(r.quantidade*COALESCE(pc.peso,r.peso_un,0)) peso FROM refugo_apontado_sync r LEFT JOIN pesos_customizados pc ON pc.codigo=r.codigo_peca WHERE r.batch_id=(SELECT batch_id FROM refugos_sync_batches WHERE status='completed' ORDER BY completed_at DESC LIMIT 1) AND r.data_refugo BETWEEN $1 AND $2 GROUP BY 1`, [start,end]);
    const byMotive = {}; let totalKg = 0;
    scrap.rows.forEach(row => { const peso=Number(row.peso||0); totalKg += peso; byMotive[row.motivo]=peso; });
    await publishDashboardSnapshot('refugo', { totalKg, byMotive });
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
