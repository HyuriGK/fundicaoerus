const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { Resend } = require('resend');
const XLSX = require('xlsx');

// Inicializa Resend - USANDO AMBAS AS VARIÁVEIS PARA COMPATIBILIDADE
const resend = new Resend(process.env.RESEND_API_KEY || process.env.SEND_API_KEY);

// --- ROTA DE ESCRITA (POST) ---
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

        // 4. ENVIAR EMAIL COM RESEND - REMOVIDO (AGORA TEM ROTA SEPARADA)
        if (action === 'send-email') {
            return res.status(400).json({ 
                error: 'Use a rota /api/carteira/send-email',
                message: 'Esta rota foi movida para /api/carteira/send-email'
            });
        }

        return res.status(400).json({ error: 'Action não reconhecida para POST' });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// --- ROTA DE LEITURA (GET) ---
router.get('/', async (req, res) => {
    const { action } = req.query;
    const client = await pool.connect();

    try {
        if (action === 'weights') {
            const r = await client.query('SELECT codigo, peso FROM pesos_customizados');
            const map = {}; 
            r.rows.forEach(row => map[row.codigo] = parseFloat(row.peso));
            return res.status(200).json(map);
        }
        
        if (action === 'quantities') {
            const r = await client.query('SELECT unique_key, quantidade FROM quantidades_manuais');
            const map = {}; 
            r.rows.forEach(row => map[row.unique_key] = parseFloat(row.quantidade));
            return res.status(200).json(map);
        }
        
        const result = await client.query("SELECT pedido, ordem_compra, to_char(entrega, 'DD/MM/YYYY') as entrega, razao_social, codigo, nome_produto, material, peso_un, qtd_pedido, saldo, peso_total FROM carteira ORDER BY entrega ASC");
        return res.status(200).json(result.rows);

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// Rota específica para envio de email (SIMPLIFICADA)
router.post('/send-email', async (req, res) => {
    console.log('[EMAIL] Recebendo requisição para enviar email');
    
    try {
        const { to, cc, subject, body, includeAttachment, attachmentData } = req.body;
        
        console.log('[EMAIL] Dados recebidos:', { 
            to: to ? '***' : 'vazio',
            cc: cc ? '***' : 'vazio',
            subject: subject || 'padrão',
            includeAttachment: !!includeAttachment,
            attachmentDataLength: attachmentData ? attachmentData.length : 0
        });
        
        if (!to) {
            return res.status(400).json({ error: 'Destinatário (to) é obrigatório' });
        }

        // VERIFICAÇÃO MELHORADA
        const apiKey = process.env.RESEND_API_KEY || process.env.SEND_API_KEY;
        if (!apiKey) {
            console.error('[EMAIL] ERRO: Nenhuma chave de API encontrada');
            console.error('[EMAIL] RESEND_API_KEY:', !!process.env.RESEND_API_KEY);
            console.error('[EMAIL] SEND_API_KEY:', !!process.env.SEND_API_KEY);
            
            return res.status(500).json({ 
                error: 'Resend não configurado',
                details: 'Adicione RESEND_API_KEY ou SEND_API_KEY nas variáveis de ambiente',
                debug: {
                    resendKeyExists: !!process.env.RESEND_API_KEY,
                    sendKeyExists: !!process.env.SEND_API_KEY
                }
            });
        }

        console.log('[EMAIL] Chave de API encontrada, comprimento:', apiKey.length);
        
        // Prepara dados do email
        const emailData = {
            from: 'Fundição Erus <sistema@fundicaoerus.com.br>',
            to: [to],
            subject: subject || 'Relatório da Carteira de Pedidos',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px;">
                    <h2 style="color: #fbbf24; border-bottom: 2px solid #fbbf24; padding-bottom: 10px;">
                        📊 Relatório da Carteira de Pedidos
                    </h2>
                    <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
                        <p style="white-space: pre-line; line-height: 1.6;">${body || 'Segue em anexo o relatório atual da carteira de pedidos.'}</p>
                    </div>
                    <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #fbbf24; margin: 20px 0;">
                        <p><strong>📅 Data de envio:</strong> ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}</p>
                        <p><strong>🏭 Sistema:</strong> Gestão Comercial - Fundição Erus</p>
                    </div>
                    <hr style="border: none; border-top: 1px solid #ddd;">
                    <p style="color: #666; font-size: 12px; text-align: center;">
                        <i>Esta é uma mensagem automática do sistema.</i>
                    </p>
                </div>
            `
        };

        // Adicionar CC se existir
        if (cc && cc.trim()) {
            emailData.cc = [cc.trim()];
        }

        // Adicionar anexo se solicitado
        if (includeAttachment && attachmentData && attachmentData.length > 0) {
            console.log('[EMAIL] Gerando anexo Excel com', attachmentData.length, 'linhas');
            const base64Excel = generateExcelBase64(attachmentData);
            emailData.attachments = [{
                filename: `Carteira_Pedidos_${new Date().toISOString().slice(0, 10)}.xlsx`,
                content: base64Excel
            }];
        }

        console.log('[EMAIL] Enviando email via Resend...');
        
        // Enviar email via Resend
        const { data, error } = await resend.emails.send(emailData);
        
        if (error) {
            console.error('[EMAIL] ❌ Erro Resend:', error);
            return res.status(500).json({ 
                error: 'Falha ao enviar email', 
                details: error.message,
                resendError: error
            });
        }
        
        console.log('[EMAIL] ✅ Email enviado via Resend:', data.id);
        return res.status(200).json({ 
            success: true, 
            message: 'Email enviado com sucesso',
            messageId: data.id
        });
        
    } catch (e) {
        console.error('[EMAIL] ❌ Erro ao enviar email:', e);
        return res.status(500).json({ 
            error: 'Falha ao enviar email', 
            details: e.message,
            stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
        });
    }
});

// Função auxiliar para gerar Excel em base64
function generateExcelBase64(data) {
    const workbook = XLSX.utils.book_new();
    const worksheetData = [
        ['PEDIDO', 'OC', 'ENTREGA', 'CLIENTE', 'CÓDIGO', 'PRODUTO', 'MATERIAL', 'PESO UN (kg)', 'SALDO', 'TOTAL (kg)'],
        ...data.map(item => [
            item.pedido || '',
            item.oc || '',
            item.entrega || '',
            item.cliente || '',
            item.codigo || '',
            item.produto || '',
            item.material || '',
            item.peso_un || '0',
            item.saldo || '0',
            item.total || '0'
        ])
    ];
    
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Carteira');
    
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return excelBuffer.toString('base64');
}

// Rota para testar configuração (MELHORADA)
router.get('/test-email', async (req, res) => {
    const apiKey = process.env.RESEND_API_KEY || process.env.SEND_API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ 
            error: 'API KEY não configurada',
            required: 'Adicione RESEND_API_KEY ou SEND_API_KEY no Vercel',
            debug: {
                RESEND_API_KEY: !!process.env.RESEND_API_KEY,
                SEND_API_KEY: !!process.env.SEND_API_KEY
            }
        });
    }
    
    try {
        console.log('[TESTE] Enviando email de teste com chave:', apiKey.substring(0, 10) + '...');
        
        const { data, error } = await resend.emails.send({
            from: 'Teste Resend <onboarding@resend.dev>',
            to: ['brasil.hyuri@gmail.com'],
            subject: 'Teste de Email - Fundição Erus',
            html: `
                <div style="font-family: Arial, sans-serif;">
                    <h2 style="color: #4CAF50;">✅ Teste de Email - Funcionando!</h2>
                    <p>Se você recebeu este email, o Resend está configurado corretamente.</p>
                    <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
                    <p><strong>Ambiente:</strong> ${process.env.NODE_ENV || 'development'}</p>
                    <hr>
                    <p style="font-size: 12px; color: #666;">Sistema de Gestão Comercial - Fundição Erus</p>
                </div>
            `
        });

        if (error) {
            console.error('[TESTE] Erro Resend:', error);
            return res.status(500).json({ 
                error: 'Falha no teste de email', 
                details: error.message 
            });
        }

        console.log('[TESTE] ✅ Email de teste enviado:', data.id);
        
        res.json({ 
            success: true, 
            message: 'Email de teste enviado com sucesso!',
            messageId: data.id,
            debug: {
                apiKeyLength: apiKey.length,
                keyPrefix: apiKey.substring(0, 10) + '...'
            }
        });
    } catch (error) {
        console.error('[TESTE] ❌ Erro ao enviar teste:', error);
        res.status(500).json({ 
            error: 'Erro ao enviar email de teste', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Rota para diagnóstico (MELHORADA)
router.get('/diagnose', (req, res) => {
    const apiKey = process.env.RESEND_API_KEY || process.env.SEND_API_KEY;
    
    res.json({
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        emailService: 'Resend',
        apiKeyConfigured: !!apiKey,
        apiKeyLength: apiKey ? apiKey.length : 0,
        keyType: process.env.RESEND_API_KEY ? 'RESEND_API_KEY' : 
                process.env.SEND_API_KEY ? 'SEND_API_KEY' : 'Nenhuma',
        databaseConnected: true,
        status: apiKey ? '✅ Configurado para envio de emails' : '❌ API KEY não configurada',
        recommendations: apiKey ? 
            '✅ Resend configurado corretamente' : 
            '❌ Adicione RESEND_API_KEY ou SEND_API_KEY no Vercel'
    });
});

module.exports = router;