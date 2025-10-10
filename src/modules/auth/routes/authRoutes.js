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
            await this.ensureDefaultRolesAndAdmin();
            this.logger.info('Auth manager initialized successfully');
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize auth manager:', error);
            return false;
        }
    }

    async ensureDefaultRolesAndAdmin() {
        try {
            // 1. Ensure permissions exist
            const permissions = [
                { name: 'admin:access', description: 'Full administrative access' },
                { name: 'users:manage', description: 'Manage users' },
                { name: 'roles:manage', description: 'Manage roles and permissions' },
            ];
            for (const p of permissions) {
                await prisma.permission.upsert({
                    where: { name: p.name },
                    update: {},
                    create: p,
                });
            }
            this.logger.info('Default permissions ensured.');

            // 2. Ensure roles exist
            let adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
            if (!adminRole) {
                adminRole = await prisma.role.create({ data: { name: 'admin', description: 'Administrator' } });
                this.logger.info('Created "admin" role.');
            }

            let userRole = await prisma.role.findUnique({ where: { name: 'user' } });
            if (!userRole) {
                userRole = await prisma.role.create({ data: { name: 'user', description: 'Standard User' } });
                this.logger.info('Created "user" role.');
            }

            // 3. Assign all permissions to admin role
            const allPermissions = await prisma.permission.findMany();
            await prisma.rolePermission.deleteMany({ where: { roleId: adminRole.id } });
            await prisma.rolePermission.createMany({
                data: allPermissions.map(p => ({ roleId: adminRole.id, permissionId: p.id })),
            });
            this.logger.info('Assigned all permissions to "admin" role.');

            // 4. Ensure default admin user exists
            const adminUser = await prisma.authUser.findFirst({ where: { role: { name: 'admin' } } });
            if (!adminUser) {
                const passwordHash = await this.hashPassword('admin123');
                await prisma.authUser.create({
                    data: {
                        username: 'admin',
                        password: passwordHash,
                        employeeId: 'ADMIN001',
                        roleId: adminRole.id,
                    },
                });
                this.logger.info('Created default admin user (admin/admin123).');
            }
        } catch (error) {
            this.logger.error('Error ensuring default roles and admin:', error);
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
        const payload = {
            id: user.id,
            username: user.username,
            employeeId: user.employeeId,
            role: user.role.name,
            permissions: user.role.permissions.map(p => p.permission.name),
        };
        return jwt.sign(payload, this.secretKey, { expiresIn: this.tokenExpiration });
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
            const user = await prisma.authUser.findUnique({
                where: { username },
                include: {
                    role: {
                        include: {
                            permissions: {
                                include: {
                                    permission: true,
                                },
                            },
                        },
                    },
                },
            });

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
            const token = this.generateToken(user);
            this.logger.info(`User ${username} authenticated successfully`);

            return {
                user: sanitizedUser,
                token,
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
                return { success: false, message: 'Username already exists' };
            }

            const existingByEmployeeId = await prisma.authUser.findUnique({ where: { employeeId: userData.employeeId } });
            if (existingByEmployeeId) {
                return { success: false, message: 'Employee ID already exists' };
            }

            let roleId = userData.roleId;
            if (!roleId) {
                const userRole = await prisma.role.findUnique({ where: { name: 'user' } });
                if (!userRole) {
                    return { success: false, message: 'Default user role not found.' };
                }
                roleId = userRole.id;
            }

            const createdUser = await prisma.authUser.create({
                data: {
                    username: userData.username,
                    password: await this.hashPassword(userData.password),
                    employeeId: userData.employeeId,
                    roleId: roleId,
                },
            });

            this.logger.info(`Created new user: ${userData.username} with roleId: ${roleId}`);
            return {
                success: true,
                user: this.sanitizeUser(createdUser),
            };
        } catch (error) {
            this.logger.error('Error creating user:', error);
            return { success: false, message: 'Internal server error' };
        }
    }

    async updateUser(id, userData) {
        try {
            const existingUser = await prisma.authUser.findUnique({ where: { id } });

            if (!existingUser) {
                return { success: false, message: 'User not found' };
            }

            if (userData.username && userData.username !== existingUser.username) {
                const duplicateUsername = await prisma.authUser.findUnique({ where: { username: userData.username } });
                if (duplicateUsername) {
                    return { success: false, message: 'Username already exists' };
                }
            }

            if (userData.employeeId && userData.employeeId !== existingUser.employeeId) {
                const duplicateEmployee = await prisma.authUser.findUnique({ where: { employeeId: userData.employeeId } });
                if (duplicateEmployee) {
                    return { success: false, message: 'Employee ID already exists' };
                }
            }

            const updateData = {};
            if (userData.username) updateData.username = userData.username;
            if (userData.roleId) updateData.roleId = userData.roleId;
            if (userData.employeeId) updateData.employeeId = userData.employeeId;
            if (userData.password) updateData.password = await this.hashPassword(userData.password);

            if (Object.keys(updateData).length === 0) {
                return { success: true, user: this.sanitizeUser(existingUser) };
            }

            const updatedUser = await prisma.authUser.update({
                where: { id },
                data: updateData,
            });

            this.logger.info(`Updated user: ${updatedUser.username}`);
            return {
                success: true,
                user: this.sanitizeUser(updatedUser),
            };
        } catch (error) {
            this.logger.error('Error updating user:', error);
            return { success: false, message: 'Internal server error' };
        }
    }

    async deleteUser(id) {
        try {
            const user = await prisma.authUser.findUnique({
                where: { id },
                include: { role: true },
            });

            if (!user) {
                return { success: false, message: 'User not found' };
            }

            if (user.role.name === 'admin') {
                const adminCount = await prisma.authUser.count({ where: { role: { name: 'admin' } } });
                if (adminCount <= 1) {
                    return { success: false, message: 'Cannot delete the last admin user' };
                }
            }

            await prisma.authUser.delete({ where: { id } });

            this.logger.info(`Deleted user: ${user.username}`);
            return { success: true, message: 'User deleted successfully' };
        } catch (error) {
            this.logger.error('Error deleting user:', error);
            return { success: false, message: 'Internal server error' };
        }
    }

    async getUsers() {
        try {
            const users = await prisma.authUser.findMany({
                orderBy: { createdAt: 'asc' },
                include: { role: true },
            });
            return users.map(user => this.sanitizeUser(user));
        } catch (error) {
            this.logger.error('Error getting users:', error);
            return [];
        }
    }

    async getUserById(id, { includePassword = false } = {}) {
        const user = await prisma.authUser.findUnique({
            where: { id },
            include: { role: true },
        });
        if (!user) {
            return null;
        }
        return includePassword ? user : this.sanitizeUser(user);
    }

    async changePassword(id, currentPassword, newPassword) {
        const user = await this.getUserById(id, { includePassword: true });

        if (!user) {
            return { success: false, message: 'User not found' };
        }

        const isPasswordValid = await this.verifyPassword(currentPassword, user.password);
        if (!isPasswordValid) {
            return { success: false, message: 'Current password is incorrect' };
        }

        await prisma.authUser.update({
            where: { id },
            data: { password: await this.hashPassword(newPassword) },
        });

        this.logger.info(`Password updated for user: ${user.username}`);
        return { success: true, message: 'Password changed successfully' };
    }

    authorizeRequest(requiredPermission) {
        return (req, res, next) => {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'No token provided' });
            }

            const token = authHeader.split(' ')[1];
            const decoded = this.verifyToken(token);

            if (!decoded) {
                return res.status(401).json({ error: 'Invalid token' });
            }

            req.user = decoded;
            const userPermissions = decoded.permissions || [];

            if (userPermissions.includes('admin:access') || (requiredPermission && userPermissions.includes(requiredPermission))) {
                return next();
            }

            if (!requiredPermission) {
                return next();
            }

            this.logger.warn(`Authorization failed for user ${decoded.username}. Required: ${requiredPermission}`);
            return res.status(403).json({ error: 'Insufficient permissions' });
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

const createAuthRoutes = (logger) => {
    const authManager = new AuthManager(logger);

    authManager.initialize().catch(error => {
        logger.error('Failed to initialize auth manager:', error);
    });

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

    router.get('/users', authManager.authorizeRequest('users:manage'), async (req, res) => {
        try {
            const users = await authManager.getUsers();
            res.json(users);
        } catch (error) {
            logger.error('Get users error:', error);
            res.status(500).json({ error: 'Failed to retrieve users' });
        }
    });

    router.post('/users', authManager.authorizeRequest('users:manage'), async (req, res) => {
        try {
            const { username, password, employeeId, roleId } = req.body;
            if (!username || !password || !employeeId) {
                return res.status(400).json({ error: 'Username, password, and employee ID are required' });
            }
            const result = await authManager.createUser({ username, password, employeeId, roleId });
            if (!result.success) {
                return res.status(400).json({ error: result.message });
            }
            res.status(201).json(result);
        } catch (error) {
            logger.error('Create user error:', error);
            res.status(500).json({ error: 'Failed to create user' });
        }
    });

    router.put('/users/:id', authManager.authorizeRequest('users:manage'), async (req, res) => {
        try {
            const { id } = req.params;
            const { username, password, employeeId, roleId } = req.body;
            const userData = {};
            if (username) userData.username = username;
            if (password) userData.password = password;
            if (employeeId) userData.employeeId = employeeId;
            if (roleId) userData.roleId = roleId;

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

    router.delete('/users/:id', authManager.authorizeRequest('users:manage'), async (req, res) => {
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

    router.get('/profile', authManager.authorizeRequest(), (req, res) => {
        res.json(req.user);
    });

    router.post('/change-password', authManager.authorizeRequest(), async (req, res) => {
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