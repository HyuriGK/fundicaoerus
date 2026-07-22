const express = require('express');
const router = express.Router();
const pool = require('../lib/db'); // Importa o db convertido
const bcrypt = require('bcryptjs');
const { logActivity } = require('./lib/logger');
const { generateToken, isAccessExemptRole, isWithinAllowedAccessHours, getAccessHoursMessage } = require('../lib/middleware');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

function getDeviceDetails(req) {
    const ua = String(req.body.user_agent || req.headers['user-agent'] || '');
    const deviceType = req.body.device_type || (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) ? 'mobile' : 'desktop');
    return {
        device_type: deviceType === 'mobile' ? 'mobile' : 'desktop',
        viewport: req.body.viewport || null,
        user_agent: ua
    };
}

// Rota: POST /api/auth (definido no index.js)
router.post('/', loginLimiter, async (req, res) => {
    const { user, pass } = req.body;

    if (!user || !pass) {
        return res.status(400).json({ success: false, message: "Dados incompletos." });
    }

    try {
        // 1. Busca o usuário pelo username
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [user]);
        const userData = result.rows[0];

        // Se não achou ninguém
        if (!userData) {
            return res.status(401).json({ success: false, message: "Usuário ou senha incorretos." });
        }

        // 2. Compara a senha enviada com a hash do banco
        const isMatch = await bcrypt.compare(pass, userData.password);

        if (isMatch) {
            // VERIFICAÇÃO DE APROVAÇÃO
            if (!userData.approved) {
                return res.status(401).json({
                    success: false,
                    message: "O administrador do sistema ainda não aceitou seu acesso."
                });
            }

            if (!isAccessExemptRole(userData.role) && !isWithinAllowedAccessHours()) {
                return res.status(403).json({
                    success: false,
                    code: 'ACCESS_HOURS_BLOCKED',
                    message: getAccessHoursMessage()
                });
            }

            // Sucesso!
            // 3. Atualiza o timestamp de último login e reseta force_logout (Fire & Forget)
            const deviceDetails = getDeviceDetails(req);
            pool.query('UPDATE users SET last_login = NOW(), force_logout = FALSE WHERE username = $1', [user])
                .then(() => logActivity(user, 'LOGIN', 'users', { name: userData.name, role: userData.role, ...deviceDetails }))
                .catch(err => console.error('Erro ao atualizar last_login ou logar atividade:', err));

            // Retorna os dados
const token = generateToken(userData);
            return res.status(200).json({
                success: true,
                token: token,
                role: userData.role,
                name: userData.name,
                can_view_monetary: userData.can_view_monetary || false
            });
        } else {
            return res.status(401).json({ success: false, message: "Usuário ou senha incorretos." });
        }

    } catch (error) {
        console.error('Erro no login:', error);
        return res.status(500).json({ success: false, message: "Erro interno do servidor." });
    }
});

// Rota: GET /api/auth/check?username=xxx — polling de sessão forçada
router.get('/check', async (req, res) => {
    const { username } = req.query;
    if (!username) return res.json({ force_logout: false });
    try {
        const result = await pool.query('SELECT force_logout, role, name, can_view_monetary FROM users WHERE username = $1', [username]);
        if (!result.rows.length) return res.json({ force_logout: true }); // usuário deletado
        const row = result.rows[0];
        const outsideHours = !isAccessExemptRole(row.role) && !isWithinAllowedAccessHours();
        return res.json({
            force_logout: row.force_logout || outsideHours,
            code: outsideHours ? 'ACCESS_HOURS_BLOCKED' : undefined,
            message: outsideHours ? getAccessHoursMessage() : undefined,
            role: row.role,
            name: row.name,
            can_view_monetary: row.can_view_monetary || false
        });
    } catch {
        return res.json({ force_logout: false });
    }
});

module.exports = router;
