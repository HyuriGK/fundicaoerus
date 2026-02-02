// --- CARREGA AS VARIÁVEIS DE AMBIENTE ---
require('dotenv').config();

const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const nodemailer = require('nodemailer');
const xlsx = require('xlsx');

// --- DEBUG ENVIRONMENT VARIABLE ---
console.log('=== DEBUG EMAIL CONFIG ===');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? 'Definido' : 'Ausente');
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? 'Definido' : 'Ausente');

// Configuração do Transporte (Gmail)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Middleware para log
router.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
    next();
});

// --- ROTA PARA ENVIO DE EMAIL (NODEMAILER) ---
router.post('/send-email', async (req, res) => {
    console.log('POST /send-email - Iniciando...');

    const { to, cc, subject, body, includeAttachment, attachmentData } = req.body;

    // Validação básica
    if (!to || !to.trim()) {
        return res.status(400).json({
            error: 'Campo obrigatório',
            message: 'O campo "Para" é obrigatório.'
        });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error('Erro: Credenciais de email não configuradas.');
        return res.status(500).json({
            error: 'Configuração ausente',
            message: 'As credenciais do Gmail não estão configuradas no servidor.'
        });
    }

    try {
        // Configuração da mensagem
        const mailOptions = {
            from: `"Fundição Erus" <${process.env.EMAIL_USER}>`,
            to: to.trim(),
            subject: subject || `Relatório - ${new Date().toLocaleDateString('pt-BR')}`,
            html: body ? body.replace(/\n/g, '<br>') : '<p>Relatório em anexo.</p>',
            attachments: []
        };

        // Adiciona CC se existir
        if (cc && cc.trim()) {
            mailOptions.cc = cc.trim();
        }

        // Gerar e anexar Excel
        if (includeAttachment && attachmentData && attachmentData.length > 0) {
            console.log(`Gerando anexo com ${attachmentData.length} linhas...`);

            const ws = xlsx.utils.json_to_sheet(attachmentData);
            const wb = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wb, ws, 'Carteira');

            const excelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

            mailOptions.attachments.push({
                filename: `Carteira_Pedidos_${new Date().toISOString().slice(0, 10)}.xlsx`,
                content: excelBuffer,
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            console.log('Anexo adicionado.');
        }

        // Enviar
        console.log(`Enviando de ${process.env.EMAIL_USER} para ${to}...`);
        const info = await transporter.sendMail(mailOptions);

        console.log('Email enviado com sucesso! ID:', info.messageId);

        return res.status(200).json({
            success: true,
            message: 'Email enviado com sucesso!',
            emailId: info.messageId
        });

    } catch (error) {
        console.error('Erro ao enviar email via Nodemailer:', error);
        return res.status(500).json({
            error: 'Erro no envio',
            message: 'Falha ao conectar com o Gmail: ' + error.message,
            details: error
        });
    }
});

// --- ROTA DE ESCRITA (POST) para outras ações ---
router.post('/', async (req, res) => {
    const { action } = req.query;

    if (action === 'send-email') {
        return res.status(400).json({ error: 'Use a rota /send-email para envio de emails' });
    }

    const client = await pool.connect();

    try {
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

        if (action === 'save-cc-list') {
            const { emails } = req.body; // Expects array of strings
            await client.query('BEGIN');
            await client.query('DELETE FROM carteira_cc_list');
            if (emails && emails.length > 0) {
                for (const email of emails) {
                    await client.query('INSERT INTO carteira_cc_list (email) VALUES ($1) ON CONFLICT DO NOTHING', [email]);
                }
            }
            await client.query('COMMIT');
            return res.status(200).json({ success: true });
        }

        if (action === 'save-snapshot') {
            const data = req.body;
            await client.query('BEGIN');
            await client.query('TRUNCATE TABLE carteira RESTART IDENTITY');

            const queryText = `INSERT INTO carteira (pedido, ordem_compra, entrega, razao_social, codigo, nome_produto, material, peso_un, qtd_pedido, saldo, peso_total, unique_key, is_new) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`;

            for (const row of data) {
                let dateVal = null;
                if (row.entrega) {
                    const parts = row.entrega.split('/');
                    dateVal = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : row.entrega;
                }
                const p = (row.pedido || '').replace(' BLOCK', '').trim().replace(/[^A-Z0-9]/g, '');
                const c = (row.codigo || '').trim().replace(/[^A-Z0-9]/g, '');
                const o = (row.ordem_compra || '').trim().replace(/[^A-Z0-9]/g, '');
                const eRaw = row.entrega ? row.entrega.replace(/[^0-9]/g, '') : '';
                const uniqueKey = `${p}_${c}_${eRaw}_${o}`;

                await client.query(queryText, [row.pedido, row.ordem_compra, dateVal, row.razao_social, row.codigo, row.nome_produto, row.material, row.peso_un, row.qtd_pedido, row.saldo, row.peso_total, uniqueKey, row.is_new || false]);
            }
            await client.query('COMMIT');
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Action não reconhecida' });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Erro em POST /:', e);
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

        if (action === 'cc-list') {
            const r = await client.query('SELECT email FROM carteira_cc_list');
            return res.status(200).json(r.rows.map(row => row.email));
        }

        const result = await client.query("SELECT pedido, ordem_compra, to_char(entrega, 'DD/MM/YYYY') as entrega, razao_social, codigo, nome_produto, material, peso_un, qtd_pedido, saldo, peso_total, is_new FROM carteira ORDER BY entrega ASC");
        return res.status(200).json(result.rows);

    } catch (e) {
        console.error('Erro em GET /:', e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

module.exports = router;