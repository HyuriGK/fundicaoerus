const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'erus-fundicao-secret-change-in-production';
const ACCESS_EXEMPT_ROLES = new Set(['desenvolvedor', 'gerente comercial', 'diretor']);

function normalizeRole(role) {
    return String(role || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getSaoPauloHour() {
    const parts = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        hour12: false
    }).formatToParts(new Date());
    return Number(parts.find(p => p.type === 'hour')?.value || 0);
}

function isAccessExemptRole(role) {
    return ACCESS_EXEMPT_ROLES.has(normalizeRole(role));
}

function isWithinAllowedAccessHours() {
    const hour = getSaoPauloHour();
    return hour >= 6 && hour < 18;
}

function getAccessHoursMessage() {
    return 'Acesso fora do horário permitido. O sistema está disponível das 06:00 às 18:00.';
}

function generateToken(user) {
    return jwt.sign(
        { user: user.username, name: user.name, role: user.role, can_view_monetary: user.can_view_monetary || false },
        JWT_SECRET,
        { expiresIn: '8h' }
    );
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Token de autenticacao ausente.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        if (!isAccessExemptRole(decoded.role) && !isWithinAllowedAccessHours()) {
            return res.status(403).json({
                success: false,
                force_logout: true,
                code: 'ACCESS_HOURS_BLOCKED',
                message: getAccessHoursMessage()
            });
        }
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Token invalido ou expirado.' });
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Acesso negado.' });
        }
        next();
    };
}

module.exports = { generateToken, authenticateToken, requireRole, JWT_SECRET, isAccessExemptRole, isWithinAllowedAccessHours, getAccessHoursMessage };
