import pool from '../db.js';

export default async function handler(req, res) {
    const client = await pool.connect();
    const { action } = req.query;

    try {
        if (req.method === 'GET') {
            // Lista para a Sidebar
            if (action === 'saved-list') {
                const result = await client.query('SELECT data_referencia, SUM(peso_total) as peso_total_agregado FROM acab_interno_programas GROUP BY data_referencia ORDER BY data_referencia DESC');
                return res.status(200).json(result.rows);
            }
            // Programa específico
            if (action === 'programacao') {
                const result = await client.query('SELECT * FROM acab_interno_programas WHERE data_referencia = $1 ORDER BY id ASC', [req.query.data_referencia]);
                return res.status(200).json(result.rows.map(r => [r.data_referencia, r.op, r.codigo, r.descricao, r.material, parseFloat(r.peso_un), parseFloat(r.quant), r.lote, parseFloat(r.peso_total), r.cliente, parseFloat(r.quant_fat)]));
            }
            // Aderência
            if (action === 'adherence-status') {
                const result = await client.query('SELECT item_index, status FROM acab_interno_adherence WHERE data_referencia = $1', [req.query.data_referencia]);
                const map = {}; result.rows.forEach(r => map[r.item_index] = r.status);
                return res.status(200).json(map);
            }
            // Configurações (Materiais, Posteriores, etc)
            if (action === 'load-config') {
                const result = await client.query('SELECT valor_json FROM acab_interno_configs WHERE chave = $1', [req.query.config_key]);
                return res.status(200).json(result.rows[0]?.valor_json || {});
            }
            // Raw Data (Base principal)
            const result = await client.query('SELECT * FROM acab_interno_raw ORDER BY data ASC');
            return res.status(200).json(result.rows);
        }

        if (req.method === 'POST') {
            const data = req.body;
            // Salvar Configurações
            if (action === 'save-config') {
                await client.query('INSERT INTO acab_interno_configs (chave, valor_json) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor_json = $2', [data.config_key, data.config_value]);
                return res.status(200).json({ success: true });
            }
            // Importar Excel (Raw)
            if (action === 'import-raw') {
                await client.query('BEGIN');
                await client.query('TRUNCATE TABLE acab_interno_raw');
                for (const r of data) {
                    await client.query('INSERT INTO acab_interno_raw (data, op, codigo, descricao, material, peso_un, quant, lote, peso_total, cliente, quant_fat) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10] || 0]);
                }
                await client.query('COMMIT');
                return res.status(200).json({ success: true });
            }
            // Salvar Programação Final
            if (action === 'save-final') {
                await client.query('BEGIN');
                await client.query('DELETE FROM acab_interno_programas WHERE data_referencia = $1', [data.data_referencia]);
                for (let i = 0; i < data.programacao.length; i++) {
                    const r = data.programacao[i];
                    await client.query('INSERT INTO acab_interno_programas (data_referencia, op, codigo, descricao, material, peso_un, quant, lote, peso_total, cliente, quant_fat, item_index) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [data.data_referencia, r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], i]);
                }
                await client.query('INSERT INTO acab_interno_configs (chave, valor_json) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor_json = $2', [`obs_${data.data_referencia}`, { config_value: data.observacoes }]);
                await client.query('COMMIT');
                return res.status(200).json({ success: true });
            }
            // Aderência (Checkbox)
            if (action === 'update-adherence') {
                await client.query('INSERT INTO acab_interno_adherence (data_referencia, item_index, status) VALUES ($1, $2, $3) ON CONFLICT (data_referencia, item_index) DO UPDATE SET status = $3', [data.data_referencia, data.item_index, data.new_status]);
                return res.status(200).json({ success: true });
            }
            // Deletar Programa
            if (action === 'delete-programacao') {
                await client.query('DELETE FROM acab_interno_programas WHERE data_referencia = $1', [data.data_referencia]);
                await client.query('DELETE FROM acab_interno_adherence WHERE data_referencia = $1', [data.data_referencia]);
                return res.status(200).json({ success: true });
            }
            // Limpar Raw
            if (action === 'clear-raw') {
                await client.query('TRUNCATE TABLE acab_interno_raw');
                return res.status(200).json({ success: true });
            }
        }
    } catch (e) {
        if (req.method === 'POST') await client.query('ROLLBACK');
        res.status(500).json({ error: e.message });
    } finally { client.release(); }
}