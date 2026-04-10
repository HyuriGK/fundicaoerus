// scripts/sync-industrial-snapshots.js
require('dotenv').config({ path: '.env.local' });
const pool = require('../lib/db');
const { getItemSectorMetrics, getCorrectedWeight } = require('../public/js/shared-utils');

async function takeSnapshot() {
    console.log('📸 Iniciando captura de snapshot da Posição Industrial...');
    
    const client = await pool.connect();
    try {
        // 1. Carregar Pesos Customizados
        const weightsRes = await client.query('SELECT codigo, peso FROM pesos_customizados');
        const customWeights = {};
        weightsRes.rows.forEach(r => customWeights[r.codigo] = parseFloat(r.peso));
        
        // 2. Carregar Pedidos Ativos (Carteira)
        // Lógica idêntica ao src/pedidos-sync.js para consistência total
        const queryPedidos = `
            SELECT 
                p.data
            FROM firebird_sync_pedidos p
            WHERE 
                ((p.data->>'QUANTIDADE_PPR')::numeric - COALESCE((p.data->>'QUANTIDADE_FATURADA_PPR')::numeric, 0)) > 0 
                AND (p.data->>'STATUS_PPR') <> 'C'
        `;
        const resultPedidos = await client.query(queryPedidos);
        const allItems = resultPedidos.rows.map(r => r.data);
        
        console.log(`📊 Processando ${allItems.length} itens da carteira...`);
        
        // 3. Calcular Totais por Setor
        let stats = {
            aguardando: { qty: 0, weight: 0 },
            moldagem:   { qty: 0, weight: 0 },
            fusao:      { qty: 0, weight: 0 },
            acabamento: { qty: 0, weight: 0 },
            tt:         { qty: 0, weight: 0 },
            usinagem:   { qty: 0, weight: 0 },
            qualidade:  { qty: 0, weight: 0 },
            expedicao:  { qty: 0, weight: 0 }
        };

        for (const item of allItems) {
            const metrics = getItemSectorMetrics(item);
            
            // Peso Unitário Corrigido
            const originalTarget = metrics.originalTarget;
            let unitWeight = 0;
            const prodCode = String(item.PRODUTO_PPR || '').trim();
            
            if (item.PESO_UNIT !== undefined && item.PESO_UNIT !== null && item.PESO_UNIT !== '' && Number(item.PESO_UNIT) > 0) {
                unitWeight = Number(item.PESO_UNIT);
            } else if (customWeights[prodCode]) {
                unitWeight = customWeights[prodCode];
            } else {
                unitWeight = originalTarget > 0 ? (Number(item.PESO_LIQUIDO_NPR) || 0) / originalTarget : 0;
            }

            // Mapeamento dos saldos individuais
            stats.aguardando.qty += metrics.qAguardando;
            stats.aguardando.weight += metrics.qAguardando * unitWeight;

            stats.moldagem.qty += metrics.qMoldada;
            stats.moldagem.weight += metrics.qMoldada * unitWeight;

            stats.fusao.qty += metrics.qFusao;
            stats.fusao.weight += metrics.qFusao * unitWeight;

            stats.acabamento.qty += metrics.qAcabamento;
            stats.acabamento.weight += metrics.qAcabamento * unitWeight;

            stats.tt.qty += metrics.qTT;
            stats.tt.weight += metrics.qTT * unitWeight;

            stats.usinagem.qty += metrics.qUsinagem;
            stats.usinagem.weight += metrics.qUsinagem * unitWeight;

            stats.qualidade.qty += metrics.qQualidade;
            stats.qualidade.weight += metrics.qQualidade * unitWeight;

            stats.expedicao.qty += metrics.qExpedicao;
            stats.expedicao.weight += metrics.qExpedicao * unitWeight;
        }
        
        // 4. Salvar no Banco
        const snapshotDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        await client.query(`
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
                created_at = CURRENT_TIMESTAMP
        `, [
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
        
        console.log(`✅ Snapshot de ${snapshotDate} salvo com sucesso para os 8 setores.`);
        console.log(`   - Usinagem: ${stats.usinagem.qty.toFixed(0)} pçs / ${stats.usinagem.weight.toFixed(2)} kg`);
        
    } catch (err) {
        console.error('❌ Erro ao capturar snapshot:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

takeSnapshot();
