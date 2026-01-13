import pool from '../db.js'; // Importa o seu db.js que está na pasta pai

export default async function handler(req, res) {
    // Tenta conectar ao banco
    let client;
    try {
        client = await pool.connect();
    } catch (dbError) {
        console.error("Erro de conexão com Banco:", dbError);
        return res.status(500).json({ error: "Falha ao conectar no banco de dados." });
    }

    const { action } = req.query; // Pega o nome da ação da URL (ex: 'registros', 'save-schedule-day')

    try {
        // =================================================================
        // 0. GARANTIR TABELA DE AGENDAMENTOS (CRIAÇÃO AUTOMÁTICA)
        // =================================================================
        // Cria uma tabela flexível para salvar a programação do dia (Auto + Manual + Obs)
        await client.query(`
            CREATE TABLE IF NOT EXISTS ai_daily_schedules (
                date DATE PRIMARY KEY,
                payload JSONB, 
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // =================================================================
        // 1. CONFIGURAÇÕES & UTILITÁRIOS
        // =================================================================
        
        // Salvar configurações diversas (Data update, Dias/Material, Posteriores)
        if (action === 'save-config' || action === 'save-last-update' || action === 'save-material-days' || action === 'save-posterior-correlation') {
            let key, value;
            
            if (action === 'save-last-update') {
                key = 'last_updated';
                value = { value: req.body.last_updated };
            } else if (action === 'save-material-days') {
                key = 'material_days';
                value = { data: req.body.materialDays };
            } else if (action === 'save-posterior-correlation') {
                key = 'posterior_correlation';
                value = { data: req.body.posteriorCorrelation };
            } else {
                // save-config genérico (usado para observações obs_DATA antigas)
                key = req.body.config_key;
                value = { value: req.body.config_value };
            }

            await client.query(
                'INSERT INTO ai_configs (config_key, config_value) VALUES ($1, $2) ON CONFLICT (config_key) DO UPDATE SET config_value = $2',
                [key, value]
            );
            return res.status(200).json({ success: true });
        }

        // Carregar configurações
        if (action === 'load-last-update') {
            const r = await client.query("SELECT config_value FROM ai_configs WHERE config_key = 'last_updated'");
            const lastUpdated = r.rows.length > 0 ? r.rows[0].config_value.value : null;
            return res.status(200).json({ last_updated: lastUpdated });
        }

        if (action === 'load-material-days') {
            const r = await client.query("SELECT config_value FROM ai_configs WHERE config_key = 'material_days'");
            const data = r.rows.length > 0 ? r.rows[0].config_value.data : [];
            return res.status(200).json({ materialDays: data });
        }

        if (action === 'load-posterior-correlation') {
            const r = await client.query("SELECT config_value FROM ai_configs WHERE config_key = 'posterior_correlation'");
            const data = r.rows.length > 0 ? r.rows[0].config_value.data : [];
            return res.status(200).json({ posteriorCorrelation: data });
        }

        if (action === 'load-config') {
            const key = req.query.config_key;
            const r = await client.query("SELECT config_value FROM ai_configs WHERE config_key = $1", [key]);
            const val = r.rows.length > 0 ? r.rows[0].config_value.value : '';
            return res.status(200).json({ config_value: val });
        }

        // =================================================================
        // 2. DADOS BRUTOS (EXCEL)
        // =================================================================
        
        // Salvar Excel importado
        if (action === 'import-raw') {
            const data = req.body; 
            await client.query('BEGIN');
            await client.query('TRUNCATE TABLE ai_raw_data RESTART IDENTITY');
            
            const insertQuery = `
                INSERT INTO ai_raw_data 
                (data, op, codigo, descricao, material, peso_un, quant, lote, peso_total, cliente, quant_fat) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `;

            for (const row of data) {
                // row vem como array do excel
                const dateVal = (row[0] && row[0] !== '') ? row[0] : null;
                
                await client.query(insertQuery, [
                    dateVal, row[1], row[2], row[3], row[4], 
                    row[5], row[6], row[7], row[8], row[9], row[10]
                ]);
            }
            await client.query('COMMIT');
            return res.status(200).json({ success: true });
        }

        // Ler registros brutos para preencher a tela inicial
        if (action === 'registros') {
            const result = await client.query("SELECT to_char(data, 'YYYY-MM-DD') as data, op, codigo, descricao, material, peso_un, quant, lote, peso_total, cliente, quant_fat FROM ai_raw_data ORDER BY id ASC");
            return res.status(200).json(result.rows);
        }

        if (action === 'clear-raw') {
            await client.query('TRUNCATE TABLE ai_raw_data RESTART IDENTITY');
            return res.status(200).json({ success: true });
        }

        // =================================================================
        // 3. NOVA PROGRAMAÇÃO DIÁRIA (SAVE/LOAD COMPLETO) - ADICIONADO AQUI
        // =================================================================

        if (action === 'save-schedule-day') {
            const { date, autoRows, manualRows, observations } = req.body;
            
            // Cria um objeto JSON com tudo que precisamos recuperar depois
            const payload = {
                autoRows: autoRows || [],
                manualRows: manualRows || [],
                observations: observations || ""
            };

            // Upsert (Insere ou Atualiza se já existir data)
            const query = `
                INSERT INTO ai_daily_schedules (date, payload, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (date) 
                DO UPDATE SET payload = $2, updated_at = NOW()
            `;

            await client.query(query, [date, JSON.stringify(payload)]);
            return res.status(200).json({ success: true });
        }

        if (action === 'get-schedule-day') {
            const { date } = req.query;
            
            const query = `SELECT payload FROM ai_daily_schedules WHERE date = $1`;
            const result = await client.query(query, [date]);

            if (result.rows.length === 0) {
                return res.status(404).json({ error: "Programação não encontrada." });
            }

            // O Postgres retorna o JSONB já parseado como objeto no JS
            return res.status(200).json(result.rows[0].payload);
        }

        // =================================================================
        // 4. PROGRAMAÇÃO FINAL (LEGADO/OUTRAS FUNÇÕES)
        // =================================================================

        if (action === 'save-final') {
            const { data_referencia, programacao, adherence_status, observacoes } = req.body;
            
            await client.query('BEGIN');
            await client.query('DELETE FROM ai_reports WHERE data_referencia = $1', [data_referencia]);
            await client.query('INSERT INTO ai_reports (data_referencia, observacoes) VALUES ($1, $2)', [data_referencia, observacoes]);

            const itemQuery = `
                INSERT INTO ai_report_items 
                (data_referencia, op, codigo, descricao, material, peso_un, quant, lote, peso_total, cliente, quant_fat, item_index) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `;
            
            let idx = 0;
            for (const row of programacao) {
                await client.query(itemQuery, [
                    data_referencia, 
                    row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], 
                    idx
                ]);
                idx++;
            }

            if (adherence_status && adherence_status.length > 0) {
                await client.query('DELETE FROM ai_adherence WHERE data_referencia = $1', [data_referencia]);
                const adhQuery = 'INSERT INTO ai_adherence (data_referencia, item_index, status) VALUES ($1, $2, $3)';
                for (let i = 0; i < adherence_status.length; i++) {
                    if (adherence_status[i] === true) {
                        await client.query(adhQuery, [data_referencia, i, true]);
                    }
                }
            }

            await client.query('COMMIT');
            return res.status(200).json({ success: true });
        }

        if (action === 'saved-list') {
            const query = `
                SELECT 
                    r.data_referencia, 
                    COALESCE(SUM(i.peso_total), 0) as peso_total_agregado 
                FROM ai_reports r
                LEFT JOIN ai_report_items i ON r.data_referencia = i.data_referencia
                GROUP BY r.data_referencia
                ORDER BY r.data_referencia DESC
            `;
            const r = await client.query(query);
            const list = r.rows.map(row => ({
                data_referencia: row.data_referencia.toISOString().split('T')[0],
                peso_total_agregado: parseFloat(row.peso_total_agregado)
            }));
            return res.status(200).json(list);
        }

        if (action === 'programacao') {
            const { data_referencia } = req.query;
            const query = `
                SELECT op, codigo, descricao, material, peso_un, lote, quant, quant_fat, peso_total, cliente 
                FROM ai_report_items 
                WHERE data_referencia = $1 
                ORDER BY item_index ASC
            `;
            const r = await client.query(query, [data_referencia]);
            const rows = r.rows.map(row => [
                row.op, row.codigo, row.descricao, row.material, 
                parseFloat(row.peso_un), row.lote, parseFloat(row.quant), 
                parseFloat(row.quant_fat)
            ]);
            return res.status(200).json(rows);
        }

        if (action === 'delete-programacao') {
            const { data_referencia } = req.body;
            await client.query('DELETE FROM ai_reports WHERE data_referencia = $1', [data_referencia]);
            return res.status(200).json({ success: true });
        }

        // =================================================================
        // 5. ADERÊNCIA (CHECKBOX)
        // =================================================================

        if (action === 'update-adherence') {
            const { data_referencia, item_index, new_status } = req.body;
            if (new_status === true) {
                await client.query(
                    'INSERT INTO ai_adherence (data_referencia, item_index, status) VALUES ($1, $2, $3) ON CONFLICT (data_referencia, item_index) DO UPDATE SET status = $3',
                    [data_referencia, item_index, true]
                );
            } else {
                await client.query('DELETE FROM ai_adherence WHERE data_referencia = $1 AND item_index = $2', [data_referencia, item_index]);
            }
            return res.status(200).json({ success: true });
        }

        if (action === 'adherence-status') {
            const { data_referencia } = req.query;
            const r = await client.query('SELECT item_index FROM ai_adherence WHERE data_referencia = $1 AND status = true', [data_referencia]);
            const statusMap = {};
            r.rows.forEach(row => { statusMap[row.item_index] = true; });
            return res.status(200).json(statusMap);
        }

        // Se nenhuma action for encontrada
        return res.status(404).json({ error: 'Action not found' });

    } catch (e) {
        if (req.method === 'POST') await client.query('ROLLBACK');
        console.error("ERRO API:", e);
        return res.status(500).json({ error: e.message });
    } finally {
        if (client) client.release();
    }
}