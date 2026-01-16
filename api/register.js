// api/register.js
import pool from '../db.js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    const { fullName, user, pass } = req.body;

    // Validação básica
    if (!fullName || !user || !pass) {
        return res.status(400).json({ success: false, message: "Preencha todos os campos." });
    }

    try {
        // 1. Verifica se o usuário já existe no banco
        const userCheck = await pool.query('SELECT id FROM users WHERE username = $1', [user]);
        
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ success: false, message: "Usuário já existe. Escolha outro." });
        }

        // 2. Criptografa a senha (Nunca salve senha pura!)
        const salt = await bcrypt.genSalt(10);
        const hashPass = await bcrypt.hash(pass, salt);

        // 3. Insere no Neon (Role padrão será 'visitante' definido no banco)
        await pool.query(
            'INSERT INTO users (name, username, password) VALUES ($1, $2, $3)',
            [fullName, user, hashPass]
        );

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Erro no registro:', error);
        return res.status(500).json({ success: false, message: "Erro interno do servidor." });
    }
}