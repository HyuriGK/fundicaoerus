import pool from '../db.js';

export default async function handler(req, res) {
    const client = await pool.connect();
    const { action } = req.query;

    try {
        // --- AÇÕES DE LEITURA (GET) ---
        if (req.method === 'GET') {
            // Lista de Programas Salvos (para a sidebar)
            if (action === 'saved-list') {
                const result = await client.query(`
                    SELECT data_referencia, SUM(peso_total) as peso_total_agregado 
                    FROM acab_interno_programas 
                    GROUP BY data_referencia ORDER BY data_referencia DESC
                `);
                return res.status(200).json(result.rows);
            }

            // Carregar um programa específico
            if (action === 'programacao') {
                const { data_referencia } = req.query;
                const result = await client.query('SELECT * FROM acab_interno_programas WHERE data_referencia = $1 ORDER BY id ASC', [data_referencia]);
                const formatted = result.rows.map(r => [
                    r.data_referencia, r.op, r.codigo, r.descricao, r.material, 
                    parseFloat(r.peso_un), parseFloat(r.quant), r.lote, 
                    parseFloat(r.peso_total), r.cliente, parseFloat(r.quant_fat)
                ]);
                return res.status(200).json(formatted);
            }

            // Status de Aderência
            if (action === 'adherence-status') {
                const { data_referencia } = req.query;
                const result = await client.query('SELECT item_index, status FROM acab_interno_adherence WHERE data_referencia = $1', [data_referencia]);
                const map = {};
                result.rows.forEach(r => map[r.item_index] = r.status);
                return res.status(200).json(map);
            }

            // Configurações Genéricas (Materiais, Posteriores, Obs, Last Update)
            if (action === 'load-config') {
                const { config_key } = req.query;
                const result = await client.query('SELECT valor_json FROM acab_interno_configs WHERE chave = $1', [config_key]);
                return res.status(200).json(result.rows[0]?.valor_json || {});
            }

            // Registros Brutos (Raw)
            const result = await client.query('SELECT * FROM acab_interno_raw ORDER BY data ASC');
            return res.status(200).json(result.rows);
        }

        // --- AÇÕES DE ESCRITA (POST) ---
        if (req.method === 'POST') {
            const data = req.body;

            // Salvar Configurações (Last Update, Materiais, Posteriores, Obs)
            if (action === 'save-config') {
                const { config_key, config_value } = data;
                await client.query('INSERT INTO acab_interno_configs (chave, valor_json) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor_json = $2', [config_key, config_value]);
                return res.status(200).json({ success: true });
            }

            // Salvar Aderência (Checkbox individual)
            if (action === 'update-adherence') {
                await client.query('INSERT INTO acab_interno_adherence (data_referencia, item_index, status) VALUES ($1, $2, $3) ON CONFLICT (data_referencia, item_index) DO UPDATE SET status = $3', [data.data_referencia, data.item_index, data.new_status]);
                return res.status(200).json({ success: true });
            }

            // Importar Dados Brutos (Excel)
            if (action === 'import-raw') {
                await client.query('BEGIN');
                await client.query('TRUNCATE TABLE acab_interno_raw');
                const query = `INSERT INTO acab_interno_raw (data, op, codigo, descricao, material, peso_un, quant, lote, peso_total, cliente, quant_fat) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`;
                for (const r of data) {
                    await client.query(query, [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10] || 0]);
                }
                await client.query('COMMIT');
                return res.status(200).json({ success: true });
            }

            // Salvar Programação Final (Modal)
            if (action === 'save-final') {
                await client.query('BEGIN');
                await client.query('DELETE FROM acab_interno_programas WHERE data_referencia = $1', [data.data_referencia]);
                const query = `INSERT INTO acab_interno_programas (data_referencia, op, codigo, descricao, material, peso_un, quant, lote, peso_total, cliente, quant_fat, item_index) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`;
                for (let i = 0; i < data.programacao.length; i++) {
                    const r = data.programacao[i];
                    await client.query(query, [data.data_referencia, r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], i]);
                }
                // Salva observação junto
                await client.query('INSERT INTO acab_interno_configs (chave, valor_json) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor_json = $2', [`obs_${data.data_referencia}`, { config_value: data.observacoes }]);
                await client.query('COMMIT');
                return res.status(200).json({ success: true });
            }

            // Excluir Programação
            if (action === 'delete-programacao') {
                await client.query('DELETE FROM acab_interno_programas WHERE data_referencia = $1', [data.data_referencia]);
                await client.query('DELETE FROM acab_interno_adherence WHERE data_referencia = $1', [data.data_referencia]);
                return res.status(200).json({ success: true });
            }

            if (action === 'clear-raw') {
                await client.query('TRUNCATE TABLE acab_interno_raw');
                return res.status(200).json({ success: true });
            }
        }

    } catch (error) {
        if (req.method === 'POST') await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}