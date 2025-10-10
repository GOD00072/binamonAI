'use strict';

const authMiddleware = (authManager) => {
    return (req, res, next) => {
        const skipAuthPaths = [
            '/api/auth/login',
            '/webhook',
        ];

        if (skipAuthPaths.some(path => req.path.startsWith(path))) {
            return next();
        }

        let token = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }

        if (!token && req.headers.cookie) {
            const cookies = req.headers.cookie.split(';').map(cookie => cookie.trim());
            const authCookie = cookies.find(cookie => cookie.startsWith('auth_token='));
            if (authCookie) {
                token = authCookie.split('=')[1];
            }
        }

        if (!token) {
            // For frontend routes, let them load and handle auth client-side
            if (req.method === 'GET' && !req.path.startsWith('/api/')) {
                 return next();
            }
            if (req.path.startsWith('/api/roles')) {
                return res.status(401).json({ error: 'Authentication required' });
            }
        }

        if (token) {
            const decoded = authManager.verifyToken(token);
            if (decoded) {
                const now = Math.floor(Date.now() / 1000);
                if (decoded.exp && decoded.exp < now) {
                    if (req.path.startsWith('/api/')) {
                        return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
                    }
                } else {
                    req.user = decoded;
                }
            } else {
                if (req.path.startsWith('/api/')) {
                    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
                }
            }
        }

        // For role management, enforce permissions strictly.
        if (req.path.startsWith('/api/roles')) {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required for role management' });
            }
            // The `authorizeRequest` middleware will handle the permission check.
        }

        return next();
    };
};

module.exports = authMiddleware;