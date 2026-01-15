import pool from '../../db.js';

export default async function handler(req, res) {
    const client = await pool.connect();
    const { action } = req.query;

    try {
        // 1. SALVAR PESO (POST)
        if (action === 'save-weight') {
            const { codigo, peso } = req.body;
            await client.query('INSERT INTO pesos_customizados (codigo, peso) VALUES ($1, $2) ON CONFLICT (codigo) DO UPDATE SET peso = $2', [codigo, peso]);
            return res.status(200).json({ success: true });
        }

        // 2. SALVAR QUANTIDADE (POST)
        if (action === 'save-quantity') {
            const { unique_key, quantity } = req.body;
            await client.query('INSERT INTO quantidades_manuais (unique_key, quantidade) VALUES ($1, $2) ON CONFLICT (unique_key) DO UPDATE SET quantidade = $2', [unique_key, quantity]);
            return res.status(200).json({ success: true });
        }

        // 3. SALVAR CARTEIRA EXCEL (POST)
        if (action === 'save-snapshot') {
            const data = req.body;
            await client.query('BEGIN');
            await client.query('TRUNCATE TABLE carteira RESTART IDENTITY');
            const queryText = `INSERT INTO carteira (pedido, ordem_compra, entrega, razao_social, codigo, nome_produto, material, peso_un, qtd_pedido, saldo, peso_total, unique_key) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`;
            for (const row of data) {
                let dateVal = null;
                if(row.entrega) {
                    const parts = row.entrega.split('/');
                    dateVal = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : row.entrega;
                }
                const p = (row.pedido || '').replace(' BLOCK','').trim().replace(/[^A-Z0-9]/g, '');
                const c = (row.codigo || '').trim().replace(/[^A-Z0-9]/g, '');
                const o = (row.ordem_compra || '').trim().replace(/[^A-Z0-9]/g, '');
                const eRaw = row.entrega ? row.entrega.replace(/[^0-9]/g, '') : '';
                const uniqueKey = `${p}_${c}_${eRaw}_${o}`;
                await client.query(queryText, [row.pedido, row.ordem_compra, dateVal, row.razao_social, row.codigo, row.nome_produto, row.material, row.peso_un, row.qtd_pedido, row.saldo, row.peso_total, uniqueKey]);
            }
            await client.query('COMMIT');
            return res.status(200).json({ success: true });
        }

        // 4. LER DADOS (GET)
        if (req.method === 'GET') {
            // Se pedir pesos
            if (action === 'weights') {
                const r = await client.query('SELECT codigo, peso FROM pesos_customizados');
                const map = {}; r.rows.forEach(row => map[row.codigo] = parseFloat(row.peso));
                return res.status(200).json(map);
            }
            // Se pedir quantidades
            if (action === 'quantities') {
                const r = await client.query('SELECT unique_key, quantidade FROM quantidades_manuais');
                const map = {}; r.rows.forEach(row => map[row.unique_key] = parseFloat(row.quantidade));
                return res.status(200).json(map);
            }
            // Padrão: ler a carteira
            const result = await client.query("SELECT pedido, ordem_compra, to_char(entrega, 'DD/MM/YYYY') as entrega, razao_social, codigo, nome_produto, material, peso_un, qtd_pedido, saldo, peso_total FROM carteira ORDER BY entrega ASC");
            return res.status(200).json(result.rows);
        }

    } catch (e) {
        if (req.method === 'POST') await client.query('ROLLBACK');
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
}