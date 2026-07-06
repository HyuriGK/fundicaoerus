const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { logActivity } = require('./lib/logger');

// Middleware básico para pegar o ID do usuário pelo username no header x-user
const getUserId = async (req, res, next) => {
    const username = req.user && req.user.name;
    if (!username) {
        return res.status(401).json({ success: false, message: 'Usuário não identificado.' });
    }
    try {
        const result = await pool.query('SELECT id, role FROM users WHERE username = $1 OR name = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
        }
        req.userId = result.rows[0].id;
        req.userRole = result.rows[0].role;
        next();
    } catch (error) {
        console.error('Erro ao identificar usuário:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
};

// LISTAR TODAS AS MENSAGENS (Admin/Dev apenas)
router.get('/all', getUserId, async (req, res) => {
    if (req.userRole !== 'desenvolvedor' && req.userRole !== 'admin') {
        return res.status(403).json({ success: false, message: 'Acesso negado.' });
    }
    try {
        const result = await pool.query(`
            SELECT c.*, u.name as sender_name, r.name as recipient_name
            FROM communications c
            LEFT JOIN users u ON c.sender_id = u.id
            LEFT JOIN users r ON c.recipient_id = r.id
            ORDER BY c.created_at DESC
        `);
        res.json({ success: true, communications: result.rows });
    } catch (error) {
        console.error('Erro ao listar comunicações:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar mensagens.' });
    }
});

// ENVIAR MENSAGEM
router.post('/', getUserId, async (req, res) => {
    if (req.userRole !== 'desenvolvedor' && req.userRole !== 'admin') {
        return res.status(403).json({ success: false, message: 'Acesso negado.' });
    }
    const { recipient_ids, message, subject, expiry_days, expiry_hours, expiry_minutes, expiry_seconds } = req.body;

    if (!message) {
        return res.status(400).json({ success: false, message: 'Mensagem vazia.' });
    }

    try {
        let valid_until = null;
        const d = parseInt(expiry_days) || 0;
        const h = parseInt(expiry_hours) || 0;
        const m = parseInt(expiry_minutes) || 0;
        const s = parseInt(expiry_seconds) || 0;
        const totalMs = ((((d * 24 + h) * 60) + m) * 60 + s) * 1000;
        if (totalMs > 0) {
            valid_until = new Date(Date.now() + totalMs);
        }

        // Se for para todos (recipient_ids vazio ou nulo)
        if (!recipient_ids || recipient_ids.length === 0) {
            const result = await pool.query(
                'INSERT INTO communications (sender_id, recipient_id, message, subject, valid_until) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                [req.userId, null, message, subject || null, valid_until]
            );
            res.json({ success: true, communication: result.rows[0] });
        } else {
            // Se for para múltiplos usuários específicos
            const queries = recipient_ids.map(rid => {
                return pool.query(
                    'INSERT INTO communications (sender_id, recipient_id, message, subject, valid_until) VALUES ($1, $2, $3, $4, $5)',
                    [req.userId, rid, message, subject || null, valid_until]
                );
            });
            await Promise.all(queries);
            res.json({ success: true, message: 'Mensagens enviadas com sucesso.' });
        }
        
        logActivity(req.user && req.user.name, 'SEND_MESSAGE', 'communications', {
            recipients: recipient_ids && recipient_ids.length ? recipient_ids.length : 'ALL',
            msg_length: message.length,
            valid_until: valid_until ? valid_until.toISOString() : 'NONE'
        });

    } catch (error) {
        console.error('Erro ao enviar comunicação:', error);
        res.status(500).json({ success: false, message: 'Erro ao enviar mensagem.' });
    }
});

// BUSCAR MENSAGENS NÃO LIDAS PARA O USUÁRIO ATUAL
router.get('/unread', getUserId, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*, u.name as sender_name
            FROM communications c
            LEFT JOIN users u ON c.sender_id = u.id
            WHERE (c.recipient_id = $1 OR c.recipient_id IS NULL)
              AND (c.valid_until IS NULL OR c.valid_until >= NOW())
              AND NOT EXISTS (
                  SELECT 1 FROM communication_reads cr 
                  WHERE cr.communication_id = c.id AND cr.user_id = $1
              )
            ORDER BY c.created_at ASC
        `, [req.userId]);
        
        res.json({ success: true, unread: result.rows });
    } catch (error) {
        console.error('Erro ao buscar mensagens não lidas:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar notificações.' });
    }
});

// BUSCAR HISTÓRICO DE MENSAGENS (Lidas e não lidas, mas NÃO expiradas)
router.get('/history', getUserId, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                c.*, 
                u.name as sender_name,
                EXISTS (
                    SELECT 1 FROM communication_reads cr 
                    WHERE cr.communication_id = c.id AND cr.user_id = $1
                ) as is_read
            FROM communications c
            LEFT JOIN users u ON c.sender_id = u.id
            WHERE (c.recipient_id = $1 OR c.recipient_id IS NULL)
              AND (c.valid_until IS NULL OR c.valid_until >= NOW())
            ORDER BY c.created_at DESC
            LIMIT 30
        `, [req.userId]);
        
        res.json({ success: true, history: result.rows });
    } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar histórico.' });
    }
});

// MARCAR COMO LIDA
router.post('/mark-read', getUserId, async (req, res) => {
    const { message_id } = req.body;
    if (!message_id) {
        return res.status(400).json({ success: false, message: 'ID da mensagem não fornecido.' });
    }

    try {
        await pool.query(
            'INSERT INTO communication_reads (user_id, communication_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [req.userId, message_id]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao marcar como lida:', error);
        res.status(500).json({ success: false, message: 'Erro ao atualizar status de leitura.' });
    }
});

module.exports = router;
