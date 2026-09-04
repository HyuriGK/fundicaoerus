const express = require('express');
const router = express.Router();
const pool = require('../lib/db'); // Importação no padrão CommonJS
const bcrypt = require('bcryptjs');

// Rota: POST /api/register (conforme definido no api/index.js)
router.post('/', async (req, res) => {
    const { fullName, user, pass } = req.body;

    // Validação básica
    const username = String(user || '').trim().toLowerCase();
    if (!fullName || !username || !pass) {
        return res.status(400).json({ success: false, message: "Preencha todos os campos." });
    }
    if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
        return res.status(400).json({ success: false, message: "Usuário deve ter de 3 a 50 caracteres: letras, números, ponto, hífen ou sublinhado." });
    }
    if (String(pass).length < 10 || !/[a-z]/i.test(pass) || !/\d/.test(pass)) {
        return res.status(400).json({ success: false, message: "Senha deve ter ao menos 10 caracteres, incluindo letras e números." });
    }

    try {
        // 1. Verifica se o usuário já existe no banco
        const userCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ success: false, message: "Usuário já existe. Escolha outro." });
        }

        // 2. Criptografa a senha (Nunca salve senha pura!)
        const salt = await bcrypt.genSalt(10);
        const hashPass = await bcrypt.hash(pass, salt);

        // 3. Insere no Neon (Role padrão será 'visitante' definido no banco)
        await pool.query(
            "INSERT INTO users (name, username, password, approved, role) VALUES ($1, $2, $3, FALSE, 'visitante')",
            [String(fullName).trim().slice(0, 255), username, hashPass]
        );

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Erro no registro:', error);
        return res.status(500).json({ success: false, message: "Erro interno do servidor." });
    }
});

module.exports = router;
