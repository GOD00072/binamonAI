// services/ConfigurationService.js
'use strict';

const fs = require('fs').promises;
const path = require('path');
const { ROOT_DIR } = require('../../../app/paths');

class ConfigurationService {
    constructor(logger) {
        this.logger = logger;
        this.configPath = path.join(ROOT_DIR, 'config', 'product_manager_config.json');
        
        // Default configuration
        this.config = {
            upload: {
                batchSize: 100,
                retryAttempts: 3,
                retryDelay: 1000
            },
            search: {
                topResults: 5,
                contextWindow: 10,
                vectorCounts: {
                    initial: 15,
                    final: 5
                }
            },
            cache: {
                ttl: {
                    product: 300,      // 5 minutes
                    conversation: 1800, // 30 minutes
                    productContext: 3600, // 1 hour
                    embedding: 86400    // 24 hours
                }
            },
            vectorDb: {
                dimension: 3072,
                model: "text-embedding-3-large"
            },
            stock: {
                enabled: true,
                lowStockThreshold: 10
            }
        };
    }

    async loadConfiguration() {
        try {
            // Ensure config directory exists
            await fs.mkdir(path.dirname(this.configPath), { recursive: true });
            
            // Try to read config file
            try {
                const content = await fs.readFile(this.configPath, 'utf8');
                this.config = { ...this.config, ...JSON.parse(content) };
                this.logger.info('Configuration loaded from file');
            } catch (readError) {
                // If file doesn't exist, create it with default config
                await this.saveConfiguration();
                this.logger.info('Created default configuration file');
            }
            
            return this.config;
        } catch (error) {
            this.logger.error('Error loading configuration:', error);
            return this.config;
        }
    }

    async saveConfiguration() {
        try {
            await fs.writeFile(
                this.configPath,
                JSON.stringify(this.config, null, 2),
                'utf8'
            );
            this.logger.info('Configuration saved to file');
            return true;
        } catch (error) {
            this.logger.error('Error saving configuration:', error);
            return false;
        }
    }

    async updateConfig(newConfig) {
        try {
            // Deep merge the configurations
            this.config = this.deepMerge(this.config, newConfig);
            await this.saveConfiguration();
            return this.config;
        } catch (error) {
            this.logger.error('Error updating configuration:', error);
            throw error;
        }
    }

    getConfig() {
        return this.config;
    }

    deepMerge(target, source) {
        const isObject = (obj) => obj && typeof obj === 'object' && !Array.isArray(obj);
        
        if (!isObject(target) || !isObject(source)) {
            return source;
        }

        Object.keys(source).forEach(key => {
            const targetValue = target[key];
            const sourceValue = source[key];

            if (Array.isArray(sourceValue)) {
                target[key] = sourceValue;
            } else if (isObject(targetValue) && isObject(sourceValue)) {
                target[key] = this.deepMerge(Object.assign({}, targetValue), sourceValue);
            } else {
                target[key] = sourceValue;
            }
        });

        return target;
    }
}

module.exports = { ConfigurationService };
