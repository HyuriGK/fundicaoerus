const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'erus-fundicao-secret-change-in-production';

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

module.exports = { generateToken, authenticateToken, requireRole, JWT_SECRET };
