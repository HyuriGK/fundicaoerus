import pool from '../../db.js';

export default async function handler(req, res) {
    const client = await pool.connect();
    // Captura o nome da ação da URL (ex: 'save-config', 'import-raw', etc)
    const { action } = req.query; 

    try {
        // =================================================================
        // 1. CONFIGURAÇÕES (Last Update, Materiais, Posteriores, Obs)
        // =================================================================
        
        // Salvar Configuração Genérica (JSONB)
        if (action === 'save-config' || action === 'save-last-update' || action === 'save-material-days' || action === 'save-posterior-correlation') {
            // Normaliza o input para salvar na tabela ai_configs
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
                // save-config genérico (usado para observações obs_DATA)
                key = req.body.config_key;
                value = { value: req.body.config_value };
            }

            await client.query(
                'INSERT INTO ai_configs (config_key, config_value) VALUES ($1, $2) ON CONFLICT (config_key) DO UPDATE SET config_value = $2',
                [key, value]
            );
            return res.status(200).json({ success: true });
        }

        // Carregar Configurações
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
        // 2. DADOS BRUTOS (Raw Data / Excel Import)
        // =================================================================
        
        // Importar dados brutos (Limpa tabela e insere novos)
        if (action === 'import-raw') {
            const data = req.body; // Array de linhas
            await client.query('BEGIN');
            await client.query('TRUNCATE TABLE ai_raw_data RESTART IDENTITY');
            
            const insertQuery = `
                INSERT INTO ai_raw_data 
                (data, op, codigo, descricao, material, peso_un, quant, lote, peso_total, cliente, quant_fat) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `;

            for (const row of data) {
                // row vem como array do excel [data, op, cod, desc, mat, peso, qtd, lote, peso_tot, cliente, fat]
                // Ajuste de data se necessário (string vazia vira null)
                const dateVal = (row[0] && row[0] !== '') ? row[0] : null;
                
                await client.query(insertQuery, [
                    dateVal, row[1], row[2], row[3], row[4], 
                    row[5], row[6], row[7], row[8], row[9], row[10]
                ]);
            }
            await client.query('COMMIT');
            return res.status(200).json({ success: true });
        }

        // Ler registros brutos
        if (action === 'registros') {
            const result = await client.query("SELECT to_char(data, 'YYYY-MM-DD') as data, op, codigo, descricao, material, peso_un, quant, lote, peso_total, cliente, quant_fat FROM ai_raw_data ORDER BY id ASC");
            return res.status(200).json(result.rows);
        }

        // Limpar registros brutos
        if (action === 'clear-raw') {
            await client.query('TRUNCATE TABLE ai_raw_data RESTART IDENTITY');
            return res.status(200).json({ success: true });
        }

        // =================================================================
        // 3. PROGRAMAÇÃO FINAL (Salvar, Listar, Carregar, Deletar)
        // =================================================================

        // Salvar Programação Final (Sobrescreve se existir data igual)
        if (action === 'save-final') {
            const { data_referencia, programacao, adherence_status, observacoes } = req.body;
            
            await client.query('BEGIN');

            // 1. Remove existente para essa data (Cascade remove itens)
            await client.query('DELETE FROM ai_reports WHERE data_referencia = $1', [data_referencia]);
            
            // 2. Insere Cabeçalho
            await client.query('INSERT INTO ai_reports (data_referencia, observacoes) VALUES ($1, $2)', [data_referencia, observacoes]);

            // 3. Insere Itens
            const itemQuery = `
                INSERT INTO ai_report_items 
                (data_referencia, op, codigo, descricao, material, peso_un, quant, lote, peso_total, cliente, quant_fat, item_index) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `;
            
            let idx = 0;
            for (const row of programacao) {
                // row format: [data(ignored here), op, cod, desc, mat, peso_un, qtd, lote, peso_tot, cli, fat]
                await client.query(itemQuery, [
                    data_referencia, 
                    row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], 
                    idx
                ]);
                idx++;
            }

            // 4. Salvar Aderência (Se houver)
            if (adherence_status && adherence_status.length > 0) {
                // Remove aderencias antigas dessa data
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

        // Listar Programações Salvas
        if (action === 'saved-list') {
            // Calcula peso total somando os itens
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
            // Formata data para retorno JSON
            const list = r.rows.map(row => ({
                data_referencia: row.data_referencia.toISOString().split('T')[0],
                peso_total_agregado: parseFloat(row.peso_total_agregado)
            }));
            return res.status(200).json(list);
        }

        // Carregar uma programação específica
        if (action === 'programacao') {
            const { data_referencia } = req.query;
            const query = `
                SELECT op, codigo, descricao, material, peso_un, lote, quant, quant_fat, peso_total, cliente 
                FROM ai_report_items 
                WHERE data_referencia = $1 
                ORDER BY item_index ASC
            `;
            const r = await client.query(query, [data_referencia]);
            
            // Converter para o formato de array que o front espera
            // Formato esperado pelo front: [OP, COD, DESC, MAT, PESO_UN, LOTE, QTD, FAT, ADERIU(placeholder)]
            // NOTA: O front mapeia colunas visualmente. Vamos retornar um array de objetos ou arrays brutos.
            // O código JS do front espera arrays brutos baseados em indices.
            // Mapeamento COL_MAP do front para Saved Mode:
            // OP:0, CODIGO:1, DESCRICAO:2, MATERIAL:3, PESO_UN:4, LOTE:5, QTD:6, QUANT_FAT:7
            
            const rows = r.rows.map(row => [
                row.op, 
                row.codigo, 
                row.descricao, 
                row.material, 
                parseFloat(row.peso_un), 
                row.lote, 
                parseFloat(row.quant), 
                parseFloat(row.quant_fat)
            ]);
            
            return res.status(200).json(rows);
        }

        // Deletar programação
        if (action === 'delete-programacao') {
            const { data_referencia } = req.body;
            await client.query('DELETE FROM ai_reports WHERE data_referencia = $1', [data_referencia]);
            return res.status(200).json({ success: true });
        }

        // =================================================================
        // 4. ADERÊNCIA E ATUALIZAÇÕES PONTUAIS
        // =================================================================

        if (action === 'update-adherence') {
            const { data_referencia, item_index, new_status } = req.body;
            
            if (new_status === true) {
                await client.query(
                    'INSERT INTO ai_adherence (data_referencia, item_index, status) VALUES ($1, $2, $3) ON CONFLICT (data_referencia, item_index) DO UPDATE SET status = $3',
                    [data_referencia, item_index, true]
                );
            } else {
                await client.query(
                    'DELETE FROM ai_adherence WHERE data_referencia = $1 AND item_index = $2',
                    [data_referencia, item_index]
                );
            }
            return res.status(200).json({ success: true });
        }

        if (action === 'adherence-status') {
            const { data_referencia } = req.query;
            const r = await client.query('SELECT item_index FROM ai_adherence WHERE data_referencia = $1 AND status = true', [data_referencia]);
            
            // Retorna um objeto map { '0': true, '5': true }
            const statusMap = {};
            r.rows.forEach(row => {
                statusMap[row.item_index] = true;
            });
            return res.status(200).json(statusMap);
        }

        // Se nenhuma action bater
        return res.status(404).json({ error: 'Action not found' });

    } catch (e) {
        if (req.method === 'POST') await client.query('ROLLBACK');
        console.error(e);
        return res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
}