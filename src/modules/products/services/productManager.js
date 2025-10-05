// productManager.js
'use strict';

const path = require('path');
const fs = require('fs').promises;
const { ProductIndexingService } = require('./ProductIndexingService');
const { ProductSearchService } = require('./ProductSearchService');
const { ProductMetadataService } = require('./ProductMetadataService');
const { VectorDBService } = require('../../knowledge/services/VectorDBService');
const { ProductCacheService } = require('./ProductCacheService');
const { ProductValidationService } = require('./ProductValidationService');
const { ProductEnhancementService } = require('./ProductEnhancementService');
const { ConfigurationService } = require('./ConfigurationService');
const { PRODUCTS_DIR } = require('../../../app/paths');
const prisma = require('../../../../lib/prisma');

class EnhancedProductManager {
    constructor(logger, chatHistory) {
        if (!logger || !chatHistory) {
            throw new Error('Logger and chatHistory are required dependencies');
        }

        this.logger = logger;
        this.chatHistory = chatHistory;
        this.productsDir = PRODUCTS_DIR;
        this.initialized = false;

        // Initialize services
        this.cacheService = new ProductCacheService(logger);
        this.validationService = new ProductValidationService(logger);
        this.configService = new ConfigurationService(logger);
        this.vectorDBService = new VectorDBService(logger);
        this.metadataService = new ProductMetadataService(logger);
        this.enhancementService = new ProductEnhancementService(logger);
        this.indexingService = new ProductIndexingService(logger, this.vectorDBService, this.metadataService, this.cacheService);
        this.searchService = new ProductSearchService(logger, this.vectorDBService, this.cacheService, this.chatHistory);
    }

    async initialize() {
        try {
            if (this.initialized) {
                this.logger.info('Product manager already initialized');
                return true;
            }

            await fs.mkdir(this.productsDir, { recursive: true });
            await this.configService.loadConfiguration();
            await this.vectorDBService.initialize(process.env.PINECONE_API_KEY, process.env.PINECONE_INDEX_NAME);
            this.metadataService.initialize();
            this.enhancementService.initialize();
            
            this.initialized = true;
            this.logger.info('Product manager initialized successfully');
            
            return true;

        } catch (error) {
            this.initialized = false;
            this.logger.error('Failed to initialize product manager:', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    // Main Product Management Methods
    async uploadAllProducts(progressCallback) {
        return this.indexingService.uploadAllProducts(this.productsDir, progressCallback);
    }

    async searchProducts(query, userId = 'default') {
        if (!this.initialized) {
            await this.initialize();
        }
        return this.searchService.searchProducts(query, userId);
    }

    async getProductById(id) {
        return this.indexingService.getProductById(id, this.productsDir);
    }

    async updateProduct(id, updates) {
        if (!this.initialized) {
            await this.initialize();
        }
        return this.indexingService.updateProduct(id, updates, this.productsDir);
    }

    // Vector Store Methods
    async getIndexStats() {
        return this.vectorDBService.getIndexStats(this.productsDir);
    }

    async healthCheck() {
        if (!this.initialized) {
            await this.initialize();
        }
        
        const vectorStatus = await this.vectorDBService.healthCheck();
        const cacheStatus = this.cacheService.healthCheck();
        const fileSystemStatus = await this.checkFileSystemHealth();
        
        return {
            initialized: this.initialized,
            vectorStore: vectorStatus,
            cache: cacheStatus,
            fileSystem: fileSystemStatus,
            timestamp: new Date().toISOString()
        };
    }

async getAllProducts() {
    try {
        const products = await prisma.product.findMany({
            include: {
                images: {
                    orderBy: {
                        order: 'asc'
                    }
                }
            }
        });

        this.logger.info(`Retrieved ${products.length} products from database`);
        return products;

    } catch (error) {
        this.logger.error('Error getting all products from database:', error);
        throw error;
    }
}
async checkProductFiles() {
    try {
        // Get total count
        const totalProducts = await prisma.product.count();

        // Get distinct categories
        const categoriesData = await prisma.product.findMany({
            select: {
                category: true
            },
            where: {
                category: {
                    not: null
                }
            },
            distinct: ['category']
        });

        const categories = categoriesData
            .map(p => p.category)
            .filter(c => c != null);

        // Get most recently updated product
        const lastUpdatedProduct = await prisma.product.findFirst({
            orderBy: {
                last_updated: 'desc'
            },
            select: {
                last_updated: true
            }
        });

        return {
            totalProducts: totalProducts,
            lastModified: lastUpdatedProduct?.last_updated || null,
            categories: categories,
            source: 'database'
        };
    } catch (error) {
        this.logger.error('Error checking products in database:', error);
        return {
            totalProducts: 0,
            lastModified: null,
            categories: [],
            source: 'database',
            error: error.message
        };
    }
}

    async checkFileSystemHealth() {
        try {
            const testFile = path.join(this.productsDir, '_health_check.tmp');
            
            // Test write
            await fs.writeFile(testFile, 'health check');
            
            // Test read
            await fs.readFile(testFile, 'utf8');
            
            // Test delete
            await fs.unlink(testFile);

            const files = await fs.readdir(this.productsDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            
            return {
                status: 'healthy',
                accessRights: 'read-write',
                productFiles: jsonFiles.length
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                accessRights: 'unknown'
            };
        }
    }

    // Configuration Methods
    async updateConfig(newConfig) {
        return this.configService.updateConfig(newConfig);
    }

    async getConfig() {
        return this.configService.getConfig();
    }

    // Cache Management
    clearCache() {
        return this.cacheService.clearAll();
    }

    // Cleanup Method
    async cleanup() {
        try {
            // Clear all caches
            this.cacheService.clearAll();
            
            // Remove temporary files
            const tempPattern = /^_.*\.tmp$/;
            const files = await fs.readdir(this.productsDir);
            await Promise.all(
                files
                    .filter(file => tempPattern.test(file))
                    .map(file => fs.unlink(path.join(this.productsDir, file)))
            );

            this.logger.info('Cleanup completed successfully');
            return true;
        } catch (error) {
            this.logger.error('Cleanup failed:', error);
            return false;
        }
    }
}

module.exports = EnhancedProductManager;
