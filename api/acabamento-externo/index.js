import pool from '../db.js';

export default async function handler(req, res) {
    const client = await pool.connect();
    const { action } = req.query;

    try {
        // --- GET: Carregar todos os dados iniciais ---
        if (req.method === 'GET') {
            const registros = await client.query('SELECT * FROM acabamento_externo_registros ORDER BY data DESC, id DESC');
            const recebidos = await client.query('SELECT registro_id as id, carga FROM acabamento_externo_recebidos');
            const itens = await client.query('SELECT * FROM acabamento_externo_itens');
            
            return res.status(200).json({
                registros: registros.rows,
                recebidos: recebidos.rows,
                itens: itens.rows
            });
        }

        // --- POST: Ações de Escrita ---
        if (req.method === 'POST') {
            const data = req.body;

            // Adicionar novo registro
            if (action === 'add-registro') {
                const query = `INSERT INTO acabamento_externo_registros 
                    (carga, data, terceiro, codigo, descricao, cliente, peso, quant, quant_escariar, quant_rebarba, valor, observacoes) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`;
                const values = [data.carga, data.data, data.terceiro, data.codigo, data.descricao, data.cliente, data.peso, data.quant, data.quant_escariar, data.quant_rebarba, data.valor, data.observacoes];
                const result = await client.query(query, values);
                return res.status(200).json({ success: true, id: result.rows[0].id });
            }

            // Marcar/Desmarcar recebido
            if (action === 'toggle-recebido') {
                if (data.checked) {
                    await client.query('INSERT INTO acabamento_externo_recebidos (registro_id, carga) VALUES ($1, $2) ON CONFLICT DO NOTHING', [data.id, data.carga]);
                } else {
                    await client.query('DELETE FROM acabamento_externo_recebidos WHERE registro_id = $1 AND carga = $2', [data.id, data.carga]);
                }
                return res.status(200).json({ success: true });
            }

            // Salvar/Atualizar item mestre
            if (action === 'save-item') {
                const query = `INSERT INTO acabamento_externo_itens (codigo, descricao, peso, cliente) 
                    VALUES ($1, $2, $3, $4) ON CONFLICT (codigo) DO UPDATE SET descricao = $2, peso = $3, cliente = $4`;
                await client.query(query, [data.codigo, data.descricao, data.peso, data.cliente]);
                return res.status(200).json({ success: true });
            }

            // Deletar item mestre
            if (action === 'delete-item') {
                await client.query('DELETE FROM acabamento_externo_itens WHERE codigo = $1', [data.codigo]);
                return res.status(200).json({ success: true });
            }

            if (action === 'delete-registro') {
    const registroId = parseInt(data.id);
    
    if (isNaN(registroId)) {
        console.error("ID recebido é inválido:", data.id);
        return res.status(400).json({ error: 'ID inválido' });
    }

    await client.query('BEGIN');
    try {
        // 1. Remove dependências na tabela de recebidos
        await client.query('DELETE FROM acabamento_externo_recebidos WHERE registro_id = $1', [registroId]);
        
        // 2. Remove o registro principal
        const result = await client.query('DELETE FROM acabamento_externo_registros WHERE id = $1', [registroId]);
        
        await client.query('COMMIT');

        if (result.rowCount === 0) {
            console.warn(`Tentativa de excluir ID ${registroId}, mas ele não foi encontrado no banco.`);
            return res.status(404).json({ success: false, error: 'Registro não encontrado no banco de dados.' });
        }

        console.log(`ID ${registroId} excluído com sucesso.`);
        return res.status(200).json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Erro ao deletar no banco:", err);
        return res.status(500).json({ error: err.message });
    }
}

            // Limpar tudo
            if (action === 'clear-all') {
                await client.query('TRUNCATE acabamento_externo_recebidos, acabamento_externo_registros RESTART IDENTITY');
                return res.status(200).json({ success: true });
            }
            
            // Importar Backup (Restauração)
            if (action === 'import') {
                await client.query('BEGIN');
                await client.query('TRUNCATE acabamento_externo_recebidos, acabamento_externo_registros, acabamento_externo_itens RESTART IDENTITY');
                
                // Importar itens mestres
                for (const item of data.itens) {
                    await client.query('INSERT INTO acabamento_externo_itens (codigo, descricao, peso, cliente) VALUES ($1, $2, $3, $4)', [item[0], item[1].descricao, item[1].peso, item[1].cliente]);
                }
                // Importar registros
                for (const r of data.registros) {
                    await client.query(`INSERT INTO acabamento_externo_registros (id, carga, data, terceiro, codigo, descricao, cliente, peso, quant, quant_escariar, quant_rebarba, valor, observacoes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, 
                    [r.id, r.carga, r.data, r.terceiro, r.codigo, r.descricao, r.cliente, r.peso, r.quant, r.quant_escariar, r.quant_rebarba, r.valor, r.observacoes]);
                }
                // Importar recebidos
                for (const carga in data.recebidos) {
                    for (const rec of data.recebidos[carga]) {
                        await client.query('INSERT INTO acabamento_externo_recebidos (registro_id, carga) VALUES ($1, $2)', [rec.id, carga]);
                    }
                }

                await client.query("SELECT setval('acabamento_externo_registros_id_seq', (SELECT MAX(id) FROM acabamento_externo_registros))");
                
                await client.query('COMMIT');
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