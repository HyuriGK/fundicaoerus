import pool from './db.js';

export default async function handler(req, res) {
  try {
    const result = await pool.query('SELECT codigo, peso FROM pesos_customizados');
    const map = {};
    result.rows.forEach(r => map[r.codigo] = parseFloat(r.peso));
    res.status(200).json(map);
  } catch (error) {
    res.status(500).json({});
  }
}