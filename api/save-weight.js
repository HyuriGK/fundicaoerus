import pool from './db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { codigo, peso } = req.body;

  try {
    await pool.query(`
      INSERT INTO pesos_customizados (codigo, peso) VALUES ($1, $2)
      ON CONFLICT (codigo) DO UPDATE SET peso = $2
    `, [codigo, peso]);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}