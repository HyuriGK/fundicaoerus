import pool from '../db.js';

export default async function handler(req, res) {
    const client = await pool.connect();
    const { action } = req.query;

    try {
        // --- MÉTODOS DE LEITURA (GET) ---
        if (req.method === 'GET') {
            // 1. Carregar Dados Brutos
            if (action === 'load-raw') {
                const result = await client.query('SELECT * FROM acab_interno_raw ORDER BY data ASC');
                return res.status(200).json(result.rows);
            }

            // 2. Listar Programações Salvas (Sidebar)
            if (action === 'saved-list') {
                const result = await client.query(`
                    SELECT data_referencia, SUM(peso_total) as peso_total_agregado 
                    FROM acab_interno_programas 
                    GROUP BY data_referencia ORDER BY data_referencia DESC
                `);
                return res.status(200).json(result.rows);
            }

            // 3. Carregar uma Programação Específica
            if (action === 'programacao') {
                const { data_referencia } = req.query;
                const result = await client.query('SELECT * FROM acab_interno_programas WHERE data_referencia = $1 ORDER BY item_index ASC', [data_referencia]);
                // Formata como array simples para o front
                const formatted = result.rows.map(r => [
                    r.data_referencia, r.op, r.codigo, r.descricao, r.material, 
                    parseFloat(r.peso_un), parseFloat(r.quant), r.lote, 
                    parseFloat(r.peso_total), r.cliente, parseFloat(r.quant_fat)
                ]);
                return res.status(200).json(formatted);
            }

            // 4. Carregar Status de Aderência
            if (action === 'adherence-status') {
                const { data_referencia } = req.query;
                const result = await client.query('SELECT item_index, status FROM acab_interno_adherence WHERE data_referencia = $1', [data_referencia]);
                const map = {};
                result.rows.forEach(r => map[r.item_index] = r.status);
                return res.status(200).json(map);
            }

            // 5. Carregar Configurações (Materiais, Posteriores, Obs, etc)
            if (action === 'load-config') {
                const { config_key } = req.query;
                const result = await client.query('SELECT valor_json FROM acab_interno_configs WHERE chave = $1', [config_key]);
                return res.status(200).json(result.rows[0]?.valor_json || {});
            }
        }

        // --- MÉTODOS DE ESCRITA (POST) ---
        if (req.method === 'POST') {
            const data = req.body;

            // 1. Salvar Dados Brutos (Importação Excel)
            if (action === 'import-raw') {
                await client.query('BEGIN');
                await client.query('TRUNCATE TABLE acab_interno_raw');
                const query = `INSERT INTO acab_interno_raw (data, op, codigo, descricao, material, peso_un, quant, lote, peso_total, cliente, quant_fat) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`;
                for (const r of data) {
                    // r[0] é a data YYYY-MM-DD vinda do front
                    await client.query(query, [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10] || 0]);
                }
                await client.query('COMMIT');
                return res.status(200).json({ success: true });
            }

            // 2. Salvar Configurações Genéricas
            if (action === 'save-config') {
                const { config_key, config_value } = data;
                await client.query('INSERT INTO acab_interno_configs (chave, valor_json) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor_json = $2', [config_key, config_value]);
                return res.status(200).json({ success: true });
            }

            // 3. Salvar Programação Final
            if (action === 'save-final') {
                await client.query('BEGIN');
                // Remove versão anterior dessa data
                await client.query('DELETE FROM acab_interno_programas WHERE data_referencia = $1', [data.data_referencia]);
                const query = `INSERT INTO acab_interno_programas (data_referencia, op, codigo, descricao, material, peso_un, quant, lote, peso_total, cliente, quant_fat, item_index) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`;
                
                for (let i = 0; i < data.programacao.length; i++) {
                    const r = data.programacao[i];
                    // r[0]=data(null se manual), r[1]=op, r[2]=cod...
                    await client.query(query, [data.data_referencia, r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], i]);
                }
                
                // Salva observações
                if (data.observacoes) {
                    await client.query('INSERT INTO acab_interno_configs (chave, valor_json) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor_json = $2', [`obs_${data.data_referencia}`, { config_value: data.observacoes }]);
                }
                
                // Salva aderência inicial se enviada
                if (data.adherence_status) {
                    for (let i = 0; i < data.adherence_status.length; i++) {
                        if (data.adherence_status[i]) {
                            await client.query('INSERT INTO acab_interno_adherence (data_referencia, item_index, status) VALUES ($1, $2, $3) ON CONFLICT (data_referencia, item_index) DO UPDATE SET status = $3', [data.data_referencia, i, true]);
                        }
                    }
                }

                await client.query('COMMIT');
                return res.status(200).json({ success: true });
            }

            // 4. Atualizar Checkbox de Aderência
            if (action === 'update-adherence') {
                await client.query('INSERT INTO acab_interno_adherence (data_referencia, item_index, status) VALUES ($1, $2, $3) ON CONFLICT (data_referencia, item_index) DO UPDATE SET status = $3', [data.data_referencia, data.item_index, data.new_status]);
                return res.status(200).json({ success: true });
            }

            // 5. Excluir Programação
            if (action === 'delete-programacao') {
                await client.query('BEGIN');
                await client.query('DELETE FROM acab_interno_programas WHERE data_referencia = $1', [data.data_referencia]);
                await client.query('DELETE FROM acab_interno_adherence WHERE data_referencia = $1', [data.data_referencia]);
                // Opcional: deletar obs
                await client.query('DELETE FROM acab_interno_configs WHERE chave = $1', [`obs_${data.data_referencia}`]);
                await client.query('COMMIT');
                return res.status(200).json({ success: true });
            }

            // 6. Limpar Tudo (Raw)
            if (action === 'clear-raw') {
                await client.query('TRUNCATE TABLE acab_interno_raw');
                return res.status(200).json({ success: true });
            }
        }

    } catch (error) {
        if (req.method === 'POST') await client.query('ROLLBACK');
        console.error("API Error:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}