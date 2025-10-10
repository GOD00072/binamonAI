
const express = require('express');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function createLineOaConfigRoutes(logger) {
    const router = express.Router();

    // Get all Line OA configs
    router.get('/', async (req, res) => {
        try {
            const configs = await prisma.lineOaConfig.findMany();
            const baseUrl = process.env.BASE_URL || `https://${req.get('host')}`;
            const configsWithWebhook = configs.map(config => ({
                ...config,
                webhookUrl: `${baseUrl}/webhook/line/${config.id}`
            }));
            res.json({ success: true, data: configsWithWebhook });
        } catch (error) {
            logger.error('Error fetching Line OA configs:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch configs' });
        }
    });

    // Create a new Line OA config
    router.post('/', async (req, res) => {
        try {
            const { name, channelId, channelSecret, channelAccessToken, contextWindowId } = req.body;
            if (!name || !channelId || !channelSecret || !channelAccessToken) {
                return res.status(400).json({ success: false, error: 'Missing required fields' });
            }
            const newConfig = await prisma.lineOaConfig.create({
                data: {
                    name,
                    channelId,
                    channelSecret,
                    channelAccessToken,
                    contextWindowId
                },
            });
            res.status(201).json({ success: true, data: newConfig });
        } catch (error) {
            logger.error('Error creating Line OA config:', error);
            res.status(500).json({ success: false, error: 'Failed to create config' });
        }
    });

    // Get a single Line OA config
    router.get('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const config = await prisma.lineOaConfig.findUnique({
                where: { id },
            });
            if (!config) {
                return res.status(404).json({ success: false, error: 'Config not found' });
            }
            res.json({ success: true, data: config });
        } catch (error) {
            logger.error(`Error fetching Line OA config ${req.params.id}:`, error);
            res.status(500).json({ success: false, error: 'Failed to fetch config' });
        }
    });

    // Update a Line OA config
    router.put('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { name, channelId, channelSecret, channelAccessToken, contextWindowId } = req.body;
            const updatedConfig = await prisma.lineOaConfig.update({
                where: { id },
                data: {
                    name,
                    channelId,
                    channelSecret,
                    channelAccessToken,
                    contextWindowId
                },
            });
            res.json({ success: true, data: updatedConfig });
        } catch (error) {
            logger.error(`Error updating Line OA config ${req.params.id}:`, error);
            res.status(500).json({ success: false, error: 'Failed to update config' });
        }
    });

    // Delete a Line OA config
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            await prisma.lineOaConfig.delete({
                where: { id },
            });
            res.status(204).send();
        } catch (error) {
            logger.error(`Error deleting Line OA config ${req.params.id}:`, error);
            res.status(500).json({ success: false, error: 'Failed to delete config' });
        }
    });

    return router;
}

module.exports = createLineOaConfigRoutes;
