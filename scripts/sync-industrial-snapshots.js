// scripts/sync-industrial-snapshots.js
const pool = require('../lib/db');
const { getItemSectorMetrics } = require('../public/js/shared-utils');
require('dotenv').config({ path: '.env.local' });

/**
 * Script para capturar um "snapshot" (foto) da Posição Industrial atual.
 * Deve ser executado diariamente (ex: via agendador de tarefas ou cron).
 */

async function takeSnapshot() {
    console.log('📸 Iniciando captura de snapshot da Posição Industrial...');
    
    const pgClient = await pool.connect();
    
    try {
        // 1. Buscar todos os itens que compõem a "Posição Industrial" (Backlog)
        // Usamos a mesma lógica do dashboard de Pedidos
        const queryPedidos = `
            SELECT 
                p.data
            FROM firebird_sync_pedidos p
            WHERE 
                ((p.data->>'QUANTIDADE_PPR')::numeric - COALESCE((p.data->>'QUANTIDADE_FATURADA_PPR')::numeric, 0)) > 0 
                AND (p.data->>'STATUS_PPR') <> 'C'
                AND (p.data->>'STATUS_PED') IS DISTINCT FROM 'C'
                AND TRIM(UPPER(p.data->>'FATURADO_PPR')) <> 'T'
        `;

        const result = await pgClient.query(queryPedidos);
        const allItems = result.rows.map(r => r.data);
        
        console.log(`📊 Processando ${allItems.length} itens da carteira...`);

        // 2. Acumuladores para os 8 setores
        const stats = {
            aguardando: { qty: 0, weight: 0 },
            moldagem:   { qty: 0, weight: 0 },
            fusao:      { qty: 0, weight: 0 },
            acabamento: { qty: 0, weight: 0 },
            tt:         { qty: 0, weight: 0 },
            usinagem:   { qty: 0, weight: 0 },
            qualidade:  { qty: 0, weight: 0 },
            expedicao:  { qty: 0, weight: 0 },
            _processedOPs: new Set()
        };

        const addKpi = (sectorKey, qty, unitWeight) => {
            if (qty <= 0) return;
            stats[sectorKey].qty += qty;
            stats[sectorKey].weight += (qty * unitWeight);
        };

        // 3. Calcular métricas usando o shared-utils (garante consistência)
        for (const item of allItems) {
            const metrics = getItemSectorMetrics(item);
            
            // Cálculo de Peso Unitário (Idêntico ao shared-utils ou pedidos.html)
            let unitWeight = 0;
            const originalTarget = metrics.originalTarget;
            if (item.PESO_UNIT && Number(item.PESO_UNIT) > 0) {
                unitWeight = Number(item.PESO_UNIT);
            } else {
                unitWeight = originalTarget > 0 ? (Number(item.PESO_LIQUIDO_NPR) || 0) / originalTarget : 0;
            }

            // Somar pesos/quantidades do backlog de cada setor
            addKpi('aguardando', metrics.qAguardando, unitWeight);
            addKpi('moldagem',   metrics.qMoldada,    unitWeight);
            addKpi('fusao',      metrics.qFusao,      unitWeight);
            addKpi('acabamento', metrics.qAcabamento, unitWeight);
            addKpi('tt',         metrics.qTT,         unitWeight);
            addKpi('usinagem',   metrics.qUsinagem,   unitWeight);
            addKpi('qualidade',  metrics.qQualidade,  unitWeight);
            addKpi('expedicao',  metrics.qExpedicao,  unitWeight);
        }
        
        // 4. Salvar no Banco
        const snapshotDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        console.log(`✅ Snapshot de ${snapshotDate} calculado com sucesso:`);
        Object.keys(stats).filter(k => k !== '_processedOPs').forEach(k => {
            console.log(`   - ${k}: ${stats[k].qty.toFixed(0)} pçs / ${stats[k].weight.toFixed(2)} kg`);
        });

        const queryInsert = `
            INSERT INTO industrial_snapshots (
                snapshot_date, 
                aguardando_qty, aguardando_weight,
                moldagem_qty, moldagem_weight,
                fusao_qty, fusao_weight,
                acabamento_qty, acabamento_weight,
                tt_qty, tt_weight,
                usinagem_qty, usinagem_weight,
                qualidade_qty, qualidade_weight,
                expedicao_qty, expedicao_weight
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT (snapshot_date) 
            DO UPDATE SET 
                aguardando_qty = EXCLUDED.aguardando_qty, 
                aguardando_weight = EXCLUDED.aguardando_weight,
                moldagem_qty = EXCLUDED.moldagem_qty,
                moldagem_weight = EXCLUDED.moldagem_weight,
                fusao_qty = EXCLUDED.fusao_qty,
                fusao_weight = EXCLUDED.fusao_weight,
                acabamento_qty = EXCLUDED.acabamento_qty,
                acabamento_weight = EXCLUDED.acabamento_weight,
                tt_qty = EXCLUDED.tt_qty,
                tt_weight = EXCLUDED.tt_weight,
                usinagem_qty = EXCLUDED.usinagem_qty,
                usinagem_weight = EXCLUDED.usinagem_weight,
                qualidade_qty = EXCLUDED.qualidade_qty,
                qualidade_weight = EXCLUDED.qualidade_weight,
                expedicao_qty = EXCLUDED.expedicao_qty,
                expedicao_weight = EXCLUDED.expedicao_weight,
                created_at = CURRENT_TIMESTAMP;
        `;

        await pgClient.query(queryInsert, [
            snapshotDate,
            stats.aguardando.qty, stats.aguardando.weight,
            stats.moldagem.qty, stats.moldagem.weight,
            stats.fusao.qty, stats.fusao.weight,
            stats.acabamento.qty, stats.acabamento.weight,
            stats.tt.qty, stats.tt.weight,
            stats.usinagem.qty, stats.usinagem.weight,
            stats.qualidade.qty, stats.qualidade.weight,
            stats.expedicao.qty, stats.expedicao.weight
        ]);

        console.log(`✅ Snapshot de ${snapshotDate} salvo no banco.`);

    } catch (err) {
        console.error('❌ Erro ao capturar snapshot:', err);
    } finally {
        pgClient.release();
        process.exit(0);
    }
}

takeSnapshot();
