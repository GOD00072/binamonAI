// routes/vectorDBRoutes.js
'use strict';

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { getVectorDBServiceInstance } = require('../services/vectorDBServiceSingleton');
const path = require('path');
const fs = require('fs').promises;
const { ROOT_DIR } = require('../../../app/paths');
const { PCA } = require('ml-pca');

const prisma = new PrismaClient();

module.exports = (logger) => {
    const vectorService = getVectorDBServiceInstance(logger);

    // Helper function to build product text for embedding
    function buildProductText(product) {
        const parts = [
            product.product_name,
            product.category,
            product.description,
            product.short_description
        ].filter(Boolean);

        return parts.join(' ');
    }

    router.get('/config', async (req, res) => {
        try {
            let config = await prisma.vectorDBConfig.findUnique({
                where: { key: 'default' }
            });

            if (!config) {
                config = await prisma.vectorDBConfig.create({
                    data: {
                        key: 'default',
                        enabled: false,
                        dbPath: 'data/lancedb',
                        embeddingModel: 'text-embedding-3-large',
                        embeddingDimension: 3072,
                        maxRetries: 3,
                        timeout: 30000,
                        productVectorEnabled: true,
                        knowledgeVectorEnabled: false,
                        productMaxResults: 5,
                        productSimilarityThreshold: 0.7,
                        knowledgeMaxResults: 5,
                        knowledgeSimilarityThreshold: 0.7
                    }
                });
            }

            res.json({
                success: true,
                config: config
            });
        } catch (error) {
            logger.error('Error fetching Vector DB config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/vector-db/config - Update Vector DB configuration
    router.post('/config', async (req, res) => {
        try {
            const {
                enabled,
                dbPath,
                embeddingModel,
                embeddingDimension,
                maxRetries,
                timeout,
                apiKey,
                productVectorEnabled,
                knowledgeVectorEnabled,
                productMaxResults,
                productSimilarityThreshold,
                knowledgeMaxResults,
                knowledgeSimilarityThreshold
            } = req.body;

            const config = await prisma.vectorDBConfig.upsert({
                where: { key: 'default' },
                update: {
                    enabled,
                    dbPath,
                    embeddingModel,
                    embeddingDimension,
                    maxRetries,
                    timeout,
                    apiKey,
                    productVectorEnabled,
                    knowledgeVectorEnabled,
                    productMaxResults,
                    productSimilarityThreshold,
                    knowledgeMaxResults,
                    knowledgeSimilarityThreshold
                },
                create: {
                    key: 'default',
                    enabled,
                    dbPath,
                    embeddingModel,
                    embeddingDimension,
                    maxRetries,
                    timeout,
                    apiKey,
                    productVectorEnabled,
                    knowledgeVectorEnabled,
                    productMaxResults,
                    productSimilarityThreshold,
                    knowledgeMaxResults,
                    knowledgeSimilarityThreshold
                }
            });

            logger.info('Vector DB config updated successfully');

            if (req.aiAssistant?.invalidateVectorDBConfigCache) {
                req.aiAssistant.invalidateVectorDBConfigCache();
            }

            res.json({
                success: true,
                config: config
            });
        } catch (error) {
            logger.error('Error updating Vector DB config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // GET /api/vector-db/stats - Get Vector DB statistics
    router.get('/stats', async (req, res) => {
        try {
            const dbConfig = await prisma.vectorDBConfig.findUnique({
                where: { key: 'default' }
            });

            if (!dbConfig || !dbConfig.enabled) {
                return res.json({
                    success: true,
                    stats: {
                        totalVectors: 0,
                        totalProducts: 0,
                        productVectors: 0,
                        knowledgeVectors: 0,
                        dbSizeMB: 0
                    }
                });
            }

            // Get product count from Prisma
            const productCount = await prisma.product.count();

            // Get database size
            const dbPath = path.join(ROOT_DIR, dbConfig.dbPath);
            const dbSizeBytes = await getDirectorySize(dbPath);
            const dbSizeMB = dbSizeBytes / (1024 * 1024);

            // Get vector counts from LanceDB
            let productVectors = 0;
            let knowledgeVectors = 0;

            try {
                let apiKey = process.env.OPENAI_API_KEY;
                if (dbConfig.apiKey) {
                    apiKey = dbConfig.apiKey;
                }

                if (apiKey && !vectorService.initialized) {
                    await vectorService.initialize(apiKey, 'default');
                }

                if (vectorService.initialized && vectorService.db) {
                    const tableNames = await vectorService.db.tableNames();

                    if (tableNames.includes('products')) {
                        const productsTable = await vectorService.db.openTable('products');
                        productVectors = await productsTable.countRows();
                    }

                    if (tableNames.includes('knowledge')) {
                        const knowledgeTable = await vectorService.db.openTable('knowledge');
                        knowledgeVectors = await knowledgeTable.countRows();
                    }
                }

                // Get knowledge vectors from KnowledgeRAG database
                const knowledgeRAG = req.knowledgeRAG;
                if (knowledgeRAG && knowledgeRAG.initialized && knowledgeRAG.db) {
                    const knowledgeTableNames = await knowledgeRAG.db.tableNames();

                    // Count vectors from all knowledge tables (all languages)
                    for (const tableName of knowledgeTableNames) {
                        try {
                            const table = await knowledgeRAG.db.openTable(tableName);
                            const count = await table.countRows();
                            knowledgeVectors += count;
                        } catch (err) {
                            logger.warn(`Failed to count rows in table ${tableName}:`, err);
                        }
                    }
                }
            } catch (error) {
                logger.error('Error counting vectors from LanceDB:', error);
                // Fallback to Prisma count
                productVectors = productCount;
            }

            const totalVectors = productVectors + knowledgeVectors;

            res.json({
                success: true,
                stats: {
                    totalVectors: totalVectors,
                    totalProducts: productCount,
                    productVectors: productVectors,
                    knowledgeVectors: knowledgeVectors,
                    dbSizeMB: dbSizeMB
                }
            });
        } catch (error) {
            logger.error('Error fetching Vector DB stats:', error);
            res.json({
                success: true,
                stats: {
                    totalVectors: 0,
                    totalProducts: 0,
                    productVectors: 0,
                    knowledgeVectors: 0,
                    dbSizeMB: 0
                }
            });
        }
    });

    // POST /api/vector-db/sync - Smart sync products to Vector DB
    router.post('/sync', async (req, res) => {
        try {
            const dbConfig = await prisma.vectorDBConfig.findUnique({
                where: { key: 'default' }
            });

            if (!dbConfig || !dbConfig.enabled || !dbConfig.productVectorEnabled) {
                return res.status(400).json({
                    success: false,
                    error: 'Vector DB or Product Vector is disabled'
                });
            }

            let apiKey = process.env.OPENAI_API_KEY;
            if (dbConfig.apiKey) {
                apiKey = dbConfig.apiKey;
            }

            if (!apiKey) {
                return res.status(400).json({
                    success: false,
                    error: 'OpenAI API key not configured'
                });
            }

            // Initialize Vector DB
            await vectorService.initialize(apiKey, 'products');

            // Get all products from Prisma
            const products = await prisma.product.findMany();
            const productIds = new Set(products.map(p => p.id));

            // Get all vectors from Vector DB
            const stats = await vectorService.getIndexStats();
            logger.info(`Current Vector DB has ${stats.totalVectorCount} vectors`);

            // Get table to check existing vectors
            const tableNames = await vectorService.db.tableNames();
            let existingVectorIds = new Set();

            if (tableNames.includes('products')) {
                const table = await vectorService.db.openTable('products');
                const allVectors = await table.query().select(['id']).toArray();
                existingVectorIds = new Set(allVectors.map(v => v.id).filter(Boolean));
            }

            logger.info(`Found ${existingVectorIds.size} existing vectors in DB`);

            let syncedCount = 0;
            let deletedCount = 0;
            let failedCount = 0;

            // Sync products (add or update)
            for (const product of products) {
                try {
                    const productText = buildProductText(product);
                    const embedding = await vectorService.getEmbedding(productText);

                    await vectorService.upsertVector(product.id, embedding, {
                        product_name: product.product_name,
                        category: product.category,
                        price: product.price,
                        sku: product.sku,
                        url: product.url
                    }, 'products');

                    syncedCount++;
                } catch (error) {
                    logger.error(`Failed to sync product ${product.id}:`, error);
                    failedCount++;
                }
            }


            for (const vectorId of existingVectorIds) {
                if (!productIds.has(vectorId)) {
                    try {
                        await vectorService.deleteVector(vectorId, 'products');
                        deletedCount++;
                        logger.info(`Deleted orphaned vector: ${vectorId}`);
                    } catch (error) {
                        logger.error(`Failed to delete vector ${vectorId}:`, error);
                    }
                }
            }

            logger.info(`Smart sync completed: ${syncedCount} synced, ${deletedCount} deleted, ${failedCount} failed`);

            res.json({
                success: true,
                syncedCount,
                deletedCount,
                failedCount,
                total: products.length
            });
        } catch (error) {
            logger.error('Error syncing products to Vector DB:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Knowledge Entry CRUD
    // GET /api/vector-db/knowledge - Get all knowledge entries
    router.get('/knowledge', async (req, res) => {
        try {
            const { page = 1, limit = 50, search = '' } = req.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);

            const where = search ? {
                OR: [
                    { title: { contains: search } },
                    { content: { contains: search } },
                    { category: { contains: search } }
                ]
            } : {};

            const [entries, total] = await Promise.all([
                prisma.knowledgeEntry.findMany({
                    where,
                    skip,
                    take: parseInt(limit),
                    orderBy: { created_at: 'desc' }
                }),
                prisma.knowledgeEntry.count({ where })
            ]);

            res.json({
                success: true,
                entries,
                total,
                page: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit))
            });
        } catch (error) {
            logger.error('Error fetching knowledge entries:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/vector-db/knowledge - Create knowledge entry
    router.post('/knowledge', async (req, res) => {
        try {
            const { title, content, category, tags, enabled = true } = req.body;

            if (!title || !content) {
                return res.status(400).json({
                    success: false,
                    error: 'Title and content are required'
                });
            }

            const entry = await prisma.knowledgeEntry.create({
                data: {
                    title,
                    content,
                    category,
                    tags,
                    enabled
                }
            });

            // Sync to Vector DB if enabled
            const dbConfig = await prisma.vectorDBConfig.findUnique({
                where: { key: 'default' }
            });

            if (dbConfig?.knowledgeVectorEnabled && dbConfig.enabled) {
                try {
                    let apiKey = process.env.OPENAI_API_KEY;
                    if (dbConfig.apiKey) {
                        apiKey = dbConfig.apiKey;
                    }

                    if (apiKey && !vectorService.initialized) {
                        await vectorService.initialize(apiKey, 'knowledge');
                    }

                    const knowledgeText = `${title} ${content} ${category || ''}`;
                    const embedding = await vectorService.getEmbedding(knowledgeText);

                    await vectorService.upsertVector(entry.id, embedding, {
                        title: entry.title,
                        content: entry.content,
                        category: entry.category,
                        product_name: '',
                        price: '',
                        sku: '',
                        url: ''
                    }, 'knowledge');

                    await prisma.knowledgeEntry.update({
                        where: { id: entry.id },
                        data: { vectorId: entry.id }
                    });

                    logger.info(`Knowledge entry ${entry.id} synced to Vector DB`);
                } catch (error) {
                    logger.error(`Failed to sync knowledge entry ${entry.id} to Vector DB:`, error);
                }
            }

            res.json({
                success: true,
                entry
            });
        } catch (error) {
            logger.error('Error creating knowledge entry:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // PUT /api/vector-db/knowledge/:id - Update knowledge entry
    router.put('/knowledge/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { title, content, category, tags, enabled } = req.body;

            const entry = await prisma.knowledgeEntry.update({
                where: { id },
                data: {
                    title,
                    content,
                    category,
                    tags,
                    enabled
                }
            });

            // Re-sync to Vector DB if enabled
            const dbConfig = await prisma.vectorDBConfig.findUnique({
                where: { key: 'default' }
            });

            if (dbConfig?.knowledgeVectorEnabled && dbConfig.enabled && entry.enabled) {
                try {
                    let apiKey = process.env.OPENAI_API_KEY;
                    if (dbConfig.apiKey) {
                        apiKey = dbConfig.apiKey;
                    }

                    if (apiKey && !vectorService.initialized) {
                        await vectorService.initialize(apiKey, 'knowledge');
                    }

                    const knowledgeText = `${title} ${content} ${category || ''}`;
                    const embedding = await vectorService.getEmbedding(knowledgeText);

                    await vectorService.upsertVector(entry.id, embedding, {
                        title: entry.title,
                        content: entry.content,
                        category: entry.category,
                        product_name: '',
                        price: '',
                        sku: '',
                        url: ''
                    }, 'knowledge');

                    logger.info(`Knowledge entry ${entry.id} updated in Vector DB`);
                } catch (error) {
                    logger.error(`Failed to update knowledge entry ${entry.id} in Vector DB:`, error);
                }
            }

            res.json({
                success: true,
                entry
            });
        } catch (error) {
            logger.error('Error updating knowledge entry:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // DELETE /api/vector-db/knowledge/:id - Delete knowledge entry
    router.delete('/knowledge/:id', async (req, res) => {
        try {
            const { id } = req.params;

            const entry = await prisma.knowledgeEntry.findUnique({
                where: { id }
            });

            if (!entry) {
                return res.status(404).json({
                    success: false,
                    error: 'Knowledge entry not found'
                });
            }

            // Delete from Vector DB if exists
            const dbConfig = await prisma.vectorDBConfig.findUnique({
                where: { key: 'default' }
            });

            if (dbConfig?.knowledgeVectorEnabled && dbConfig.enabled && entry.vectorId) {
                try {
                    let apiKey = process.env.OPENAI_API_KEY;
                    if (dbConfig.apiKey) {
                        apiKey = dbConfig.apiKey;
                    }

                    if (apiKey && !vectorService.initialized) {
                        await vectorService.initialize(apiKey, 'knowledge');
                    }

                    await vectorService.deleteVector(entry.id, 'knowledge');
                    logger.info(`Knowledge entry ${entry.id} deleted from Vector DB`);
                } catch (error) {
                    logger.error(`Failed to delete knowledge entry ${entry.id} from Vector DB:`, error);
                }
            }

            await prisma.knowledgeEntry.delete({
                where: { id }
            });

            res.json({
                success: true
            });
        } catch (error) {
            logger.error('Error deleting knowledge entry:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/vector-db/test-search - Test search
    router.post('/test-search', async (req, res) => {
        try {
            const {
                query,
                searchType = 'both',
                productMaxResults = 5,
                productSimilarityThreshold = 0.7,
                knowledgeMaxResults = 5,
                knowledgeSimilarityThreshold = 0.7
            } = req.body;

            if (!query || !query.trim()) {
                return res.status(400).json({
                    success: false,
                    error: 'Query is required'
                });
            }

            const dbConfig = await prisma.vectorDBConfig.findUnique({
                where: { key: 'default' }
            });

            if (!dbConfig || !dbConfig.enabled) {
                return res.status(400).json({
                    success: false,
                    error: 'Vector DB is disabled'
                });
            }

            let apiKey = process.env.OPENAI_API_KEY;
            if (dbConfig.apiKey) {
                apiKey = dbConfig.apiKey;
            }

            if (!apiKey) {
                return res.status(400).json({
                    success: false,
                    error: 'OpenAI API key not configured'
                });
            }

            if (!vectorService.initialized) {
                await vectorService.initialize(apiKey, 'default');
            }

            const embedding = await vectorService.getEmbedding(query);

            let productResults = [];
            let knowledgeResults = [];

            // Search products
            if ((searchType === 'both' || searchType === 'product') && dbConfig.productVectorEnabled) {
                try {
                    const results = await vectorService.queryVectors(
                        embedding,
                        productMaxResults,
                        {},
                        'products'
                    );

                    productResults = results.filter(r => r.score >= productSimilarityThreshold);
                } catch (error) {
                    logger.error('Product search error:', error);
                    productResults = [];
                }
            }

            // Search knowledge using KnowledgeRAG
            if ((searchType === 'both' || searchType === 'knowledge') && dbConfig.knowledgeVectorEnabled) {
                try {
                    const knowledgeRAG = req.knowledgeRAG;
                    const aiAssistant = req.aiAssistant;
                    const knowledgeConfig = aiAssistant?.configManager?.knowledgeConfig || {};
                    const knowledgeSearchSettings = knowledgeConfig.searchSettings || {};
                    const knowledgeEnabled = knowledgeConfig.enabled !== false;

                    if (knowledgeRAG && knowledgeRAG.initialized && knowledgeEnabled) {
                        const topK = knowledgeMaxResults ?? knowledgeSearchSettings.topK ?? 3;
                        const scoreThreshold = knowledgeSimilarityThreshold ?? knowledgeSearchSettings.scoreThreshold ?? 0.5;
                        const languagePreference = knowledgeSearchSettings.languageOverride || 'TH';

                        const ragResults = await knowledgeRAG.searchKnowledge(query, {
                            topK,
                            scoreThreshold,
                            language: languagePreference,
                            filter: knowledgeSearchSettings.filter ?? {}
                        });

                        if (ragResults.success) {
                            knowledgeResults = ragResults.results.map(r => ({
                                id: r.id,
                                score: r.relevance_score,
                                metadata: {
                                    text: r.text,
                                    category: r.category,
                                    file_name: r.file_name,
                                    language: r.language
                                }
                            }));
                        } else {
                            logger.warn('KnowledgeRAG search returned no success, falling back to vector service', {
                                error: ragResults.error
                            });
                            const results = await vectorService.queryVectors(
                                embedding,
                                knowledgeMaxResults,
                                {},
                                'knowledge'
                            );

                            knowledgeResults = results.filter(r => r.score >= knowledgeSimilarityThreshold);
                        }
                    } else if (!knowledgeEnabled) {
                        logger.info('Knowledge configuration disabled, skipping KnowledgeRAG search for vector DB test');
                        knowledgeResults = [];
                    } else {
                        logger.info('KnowledgeRAG unavailable or disabled, falling back to vector service', {
                            knowledgeRAGAvailable: !!knowledgeRAG,
                            knowledgeRAGInitialized: knowledgeRAG?.initialized,
                            knowledgeEnabled
                        });

                        const results = await vectorService.queryVectors(
                            embedding,
                            knowledgeMaxResults,
                            {},
                            'knowledge'
                        );

                        knowledgeResults = results.filter(r => r.score >= knowledgeSimilarityThreshold);
                    }
                } catch (error) {
                    logger.error('Knowledge search error:', error);
                    knowledgeResults = [];
                }
            }

            res.json({
                success: true,
                productResults,
                knowledgeResults,
                query
            });
        } catch (error) {
            logger.error('Error in test search:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Helper function to sync single product to Vector DB
    async function syncSingleProduct(product) {
        try {
            const dbConfig = await prisma.vectorDBConfig.findUnique({
                where: { key: 'default' }
            });

            if (!dbConfig || !dbConfig.enabled || !dbConfig.productVectorEnabled) {
                return { success: false, reason: 'Vector DB or Product Vector is disabled' };
            }

            let apiKey = process.env.OPENAI_API_KEY;
            if (dbConfig && dbConfig.apiKey) {
                apiKey = dbConfig.apiKey;
            }

            if (!apiKey) {
                return { success: false, reason: 'API key not configured' };
            }

            // Initialize Vector DB if not already initialized
            if (!vectorService.initialized) {
                await vectorService.initialize(apiKey, 'products');
            }

            // Build product text for embedding
            const productText = buildProductText(product);

            // Get embedding
            const embedding = await vectorService.getEmbedding(productText);

            // Add to vector DB
            await vectorService.upsertVector(product.id, embedding, {
                product_name: product.product_name,
                category: product.category,
                price: product.price,
                sku: product.sku,
                url: product.url
            }, 'products');

            logger.info(`Product ${product.id} synced to Vector DB`);
            return { success: true };
        } catch (error) {
            logger.error(`Failed to sync product ${product.id} to Vector DB:`, error);
            return { success: false, error: error.message };
        }
    }

    // Helper function to delete product from Vector DB
    async function deleteProductFromVectorDB(productId) {
        try {
            const dbConfig = await prisma.vectorDBConfig.findUnique({
                where: { key: 'default' }
            });

            if (!dbConfig || !dbConfig.enabled) {
                return { success: false, reason: 'Vector DB is disabled' };
            }

            let apiKey = process.env.OPENAI_API_KEY;
            if (dbConfig && dbConfig.apiKey) {
                apiKey = dbConfig.apiKey;
            }

            if (!apiKey) {
                return { success: false, reason: 'API key not configured' };
            }

            if (!vectorService.initialized) {
                await vectorService.initialize(apiKey, 'products');
            }

            await vectorService.deleteVector(productId, 'products');
            logger.info(`Product ${productId} deleted from Vector DB`);
            return { success: true };
        } catch (error) {
            logger.error(`Failed to delete product ${productId} from Vector DB:`, error);
            return { success: false, error: error.message };
        }
    }

    router.get('/visualization', async (req, res) => {
        try {
            const dbConfig = await prisma.vectorDBConfig.findUnique({
                where: { key: 'default' }
            });

            if (!dbConfig || !dbConfig.enabled) {
                return res.json({
                    success: true,
                    productVectors: [],
                    knowledgeVectors: []
                });
            }

            const productVectors = [];
            const knowledgeVectors = [];

            try {
                let apiKey = process.env.OPENAI_API_KEY;
                if (dbConfig.apiKey) {
                    apiKey = dbConfig.apiKey;
                }

                if (apiKey && !vectorService.initialized) {
                    await vectorService.initialize(apiKey, 'default');
                }

                if (vectorService.initialized && vectorService.db) {
                    const tableNames = await vectorService.db.tableNames();

                    if (tableNames.includes('products')) {
                        const productsTable = await vectorService.db.openTable('products');

                        try {
                            const vectorProducts = await productsTable.query().limit(100).toArray();

                            if (vectorProducts.length > 0) {
                                const embeddings = vectorProducts.map(p => Array.from(p.vector));
                                let reduced;
                                if (embeddings.length >= 2) {
                                    const pca = new PCA(embeddings);
                                    reduced = pca.predict(embeddings, { nComponents: Math.min(3, embeddings.length) });
                                }
                                const productIds = vectorProducts.map(p => p.id);
                                const dbProducts = await prisma.product.findMany({
                                    where: { id: { in: productIds } },
                                    select: { id: true, product_name: true, category: true }
                                });

                                const productMap = new Map(dbProducts.map(p => [p.id, p]));

                                vectorProducts.forEach((vp, i) => {
                                    const dbProduct = productMap.get(vp.id);

                                    let x, y, z;
                                    if (reduced) {
                                        const coords = reduced.getRow(i);
                                        x = coords[0] * 10;
                                        y = coords[1] * 10 || 0;
                                        z = coords[2] * 10 || 0;
                                    } else {
                                        x = 0;
                                        y = 0;
                                        z = 0;
                                    }

                                    productVectors.push({
                                        id: vp.id,
                                        name: dbProduct?.product_name || `Product ${i + 1}`,
                                        category: dbProduct?.category || '',
                                        x, y, z,
                                        size: 8 + Math.random() * 4
                                    });
                                });

                                logger.info(`PCA applied to ${vectorProducts.length} product vectors`);
                            }
                        } catch (err) {
                            logger.error('Error processing products table:', err);
                        }
                    }

                    if (tableNames.includes('knowledge')) {
                        const knowledgeTable = await vectorService.db.openTable('knowledge');

                        try {
                            const vectorKnowledge = await knowledgeTable.query().limit(100).toArray();

                            if (vectorKnowledge.length > 0) {
                                const embeddings = vectorKnowledge.map(k => Array.from(k.vector));

                                let reduced;
                                if (embeddings.length >= 2) {
                                    const pca = new PCA(embeddings);
                                    reduced = pca.predict(embeddings, { nComponents: Math.min(3, embeddings.length) });
                                }

                                const knowledgeIds = vectorKnowledge.map(k => k.id);
                                const dbKnowledge = await prisma.knowledgeEntry.findMany({
                                    where: { id: { in: knowledgeIds } },
                                    select: { id: true, title: true, category: true }
                                });

                                const knowledgeMap = new Map(dbKnowledge.map(k => [k.id, k]));

                                vectorKnowledge.forEach((vk, i) => {
                                    const dbEntry = knowledgeMap.get(vk.id);

                                    let x, y, z;
                                    if (reduced) {
                                        const coords = reduced.getRow(i);
                                        x = coords[0] * 10;
                                        y = coords[1] * 10 || 0;
                                        z = coords[2] * 10 || 0;
                                    } else {
                                        x = 0;
                                        y = 0;
                                        z = 0;
                                    }

                                    knowledgeVectors.push({
                                        id: vk.id,
                                        name: dbEntry?.title || `Knowledge ${i + 1}`,
                                        category: dbEntry?.category || '',
                                        x, y, z,
                                        size: 8 + Math.random() * 4
                                    });
                                });

                                logger.info(`PCA applied to ${vectorKnowledge.length} knowledge vectors`);
                            }
                        } catch (err) {
                            logger.error('Error processing knowledge table:', err);
                        }
                    }

                    const knowledgeRAG = req.knowledgeRAG;
                    if (knowledgeRAG && knowledgeRAG.initialized && knowledgeRAG.db) {
                        const ragTableNames = await knowledgeRAG.db.tableNames();

                        for (const tableName of ragTableNames) {
                            try {
                                const table = await knowledgeRAG.db.openTable(tableName);
                                const vectors = await table.query().limit(100).toArray();

                                const validVectors = vectors.filter(v => v.id && v.id.trim() !== '');

                                if (validVectors.length > 0) {
                                    const embeddings = validVectors.map(v => Array.from(v.vector));

                                    let reduced;
                                    if (embeddings.length >= 2) {
                                        const pca = new PCA(embeddings);
                                        reduced = pca.predict(embeddings, { nComponents: Math.min(3, embeddings.length) });
                                    }

                                    validVectors.forEach((vec, i) => {
                                        let x, y, z;
                                        if (reduced) {
                                            const coords = reduced.getRow(i);
                                            x = coords[0] * 10;
                                            y = coords[1] * 10 || 0;
                                            z = coords[2] * 10 || 0;
                                        } else {
                                            x = 0;
                                            y = 0;
                                            z = 0;
                                        }

                                        knowledgeVectors.push({
                                            id: vec.id,
                                            name: vec.file_name || vec.text?.substring(0, 50) || `Knowledge ${i + 1}`,
                                            category: vec.category || '',
                                            x, y, z,
                                            size: 8 + Math.random() * 4
                                        });
                                    });

                                    logger.info(`PCA applied to ${validVectors.length} vectors from ${tableName}`);
                                }
                            } catch (err) {
                                logger.warn(`Failed to process table ${tableName}:`, err);
                            }
                        }
                    }
                }
            } catch (error) {
                logger.error('Error generating visualization data:', error);
            }

            res.json({
                success: true,
                productVectors,
                knowledgeVectors
            });

        } catch (error) {
            logger.error('Error in visualization endpoint:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Helper function to get directory size
    async function getDirectorySize(dirPath) {
        let size = 0;

        try {
            const files = await fs.readdir(dirPath, { withFileTypes: true });

            for (const file of files) {
                const filePath = path.join(dirPath, file.name);

                if (file.isDirectory()) {
                    size += await getDirectorySize(filePath);
                } else {
                    const stats = await fs.stat(filePath);
                    size += stats.size;
                }
            }
        } catch (err) {
            // Directory doesn't exist or can't be read
            return 0;
        }

        return size;
    }

    router.syncSingleProduct = syncSingleProduct;
    router.deleteProductFromVectorDB = deleteProductFromVectorDB;

    return router;
};
