import pool from '../../db.js';

export default async function handler(req, res) {
    const client = await pool.connect();

    try {
        // ==================================================================
        // 1. SALVAR TUDO (POST) - Rota: /api/amostra/save_all
        // ==================================================================
        if (req.url.includes('save_all') && req.method === 'POST') {
            const { opData, sectorData, opObservations } = req.body;

            await client.query('BEGIN');

            // 1.1 Limpar tabelas de dados brutos (OPs e Apontamentos são substituídos pelo novo import)
            // OBS: Não limpamos observações cegamente aqui, faremos upsert, 
            // mas se você quiser que o Excel mande na verdade absoluta, pode limpar.
            // Vou assumir que OPs e Apontamentos são voláteis (vem do Excel), mas Observações são persistentes.
            
            await client.query('TRUNCATE TABLE amostras_ops RESTART IDENTITY');
            await client.query('TRUNCATE TABLE amostras_apontamentos RESTART IDENTITY');

            // 1.2 Inserir OPs
            if (opData && opData.length > 0) {
                // O índice 0 é o cabeçalho, salvamos ele também para o frontend se achar
                for (const row of opData) {
                    // Tenta extrair o número da OP (assumindo índice 0, conforme seu script frontend)
                    const opNum = row[0] ? String(row[0]) : null;
                    await client.query(
                        'INSERT INTO amostras_ops (op_numero, raw_data) VALUES ($1, $2)',
                        [opNum, JSON.stringify(row)]
                    );
                }
            }

            // 1.3 Inserir Dados dos Setores
            if (sectorData) {
                for (const [sectorId, rows] of Object.entries(sectorData)) {
                    if (Array.isArray(rows)) {
                        for (const row of rows) {
                            // Assumindo índice 1 como OP conforme seu script (APONTAMENTO_OP_INDEX = 1)
                            const opNum = row[1] ? String(row[1]) : null;
                            await client.query(
                                'INSERT INTO amostras_apontamentos (setor_id, op_numero, raw_data) VALUES ($1, $2, $3)',
                                [sectorId, opNum, JSON.stringify(row)]
                            );
                        }
                    }
                }
            }

            // 1.4 Salvar Observações (Upsert - Atualiza se existir, Insere se novo)
            if (opObservations) {
                for (const [opNum, sectorsObj] of Object.entries(opObservations)) {
                    for (const [sectorId, text] of Object.entries(sectorsObj)) {
                        await client.query(
                            `INSERT INTO amostras_observacoes (op_numero, setor_id, texto) 
                             VALUES ($1, $2, $3) 
                             ON CONFLICT (op_numero, setor_id) 
                             DO UPDATE SET texto = $3`,
                            [opNum, sectorId, text]
                        );
                    }
                }
            }

            await client.query('COMMIT');
            return res.status(200).json({ success: true });
        }

        // ==================================================================
        // 2. CARREGAR TUDO (GET) - Rota: /api/amostra/load_all
        // ==================================================================
        if (req.url.includes('load_all') && req.method === 'GET') {
            // 2.1 Carregar OPs
            const opsResult = await client.query('SELECT raw_data FROM amostras_ops ORDER BY id ASC');
            const opData = opsResult.rows.map(r => r.raw_data);

            // 2.2 Carregar Apontamentos
            const sectorResult = await client.query('SELECT setor_id, raw_data FROM amostras_apontamentos ORDER BY id ASC');
            const sectorData = {};
            
            sectorResult.rows.forEach(row => {
                if (!sectorData[row.setor_id]) {
                    sectorData[row.setor_id] = [];
                }
                sectorData[row.setor_id].push(row.raw_data);
            });

            // 2.3 Carregar Observações
            const obsResult = await client.query('SELECT op_numero, setor_id, texto FROM amostras_observacoes');
            const opObservations = {};
            
            obsResult.rows.forEach(row => {
                if (!opObservations[row.op_numero]) {
                    opObservations[row.op_numero] = {};
                }
                opObservations[row.op_numero][row.setor_id] = row.texto;
            });

            return res.status(200).json({
                opData,
                sectorData,
                opObservations
            });
        }

        // ==================================================================
        // 3. LIMPAR DADOS (POST) - Rota: /api/amostra/clear_monitor
        // ==================================================================
        if (req.url.includes('clear_monitor') && req.method === 'POST') {
            await client.query('BEGIN');
            await client.query('TRUNCATE TABLE amostras_ops RESTART IDENTITY');
            await client.query('TRUNCATE TABLE amostras_apontamentos RESTART IDENTITY');
            await client.query('TRUNCATE TABLE amostras_observacoes RESTART IDENTITY');
            await client.query('COMMIT');
            return res.status(200).json({ success: true });
        }

        // Rota não encontrada
        return res.status(404).json({ error: 'Endpoint não encontrado em api/amostra' });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Erro na API Amostra:", e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
}