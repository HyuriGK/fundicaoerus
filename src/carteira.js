require('dotenv').config(); // Tenta ler .env localmente

const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { Resend } = require('resend');
const xlsx = require('xlsx');

// --- DEBUG INICIAL ---
console.log('=== STATUS INICIAL ===');
console.log('Ambiente:', process.env.NODE_ENV || 'development');
console.log('RESEND_API_KEY (Global):', process.env.RESEND_API_KEY ? 'Definida' : 'Não definida');

// Inicialização Global (Pode falhar se a ENV não estiver pronta no boot)
let resendGlobal = null;
try {
    if (process.env.RESEND_API_KEY) {
        resendGlobal = new Resend(process.env.RESEND_API_KEY);
    }
} catch (error) {
    console.error('Erro ao iniciar Resend globalmente:', error.message);
}

// Middleware de Log
router.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
    next();
});

// --- ROTA DE ENVIO DE EMAIL ---
router.post('/send-email', async (req, res) => {
    console.log('POST /send-email - Iniciando processamento');
    
    // Tenta obter o cliente: ou o global, ou cria um novo AGORA (Lazy Load)
    // Isso resolve casos onde a variável de ambiente carrega com atraso na Vercel
    let mailClient = resendGlobal;
    
    if (!mailClient && process.env.RESEND_API_KEY) {
        console.log('Tentando inicializar Resend dentro da rota...');
        try {
            mailClient = new Resend(process.env.RESEND_API_KEY);
        } catch (e) {
            console.error('Falha ao criar instância do Resend:', e);
        }
    }

    // Verificação Final
    if (!mailClient || !process.env.RESEND_API_KEY) {
        console.error('ERRO CRÍTICO: Chave API do Resend não encontrada no momento do envio.');
        console.error('Verifique as variáveis de ambiente no painel da Vercel (Settings > Environment Variables).');
        
        return res.status(500).json({ 
            error: 'Configuração ausente',
            message: 'A chave da API de e-mail não está configurada no servidor. Adicione RESEND_API_KEY nas variáveis de ambiente.',
            debug_env: process.env.NODE_ENV
        });
    }

    const { to, cc, subject, body, includeAttachment, attachmentData } = req.body;
    
    if (!to || !to.trim()) {
        return res.status(400).json({ error: 'O campo "Para" é obrigatório.' });
    }

    try {
        const emailOptions = {
            from: 'Fundição Erus <onboarding@resend.dev>', // Use onboarding@resend.dev para testes
            to: [to.trim()],
            subject: subject || `Relatório - ${new Date().toLocaleDateString('pt-BR')}`,
            html: body ? body.replace(/\n/g, '<br>') : '<p>Relatório em anexo.</p>',
        };

        if (cc && cc.trim()) emailOptions.cc = [cc.trim()];

        if (includeAttachment && attachmentData?.length > 0) {
            console.log(`Gerando anexo Excel com ${attachmentData.length} linhas...`);
            const ws = xlsx.utils.json_to_sheet(attachmentData);
            const wb = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wb, ws, 'Dados');
            const excelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
            
            emailOptions.attachments = [{
                filename: `Relatorio_${new Date().toISOString().slice(0, 10)}.xlsx`,
                content: excelBuffer.toString('base64'),
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }];
        }

        console.log(`Enviando email para ${to}...`);
        const { data, error } = await mailClient.emails.send(emailOptions);

        if (error) {
            console.error('Erro retornado pela API do Resend:', error);
            return res.status(500).json({ 
                error: 'Falha no envio', 
                message: error.message,
                details: error 
            });
        }

        console.log('Sucesso! ID:', data?.id);
        return res.status(200).json({ success: true, emailId: data?.id });

    } catch (error) {
        console.error('Exceção no processamento:', error);
        return res.status(500).json({ error: 'Erro interno', message: error.message });
    }
});

// --- DEMAIS ROTAS (Mantenha igual) ---
router.post('/', async (req, res) => {
    // ... seu código existente das rotas de banco de dados (save-weight, etc)
    // Se for action=send-email, avisa para usar a rota correta
    if (req.query.action === 'send-email') {
        return res.status(400).json({ error: 'Use endpoint /send-email' });
    }
    
    // ... (Mantenha o resto do seu código original aqui para POST e GET)
    const client = await pool.connect();
    try {
        const { action } = req.query;
        // ... (lógica de save-weight, save-quantity, save-snapshot)
        if (action === 'save-weight') {
            const { codigo, peso } = req.body;
            await client.query('INSERT INTO pesos_customizados (codigo, peso) VALUES ($1, $2) ON CONFLICT (codigo) DO UPDATE SET peso = $2', [codigo, peso]);
            return res.status(200).json({ success: true });
        }
        if (action === 'save-quantity') {
            const { unique_key, quantity } = req.body;
            await client.query('INSERT INTO quantidades_manuais (unique_key, quantidade) VALUES ($1, $2) ON CONFLICT (unique_key) DO UPDATE SET quantidade = $2', [unique_key, quantity]);
            return res.status(200).json({ success: true });
        }
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
        return res.status(400).json({ error: 'Action não reconhecida' });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

router.get('/', async (req, res) => {
    const { action } = req.query;
    const client = await pool.connect();
    try {
        if (action === 'weights') {
            const r = await client.query('SELECT codigo, peso FROM pesos_customizados');
            const map = {}; r.rows.forEach(row => map[row.codigo] = parseFloat(row.peso));
            return res.status(200).json(map);
        }
        if (action === 'quantities') {
            const r = await client.query('SELECT unique_key, quantidade FROM quantidades_manuais');
            const map = {}; r.rows.forEach(row => map[row.unique_key] = parseFloat(row.quantidade));
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

module.exports = router;