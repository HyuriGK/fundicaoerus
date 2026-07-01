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

async function ensureSenhasTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS ti_senhas (
            id SERIAL PRIMARY KEY,
            tipo VARCHAR(30) NOT NULL DEFAULT 'programa',
            titulo VARCHAR(255) NOT NULL,
            sistema VARCHAR(255),
            usuario_acesso VARCHAR(255),
            senha TEXT NOT NULL,
            computador VARCHAR(255),
            url TEXT,
            observacoes TEXT,
            criado_por VARCHAR(255),
            criado_em TIMESTAMP DEFAULT NOW(),
            atualizado_em TIMESTAMP DEFAULT NOW()
        )
    `);
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
        logActivity(usuario || req.user && req.user.name || 'Sistema', 'ABRIR_CHAMADO', 'ti_chamados', { id: r.rows[0].id, titulo, urgencia: urgencia || 'media' });
        res.json(r.rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

router.get('/senhas', async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureSenhasTable(client);
        const result = await client.query('SELECT * FROM ti_senhas ORDER BY atualizado_em DESC, titulo ASC');
        res.json(result.rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

router.post('/senhas', async (req, res) => {
    const { tipo, titulo, sistema, usuario_acesso, senha, computador, url, observacoes, criado_por } = req.body;
    if (!titulo || !senha) return res.status(400).json({ error: 'titulo e senha são obrigatórios' });
    const client = await pool.connect();
    try {
        await ensureSenhasTable(client);
        const r = await client.query(
            `INSERT INTO ti_senhas (tipo, titulo, sistema, usuario_acesso, senha, computador, url, observacoes, criado_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [tipo || 'programa', titulo, sistema || null, usuario_acesso || null, senha, computador || null, url || null, observacoes || null, criado_por || null]
        );
        logActivity(criado_por || req.user && req.user.name || 'Sistema', 'CRIAR_SENHA_TI', 'ti_senhas', { id: r.rows[0].id, titulo });
        res.json(r.rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

router.put('/senhas/:id', async (req, res) => {
    const { tipo, titulo, sistema, usuario_acesso, senha, computador, url, observacoes, criado_por } = req.body;
    if (!titulo || !senha) return res.status(400).json({ error: 'titulo e senha são obrigatórios' });
    const client = await pool.connect();
    try {
        await ensureSenhasTable(client);
        const r = await client.query(
            `UPDATE ti_senhas
             SET tipo=$1, titulo=$2, sistema=$3, usuario_acesso=$4, senha=$5, computador=$6, url=$7, observacoes=$8, atualizado_em=NOW()
             WHERE id=$9 RETURNING *`,
            [tipo || 'programa', titulo, sistema || null, usuario_acesso || null, senha, computador || null, url || null, observacoes || null, req.params.id]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Senha não encontrada' });
        logActivity(criado_por || req.user && req.user.name || 'Sistema', 'ATUALIZAR_SENHA_TI', 'ti_senhas', { id: req.params.id, titulo });
        res.json(r.rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

router.delete('/senhas/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const r = await client.query('DELETE FROM ti_senhas WHERE id=$1 RETURNING titulo', [req.params.id]);
        logActivity(req.user && req.user.name || 'Sistema', 'DELETE_SENHA_TI', 'ti_senhas', { id: req.params.id, titulo: r.rows[0]?.titulo });
        res.json({ ok: true });
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
        logActivity(req.user && req.user.name || 'Sistema', 'ATUALIZAR_CHAMADO', 'ti_chamados', { id, status, titulo: r.rows[0].titulo });
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
        logActivity(req.user && req.user.name || 'Sistema', 'DELETE_CHAMADO', 'ti_chamados', { id: req.params.id });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

module.exports = router;
