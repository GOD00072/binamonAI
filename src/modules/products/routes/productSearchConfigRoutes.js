'use strict';

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = function(logger) {

    // GET /api/product-search-config - Get configuration
    router.get('/', async (req, res) => {
        try {
            let config = await prisma.productSearchConfig.findUnique({
                where: { key: 'default' }
            });

            // Create default if not exists
            if (!config) {
                config = await prisma.productSearchConfig.create({
                    data: {
                        key: 'default',
                        topResults: 7,
                        contextWindow: 15,
                        relevanceThreshold: 0.03,
                        embeddingBoostFactor: 2.0,
                        scoreThresholds: JSON.stringify({
                            minimum: 0,
                            followup: 20,
                            dimension: 15,
                            material: 12,
                            type: 15,
                            sharedNumbers: 15,
                            stockAvailable: 10,
                            stockUnavailable: -10,
                            historicalInterest: 50
                        }),
                        searchMethods: JSON.stringify({
                            vectorSearchEnabled: true,
                            keywordSearchEnabled: true,
                            directoryFallbackEnabled: true,
                            crossLanguageSearch: false
                        }),
                        caching: JSON.stringify({
                            contextCacheTTL: 1800,
                            userStateCacheTTL: 3600,
                            productCacheTTL: 3600
                        }),
                        cleanup: JSON.stringify({
                            expiredContextInterval: 3600000,
                            contextExpirationTime: 1800000
                        })
                    }
                });
            }

            // Parse JSON fields
            const parsedConfig = {
                ...config,
                scoreThresholds: JSON.parse(config.scoreThresholds),
                searchMethods: JSON.parse(config.searchMethods),
                caching: JSON.parse(config.caching),
                cleanup: JSON.parse(config.cleanup)
            };

            res.json({
                success: true,
                config: parsedConfig
            });

        } catch (error) {
            logger.error('Error getting product search config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/product-search-config - Update configuration
    router.post('/', async (req, res) => {
        try {
            const {
                topResults,
                contextWindow,
                relevanceThreshold,
                embeddingBoostFactor,
                scoreThresholds,
                searchMethods,
                caching,
                cleanup
            } = req.body;

            const updateData = {};

            if (topResults !== undefined) updateData.topResults = topResults;
            if (contextWindow !== undefined) updateData.contextWindow = contextWindow;
            if (relevanceThreshold !== undefined) updateData.relevanceThreshold = relevanceThreshold;
            if (embeddingBoostFactor !== undefined) updateData.embeddingBoostFactor = embeddingBoostFactor;

            if (scoreThresholds) updateData.scoreThresholds = JSON.stringify(scoreThresholds);
            if (searchMethods) updateData.searchMethods = JSON.stringify(searchMethods);
            if (caching) updateData.caching = JSON.stringify(caching);
            if (cleanup) updateData.cleanup = JSON.stringify(cleanup);

            const config = await prisma.productSearchConfig.upsert({
                where: { key: 'default' },
                update: updateData,
                create: {
                    key: 'default',
                    ...updateData
                }
            });

            // Parse JSON fields for response
            const parsedConfig = {
                ...config,
                scoreThresholds: JSON.parse(config.scoreThresholds),
                searchMethods: JSON.parse(config.searchMethods),
                caching: JSON.parse(config.caching),
                cleanup: JSON.parse(config.cleanup)
            };

            logger.info('Product search config updated', { config: parsedConfig });

            res.json({
                success: true,
                config: parsedConfig,
                message: 'Configuration updated successfully'
            });

        } catch (error) {
            logger.error('Error updating product search config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/product-search-config/reset - Reset to defaults
    router.post('/reset', async (req, res) => {
        try {
            const config = await prisma.productSearchConfig.upsert({
                where: { key: 'default' },
                update: {
                    topResults: 7,
                    contextWindow: 15,
                    relevanceThreshold: 0.03,
                    embeddingBoostFactor: 2.0,
                    scoreThresholds: JSON.stringify({
                        minimum: 0,
                        followup: 20,
                        dimension: 15,
                        material: 12,
                        type: 15,
                        sharedNumbers: 15,
                        stockAvailable: 10,
                        stockUnavailable: -10,
                        historicalInterest: 50
                    }),
                    searchMethods: JSON.stringify({
                        vectorSearchEnabled: true,
                        keywordSearchEnabled: true,
                        directoryFallbackEnabled: true,
                        crossLanguageSearch: false
                    }),
                    caching: JSON.stringify({
                        contextCacheTTL: 1800,
                        userStateCacheTTL: 3600,
                        productCacheTTL: 3600
                    }),
                    cleanup: JSON.stringify({
                        expiredContextInterval: 3600000,
                        contextExpirationTime: 1800000
                    })
                },
                create: {
                    key: 'default'
                }
            });

            const parsedConfig = {
                ...config,
                scoreThresholds: JSON.parse(config.scoreThresholds),
                searchMethods: JSON.parse(config.searchMethods),
                caching: JSON.parse(config.caching),
                cleanup: JSON.parse(config.cleanup)
            };

            logger.info('Product search config reset to defaults');

            res.json({
                success: true,
                config: parsedConfig,
                message: 'Configuration reset to defaults'
            });

        } catch (error) {
            logger.error('Error resetting product search config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    return router;
};
