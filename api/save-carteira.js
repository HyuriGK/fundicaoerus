import pool from './db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const client = await pool.connect();
  try {
    const data = req.body; // Array de objetos enviado pelo HTML
    
    await client.query('BEGIN');

    // Limpa a tabela atual para colocar o novo snapshot do Excel
    // NOTA: Não limpamos as tabelas de pesos e quantidades manuais para preservar edições
    await client.query('TRUNCATE TABLE carteira RESTART IDENTITY');

    const queryText = `
      INSERT INTO carteira (pedido, ordem_compra, entrega, razao_social, codigo, nome_produto, material, peso_un, qtd_pedido, saldo, peso_total, unique_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;

    for (const row of data) {
      // Tenta converter data dd/mm/aaaa para aaaa-mm-dd
      let dateVal = null;
      if(row.entrega) {
         const parts = row.entrega.split('/');
         if(parts.length === 3) dateVal = `${parts[2]}-${parts[1]}-${parts[0]}`;
         else dateVal = row.entrega; // Tenta salvar como veio se já for ISO ou null
      }

      // Gera a unique_key igual ao frontend (Pedido_Codigo_Data_OC)
      const p = (row.pedido || '').replace(' BLOCK','').trim().replace(/[^A-Z0-9]/g, '');
      const c = (row.codigo || '').trim().replace(/[^A-Z0-9]/g, '');
      const o = (row.ordem_compra || '').trim().replace(/[^A-Z0-9]/g, '');
      const eRaw = row.entrega ? row.entrega.replace(/[^0-9]/g, '') : '';
      const uniqueKey = `${p}_${c}_${eRaw}_${o}`;

      await client.query(queryText, [
        row.pedido, row.ordem_compra, dateVal, row.razao_social,
        row.codigo, row.nome_produto, row.material, row.peso_un,
        row.qtd_pedido, row.saldo, row.peso_total, uniqueKey
      ]);
    }

    await client.query('COMMIT');
    res.status(200).json({ message: 'Dados salvos com sucesso!' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
}