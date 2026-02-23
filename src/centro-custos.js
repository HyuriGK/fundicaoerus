// src/centro-custos.js
// API para gerenciar mapeamento Fornecedor → Centro de Custo
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// Lista fixa de centros de custo para fundição
const CENTROS_CUSTO = [
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
    { codigo: 'OUT', nome: 'Outros' }
];

// Ensure table exists
async function ensureTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS centro_custos_mapeamento (
                id SERIAL PRIMARY KEY,
                fornecedor VARCHAR(255) UNIQUE NOT NULL,
                centro_custo VARCHAR(10) NOT NULL,
                atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } catch (e) {
        console.error('Erro ao criar tabela centro_custos_mapeamento:', e.message);
    }
}

// Initialize on load
ensureTable();

// GET /api/centro-custos — Lista centros disponíveis + mapeamentos existentes
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT fornecedor, centro_custo FROM centro_custos_mapeamento');
        const mapeamentos = {};
        rows.forEach(r => { mapeamentos[r.fornecedor] = r.centro_custo; });

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

// POST /api/centro-custos — Salvar/atualizar centro de custo de um fornecedor
router.post('/', async (req, res) => {
    try {
        const { fornecedor, centro_custo } = req.body;
        if (!fornecedor) return res.status(400).json({ success: false, error: 'Fornecedor é obrigatório' });

        if (!centro_custo || centro_custo === '') {
            // Remove mapping
            await pool.query('DELETE FROM centro_custos_mapeamento WHERE fornecedor = $1', [fornecedor]);
        } else {
            // Upsert
            await pool.query(`
                INSERT INTO centro_custos_mapeamento (fornecedor, centro_custo, atualizado_em)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (fornecedor) 
                DO UPDATE SET centro_custo = $2, atualizado_em = CURRENT_TIMESTAMP
            `, [fornecedor, centro_custo]);
        }

        res.json({ success: true });
    } catch (e) {
        console.error('Erro ao salvar centro de custo:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
