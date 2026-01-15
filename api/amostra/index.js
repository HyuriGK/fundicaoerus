import pool from '../../db.js';

export default async function handler(req, res) {
    // Conecta ao banco
    const client = await pool.connect();

    try {
        // ==================================================================
        // 1. SALVAR (Quando o HTML chama /api/amostra/save_all)
        // ==================================================================
        if (req.url.includes('save_all') && req.method === 'POST') {
            const { opData, sectorData, opObservations } = req.body;

            await client.query('BEGIN');

            // Limpa as tabelas (Snapshot)
            await client.query('TRUNCATE TABLE amostras_ops RESTART IDENTITY');
            await client.query('TRUNCATE TABLE amostras_apontamentos RESTART IDENTITY');

            // Salva OPs
            if (opData && opData.length > 0) {
                for (const row of opData) {
                    // row[0] é o número da OP
                    const opNum = row[0] ? String(row[0]) : null;
                    await client.query(
                        'INSERT INTO amostras_ops (op_numero, raw_data) VALUES ($1, $2)',
                        [opNum, JSON.stringify(row)]
                    );
                }
            }

            // Salva Setores
            if (sectorData) {
                for (const [sectorId, rows] of Object.entries(sectorData)) {
                    if (Array.isArray(rows)) {
                        for (const row of rows) {
                            // row[1] é a OP nos arquivos de setor
                            const opNum = row[1] ? String(row[1]) : null;
                            await client.query(
                                'INSERT INTO amostras_apontamentos (setor_id, op_numero, raw_data) VALUES ($1, $2, $3)',
                                [sectorId, opNum, JSON.stringify(row)]
                            );
                        }
                    }
                }
            }

            // Salva Observações
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
        // 2. CARREGAR (Quando o HTML chama /api/amostra/load_all)
        // ==================================================================
        if (req.url.includes('load_all') && req.method === 'GET') {
            
            // Busca OPs
            const opsResult = await client.query('SELECT raw_data FROM amostras_ops ORDER BY id ASC');
            const opData = opsResult.rows.map(r => r.raw_data);

            // Busca Setores
            const sectorResult = await client.query('SELECT setor_id, raw_data FROM amostras_apontamentos ORDER BY id ASC');
            const sectorData = {};
            sectorResult.rows.forEach(row => {
                if (!sectorData[row.setor_id]) sectorData[row.setor_id] = [];
                sectorData[row.setor_id].push(row.raw_data);
            });

            // Busca Observações
            const obsResult = await client.query('SELECT op_numero, setor_id, texto FROM amostras_observacoes');
            const opObservations = {};
            obsResult.rows.forEach(row => {
                if (!opObservations[row.op_numero]) opObservations[row.op_numero] = {};
                opObservations[row.op_numero][row.setor_id] = row.texto;
            });

            return res.status(200).json({ opData, sectorData, opObservations });
        }

        // ==================================================================
        // 3. LIMPAR
        // ==================================================================
        if (req.url.includes('clear_monitor') && req.method === 'POST') {
            await client.query('BEGIN');
            await client.query('TRUNCATE TABLE amostras_ops RESTART IDENTITY');
            await client.query('TRUNCATE TABLE amostras_apontamentos RESTART IDENTITY');
            await client.query('TRUNCATE TABLE amostras_observacoes RESTART IDENTITY');
            await client.query('COMMIT');
            return res.status(200).json({ success: true });
        }

        return res.status(404).json({ error: 'Endpoint não encontrado em api/amostra' });

    } catch (e) {
        if (req.method === 'POST') await client.query('ROLLBACK');
        console.error("Erro API:", e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
}