const express = require('express');
const router = express.Router();
const pool = require('../lib/db'); // Certifique-se que o db.js exporta usando module.exports = pool ou similar
const nodemailer = require('nodemailer');
const XLSX = require('xlsx');

// Configuração do transporter de email
const createTransporter = () => {
    // Verifica se as variáveis de ambiente necessárias estão definidas
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = process.env.SMTP_SECURE === 'true';

    if (!host || !port || !user || !pass) {
        throw new Error('Variáveis de ambiente para email não configuradas. Configure SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS.');
    }

    return nodemailer.createTransport({
        host: host,
        port: parseInt(port, 10),
        secure: secure,
        auth: {
            user: user,
            pass: pass
        }
    });
};

// --- ROTA DE ESCRITA (POST) ---
// Captura: save-weight, save-quantity, save-snapshot, send-email
router.post('/', async (req, res) => {
    const { action } = req.query; // Mantivemos a lógica de ler a action da URL
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

        // 4. ENVIAR EMAIL (NOVA FUNCIONALIDADE)
        if (action === 'send-email') {
            const { to, cc, subject, body, includeAttachment, attachmentData } = req.body;
            
            // Validar campos obrigatórios
            if (!to) {
                return res.status(400).json({ error: 'Destinatário (to) é obrigatório' });
            }

            // Configurar transporter
            const transporter = createTransporter();
            
            // Configurar opções do email
            const mailOptions = {
                from: process.env.EMAIL_FROM || 'sistema@fundicaoerus.com.br',
                to: to,
                subject: subject || 'Relatório da Carteira de Pedidos',
                text: body || 'Relatório da carteira de pedidos em anexo.',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px;">
                        <h2 style="color: #fbbf24;">Relatório da Carteira de Pedidos</h2>
                        <p>${body || 'Segue em anexo o relatório atual da carteira de pedidos.'}</p>
                        <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #fbbf24; margin: 20px 0;">
                            <p><strong>Data de envio:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
                            <p><strong>Enviado por:</strong> Sistema de Gestão Comercial - Fundição Erus</p>
                        </div>
                        <hr>
                        <p style="color: #666; font-size: 12px;">
                            Esta é uma mensagem automática do sistema. Por favor, não responda este email.
                        </p>
                    </div>
                `
            };

            // Adicionar cópia se fornecida
            if (cc) {
                mailOptions.cc = cc;
            }

            // Gerar e anexar Excel se solicitado
            if (includeAttachment && attachmentData && attachmentData.length > 0) {
                // Criar workbook Excel
                const workbook = XLSX.utils.book_new();
                
                // Converter dados para planilha
                const worksheetData = [
                    ['PEDIDO', 'OC', 'ENTREGA', 'CLIENTE', 'CÓDIGO', 'PRODUTO', 'MATERIAL', 'PESO UN (kg)', 'SALDO', 'TOTAL (kg)'],
                    ...attachmentData.map(item => [
                        item.pedido,
                        item.oc,
                        item.entrega,
                        item.cliente,
                        item.codigo,
                        item.produto,
                        item.material,
                        item.peso_un,
                        item.saldo,
                        item.total
                    ])
                ];
                
                const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Carteira');
                
                // Gerar buffer do Excel
                const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
                
                mailOptions.attachments = [
                    {
                        filename: `carteira_pedidos_${new Date().toISOString().slice(0, 10)}.xlsx`,
                        content: excelBuffer,
                        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    }
                ];
            }

            // Enviar email
            const info = await transporter.sendMail(mailOptions);
            
            console.log('Email enviado:', info.messageId);
            return res.status(200).json({ 
                success: true, 
                messageId: info.messageId,
                previewUrl: nodemailer.getTestMessageUrl(info)
            });
        }

        // Se nenhuma action for encontrada
        return res.status(400).json({ error: 'Action não reconhecida para POST' });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Erro no processamento:', e);
        
        // Erro específico para envio de email
        if (action === 'send-email') {
            return res.status(500).json({ 
                error: 'Falha ao enviar email', 
                details: e.message 
            });
        }
        
        res.status(500).json({ error: e.message });
    } finally {
        if (client) client.release();
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

// Rota específica para envio de email (mantida para compatibilidade com frontend)
router.post('/send-email', async (req, res) => {
    try {
        const { to, cc, subject, body, includeAttachment, attachmentData } = req.body;
        
        // Validar campos obrigatórios
        if (!to) {
            return res.status(400).json({ error: 'Destinatário (to) é obrigatório' });
        }

        // Configurar transporter
        const transporter = createTransporter();
        
        // Configurar opções do email
        const mailOptions = {
            from: process.env.EMAIL_FROM || 'sistema@fundicaoerus.com.br',
            to: to,
            subject: subject || 'Relatório da Carteira de Pedidos',
            text: body || 'Relatório da carteira de pedidos em anexo.',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px;">
                    <h2 style="color: #fbbf24; border-bottom: 2px solid #fbbf24; padding-bottom: 10px;">
                        <i class="fa-solid fa-briefcase" style="margin-right: 10px;"></i>Relatório da Carteira de Pedidos
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
                        <i class="fa-solid fa-circle-info" style="margin-right: 5px;"></i>
                        Esta é uma mensagem automática do sistema. Por favor, não responda este email.
                    </p>
                </div>
            `
        };

        // Adicionar cópia se fornecida
        if (cc) {
            mailOptions.cc = cc;
        }

        // Gerar e anexar Excel se solicitado
        if (includeAttachment && attachmentData && attachmentData.length > 0) {
            // Criar workbook Excel
            const workbook = XLSX.utils.book_new();
            
            // Converter dados para planilha
            const worksheetData = [
                ['PEDIDO', 'OC', 'ENTREGA', 'CLIENTE', 'CÓDIGO', 'PRODUTO', 'MATERIAL', 'PESO UN (kg)', 'SALDO', 'TOTAL (kg)'],
                ...attachmentData.map(item => [
                    item.pedido,
                    item.oc,
                    item.entrega,
                    item.cliente,
                    item.codigo,
                    item.produto,
                    item.material,
                    item.peso_un,
                    item.saldo,
                    item.total
                ])
            ];
            
            const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
            
            // Ajustar largura das colunas (aproximado)
            const colWidths = [
                { wch: 10 }, // PEDIDO
                { wch: 8 },  // OC
                { wch: 12 }, // ENTREGA
                { wch: 25 }, // CLIENTE
                { wch: 12 }, // CÓDIGO
                { wch: 40 }, // PRODUTO
                { wch: 8 },  // MATERIAL
                { wch: 12 }, // PESO UN
                { wch: 10 }, // SALDO
                { wch: 15 }  // TOTAL
            ];
            worksheet['!cols'] = colWidths;
            
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Carteira');
            
            // Gerar buffer do Excel
            const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            
            mailOptions.attachments = [
                {
                    filename: `carteira_pedidos_${new Date().toISOString().slice(0, 10)}.xlsx`,
                    content: excelBuffer,
                    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                }
            ];
        }

        // Enviar email
        const info = await transporter.sendMail(mailOptions);
        
        console.log('✅ Email enviado com sucesso:', info.messageId);
        
        return res.status(200).json({ 
            success: true, 
            message: 'Email enviado com sucesso',
            messageId: info.messageId
        });

    } catch (e) {
        console.error('❌ Erro ao enviar email:', e);
        
        return res.status(500).json({ 
            error: 'Falha ao enviar email', 
            details: e.message,
            suggestion: 'Verifique as configurações de SMTP no servidor'
        });
    }
});

// Rota para testar conexão com email (útil para debug)
router.get('/test-email', async (req, res) => {
    try {
        const transporter = createTransporter();
        
        // Verificar se as configurações são válidas
        await transporter.verify();
        
        res.status(200).json({ 
            success: true, 
            message: 'Configurações de email estão corretas',
            smtpConfig: {
                host: process.env.SMTP_HOST || 'não definido',
                port: process.env.SMTP_PORT || 'não definido',
                user: process.env.SMTP_USER || 'não definido',
                secure: process.env.SMTP_SECURE || false
            }
        });
    } catch (e) {
        console.error('Erro na configuração do email:', e);
        res.status(500).json({ 
            error: 'Configurações de email incorretas', 
            details: e.message,
            requiredEnvVars: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM']
        });
    }
});

module.exports = router;