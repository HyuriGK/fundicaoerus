const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { logActivity } = require('./lib/logger');

// --- ROTA GET: Ler dados ---
router.get('/', async (req, res) => {
    const client = await pool.connect();
    try {
        const registros = await client.query('SELECT * FROM usinagem_externo_registros ORDER BY data DESC, id DESC');
        const recebidos = await client.query('SELECT registro_id as id, carga FROM usinagem_externo_recebidos');
        const itens = await client.query('SELECT * FROM usinagem_externo_itens');

        return res.status(200).json({
            registros: registros.rows,
            recebidos: recebidos.rows,
            itens: itens.rows
        });
    } catch (error) {
        console.error('Erro GET usinagem-externo:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// --- ROTA POST: Ações de escrita ---
router.post('/', async (req, res) => {
    const { action } = req.query;
    const data = req.body;
    const client = await pool.connect();

    try {
        // 1. ADICIONAR REGISTRO
        if (action === 'add-registro') {
            const query = `INSERT INTO usinagem_externo_registros 
                (carga, data, terceiro, codigo, descricao, cliente, peso, quant, quant_escariar, quant_rebarba, valor_unit, valor, observacoes) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`;

            const values = [
                data.carga,
                data.data,
                data.terceiro,
                data.codigo,
                data.descricao,
                data.cliente,
                data.peso,
                data.quant,
                data.quant_escariar,
                data.quant_rebarba,
                data.valor_unit,
                data.valor,
                data.observacoes
            ];

            const result = await client.query(query, values);
            const user = req.user && req.user.name || 'Sistema';
            logActivity(user, 'ADD_REGISTRO', 'usinagem_externo', { carga: data.carga, codigo: data.codigo, id: result.rows[0].id });
            return res.status(200).json({ success: true, id: result.rows[0].id });
        }

        // 2. TOGGLE RECEBIDO
        if (action === 'toggle-recebido') {
            if (data.checked) {
                await client.query('INSERT INTO usinagem_externo_recebidos (registro_id, carga) VALUES ($1, $2) ON CONFLICT DO NOTHING', [data.id, data.carga]);
            } else {
                await client.query('DELETE FROM usinagem_externo_recebidos WHERE registro_id = $1 AND carga = $2', [data.id, data.carga]);
            }
            return res.status(200).json({ success: true });
        }

        // 3. SALVAR ITEM MESTRE
        if (action === 'save-item') {
            const query = `INSERT INTO usinagem_externo_itens (codigo, descricao, peso, cliente) 
                VALUES ($1, $2, $3, $4) ON CONFLICT (codigo) DO UPDATE SET descricao = $2, peso = $3, cliente = $4`;
            await client.query(query, [data.codigo, data.descricao, data.peso, data.cliente]);
            return res.status(200).json({ success: true });
        }

        // 4. DELETAR ITEM MESTRE
        if (action === 'delete-item') {
            await client.query('DELETE FROM usinagem_externo_itens WHERE codigo = $1', [data.codigo]);
            return res.status(200).json({ success: true });
        }

        // 5. DELETAR REGISTRO
        if (action === 'delete-registro') {
            const registroId = parseInt(data.id);
            if (isNaN(registroId)) return res.status(400).json({ error: 'ID inválido' });

            await client.query('BEGIN');
            await client.query('DELETE FROM usinagem_externo_recebidos WHERE registro_id = $1', [registroId]);
            const result = await client.query('DELETE FROM usinagem_externo_registros WHERE id = $1', [registroId]);
            await client.query('COMMIT');

            if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Registro não encontrado.' });

            const user = req.user && req.user.name || 'Sistema';
            logActivity(user, 'DELETE_REGISTRO', 'usinagem_externo', { id: registroId, data: data });

            return res.status(200).json({ success: true });
        }

        // 6. LIMPAR TUDO
        if (action === 'clear-all') {
            await client.query('TRUNCATE usinagem_externo_recebidos, usinagem_externo_registros RESTART IDENTITY');
            return res.status(200).json({ success: true });
        }

        // 7. IMPORTAR BACKUP (Mantendo lógica original)
        if (action === 'import') {
            await client.query('BEGIN');
            await client.query('TRUNCATE usinagem_externo_recebidos, usinagem_externo_registros, usinagem_externo_itens RESTART IDENTITY');

            if (data.itens && data.itens.length > 0) {
                for (const item of data.itens) {
                    const codigo = Array.isArray(item) ? item[0] : item.codigo;
                    const props = Array.isArray(item) ? item[1] : item;
                    await client.query('INSERT INTO usinagem_externo_itens (codigo, descricao, peso, cliente) VALUES ($1, $2, $3, $4)',
                        [codigo, props.descricao, props.peso, props.cliente]);
                }
            }

            if (data.registros && data.registros.length > 0) {
                for (const r of data.registros) {
                    await client.query(`INSERT INTO usinagem_externo_registros (id, carga, data, terceiro, codigo, descricao, cliente, peso, quant, quant_escariar, quant_rebarba, valor_unit, valor, observacoes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
                        [r.id, r.carga, r.data, r.terceiro, r.codigo, r.descricao, r.cliente, r.peso, r.quant, r.quant_escariar, r.quant_rebarba, r.valor_unit || null, r.valor, r.observacoes]);
                }
            }

            if (data.recebidos) {
                if (!Array.isArray(data.recebidos)) {
                    for (const carga in data.recebidos) {
                        for (const rec of data.recebidos[carga]) {
                            await client.query('INSERT INTO usinagem_externo_recebidos (registro_id, carga) VALUES ($1, $2)', [rec.id, carga]);
                        }
                    }
                } else {
                    for (const rec of data.recebidos) {
                        await client.query('INSERT INTO usinagem_externo_recebidos (registro_id, carga) VALUES ($1, $2)', [rec.id || rec.registro_id, rec.carga]);
                    }
                }
            }

            await client.query("SELECT setval('usinagem_externo_registros_id_seq', (SELECT MAX(id) FROM usinagem_externo_registros))");
            await client.query('COMMIT');
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Ação não reconhecida' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro POST usinagem-externo:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;
