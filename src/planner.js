const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { logActivity } = require('./lib/logger');

function getUser(req) {
    return String(req.user && req.user.name || req.query.user || (req.body && req.body.user) || 'Desconhecido').trim() || 'Desconhecido';
}

async function ensureTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS planner_tasks (
            id SERIAL PRIMARY KEY,
            owner_username VARCHAR(255) NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT DEFAULT '',
            status VARCHAR(20) NOT NULL DEFAULT 'todo',
            priority VARCHAR(20) NOT NULL DEFAULT 'media',
            due_date DATE,
            tags TEXT[] DEFAULT '{}',
            position INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            completed_at TIMESTAMPTZ
        )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_planner_tasks_owner ON planner_tasks(owner_username)');
}

router.get('/tasks', async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureTable(client);
        const user = getUser(req);
        const result = await client.query(
            `SELECT id, title, description, status, priority,
                    to_char(due_date, 'YYYY-MM-DD') AS due_date,
                    COALESCE(tags, '{}') AS tags,
                    position, created_at, updated_at, completed_at
             FROM planner_tasks
             WHERE owner_username = $1
             ORDER BY status, position, created_at DESC`,
            [user]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

router.post('/tasks', async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureTable(client);
        const user = getUser(req);
        const { title, description = '', status = 'todo', priority = 'media', due_date = null, tags = [] } = req.body;
        if (!title || !String(title).trim()) return res.status(400).json({ success: false, error: 'Título obrigatório.' });

        const posResult = await client.query(
            'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM planner_tasks WHERE owner_username = $1 AND status = $2',
            [user, status]
        );
        const result = await client.query(
            `INSERT INTO planner_tasks
                (owner_username, title, description, status, priority, due_date, tags, position)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING id, title, description, status, priority,
                       to_char(due_date, 'YYYY-MM-DD') AS due_date,
                       COALESCE(tags, '{}') AS tags,
                       position, created_at, updated_at, completed_at`,
            [user, String(title).trim(), description, status, priority, due_date || null, tags, posResult.rows[0].next_position]
        );
        logActivity(user, 'ADD_TAREFA', 'planner_tasks', { id: result.rows[0].id, titulo: String(title).trim(), prioridade: priority });
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

router.put('/tasks/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureTable(client);
        const user = getUser(req);
        const { title, description = '', status = 'todo', priority = 'media', due_date = null, tags = [] } = req.body;
        if (!title || !String(title).trim()) return res.status(400).json({ success: false, error: 'Título obrigatório.' });

        const result = await client.query(
            `UPDATE planner_tasks
             SET title=$1, description=$2, status=$3, priority=$4, due_date=$5, tags=$6,
                 completed_at = CASE WHEN $3 = 'done' AND completed_at IS NULL THEN NOW() WHEN $3 <> 'done' THEN NULL ELSE completed_at END,
                 updated_at=NOW()
             WHERE id=$7 AND owner_username=$8
             RETURNING id, title, description, status, priority,
                       to_char(due_date, 'YYYY-MM-DD') AS due_date,
                       COALESCE(tags, '{}') AS tags,
                       position, created_at, updated_at, completed_at`,
            [String(title).trim(), description, status, priority, due_date || null, tags, req.params.id, user]
        );
        if (!result.rows.length) return res.status(404).json({ success: false, error: 'Tarefa não encontrada.' });
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

router.patch('/tasks/:id/move', async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureTable(client);
        const user = getUser(req);
        const { status, position = 0 } = req.body;
        await client.query(
            `UPDATE planner_tasks
             SET status=$1, position=$2,
                 completed_at = CASE WHEN $1 = 'done' AND completed_at IS NULL THEN NOW() WHEN $1 <> 'done' THEN NULL ELSE completed_at END,
                 updated_at=NOW()
             WHERE id=$3 AND owner_username=$4`,
            [status, position, req.params.id, user]
        );
        const STATUS_LABEL = { todo: 'A Fazer', doing: 'Fazendo', done: 'Concluído' };
        logActivity(user, status === 'done' ? 'CONCLUIR_TAREFA' : 'MOVER_TAREFA', 'planner_tasks', { id: req.params.id, status: STATUS_LABEL[status] || status });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

router.post('/tasks/reorder', async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureTable(client);
        const user = getUser(req);
        const { columns = {} } = req.body;
        await client.query('BEGIN');
        for (const [status, ids] of Object.entries(columns)) {
            for (let i = 0; i < ids.length; i++) {
                await client.query(
                    'UPDATE planner_tasks SET status=$1, position=$2, updated_at=NOW() WHERE id=$3 AND owner_username=$4',
                    [status, i, ids[i], user]
                );
            }
        }
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

router.delete('/tasks/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureTable(client);
        const user = getUser(req);
        const prev = await client.query('SELECT title FROM planner_tasks WHERE id=$1 AND owner_username=$2', [req.params.id, user]);
        await client.query('DELETE FROM planner_tasks WHERE id=$1 AND owner_username=$2', [req.params.id, user]);
        logActivity(user, 'DELETE_TAREFA', 'planner_tasks', { id: req.params.id, titulo: prev.rows[0]?.title || null });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;
