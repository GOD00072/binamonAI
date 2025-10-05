// services/ProductCacheService.js
'use strict';

const NodeCache = require('node-cache');

class ProductCacheService {
    constructor(logger) {
        this.logger = logger;
        
        // Primary cache with moderate TTL
        this.productCache = new NodeCache({ stdTTL: 300 }); // 5 minutes
        
        // Conversation context cache with longer TTL
        this.conversationCache = new NodeCache({ stdTTL: 1800 }); // 30 minutes
        
        // Product context cache with even longer TTL
        this.productContextCache = new NodeCache({ stdTTL: 3600 }); // 1 hour
    }

    // Basic cache operations
    get(key, cacheType = 'product') {
        try {
            const cache = this.getCache(cacheType);
            return cache.get(key);
        } catch (error) {
            this.logger.error(`Error getting item from ${cacheType} cache:`, error);
            return null;
        }
    }

    set(key, value, ttl = null, cacheType = 'product') {
        try {
            const cache = this.getCache(cacheType);
            return cache.set(key, value, ttl);
        } catch (error) {
            this.logger.error(`Error setting item in ${cacheType} cache:`, error);
            return false;
        }
    }

    del(key, cacheType = 'product') {
        try {
            const cache = this.getCache(cacheType);
            return cache.del(key);
        } catch (error) {
            this.logger.error(`Error deleting item from ${cacheType} cache:`, error);
            return false;
        }
    }

    has(key, cacheType = 'product') {
        try {
            const cache = this.getCache(cacheType);
            return cache.has(key);
        } catch (error) {
            this.logger.error(`Error checking item in ${cacheType} cache:`, error);
            return false;
        }
    }

    // Cache management
    clear(cacheType = 'product') {
        try {
            const cache = this.getCache(cacheType);
            cache.flushAll();
            this.logger.info(`${cacheType} cache cleared`);
            // services/ProductCacheService.js (continued)
            return true;
        } catch (error) {
            this.logger.error(`Error clearing ${cacheType} cache:`, error);
            return false;
        }
    }

    clearAll() {
        try {
            this.productCache.flushAll();
            this.conversationCache.flushAll();
            this.productContextCache.flushAll();
            this.logger.info('All caches cleared');
            return true;
        } catch (error) {
            this.logger.error('Error clearing all caches:', error);
            return false;
        }
    }

    getStats(cacheType = 'all') {
        try {
            if (cacheType === 'all') {
                return {
                    product: this.productCache.getStats(),
                    conversation: this.conversationCache.getStats(),
                    productContext: this.productContextCache.getStats()
                };
            } else {
                const cache = this.getCache(cacheType);
                return cache.getStats();
            }
        } catch (error) {
            this.logger.error(`Error getting stats for ${cacheType} cache:`, error);
            return {};
        }
    }

    // Helper method to get the right cache based on type
    getCache(cacheType) {
        switch (cacheType) {
            case 'product':
                return this.productCache;
            case 'conversation':
                return this.conversationCache;
            case 'productContext':
                return this.productContextCache;
            default:
                return this.productCache;
        }
    }

    healthCheck() {
        return {
            product: this.productCache.getStats(),
            conversation: this.conversationCache.getStats(),
            productContext: this.productContextCache.getStats(),
            status: 'healthy',
            memoryUsage: process.memoryUsage()
        };
    }
}

module.exports = { ProductCacheService };