const express = require('express');
const router = express.Router();
const pool = require('../lib/db'); // Importação correta do DB
const { logActivity } = require('./lib/logger');

// --- ROTA GET: Ler dados ---
router.get('/', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query(`CREATE TABLE IF NOT EXISTS acabamento_externo_previsoes (carga VARCHAR PRIMARY KEY, previsao_entrega DATE, data_entrega DATE)`);
        await client.query(`ALTER TABLE acabamento_externo_previsoes ADD COLUMN IF NOT EXISTS data_entrega DATE`);
        const registros = await client.query('SELECT * FROM acabamento_externo_registros ORDER BY data DESC, id DESC');
        // Nota: Ajustei a query de recebidos para retornar o formato esperado pelo front
        const recebidos = await client.query('SELECT registro_id as id, carga FROM acabamento_externo_recebidos');
        const itens = await client.query('SELECT * FROM acabamento_externo_itens');
        const previsoes = await client.query('SELECT carga, previsao_entrega, data_entrega FROM acabamento_externo_previsoes');

        return res.status(200).json({
            registros: registros.rows,
            recebidos: recebidos.rows,
            itens: itens.rows,
            previsoes: previsoes.rows
        });
    } catch (error) {
        console.error('Erro GET acabamento-externo:', error);
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
            const query = `INSERT INTO acabamento_externo_registros 
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
            const user = req.headers['x-user'] || 'Sistema';
            // Detecta se é a primeira peça da carga (nova carga) ou item adicionado a uma carga existente
            const cnt = await client.query('SELECT COUNT(*)::int AS n FROM acabamento_externo_registros WHERE carga = $1', [data.carga]);
            const isNovaCarga = (cnt.rows[0].n <= 1);
            logActivity(user, isNovaCarga ? 'NOVA_CARGA' : 'ADD_ITEM_CARGA', 'acabamento_externo', {
                carga: data.carga, codigo: data.codigo, descricao: data.descricao, quant: data.quant, terceiro: data.terceiro, id: result.rows[0].id
            });
            return res.status(200).json({ success: true, id: result.rows[0].id });
        }

        // 2. TOGGLE RECEBIDO (Marcar/Desmarcar)
        if (action === 'toggle-recebido') {
            let codigoItem = null, descItem = null;
            try {
                const r = await client.query('SELECT codigo, descricao FROM acabamento_externo_registros WHERE id = $1', [data.id]);
                codigoItem = r.rows[0]?.codigo; descItem = r.rows[0]?.descricao;
            } catch (e) { /* segue sem detalhes do item */ }
            if (data.checked) {
                await client.query('INSERT INTO acabamento_externo_recebidos (registro_id, carga) VALUES ($1, $2) ON CONFLICT DO NOTHING', [data.id, data.carga]);
            } else {
                await client.query('DELETE FROM acabamento_externo_recebidos WHERE registro_id = $1 AND carga = $2', [data.id, data.carga]);
            }
            logActivity(req.headers['x-user'] || 'Sistema', data.checked ? 'RECEBER_ITEM' : 'DESMARCAR_ITEM', 'acabamento_externo', {
                carga: data.carga, id: data.id, codigo: codigoItem, descricao: descItem
            });
            return res.status(200).json({ success: true });
        }

        // 3. SALVAR ITEM MESTRE (Autopreenchimento)
        if (action === 'save-item') {
            const query = `INSERT INTO acabamento_externo_itens (codigo, descricao, peso, cliente) 
                VALUES ($1, $2, $3, $4) ON CONFLICT (codigo) DO UPDATE SET descricao = $2, peso = $3, cliente = $4`;
            await client.query(query, [data.codigo, data.descricao, data.peso, data.cliente]);
            return res.status(200).json({ success: true });
        }

        // 4. DELETAR ITEM MESTRE
        if (action === 'delete-item') {
            await client.query('DELETE FROM acabamento_externo_itens WHERE codigo = $1', [data.codigo]);
            return res.status(200).json({ success: true });
        }

        // 5. DELETAR REGISTRO (Com transação)
        if (action === 'delete-registro') {
            const registroId = parseInt(data.id);

            if (isNaN(registroId)) {
                return res.status(400).json({ error: 'ID inválido' });
            }

            // Captura dados do item antes de remover (auditoria)
            const infoRes = await client.query('SELECT carga, codigo, descricao FROM acabamento_externo_registros WHERE id = $1', [registroId]);
            const info = infoRes.rows[0] || {};

            await client.query('BEGIN');

            // Remove dependências primeiro
            await client.query('DELETE FROM acabamento_externo_recebidos WHERE registro_id = $1', [registroId]);

            // Remove o registro principal
            const result = await client.query('DELETE FROM acabamento_externo_registros WHERE id = $1', [registroId]);

            await client.query('COMMIT');

            if (result.rowCount === 0) {
                return res.status(404).json({ success: false, error: 'Registro não encontrado.' });
            }

            const user = req.headers['x-user'] || 'Sistema';
            logActivity(user, 'REMOVE_ITEM_CARGA', 'acabamento_externo', { id: registroId, carga: info.carga, codigo: info.codigo, descricao: info.descricao });

            return res.status(200).json({ success: true });
        }

        // 6b. SALVAR PREVISÃO DE ENTREGA
        if (action === 'save-previsao') {
            if (data.field === 'data_entrega') {
                await client.query(
                    `INSERT INTO acabamento_externo_previsoes (carga, data_entrega) VALUES ($1, $2) ON CONFLICT (carga) DO UPDATE SET data_entrega = $2`,
                    [data.carga, data.value || null]
                );
            } else {
                await client.query(
                    `INSERT INTO acabamento_externo_previsoes (carga, previsao_entrega) VALUES ($1, $2) ON CONFLICT (carga) DO UPDATE SET previsao_entrega = $2`,
                    [data.carga, data.value || null]
                );
            }
            logActivity(req.headers['x-user'] || 'Sistema', 'UPDATE_PREVISAO_ENTREGA', 'acabamento_externo', {
                carga: data.carga, campo: data.field === 'data_entrega' ? 'Data de Entrega' : 'Previsão de Entrega', valor: data.value || null
            });
            return res.status(200).json({ success: true });
        }

        // 6. LIMPAR TUDO
        if (action === 'clear-all') {
            await client.query('TRUNCATE acabamento_externo_recebidos, acabamento_externo_registros RESTART IDENTITY');
            logActivity(req.headers['x-user'] || 'Sistema', 'LIMPAR_TUDO', 'acabamento_externo', { escopo: 'registros e recebidos' });
            return res.status(200).json({ success: true });
        }

        // 7. IMPORTAR BACKUP
        if (action === 'import') {
            await client.query('BEGIN');
            await client.query('TRUNCATE acabamento_externo_recebidos, acabamento_externo_registros, acabamento_externo_itens RESTART IDENTITY');

            // Importar itens mestres
            if (data.itens && data.itens.length > 0) {
                for (const item of data.itens) {
                    // Mantive a lógica original do seu arquivo: item é um array [codigo, objeto]
                    // Se o backup vier diferente, pode dar erro aqui, mas mantive sua lógica original.
                    const codigo = Array.isArray(item) ? item[0] : item.codigo;
                    const props = Array.isArray(item) ? item[1] : item;

                    await client.query('INSERT INTO acabamento_externo_itens (codigo, descricao, peso, cliente) VALUES ($1, $2, $3, $4)',
                        [codigo, props.descricao, props.peso, props.cliente]);
                }
            }

            // Importar registros
            if (data.registros && data.registros.length > 0) {
                for (const r of data.registros) {
                    await client.query(`INSERT INTO acabamento_externo_registros (id, carga, data, terceiro, codigo, descricao, cliente, peso, quant, quant_escariar, quant_rebarba, valor_unit, valor, observacoes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
                        [r.id, r.carga, r.data, r.terceiro, r.codigo, r.descricao, r.cliente, r.peso, r.quant, r.quant_escariar, r.quant_rebarba, r.valor_unit || null, r.valor, r.observacoes]);
                }
            }

            // Importar recebidos
            if (data.recebidos) {
                // Se for objeto { carga: [itens] }
                if (!Array.isArray(data.recebidos)) {
                    for (const carga in data.recebidos) {
                        for (const rec of data.recebidos[carga]) {
                            await client.query('INSERT INTO acabamento_externo_recebidos (registro_id, carga) VALUES ($1, $2)', [rec.id, carga]);
                        }
                    }
                } else {
                    // Se for array direto (caso mude no futuro)
                    for (const rec of data.recebidos) {
                        await client.query('INSERT INTO acabamento_externo_recebidos (registro_id, carga) VALUES ($1, $2)', [rec.id || rec.registro_id, rec.carga]);
                    }
                }
            }

            // Ajustar sequência do ID
            await client.query("SELECT setval('acabamento_externo_registros_id_seq', (SELECT MAX(id) FROM acabamento_externo_registros))");

            await client.query('COMMIT');
            logActivity(req.headers['x-user'] || 'Sistema', 'IMPORTAR_BACKUP', 'acabamento_externo', {
                registros: (data.registros || []).length, itens: (data.itens || []).length
            });
            return res.status(200).json({ success: true });
        }

        // Se nenhuma action bateu
        return res.status(400).json({ error: 'Ação não reconhecida' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro POST acabamento-externo:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;