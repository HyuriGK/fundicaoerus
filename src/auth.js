const express = require('express');
const router = express.Router();
const pool = require('../lib/db'); // Importa o db convertido
const bcrypt = require('bcryptjs');
const { logActivity } = require('./lib/logger');

// Rota: POST /api/auth (definido no index.js)
router.post('/', async (req, res) => {
    const { user, pass } = req.body;

    if (!user || !pass) {
        return res.status(400).json({ success: false, message: "Dados incompletos." });
    }

    try {
        // 1. Busca o usuário pelo username
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [user]);
        const userData = result.rows[0];

        // Se não achou ninguém
        if (!userData) {
            return res.status(401).json({ success: false, message: "Usuário ou senha incorretos." });
        }

        // 2. Compara a senha enviada com a hash do banco
        const isMatch = await bcrypt.compare(pass, userData.password);

        if (isMatch) {
            // VERIFICAÇÃO DE APROVAÇÃO
            if (!userData.approved) {
                return res.status(401).json({
                    success: false,
                    message: "O administrador do sistema ainda não aceitou seu acesso."
                });
            }

            // Sucesso!
            // 3. Atualiza o timestamp de último login (Fire & Forget)
            pool.query('UPDATE users SET last_login = NOW() WHERE username = $1', [user])
                .then(() => logActivity(user, 'LOGIN', 'users', { name: userData.name, role: userData.role }))
                .catch(err => console.error('Erro ao atualizar last_login ou logar atividade:', err));

            // Retorna os dados
            return res.status(200).json({
                success: true,
                role: userData.role,
                name: userData.name,
                can_view_monetary: userData.can_view_monetary || false
            });
        } else {
            return res.status(401).json({ success: false, message: "Usuário ou senha incorretos." });
        }

    } catch (error) {
        console.error('Erro no login:', error);
        return res.status(500).json({ success: false, message: "Erro interno do servidor." });
    }
});

module.exports = router;