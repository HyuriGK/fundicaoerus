import pool from '../db.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    // O HTML chama esse endpoint para limpar TUDO antes de reinserir o que sobrou (no caso de limpeza parcial)
    // ou apenas limpar tudo.
    
    try {
        await pool.query('TRUNCATE TABLE producao_apontada RESTART IDENTITY');
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}