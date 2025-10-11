'use strict';

const express = require('express');
const prisma = require('../../../../lib/prisma');
const router = express.Router();

const createRoleRoutes = (authManager, webSocketManager) => {
    const checkRolesManagePermission = authManager.authorizeRequest('roles:manage');

    // Get all roles
    router.get('/', checkRolesManagePermission, async (req, res) => {
        try {
            const roles = await prisma.role.findMany({
                include: { permissions: { include: { permission: true } } },
            });
            res.json(roles);
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve roles' });
        }
    });

    // Create a new role
    router.post('/', checkRolesManagePermission, async (req, res) => {
        try {
            const { name, description } = req.body;
            if (!name) {
                return res.status(400).json({ error: 'Role name is required' });
            }
            const newRole = await prisma.role.create({
                data: { name, description },
            });
            res.status(201).json(newRole);
        } catch (error) {
            res.status(500).json({ error: 'Failed to create role' });
        }
    });

    // Update a role
    router.put('/:id', checkRolesManagePermission, async (req, res) => {
        try {
            const { id } = req.params;
            const { name, description } = req.body;
            const updatedRole = await prisma.role.update({
                where: { id },
                data: { name, description },
            });
            res.json(updatedRole);
        } catch (error) {
            res.status(500).json({ error: 'Failed to update role' });
        }
    });

    // Delete a role
    router.delete('/:id', checkRolesManagePermission, async (req, res) => {
        try {
            const { id } = req.params;
            await prisma.role.delete({ where: { id } });
            res.status(204).send();
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete role' });
        }
    });

    // Assign permissions to a role
    router.post('/:id/permissions', checkRolesManagePermission, async (req, res) => {
        try {
            const { id } = req.params;
            const { permissionIds } = req.body;
            console.log('Received req.body:', req.body);
            console.log('Received permissionIds:', permissionIds);

            const result = await authManager.assignPermissionsToRole(id, permissionIds);

            if (!result.success) {
                return res.status(400).json({ error: result.message });
            }
            // Broadcast role permission update to all clients
            try {
                const role = result.role;
                const roleName = role.name;
                const perms = role.permissions.map(p => p.permission.name);
                if (webSocketManager && webSocketManager.io) {
                    webSocketManager.io.emit('auth_role_permissions_updated', {
                        roleId: id,
                        roleName,
                        permissions: perms,
                        timestamp: Date.now()
                    });
                }
            } catch (e) {
                // Non-fatal: logging only
                console.error('Failed to emit auth_role_permissions_updated:', e.message);
            }
            res.json(result.role);
        } catch (error) {
            res.status(500).json({ error: 'Failed to assign permissions' });
        }
    });

    // Get all permissions
    router.get('/permissions', checkRolesManagePermission, async (req, res) => {
        try {
            const permissions = await prisma.permission.findMany();
            res.json(permissions);
        } catch (error) {
            res.status(500).json({ error: 'Failed to retrieve permissions' });
        }
    });

    return router;
};

module.exports = createRoleRoutes;
