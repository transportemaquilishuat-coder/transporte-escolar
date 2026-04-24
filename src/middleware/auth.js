const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    console.log('--- AUTH CHECK ---');
    console.log('method:', req.method);
    console.log('path:', req.originalUrl);
    console.log('authorization header:', req.headers.authorization);

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

    console.log('token exists:', !!token);
    console.log('token preview:', token ? `${token.slice(0, 16)}...` : 'null');

    if (!token) {
        return res.status(401).json({ error: 'Token requerido' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        console.log('decoded payload:', payload);
        req.user = payload;
        next();
    } catch (error) {
        console.error('jwt verify failed:', error.message);
        return res.status(401).json({ error: `Token requerido: ${error.message}` });
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        if (!roles.includes(req.user.rol)) {
            return res.status(403).json({ error: 'No tienes permisos para esta acción' });
        }

        next();
    };
}

module.exports = {
    authenticateToken,
    requireRole,
};
