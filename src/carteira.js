const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { Resend } = require('resend');
const XLSX = require('xlsx');

// Inicializa Resend com fallback para ambas as variáveis
const apiKey = process.env.RESEND_API_KEY || process.env.SEND_API_KEY;
if (!apiKey) {
    console.error('❌ CRÍTICO: Nenhuma chave Resend encontrada!');
    console.error('   Configure RESEND_API_KEY ou SEND_API_KEY no Vercel');
}

const resend = new Resend(apiKey);

// Middleware de log para debugging
router.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
});

// --- ROTA DE ESCRITA (POST) ---
router.post('/', async (req, res) => {
    const { action } = req.query;
    const client = await pool.connect();

    try {
        console.log(`[POST] Action: ${action}, Body size: ${JSON.stringify(req.body).length} bytes`);

        // 1. SALVAR PESO
        if (action === 'save-weight') {
            const { codigo, peso } = req.body;
            await client.query(
                'INSERT INTO pesos_customizados (codigo, peso) VALUES ($1, $2) ON CONFLICT (codigo) DO UPDATE SET peso = $2', 
                [codigo, peso]
            );
            return res.status(200).json({ success: true });
        }

        // 2. SALVAR QUANTIDADE
        if (action === 'save-quantity') {
            const { unique_key, quantity } = req.body;
            await client.query(
                'INSERT INTO quantidades_manuais (unique_key, quantidade) VALUES ($1, $2) ON CONFLICT (unique_key) DO UPDATE SET quantidade = $2', 
                [unique_key, quantity]
            );
            return res.status(200).json({ success: true });
        }

        // 3. SALVAR CARTEIRA EXCEL
        if (action === 'save-snapshot') {
            const data = req.body;
            console.log(`[SAVE-SNAPSHOT] Salvando ${data.length} registros`);
            
            await client.query('BEGIN');
            await client.query('TRUNCATE TABLE carteira RESTART IDENTITY');
            
            const queryText = `INSERT INTO carteira (pedido, ordem_compra, entrega, razao_social, codigo, nome_produto, material, peso_un, qtd_pedido, saldo, peso_total, unique_key) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`;
            
            for (const row of data) {
                let dateVal = null;
                if (row.entrega) {
                    const parts = row.entrega.split('/');
                    dateVal = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : row.entrega;
                }
                
                const p = (row.pedido || '').replace(' BLOCK','').trim().replace(/[^A-Z0-9]/g, '');
                const c = (row.codigo || '').trim().replace(/[^A-Z0-9]/g, '');
                const o = (row.ordem_compra || '').trim().replace(/[^A-Z0-9]/g, '');
                const eRaw = row.entrega ? row.entrega.replace(/[^0-9]/g, '') : '';
                const uniqueKey = `${p}_${c}_${eRaw}_${o}`;
                
                await client.query(queryText, [
                    row.pedido, row.ordem_compra, dateVal, 
                    row.razao_social, row.codigo, row.nome_produto, 
                    row.material, row.peso_un, row.qtd_pedido, 
                    row.saldo, row.peso_total, uniqueKey
                ]);
            }
            
            await client.query('COMMIT');
            console.log(`[SAVE-SNAPSHOT] ✅ ${data.length} registros salvos`);
            return res.status(200).json({ 
                success: true, 
                message: `${data.length} registros salvos com sucesso` 
            });
        }

        // 4. ENVIAR EMAIL COM RESEND - REMOVIDO (AGORA TEM ROTA SEPARADA)
        if (action === 'send-email') {
            return res.status(400).json({ 
                error: 'Use a rota /api/carteira/send-email',
                message: 'Esta rota foi movida para /api/carteira/send-email'
            });
        }

        return res.status(400).json({ error: 'Action não reconhecida para POST' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[POST ERROR] ${action}:`, error.message);
        res.status(500).json({ 
            error: 'Erro interno do servidor',
            message: error.message,
            action: action 
        });
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
            const result = await client.query('SELECT codigo, peso FROM pesos_customizados');
            const map = {}; 
            result.rows.forEach(row => map[row.codigo] = parseFloat(row.peso));
            return res.status(200).json(map);
        }
        
        if (action === 'quantities') {
            const result = await client.query('SELECT unique_key, quantidade FROM quantidades_manuais');
            const map = {}; 
            result.rows.forEach(row => map[row.unique_key] = parseFloat(row.quantidade));
            return res.status(200).json(map);
        }
        
        // Retorna todos os dados da carteira
        const result = await client.query(`
            SELECT pedido, ordem_compra, to_char(entrega, 'DD/MM/YYYY') as entrega, 
                   razao_social, codigo, nome_produto, material, peso_un, 
                   qtd_pedido, saldo, peso_total 
            FROM carteira 
            ORDER BY entrega ASC
        `);
        
        return res.status(200).json(result.rows);

    } catch (error) {
        console.error('[GET ERROR]:', error.message);
        res.status(500).json({ 
            error: 'Erro ao buscar dados',
            message: error.message 
        });
    } finally {
        client.release();
    }
});

// --- ROTA ESPECÍFICA PARA ENVIO DE EMAIL ---
router.post('/send-email', async (req, res) => {
    console.log('[EMAIL] 📧 Iniciando envio de email');
    
    try {
        const { to, cc, subject, body, includeAttachment, attachmentData } = req.body;
        
        // Logs sem expor dados sensíveis
        console.log('[EMAIL] 📝 Detalhes:', { 
            to: to ? '***@***' : 'não informado',
            cc: cc ? '***@***' : 'não informado',
            subject: subject || 'padrão',
            hasAttachment: !!(includeAttachment && attachmentData),
            attachmentRows: attachmentData ? attachmentData.length : 0
        });
        
        // Validações
        if (!to) {
            return res.status(400).json({ 
                success: false,
                error: 'Destinatário obrigatório',
                message: 'O campo "Para" é obrigatório'
            });
        }

        // Validação do email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            return res.status(400).json({ 
                success: false,
                error: 'Email inválido',
                message: 'O email do destinatário é inválido'
            });
        }

        // Verifica se a API KEY está configurada
        if (!apiKey) {
            console.error('[EMAIL] ❌ ERRO: API Key não configurada');
            return res.status(500).json({ 
                success: false,
                error: 'Serviço de email não configurado',
                message: 'Configure a chave do Resend no Vercel',
                details: 'Adicione RESEND_API_KEY nas variáveis de ambiente'
            });
        }

        // Prepara dados do email
        const emailData = {
            from: 'Fundição Erus <sistema@fundicaoerus.com.br>',
            to: [to],
            subject: subject || `Relatório da Carteira de Pedidos - ${new Date().toLocaleDateString('pt-BR')}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Relatório da Carteira</title>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 700px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #fbbf24, #d97706); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
                        .content { background: #f9f9f9; padding: 25px; border-left: 4px solid #fbbf24; margin: 20px 0; }
                        .footer { background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd; }
                        .highlight { color: #fbbf24; font-weight: bold; }
                        .data-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>📊 Relatório da Carteira de Pedidos</h1>
                            <p>Sistema de Gestão Comercial - Fundição Erus</p>
                        </div>
                        
                        <div class="content">
                            <p style="white-space: pre-line; margin-bottom: 20px;">${body || 'Segue em anexo o relatório atual da carteira de pedidos.'}</p>
                            
                            <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
                                <p><strong>📅 Data de envio:</strong> ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}</p>
                                <p><strong>🔗 Sistema:</strong> <a href="${process.env.APP_URL || 'https://fundicaoerus.vercel.app'}">Acessar Sistema</a></p>
                            </div>
                        </div>
                        
                        <div class="footer">
                            <p><i>Esta é uma mensagem automática do sistema de gestão comercial.</i></p>
                            <p>Fundição Erus &copy; ${new Date().getFullYear()}</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        // Adicionar CC se existir
        if (cc && cc.trim()) {
            const ccEmails = cc.split(',').map(email => email.trim()).filter(email => emailRegex.test(email));
            if (ccEmails.length > 0) {
                emailData.cc = ccEmails;
            }
        }

        // Adicionar anexo se solicitado
        if (includeAttachment && attachmentData && attachmentData.length > 0) {
            console.log(`[EMAIL] 📎 Gerando anexo Excel com ${attachmentData.length} registros`);
            const base64Excel = generateExcelBase64(attachmentData);
            emailData.attachments = [{
                filename: `Carteira_Pedidos_${new Date().toISOString().slice(0, 10)}.xlsx`,
                content: base64Excel,
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }];
        }

        console.log('[EMAIL] 🚀 Enviando via Resend...');
        
        // Enviar email via Resend
        const { data, error } = await resend.emails.send(emailData);
        
        if (error) {
            console.error('[EMAIL] ❌ Erro do Resend:', error);
            return res.status(500).json({ 
                success: false,
                error: 'Falha ao enviar email',
                message: error.message || 'Erro desconhecido do provedor de email',
                providerError: error
            });
        }
        
        console.log(`[EMAIL] ✅ Email enviado com sucesso! ID: ${data.id}`);
        return res.status(200).json({ 
            success: true, 
            message: 'Email enviado com sucesso!',
            messageId: data.id,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('[EMAIL] ❌ Erro inesperado:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Erro interno ao processar email',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Função auxiliar para gerar Excel em base64
function generateExcelBase64(data) {
    try {
        const workbook = XLSX.utils.book_new();
        
        // Formatar dados da planilha
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
                parseFloat(item.peso_un) || 0,
                parseFloat(item.saldo) || 0,
                parseFloat(item.total) || 0
            ])
        ];
        
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        
        // Adicionar formatação básica
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({r: 0, c: C});
            if (!worksheet[cellAddress]) continue;
            worksheet[cellAddress].s = { 
                font: { bold: true },
                fill: { fgColor: { rgb: "FFD966" } }
            };
        }
        
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Carteira');
        
        // Converter para buffer e depois base64
        const excelBuffer = XLSX.write(workbook, { 
            type: 'buffer', 
            bookType: 'xlsx',
            compression: true
        });
        
        return excelBuffer.toString('base64');
    } catch (error) {
        console.error('[EXCEL ERROR]:', error);
        throw new Error('Erro ao gerar arquivo Excel: ' + error.message);
    }
}

// --- ROTA DE TESTE DE EMAIL ---
router.get('/test-email', async (req, res) => {
    try {
        console.log('[TESTE] 🔧 Testando configuração do Resend');
        
        if (!apiKey) {
            return res.status(500).json({ 
                success: false,
                error: 'API KEY não configurada',
                instructions: 'Adicione RESEND_API_KEY nas variáveis de ambiente do Vercel',
                currentKeys: {
                    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
                    SEND_API_KEY: !!process.env.SEND_API_KEY
                }
            });
        }

        console.log(`[TESTE] ✅ Chave encontrada (${apiKey.length} caracteres)`);
        
        const { data, error } = await resend.emails.send({
            from: 'Teste Resend <onboarding@resend.dev>',
            to: ['brasil.hyuri@gmail.com'],
            subject: '✅ Teste de Email - Fundição Erus',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #4CAF50;">✅ Teste de Email - Funcionando!</h2>
                    <p>Se você recebeu este email, o Resend está configurado corretamente.</p>
                    
                    <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
                        <p><strong>Ambiente:</strong> ${process.env.NODE_ENV || 'development'}</p>
                        <p><strong>API Key:</strong> ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}</p>
                    </div>
                    
                    <hr>
                    <p style="font-size: 12px; color: #666;">
                        Sistema de Gestão Comercial - Fundição Erus
                    </p>
                </div>
            `
        });

        if (error) {
            console.error('[TESTE] ❌ Erro do Resend:', error);
            return res.status(500).json({ 
                success: false,
                error: 'Falha no teste de email',
                details: error.message,
                resendError: error
            });
        }

        console.log(`[TESTE] ✅ Email de teste enviado! ID: ${data.id}`);
        
        res.json({ 
            success: true, 
            message: 'Email de teste enviado com sucesso!',
            messageId: data.id,
            debug: {
                apiKeyLength: apiKey.length,
                keyPrefix: apiKey.substring(0, 8) + '...',
                environment: process.env.NODE_ENV || 'development'
            }
        });
    } catch (error) {
        console.error('[TESTE] ❌ Erro inesperado:', error);
        res.status(500).json({ 
            success: false,
            error: 'Erro ao enviar email de teste',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// --- ROTA DE DIAGNÓSTICO ---
router.get('/diagnose', (req, res) => {
    const diagnostics = {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        appUrl: process.env.APP_URL || 'Não configurado',
        
        // Email Configuration
        emailService: 'Resend',
        apiKeyConfigured: !!apiKey,
        apiKeyLength: apiKey ? apiKey.length : 0,
        keySource: process.env.RESEND_API_KEY ? 'RESEND_API_KEY' : 
                  process.env.SEND_API_KEY ? 'SEND_API_KEY' : 'Nenhuma',
        
        // Database
        databaseConfigured: !!process.env.DATABASE_URL,
        
        // System Status
        status: apiKey ? '✅ Configurado para envio de emails' : '❌ API KEY não configurada',
        health: 'operational',
        
        // Recommendations
        recommendations: []
    };
    
    if (!apiKey) {
        diagnostics.recommendations.push('❌ Adicione RESEND_API_KEY nas variáveis de ambiente do Vercel');
    }
    
    if (!process.env.APP_URL) {
        diagnostics.recommendations.push('⚠️ Configure APP_URL com a URL do seu site');
    }
    
    if (diagnostics.recommendations.length === 0) {
        diagnostics.recommendations.push('✅ Sistema configurado corretamente');
    }
    
    res.json(diagnostics);
});

// --- ROTA DE HEALTH CHECK ---
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'carteira-api',
        version: '1.0.0'
    });
});

module.exports = router;