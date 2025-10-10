'use strict';

const DISABLE_AUTH = false;

// แก้ไขเพื่อตรวจสอบ token จาก cookie หรือ headers
const authMiddleware = (authManager) => {
    return (req, res, next) => {
        if (DISABLE_AUTH) {
            return next();
        }

        // Skip authentication for specific endpoints
        const skipPaths = [
            '/webhook',
            '/api/auth/login',
            '/login.html',
            '/login',
            '/',
            '/api/auth/login',
            '/api/products/urls',
            '/api/product-images/config'
        ];


        const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.html', '.map'];
        const isStaticFile = staticExtensions.some(ext => req.path.endsWith(ext));
        

        if (skipPaths.includes(req.path) || isStaticFile) {
            return next();
        }

        const reactRoutes = ['/chat', '/users', '/products', '/ai-config', '/dashboard'];
        const isReactRoute = reactRoutes.some(route => req.path.startsWith(route));
        
        if (isReactRoute && req.method === 'GET') {
            let token = null;
            
            // Check Authorization header
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.split(' ')[1];
            }
            
            // Check cookie if no header
            if (!token && req.headers.cookie) {
                const cookies = req.headers.cookie.split(';').map(cookie => cookie.trim());
                const authCookie = cookies.find(cookie => cookie.startsWith('auth_token='));
                if (authCookie) {
                    token = authCookie.split('=')[1];
                }
            }
            
            // If no token for React routes, let React handle it (it will show login)
            if (!token) {
                return next();
            }
            
            // If token exists, verify it
            const decoded = authManager.verifyToken(token);
            if (decoded) {
                req.user = decoded;
            }
            
            return next();
        }
        
        // For API endpoints, require authentication
        if (req.path.startsWith('/api/') && req.path !== '/api/auth/login') {
            let token = null;
            
            // Get token from Authorization header
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.split(' ')[1];
            }
            
            // Get token from cookie as fallback
            if (!token && req.headers.cookie) {
                const cookies = req.headers.cookie.split(';').map(cookie => cookie.trim());
                const authCookie = cookies.find(cookie => cookie.startsWith('auth_token='));
                if (authCookie) {
                    token = authCookie.split('=')[1];
                }
            }
            
            // Get token from query parameter (for testing only)
            if (!token && req.query.token) {
                token = req.query.token;
            }
            
            if (!token) {
                return res.status(401).json({ 
                    error: 'Authentication required',
                    code: 'NO_TOKEN'
                });
            }
            
            // Verify token
            const decoded = authManager.verifyToken(token);
            
            if (!decoded) {
                return res.status(401).json({ 
                    error: 'Invalid token',
                    code: 'INVALID_TOKEN'
                });
            }
            
            // Check if token is expired
            const now = Math.floor(Date.now() / 1000);
            if (decoded.exp && decoded.exp < now) {
                return res.status(401).json({ 
                    error: 'Token expired',
                    code: 'TOKEN_EXPIRED'
                });
            }
            
            // Attach user data to request
            req.user = decoded;
            return next();
        }
        
        // For all other requests, pass through
        next();
    };
};

module.exports = authMiddleware;
