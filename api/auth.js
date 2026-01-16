// api/auth.js
import pool from '../lib/db.js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

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
            // Sucesso! Retorna os dados (menos a senha)
            return res.status(200).json({ 
                success: true, 
                role: userData.role, // Aqui vem 'visitante', 'admin', etc.
                name: userData.name
            });
        } else {
            return res.status(401).json({ success: false, message: "Usuário ou senha incorretos." });
        }

    } catch (error) {
        console.error('Erro no login:', error);
        return res.status(500).json({ success: false, message: "Erro interno do servidor." });
    }
}