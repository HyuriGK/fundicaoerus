const jwt = require('jsonwebtoken');
const pool = require('./db');

const JWT_SECRET = process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' && !JWT_SECRET) {
    throw new Error('JWT_SECRET deve ser configurado em produção.');
}
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

function canAccessOutsideHours(user) {
    return isAccessExemptRole(user?.role) || user?.can_access_after_hours === true;
}

function isWithinAllowedAccessHours() {
    const hour = getSaoPauloHour();
    return hour >= 6 && hour < 18;
}

function getAccessHoursMessage() {
    return 'Acesso fora do horário permitido. O sistema está disponível das 06:00 às 18:00.';
}

function generateToken(user) {
    if (!JWT_SECRET) throw new Error('JWT_SECRET não configurado.');
    return jwt.sign(
        { user: user.username, name: user.name, role: user.role, can_view_monetary: user.can_view_monetary || false, can_access_after_hours: user.can_access_after_hours || false },
        JWT_SECRET,
        { expiresIn: '8h' }
    );
}

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Token de autenticacao ausente.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        if (!canAccessOutsideHours(decoded) && !isWithinAllowedAccessHours()) {
            const result = await pool.query('SELECT can_access_after_hours FROM users WHERE username = $1 LIMIT 1', [decoded.user]);
            if (result.rows[0]?.can_access_after_hours === true) {
                req.user.can_access_after_hours = true;
                return next();
            }
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

module.exports = { generateToken, authenticateToken, requireRole, JWT_SECRET, isAccessExemptRole, canAccessOutsideHours, isWithinAllowedAccessHours, getAccessHoursMessage };
