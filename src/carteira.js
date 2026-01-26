const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { Resend } = require('resend');
const xlsx = require('xlsx');

// Inicializa o Resend com a chave da API
// Nota: A chave deve ser configurada via variável de ambiente
const resend = new Resend(process.env.RESEND_API_KEY);

// --- ROTA DE ESCRITA (POST) ---
// Captura: save-weight, save-quantity, save-snapshot
router.post('/', async (req, res) => {
    const { action } = req.query;
    const client = await pool.connect();

    try {
        // 1. SALVAR PESO
        if (action === 'save-weight') {
            const { codigo, peso } = req.body;
            await client.query('INSERT INTO pesos_customizados (codigo, peso) VALUES ($1, $2) ON CONFLICT (codigo) DO UPDATE SET peso = $2', [codigo, peso]);
            return res.status(200).json({ success: true });
        }

        // 2. SALVAR QUANTIDADE
        if (action === 'save-quantity') {
            const { unique_key, quantity } = req.body;
            await client.query('INSERT INTO quantidades_manuais (unique_key, quantidade) VALUES ($1, $2) ON CONFLICT (unique_key) DO UPDATE SET quantidade = $2', [unique_key, quantity]);
            return res.status(200).json({ success: true });
        }

        // 3. SALVAR CARTEIRA EXCEL
        if (action === 'save-snapshot') {
            const data = req.body;
            await client.query('BEGIN');
            await client.query('TRUNCATE TABLE carteira RESTART IDENTITY');
            
            const queryText = `INSERT INTO carteira (pedido, ordem_compra, entrega, razao_social, codigo, nome_produto, material, peso_un, qtd_pedido, saldo, peso_total, unique_key) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`;
            
            for (const row of data) {
                let dateVal = null;
                if(row.entrega) {
                    const parts = row.entrega.split('/');
                    dateVal = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : row.entrega;
                }
                const p = (row.pedido || '').replace(' BLOCK','').trim().replace(/[^A-Z0-9]/g, '');
                const c = (row.codigo || '').trim().replace(/[^A-Z0-9]/g, '');
                const o = (row.ordem_compra || '').trim().replace(/[^A-Z0-9]/g, '');
                const eRaw = row.entrega ? row.entrega.replace(/[^0-9]/g, '') : '';
                const uniqueKey = `${p}_${c}_${eRaw}_${o}`;
                
                await client.query(queryText, [row.pedido, row.ordem_compra, dateVal, row.razao_social, row.codigo, row.nome_produto, row.material, row.peso_un, row.qtd_pedido, row.saldo, row.peso_total, uniqueKey]);
            }
            await client.query('COMMIT');
            return res.status(200).json({ success: true });
        }

        // Se nenhuma action for encontrada
        return res.status(400).json({ error: 'Action não reconhecida para POST' });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// --- ROTA PARA ENVIO DE EMAIL COM RESEND ---
router.post('/send-email', async (req, res) => {
    const { to, cc, subject, body, includeAttachment, attachmentData } = req.body;
    
    try {
        // Verifica se a chave do Resend está configurada
        if (!process.env.RESEND_API_KEY) {
            throw new Error('RESEND_API_KEY não configurada no servidor');
        }

        const emailOptions = {
            from: 'Fundição Erus <sistema@fundicaoerus.com>', // Substitua pelo seu domínio verificado no Resend
            to: [to],
            subject: subject || 'Relatório da Carteira de Pedidos',
            html: body ? body.replace(/\n/g, '<br>') : '<p>Relatório em anexo.</p>',
        };

        // Adiciona CC se fornecido
        if (cc && cc.trim()) {
            emailOptions.cc = [cc];
        }

        // Se houver anexo, gerar o arquivo Excel
        if (includeAttachment && attachmentData && attachmentData.length > 0) {
            // Criar worksheet
            const ws = xlsx.utils.json_to_sheet(attachmentData);
            const wb = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wb, ws, 'Carteira de Pedidos');
            
            // Gerar buffer do Excel
            const excelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
            
            // Converter para base64 (Resend requer base64 para anexos)
            const base64Excel = excelBuffer.toString('base64');
            
            emailOptions.attachments = [{
                filename: `Carteira_Pedidos_${new Date().toISOString().slice(0, 10)}.xlsx`,
                content: base64Excel,
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }];
        }

        // Enviar email usando Resend
        const { data, error } = await resend.emails.send(emailOptions);

        if (error) {
            console.error('Erro do Resend:', error);
            return res.status(500).json({ 
                error: 'Erro ao enviar email via Resend', 
                details: error.message 
            });
        }

        console.log('Email enviado com sucesso via Resend. ID:', data?.id);
        return res.status(200).json({ 
            success: true, 
            message: 'Email enviado com sucesso!',
            emailId: data?.id 
        });

    } catch (error) {
        console.error('Erro ao enviar email:', error);
        return res.status(500).json({ 
            error: 'Erro interno ao processar envio de email', 
            details: error.message 
        });
    }
});

// --- ROTA DE LEITURA (GET) ---
// Captura: weights, quantities ou lista geral
router.get('/', async (req, res) => {
    const { action } = req.query;
    const client = await pool.connect();

    try {
        // Se pedir pesos
        if (action === 'weights') {
            const r = await client.query('SELECT codigo, peso FROM pesos_customizados');
            const map = {}; 
            r.rows.forEach(row => map[row.codigo] = parseFloat(row.peso));
            return res.status(200).json(map);
        }
        
        // Se pedir quantidades
        if (action === 'quantities') {
            const r = await client.query('SELECT unique_key, quantidade FROM quantidades_manuais');
            const map = {}; 
            r.rows.forEach(row => map[row.unique_key] = parseFloat(row.quantidade));
            return res.status(200).json(map);
        }
        
        // Padrão: ler a carteira inteira
        const result = await client.query("SELECT pedido, ordem_compra, to_char(entrega, 'DD/MM/YYYY') as entrega, razao_social, codigo, nome_produto, material, peso_un, qtd_pedido, saldo, peso_total FROM carteira ORDER BY entrega ASC");
        return res.status(200).json(result.rows);

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

module.exports = router;