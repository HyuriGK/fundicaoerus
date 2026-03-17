// src/centro-custos.js
// API para gerenciar mapeamento Fornecedor → Centro de Custo
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// Lista fixa de centros de custo para fundição
const CENTROS_CUSTO = [
    { codigo: 'MTP', nome: 'Matéria-Prima' },
    { codigo: 'ARE', nome: 'Areia' },
    { codigo: 'RES', nome: 'Resina' },
    { codigo: 'CAT', nome: 'Catalisador' },
    { codigo: 'LIG', nome: 'Liga' },
    { codigo: 'CMB', nome: 'Combustível' },
    { codigo: 'FUS', nome: 'Fusão' },
    { codigo: 'MOL', nome: 'Moldagem' },
    { codigo: 'ACB', nome: 'Acabamento' },
    { codigo: 'USI', nome: 'Usinagem' },
    { codigo: 'TTE', nome: 'Trat. Térmico' },
    { codigo: 'LAB', nome: 'Laboratório / Qualidade' },
    { codigo: 'MAN', nome: 'Manutenção' },
    { codigo: 'ADM', nome: 'Administrativo' },
    { codigo: 'LOG', nome: 'Logística / Expedição' },
    { codigo: 'RH', nome: 'Recursos Humanos' },
    { codigo: 'COM', nome: 'Comercial' },
    { codigo: 'TER', nome: 'Terceirização' },
    { codigo: 'INV', nome: 'Investimentos' },
    { codigo: 'MDL', nome: 'Modelação' },
    { codigo: 'EQF', nome: 'Equip. Uso Fabril' },
    { codigo: 'PSV', nome: 'Prestação de Serviço' },
    { codigo: 'ALI', nome: 'Alimentação' },
    { codigo: 'EPI', nome: 'Equip. Proteção Individual' },
    { codigo: 'PRM', nome: 'Premiações' },
    { codigo: 'ENG', nome: 'Engenharia' },
    { codigo: 'SFT', nome: 'Softwares' },
    { codigo: 'GAS', nome: 'Gás' },
    { codigo: 'OUT', nome: 'Outros' }
];

// Ensure table exists (Updated for Item-Level Mapping)
async function ensureTable() {
    try {
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='centro_custos_mapeamento' AND column_name='produto') THEN
                    ALTER TABLE centro_custos_mapeamento ADD COLUMN produto VARCHAR(255) DEFAULT '';
                    ALTER TABLE centro_custos_mapeamento DROP CONSTRAINT IF EXISTS centro_custos_mapeamento_fornecedor_key;
                    ALTER TABLE centro_custos_mapeamento ADD CONSTRAINT cc_fornecedor_produto_unique UNIQUE (fornecedor, produto);
                END IF;
            END $$;
        `);
    } catch (e) {
        console.error('Erro ao migrar tabela centro_custos_mapeamento:', e.message);
    }
}

// Initialize on load
ensureTable();

// GET /api/centro-custos — Lista centros disponíveis + mapeamentos existentes
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT fornecedor, produto, centro_custo FROM centro_custos_mapeamento');
        const mapeamentos = {};
        rows.forEach(r => { 
            const key = `${r.fornecedor}|${r.produto || ''}`;
            mapeamentos[key] = r.centro_custo; 
        });

        res.json({
            success: true,
            centros: CENTROS_CUSTO,
            mapeamentos
        });
    } catch (e) {
        console.error('Erro ao buscar centro de custos:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /api/centro-custos/resumo — Resumo agregado por centro de custo (mês/ano)
router.get('/resumo', async (req, res) => {
    try {
        const { mes, ano } = req.query;

        // Get all items with values for the period
        let query = `
            SELECT nome as fornecedor, produto, SUM(valor) as total
            FROM custos_registros
            WHERE categoria = 'fornecedores'
        `;
        const params = [];
        if (mes) { params.push(Number(mes)); query += ` AND mes = $${params.length}`; }
        if (ano) { params.push(Number(ano)); query += ` AND ano = $${params.length}`; }
        query += ' GROUP BY nome, produto ORDER BY total DESC';

        const { rows: registros } = await pool.query(query, params);

        // Get mappings
        const { rows: mappings } = await pool.query('SELECT fornecedor, produto, centro_custo FROM centro_custos_mapeamento');
        const mapCC = {};
        mappings.forEach(m => { 
            const key = `${m.fornecedor}|${m.produto || ''}`;
            mapCC[key] = m.centro_custo; 
        });

        // Aggregate by CC
        const ccTotals = {};
        const ccFornecedores = {}; // We'll keep supplier level for high-level modal
        registros.forEach(r => {
            const keyExact = `${r.fornecedor}|${r.produto || ''}`;
            const keyDefault = `${r.fornecedor}|`; // Default mapping for supplier
            
            const cc = mapCC[keyExact] || mapCC[keyDefault] || 'SEM';
            const val = Number(r.total) || 0;
            ccTotals[cc] = (ccTotals[cc] || 0) + val;
            
            if (!ccFornecedores[cc]) ccFornecedores[cc] = [];
            let fEntry = ccFornecedores[cc].find(x => x.fornecedor === r.fornecedor);
            if (!fEntry) {
                fEntry = { fornecedor: r.fornecedor, total: 0, produtos: [] };
                ccFornecedores[cc].push(fEntry);
            }
            fEntry.total += val;
            if (!fEntry.produtos.includes(r.produto)) fEntry.produtos.push(r.produto);
        });

        // Build result array
        const centrosMap = {};
        CENTROS_CUSTO.forEach(c => { centrosMap[c.codigo] = c.nome; });
        centrosMap['SEM'] = 'Sem Centro de Custo';

        const result = Object.entries(ccTotals)
            .map(([cc, total]) => ({
                codigo: cc,
                nome: centrosMap[cc] || cc,
                total,
                fornecedores: ccFornecedores[cc] || []
            }))
            .sort((a, b) => b.total - a.total);

        res.json({ success: true, data: result });
    } catch (e) {
        console.error('Erro ao calcular resumo CC:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/centro-custos — Salvar/atualizar centro de custo de um item specifico
router.post('/', async (req, res) => {
    try {
        const { fornecedor, produto, centro_custo } = req.body;
        if (!fornecedor) return res.status(400).json({ success: false, error: 'Fornecedor é obrigatório' });
        const prodName = produto || '';

        if (!centro_custo || centro_custo === '') {
            await pool.query('DELETE FROM centro_custos_mapeamento WHERE fornecedor = $1 AND produto = $2', [fornecedor, prodName]);
        } else {
            await pool.query(`
                INSERT INTO centro_custos_mapeamento (fornecedor, produto, centro_custo, atualizado_em)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (fornecedor, produto) 
                DO UPDATE SET centro_custo = $3, atualizado_em = CURRENT_TIMESTAMP
            `, [fornecedor, prodName, centro_custo]);
        }

        res.json({ success: true });
    } catch (e) {
        console.error('Erro ao salvar centro de custo:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
