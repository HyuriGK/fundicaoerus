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

    const { action } = req.query; // Pega o nome da ação da URL

    try {
        // =================================================================
        // 0. GARANTIR TABELA DE AGENDAMENTOS
        // =================================================================
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
                key = req.body.config_key;
                value = { value: req.body.config_value };
            }

            await client.query(
                'INSERT INTO ai_configs (config_key, config_value) VALUES ($1, $2) ON CONFLICT (config_key) DO UPDATE SET config_value = $2',
                [key, value]
            );
            return res.status(200).json({ success: true });
        }

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
                const dateVal = (row[0] && row[0] !== '') ? row[0] : null;
                await client.query(insertQuery, [
                    dateVal, row[1], row[2], row[3], row[4], 
                    row[5], row[6], row[7], row[8], row[9], row[10]
                ]);
            }
            await client.query('COMMIT');
            return res.status(200).json({ success: true });
        }

        if (action === 'registros') {
            const result = await client.query("SELECT to_char(data, 'YYYY-MM-DD') as data, op, codigo, descricao, material, peso_un, quant, lote, peso_total, cliente, quant_fat FROM ai_raw_data ORDER BY id ASC");
            return res.status(200).json(result.rows);
        }

        if (action === 'clear-raw') {
            await client.query('TRUNCATE TABLE ai_raw_data RESTART IDENTITY');
            return res.status(200).json({ success: true });
        }

        // =================================================================
        // 3. PROGRAMAÇÃO DIÁRIA (SAVE / LOAD / DELETE)
        // =================================================================

        if (action === 'save-schedule-day') {
            const { date, autoRows, manualRows, observations } = req.body;
            const payload = {
                autoRows: autoRows || [],
                manualRows: manualRows || [],
                observations: observations || ""
            };

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
            return res.status(200).json(result.rows[0].payload);
        }

        // ===> AQUI ESTAVA O PROBLEMA: FALTAVA ESTA PARTE <===
        if (action === 'delete-schedule-day') {
            const { date } = req.body;
            await client.query('DELETE FROM ai_daily_schedules WHERE date = $1', [date]);
            return res.status(200).json({ success: true });
        }
        // ====================================================

        // =================================================================
        // 4. LEGADO (Mantido por compatibilidade)
        // =================================================================
        if (action === 'save-final') {
            return res.status(200).json({ success: true });
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