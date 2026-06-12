const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

let tableReady = false;
async function ensureTable() {
    if (tableReady) return;
    await pool.query(`CREATE TABLE IF NOT EXISTS rh_colaboradores (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        cpf VARCHAR(14),
        data_admissao DATE,
        cargo VARCHAR(120),
        setor VARCHAR(120),
        avaliacoes JSONB DEFAULT '{}'::jsonb,
        exames JSONB DEFAULT '[]'::jsonb,
        cursos JSONB DEFAULT '[]'::jsonb,
        epis JSONB DEFAULT '[]'::jsonb,
        ativo BOOLEAN DEFAULT TRUE,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query(`ALTER TABLE rh_colaboradores ADD COLUMN IF NOT EXISTS vinculo VARCHAR(20)`);
    tableReady = true;
}

// Listar funcionários
router.get('/funcionarios', async (req, res) => {
    try {
        await ensureTable();
        const result = await pool.query(`
            SELECT id, nome, cpf, TO_CHAR(data_admissao, 'YYYY-MM-DD') as data_admissao,
                   cargo, setor, vinculo, avaliacoes, exames, cursos, epis, ativo
            FROM rh_colaboradores
            WHERE ativo = TRUE
            ORDER BY nome ASC
        `);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Erro GET RH funcionários:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Criar funcionário
router.post('/funcionarios', async (req, res) => {
    const { nome, cpf, data_admissao, cargo, setor, vinculo, avaliacoes, exames, cursos, epis } = req.body;
    if (!nome || !String(nome).trim()) {
        return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
    }
    try {
        await ensureTable();
        const result = await pool.query(`
            INSERT INTO rh_colaboradores (nome, cpf, data_admissao, cargo, setor, vinculo, avaliacoes, exames, cursos, epis)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `, [
            String(nome).trim(),
            cpf || null,
            data_admissao || null,
            cargo || null,
            setor || null,
            vinculo || null,
            JSON.stringify(avaliacoes || {}),
            JSON.stringify(exames || []),
            JSON.stringify(cursos || []),
            JSON.stringify(epis || [])
        ]);
        res.json({ success: true, id: result.rows[0].id });
    } catch (error) {
        console.error('Erro POST RH funcionário:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Atualizar funcionário
router.put('/funcionarios/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, cpf, data_admissao, cargo, setor, vinculo, avaliacoes, exames, cursos, epis } = req.body;
    try {
        await ensureTable();
        await pool.query(`
            UPDATE rh_colaboradores SET
                nome = $1, cpf = $2, data_admissao = $3, cargo = $4, setor = $5, vinculo = $6,
                avaliacoes = $7, exames = $8, cursos = $9, epis = $10,
                atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $11
        `, [
            String(nome || '').trim(),
            cpf || null,
            data_admissao || null,
            cargo || null,
            setor || null,
            vinculo || null,
            JSON.stringify(avaliacoes || {}),
            JSON.stringify(exames || []),
            JSON.stringify(cursos || []),
            JSON.stringify(epis || []),
            id
        ]);
        res.json({ success: true });
    } catch (error) {
        console.error('Erro PUT RH funcionário:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Excluir funcionário (soft delete)
router.delete('/funcionarios/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await ensureTable();
        await pool.query('UPDATE rh_colaboradores SET ativo = FALSE, atualizado_em = CURRENT_TIMESTAMP WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Erro DELETE RH funcionário:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
