// scripts/sync-industrial-snapshots.js
const pool = require('../../lib/db');
const { getItemSectorMetrics } = require('../../public/js/shared-utils');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

/**
 * Script para capturar um "snapshot" (foto) da Posição Industrial atual.
 * Deve ser executado diariamente (ex: via agendador de tarefas ou cron).
 */

async function takeSnapshot() {
    console.log('📸 Iniciando captura de snapshot da Posição Industrial...');
    
    const pgClient = await pool.connect();
    
    try {
        // 0. Carregar pesos customizados
        console.log('⚖️ Carregando pesos customizados...');
        const resWeights = await pgClient.query('SELECT codigo, peso FROM pesos_customizados');
        const customWeights = {};
        resWeights.rows.forEach(row => {
            customWeights[String(row.codigo).trim()] = Number(row.peso);
        });

        // 1. Buscar todos os itens que compõem a "Posição Industrial" (Backlog)
        // SQL filtra itens faturados ou cancelados
        const queryPedidos = `
            SELECT 
                p.data,
                f.tipo_moldagem_procedimento
            FROM firebird_sync_emissoes p
            LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = (p.data->>'PRODUTO_PPR')
            WHERE 
                ((p.data->>'QUANTIDADE_PPR')::numeric - COALESCE((p.data->>'QUANTIDADE_FATURADA_PPR')::numeric, 0)) > 0 
                AND (p.data->>'STATUS_PPR') <> 'C'
        `;

        const result = await pgClient.query(queryPedidos);
        const allItems = result.rows.map(r => ({
            ...r.data,
            _tipo_moldagem_procedimento: r.tipo_moldagem_procedimento || null
        }));
        
        console.log(`📊 Processando ${allItems.length} itens da carteira...`);

        // 2. Acumuladores para os 8 setores
        const stats = {
            aguardando: { qty: 0, weight: 0, value: 0, ops: new Set() },
            moldagem:   { qty: 0, weight: 0, value: 0, ops: new Set() },
            moldagem_pesada: { qty: 0, weight: 0, value: 0, ops: new Set() },
            moldagem_leve:   { qty: 0, weight: 0, value: 0, ops: new Set() },
            moldagem_manual: { qty: 0, weight: 0, value: 0, ops: new Set() },
            moldagem_outros: { qty: 0, weight: 0, value: 0, ops: new Set() },
            fusao:      { qty: 0, weight: 0, value: 0, ops: new Set() },
            acabamento: { qty: 0, weight: 0, value: 0, ops: new Set() },
            tt:         { qty: 0, weight: 0, value: 0, ops: new Set() },
            usinagem:   { qty: 0, weight: 0, value: 0, ops: new Set() },
            qualidade:  { qty: 0, weight: 0, value: 0, ops: new Set() },
            expedicao:  { qty: 0, weight: 0, value: 0, ops: new Set() }
        };

        const addKpi = (sectorKey, qty, unitWeight, unitPrice, opKey) => {
            if (qty <= 0) return;

            // Deduplicação por OP (idêntico ao dashboard)
            const cleanedOP = String(opKey || '').trim();
            if (cleanedOP && cleanedOP !== '-') {
                if (stats[sectorKey].ops.has(cleanedOP)) return; // Já contou esta OP neste setor
                stats[sectorKey].ops.add(cleanedOP);
            }

            stats[sectorKey].qty += qty;
            stats[sectorKey].weight += (qty * unitWeight);
            stats[sectorKey].value += (qty * unitPrice);
        };

        // 3. Calcular métricas usando o shared-utils (garante consistência)
        for (const item of allItems) {
            // 1. Filtrar Modelos (terminam com 1) - Requisito do Dashboard
            const prodCode = String(item.PRODUTO_PPR || '').trim();
            if (prodCode.endsWith('1')) continue;

            // 2. Filtrar Itens Faturados (mesmo se ainda houver saldo residual)
            if (String(item.FATURADO_PPR || '').trim().toUpperCase() === 'T') continue;

            const metrics = getItemSectorMetrics(item);
            const targetTotalQty = metrics.targetTotalQty;

            // Calculo de peso unitario: ERP primeiro, customizado apenas como fallback
            let unitWeight = 0;
            if (item.PESO_UNIT && Number(item.PESO_UNIT) > 0) {
                unitWeight = Number(item.PESO_UNIT);
            } else {
                const erpUnit = targetTotalQty > 0 ? (Number(item.PESO_LIQUIDO_NPR) || 0) / targetTotalQty : 0;
                unitWeight = erpUnit > 0 ? erpUnit : (customWeights[prodCode] || 0);
            }

            const op = item.OP_PCS;
            const moldagemTipo = String(item._tipo_moldagem_procedimento || '').trim().toUpperCase();
            const moldagemKey = moldagemTipo === 'MOLDAGEM PESADA' ? 'moldagem_pesada'
                : moldagemTipo === 'MOLDAGEM LEVE' ? 'moldagem_leve'
                : moldagemTipo === 'MOLDAGEM MANUAL' ? 'moldagem_manual'
                : 'moldagem_outros';
            let unitPrice = parseFloat(item.VALOR_PPR || 0);
            if (item.PRECO_KG && Number(item.PRECO_KG) > 0 && customWeights[prodCode]) {
                unitPrice = Number(item.PRECO_KG) * unitWeight;
            }

            // Somar pesos/quantidades do backlog de cada setor
            addKpi('aguardando', metrics.qAguardando, unitWeight, unitPrice, op);
            addKpi('moldagem',   metrics.qMoldada,    unitWeight, unitPrice, op);
            addKpi(moldagemKey,  metrics.qMoldada,    unitWeight, unitPrice, op);
            addKpi('fusao',      metrics.qFusao,      unitWeight, unitPrice, op);
            addKpi('acabamento', metrics.qAcabamento, unitWeight, unitPrice, op);
            addKpi('tt',         metrics.qTT,         unitWeight, unitPrice, op);
            addKpi('usinagem',   metrics.qUsinagem,   unitWeight, unitPrice, op);
            addKpi('qualidade',  metrics.qQualidade,  unitWeight, unitPrice, op);
            addKpi('expedicao',  metrics.qExpedicao,  unitWeight, unitPrice, op);
        }
        
        // 4. Salvar no Banco
        const snapshotDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        console.log(`✅ Snapshot de ${snapshotDate} calculado com sucesso:`);
        Object.keys(stats).forEach(k => {
            console.log(`   - ${k.padEnd(12)}: ${String(stats[k].qty.toFixed(0)).padStart(5)} pçs / ${String(stats[k].weight.toFixed(2)).padStart(9)} kg / R$ ${stats[k].value.toFixed(2)} (OPs: ${stats[k].ops.size})`);
        });

        await pgClient.query(`
            ALTER TABLE industrial_snapshots
                ADD COLUMN IF NOT EXISTS aguardando_value NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS moldagem_value NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS moldagem_pesada_qty NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS moldagem_pesada_weight NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS moldagem_pesada_value NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS moldagem_leve_qty NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS moldagem_leve_weight NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS moldagem_leve_value NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS moldagem_manual_qty NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS moldagem_manual_weight NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS moldagem_manual_value NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS moldagem_outros_qty NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS moldagem_outros_weight NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS moldagem_outros_value NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS fusao_value NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS acabamento_value NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS tt_value NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS usinagem_value NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS qualidade_value NUMERIC DEFAULT 0,
                ADD COLUMN IF NOT EXISTS expedicao_value NUMERIC DEFAULT 0
        `);

        const queryInsert = `
            INSERT INTO industrial_snapshots (
                snapshot_date, 
                aguardando_qty, aguardando_weight, aguardando_value,
                moldagem_qty, moldagem_weight, moldagem_value,
                moldagem_pesada_qty, moldagem_pesada_weight, moldagem_pesada_value,
                moldagem_leve_qty, moldagem_leve_weight, moldagem_leve_value,
                moldagem_manual_qty, moldagem_manual_weight, moldagem_manual_value,
                moldagem_outros_qty, moldagem_outros_weight, moldagem_outros_value,
                fusao_qty, fusao_weight, fusao_value,
                acabamento_qty, acabamento_weight, acabamento_value,
                tt_qty, tt_weight, tt_value,
                usinagem_qty, usinagem_weight, usinagem_value,
                qualidade_qty, qualidade_weight, qualidade_value,
                expedicao_qty, expedicao_weight, expedicao_value
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37)
            ON CONFLICT (snapshot_date) 
            DO UPDATE SET 
                aguardando_qty = EXCLUDED.aguardando_qty, 
                aguardando_weight = EXCLUDED.aguardando_weight,
                aguardando_value = EXCLUDED.aguardando_value,
                moldagem_qty = EXCLUDED.moldagem_qty,
                moldagem_weight = EXCLUDED.moldagem_weight,
                moldagem_value = EXCLUDED.moldagem_value,
                moldagem_pesada_qty = EXCLUDED.moldagem_pesada_qty,
                moldagem_pesada_weight = EXCLUDED.moldagem_pesada_weight,
                moldagem_pesada_value = EXCLUDED.moldagem_pesada_value,
                moldagem_leve_qty = EXCLUDED.moldagem_leve_qty,
                moldagem_leve_weight = EXCLUDED.moldagem_leve_weight,
                moldagem_leve_value = EXCLUDED.moldagem_leve_value,
                moldagem_manual_qty = EXCLUDED.moldagem_manual_qty,
                moldagem_manual_weight = EXCLUDED.moldagem_manual_weight,
                moldagem_manual_value = EXCLUDED.moldagem_manual_value,
                moldagem_outros_qty = EXCLUDED.moldagem_outros_qty,
                moldagem_outros_weight = EXCLUDED.moldagem_outros_weight,
                moldagem_outros_value = EXCLUDED.moldagem_outros_value,
                fusao_qty = EXCLUDED.fusao_qty,
                fusao_weight = EXCLUDED.fusao_weight,
                fusao_value = EXCLUDED.fusao_value,
                acabamento_qty = EXCLUDED.acabamento_qty,
                acabamento_weight = EXCLUDED.acabamento_weight,
                acabamento_value = EXCLUDED.acabamento_value,
                tt_qty = EXCLUDED.tt_qty,
                tt_weight = EXCLUDED.tt_weight,
                tt_value = EXCLUDED.tt_value,
                usinagem_qty = EXCLUDED.usinagem_qty,
                usinagem_weight = EXCLUDED.usinagem_weight,
                usinagem_value = EXCLUDED.usinagem_value,
                qualidade_qty = EXCLUDED.qualidade_qty,
                qualidade_weight = EXCLUDED.qualidade_weight,
                qualidade_value = EXCLUDED.qualidade_value,
                expedicao_qty = EXCLUDED.expedicao_qty,
                expedicao_weight = EXCLUDED.expedicao_weight,
                expedicao_value = EXCLUDED.expedicao_value,
                created_at = CURRENT_TIMESTAMP;
        `;

        await pgClient.query(queryInsert, [
            snapshotDate,
            stats.aguardando.qty, stats.aguardando.weight, stats.aguardando.value,
            stats.moldagem.qty, stats.moldagem.weight, stats.moldagem.value,
            stats.moldagem_pesada.qty, stats.moldagem_pesada.weight, stats.moldagem_pesada.value,
            stats.moldagem_leve.qty, stats.moldagem_leve.weight, stats.moldagem_leve.value,
            stats.moldagem_manual.qty, stats.moldagem_manual.weight, stats.moldagem_manual.value,
            stats.moldagem_outros.qty, stats.moldagem_outros.weight, stats.moldagem_outros.value,
            stats.fusao.qty, stats.fusao.weight, stats.fusao.value,
            stats.acabamento.qty, stats.acabamento.weight, stats.acabamento.value,
            stats.tt.qty, stats.tt.weight, stats.tt.value,
            stats.usinagem.qty, stats.usinagem.weight, stats.usinagem.value,
            stats.qualidade.qty, stats.qualidade.weight, stats.qualidade.value,
            stats.expedicao.qty, stats.expedicao.weight, stats.expedicao.value
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
