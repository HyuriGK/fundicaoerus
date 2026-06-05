const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { logActivity } = require('./lib/logger');

async function ensureTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS ti_chamados (
            id SERIAL PRIMARY KEY,
            titulo VARCHAR(255) NOT NULL,
            descricao TEXT,
            urgencia VARCHAR(20) NOT NULL DEFAULT 'media',
            usuario VARCHAR(255) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'aberto',
            resolucao TEXT,
            criado_em TIMESTAMP DEFAULT NOW(),
            resolvido_em TIMESTAMP,
            anexo_base64 TEXT,
            anexo_nome VARCHAR(255)
        )
    `);
    // Adiciona colunas se a tabela já existia sem elas
    await client.query(`ALTER TABLE ti_chamados ADD COLUMN IF NOT EXISTS anexo_base64 TEXT`);
    await client.query(`ALTER TABLE ti_chamados ADD COLUMN IF NOT EXISTS anexo_nome VARCHAR(255)`);
}

// GET /api/chamados — lista todos (desenvolvedor) ou do usuário
router.get('/', async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureTable(client);
        const { usuario, todos } = req.query;
        let result;
        if (todos === '1') {
            result = await client.query(
                'SELECT * FROM ti_chamados ORDER BY CASE urgencia WHEN \'critica\' THEN 1 WHEN \'alta\' THEN 2 WHEN \'media\' THEN 3 ELSE 4 END, criado_em DESC'
            );
        } else if (usuario) {
            result = await client.query(
                'SELECT * FROM ti_chamados WHERE usuario = $1 ORDER BY criado_em DESC',
                [usuario]
            );
        } else {
            result = await client.query('SELECT * FROM ti_chamados ORDER BY criado_em DESC');
        }
        res.json(result.rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// POST /api/chamados — abrir chamado
router.post('/', async (req, res) => {
    const { titulo, descricao, urgencia, usuario, anexo_base64, anexo_nome } = req.body;
    if (!titulo || !usuario) return res.status(400).json({ error: 'titulo e usuario são obrigatórios' });
    const client = await pool.connect();
    try {
        await ensureTable(client);
        const r = await client.query(
            'INSERT INTO ti_chamados (titulo, descricao, urgencia, usuario, anexo_base64, anexo_nome) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
            [titulo, descricao || '', urgencia || 'media', usuario, anexo_base64 || null, anexo_nome || null]
        );
        logActivity(usuario || req.headers['x-user'] || 'Sistema', 'ABRIR_CHAMADO', 'ti_chamados', { id: r.rows[0].id, titulo, urgencia: urgencia || 'media' });
        res.json(r.rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// PATCH /api/chamados/:id — atualizar status/resolução
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const { status, resolucao } = req.body;
    const client = await pool.connect();
    try {
        const resolvido_em = status === 'resolvido' ? new Date() : null;
        const r = await client.query(
            `UPDATE ti_chamados SET status=$1, resolucao=$2, resolvido_em=$3 WHERE id=$4 RETURNING *`,
            [status, resolucao || null, resolvido_em, id]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Chamado não encontrado' });
        logActivity(req.headers['x-user'] || 'Sistema', 'ATUALIZAR_CHAMADO', 'ti_chamados', { id, status, titulo: r.rows[0].titulo });
        res.json(r.rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// DELETE /api/chamados/:id
router.delete('/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('DELETE FROM ti_chamados WHERE id=$1', [req.params.id]);
        logActivity(req.headers['x-user'] || 'Sistema', 'DELETE_CHAMADO', 'ti_chamados', { id: req.params.id });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

module.exports = router;
