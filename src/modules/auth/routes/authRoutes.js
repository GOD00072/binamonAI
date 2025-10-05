'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../../../../lib/prisma');
const router = express.Router();

class AuthManager {
    constructor(logger) {
        this.logger = logger;
        this.secretKey = process.env.JWT_SECRET || 'default_jwt_secret_key_change_in_production';
        this.tokenExpiration = '24h';
    }

    async initialize() {
        try {
            await this.ensureDefaultAdmin();
            this.logger.info('Auth manager initialized successfully');
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize auth manager:', error);
            return false;
        }
    }

    async ensureDefaultAdmin() {
        try {
            const existingAdmin = await prisma.authUser.findFirst({ where: { role: 'admin' } });
            if (existingAdmin) {
                return;
            }

            const passwordHash = await this.hashPassword('admin123');
            const existingUsername = await prisma.authUser.findUnique({ where: { username: 'admin' } });

            if (existingUsername) {
                await prisma.authUser.update({
                    where: { id: existingUsername.id },
                    data: {
                        role: 'admin',
                        password: passwordHash,
                        employeeId: existingUsername.employeeId || 'ADMIN001'
                    }
                });
                this.logger.warn('Elevated existing user "admin" to admin role and reset password to default.');
                return;
            }

            let employeeId = 'ADMIN001';
            const employeeExists = await prisma.authUser.findUnique({ where: { employeeId } });
            if (employeeExists) {
                employeeId = `ADMIN${Date.now()}`;
            }

            await prisma.authUser.create({
                data: {
                    username: 'admin',
                    password: passwordHash,
                    employeeId,
                    role: 'admin'
                }
            });

            this.logger.info('Created default admin account (admin/admin123).');
        } catch (error) {
            this.logger.error('Error ensuring default admin:', error);
            throw error;
        }
    }

    sanitizeUser(user) {
        if (!user) {
            return null;
        }

        const { password, ...userData } = user;
        return userData;
    }

    async hashPassword(password) {
        const saltRounds = 10;
        return await bcrypt.hash(password, saltRounds);
    }

    async verifyPassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }

    generateToken(user) {
        return jwt.sign(user, this.secretKey, { expiresIn: this.tokenExpiration });
    }

    verifyToken(token) {
        try {
            return jwt.verify(token, this.secretKey);
        } catch (error) {
            this.logger.error('Token verification failed:', error.message);
            return null;
        }
    }

    async authenticate(username, password) {
        try {
            const user = await prisma.authUser.findUnique({ where: { username } });

            if (!user) {
                this.logger.info(`Authentication failed: User ${username} not found`);
                return null;
            }

            const isPasswordValid = await this.verifyPassword(password, user.password);

            if (!isPasswordValid) {
                this.logger.info(`Authentication failed: Invalid password for user ${username}`);
                return null;
            }

            const sanitizedUser = this.sanitizeUser(user);
            const token = this.generateToken(sanitizedUser);
            this.logger.info(`User ${username} authenticated successfully`);

            return {
                user: sanitizedUser,
                token
            };
        } catch (error) {
            this.logger.error('Authentication error:', error);
            return null;
        }
    }

    async createUser(userData) {
        try {
            const existingByUsername = await prisma.authUser.findUnique({ where: { username: userData.username } });
            if (existingByUsername) {
                return {
                    success: false,
                    message: 'Username already exists'
                };
            }

            const existingByEmployeeId = await prisma.authUser.findUnique({ where: { employeeId: userData.employeeId } });
            if (existingByEmployeeId) {
                return {
                    success: false,
                    message: 'Employee ID already exists'
                };
            }

            const createdUser = await prisma.authUser.create({
                data: {
                    username: userData.username,
                    password: await this.hashPassword(userData.password),
                    employeeId: userData.employeeId,
                    role: userData.role || 'user'
                }
            });

            this.logger.info(`Created new user: ${userData.username} with role: ${userData.role}`);
            return {
                success: true,
                user: this.sanitizeUser(createdUser)
            };
        } catch (error) {
            this.logger.error('Error creating user:', error);
            return {
                success: false,
                message: 'Internal server error'
            };
        }
    }

    async updateUser(id, userData) {
        try {
            const existingUser = await prisma.authUser.findUnique({ where: { id } });

            if (!existingUser) {
                return {
                    success: false,
                    message: 'User not found'
                };
            }

            if (userData.username && userData.username !== existingUser.username) {
                const duplicateUsername = await prisma.authUser.findUnique({ where: { username: userData.username } });
                if (duplicateUsername) {
                    return {
                        success: false,
                        message: 'Username already exists'
                    };
                }
            }

            if (userData.employeeId && userData.employeeId !== existingUser.employeeId) {
                const duplicateEmployee = await prisma.authUser.findUnique({ where: { employeeId: userData.employeeId } });
                if (duplicateEmployee) {
                    return {
                        success: false,
                        message: 'Employee ID already exists'
                    };
                }
            }

            const updateData = {};

            if (userData.username) {
                updateData.username = userData.username;
            }

            if (userData.role) {
                updateData.role = userData.role;
            }

            if (userData.employeeId) {
                updateData.employeeId = userData.employeeId;
            }

            if (userData.password) {
                updateData.password = await this.hashPassword(userData.password);
            }

            if (Object.keys(updateData).length === 0) {
                return {
                    success: true,
                    user: this.sanitizeUser(existingUser)
                };
            }

            const updatedUser = await prisma.authUser.update({
                where: { id },
                data: updateData
            });

            this.logger.info(`Updated user: ${updatedUser.username}`);
            return {
                success: true,
                user: this.sanitizeUser(updatedUser)
            };
        } catch (error) {
            this.logger.error('Error updating user:', error);
            return {
                success: false,
                message: 'Internal server error'
            };
        }
    }

    async deleteUser(id) {
        try {
            const user = await prisma.authUser.findUnique({ where: { id } });

            if (!user) {
                return {
                    success: false,
                    message: 'User not found'
                };
            }

            if (user.role === 'admin') {
                const adminCount = await prisma.authUser.count({ where: { role: 'admin' } });
                if (adminCount <= 1) {
                    return {
                        success: false,
                        message: 'Cannot delete the last admin user'
                    };
                }
            }

            await prisma.authUser.delete({ where: { id } });

            this.logger.info(`Deleted user: ${user.username}`);
            return {
                success: true,
                message: 'User deleted successfully'
            };
        } catch (error) {
            this.logger.error('Error deleting user:', error);
            return {
                success: false,
                message: 'Internal server error'
            };
        }
    }

    async getUsers() {
        try {
            const users = await prisma.authUser.findMany({ orderBy: { createdAt: 'asc' } });
            return users.map(user => this.sanitizeUser(user));
        } catch (error) {
            this.logger.error('Error getting users:', error);
            return [];
        }
    }

    async getUserById(id, { includePassword = false } = {}) {
        const user = await prisma.authUser.findUnique({ where: { id } });
        if (!user) {
            return null;
        }
        return includePassword ? user : this.sanitizeUser(user);
    }

    async changePassword(id, currentPassword, newPassword) {
        const user = await this.getUserById(id, { includePassword: true });

        if (!user) {
            return {
                success: false,
                message: 'User not found'
            };
        }

        const isPasswordValid = await this.verifyPassword(currentPassword, user.password);
        if (!isPasswordValid) {
            return {
                success: false,
                message: 'Current password is incorrect'
            };
        }

        await prisma.authUser.update({
            where: { id },
            data: {
                password: await this.hashPassword(newPassword)
            }
        });

        this.logger.info(`Password updated for user: ${user.username}`);
        return {
            success: true,
            message: 'Password changed successfully'
        };
    }

    authorizeRequest(rolesAllowed = ['admin']) {
        return async (req, res, next) => {
            try {
                if (req.path === '/webhook') {
                    return next();
                }

                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return res.status(401).json({ error: 'No token provided' });
                }

                const token = authHeader.split(' ')[1];
                const decoded = this.verifyToken(token);

                if (!decoded) {
                    return res.status(401).json({ error: 'Invalid token' });
                }

                const now = Math.floor(Date.now() / 1000);
                if (decoded.exp && decoded.exp < now) {
                    return res.status(401).json({ error: 'Token expired' });
                }

                if (!decoded.id) {
                    return res.status(401).json({ error: 'Token payload missing user id' });
                }

                const userRecord = await prisma.authUser.findUnique({ where: { id: decoded.id } });
                if (!userRecord) {
                    return res.status(401).json({ error: 'User not found' });
                }

                if (rolesAllowed.length > 0 && !rolesAllowed.includes(userRecord.role)) {
                    this.logger.warn(`Unauthorized access attempt by user ${userRecord.username} with role ${userRecord.role}`);
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }

                req.user = this.sanitizeUser(userRecord);
                next();
            } catch (error) {
                this.logger.error('Authorization error:', error);
                res.status(500).json({ error: 'Authorization failed' });
            }
        };
    }

    isAdmin() {
        return (req, res, next) => {
            if (req.user && req.user.role === 'admin') {
                next();
            } else {
                res.status(403).json({ error: 'Admin privileges required' });
            }
        };
    }
}

// Create router function that sets up the auth routes
const createAuthRoutes = (logger) => {
    const authManager = new AuthManager(logger);
    
    // Initialize auth manager
    authManager.initialize().catch(error => {
        logger.error('Failed to initialize auth manager:', error);
    });
    
    // Login route
    router.post('/login', async (req, res) => {
        try {
            const { username, password } = req.body;
            
            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password are required' });
            }
            
            const result = await authManager.authenticate(username, password);
            
            if (!result) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            res.json(result);
        } catch (error) {
            logger.error('Login error:', error);
            res.status(500).json({ error: 'Login failed' });
        }
    });
    
    // User management routes (admin only)
    // Get all users
    router.get('/users', authManager.authorizeRequest(['admin']), async (req, res) => {
        try {
            const users = await authManager.getUsers();
            res.json(users);
        } catch (error) {
            logger.error('Get users error:', error);
            res.status(500).json({ error: 'Failed to retrieve users' });
        }
    });
    
    // Create user
    router.post('/users', authManager.authorizeRequest(['admin']), async (req, res) => {
        try {
            const { username, password, employeeId, role } = req.body;
            
            if (!username || !password || !employeeId) {
                return res.status(400).json({ error: 'Username, password, and employee ID are required' });
            }
            
            const result = await authManager.createUser({
                username,
                password,
                employeeId,
                role: role || 'user'
            });
            
            if (!result.success) {
                return res.status(400).json({ error: result.message });
            }
            
            res.status(201).json(result);
        } catch (error) {
            logger.error('Create user error:', error);
            res.status(500).json({ error: 'Failed to create user' });
        }
    });
    
    // Update user
    router.put('/users/:id', authManager.authorizeRequest(['admin']), async (req, res) => {
        try {
            const { id } = req.params;
            const { username, password, employeeId, role } = req.body;
            
            const userData = {};
            if (username) userData.username = username;
            if (password) userData.password = password;
            if (employeeId) userData.employeeId = employeeId;
            if (role) userData.role = role;
            
            const result = await authManager.updateUser(id, userData);
            
            if (!result.success) {
                return res.status(400).json({ error: result.message });
            }
            
            res.json(result);
        } catch (error) {
            logger.error('Update user error:', error);
            res.status(500).json({ error: 'Failed to update user' });
        }
    });
    
    // Delete user
    router.delete('/users/:id', authManager.authorizeRequest(['admin']), async (req, res) => {
        try {
            const { id } = req.params;
            const result = await authManager.deleteUser(id);
            
            if (!result.success) {
                return res.status(400).json({ error: result.message });
            }
            
            res.json(result);
        } catch (error) {
            logger.error('Delete user error:', error);
            res.status(500).json({ error: 'Failed to delete user' });
        }
    });
    
    // User profile route
    router.get('/profile', authManager.authorizeRequest(['admin', 'user']), (req, res) => {
        res.json(req.user);
    });
    
    // Change own password
    router.post('/change-password', authManager.authorizeRequest(['admin', 'user']), async (req, res) => {
        try {
            const { currentPassword, newPassword } = req.body;

            if (!currentPassword || !newPassword) {
                return res.status(400).json({ error: 'Current password and new password are required' });
            }

            const result = await authManager.changePassword(req.user.id, currentPassword, newPassword);

            if (!result.success) {
                const statusCode = result.message === 'Current password is incorrect' ? 401 : 400;
                return res.status(statusCode).json({ error: result.message });
            }

            res.json(result);
        } catch (error) {
            logger.error('Change password error:', error);
            res.status(500).json({ error: 'Failed to change password' });
        }
    });
    
    return {
        router,
        authManager
    };
};

module.exports = createAuthRoutes;
