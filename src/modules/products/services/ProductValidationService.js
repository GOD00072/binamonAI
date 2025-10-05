// services/ProductValidationService.js
'use strict';

class ProductValidationService {
    constructor(logger) {
        this.logger = logger;
    }

    validateProductStructure(product) {
        // Required fields that must exist and have specific types
        const requiredFields = {
            product_name: 'string',
            category: 'string'
        };

        // Check required fields
        for (const [field, type] of Object.entries(requiredFields)) {
            if (!product[field] || typeof product[field] !== type) {
                return false;
            }
        }

        // Validate production links if present
        if (product.production_links) {
            if (!product.production_links.code || 
                !product.production_links.linked_at ||
                typeof product.production_links.code !== 'string' ||
                typeof product.production_links.linked_at !== 'string') {
                return false;
            }
        }

        // Validate production pricing if present
        if (product.production_pricing) {
            if (!Array.isArray(product.production_pricing.regular) || 
                !Array.isArray(product.production_pricing.printing)) {
                return false;
            }
        }

        // Validate production pack details if present
        if (product.production_pack_details) {
            const requiredPackFields = [
                'pieces_per_pack',
                'boxes_per_case',
                'pieces_per_case'
            ];

            for (const field of requiredPackFields) {
                if (typeof product.production_pack_details[field] !== 'number') {
                    return false;
                }
            }
        }

        // Validate production dimensions if present
        if (product.production_dimensions) {
            const requiredDimFields = ['length', 'width', 'height', 'weight'];
            for (const field of requiredDimFields) {
                if (typeof product.production_dimensions[field] !== 'number') {
                    return false;
                }
            }
        }

        // Validate stock information if present
        if (product.stock_quantity !== undefined && typeof product.stock_quantity !== 'number') {
            return false;
        }

        return true;
    }

    validateVector(vector) {
        if (!vector) return false;
        if (!vector.id || typeof vector.id !== 'string') return false;
        if (!vector.values || !Array.isArray(vector.values)) return false;
        if (vector.values.length !== 3072) return false; // Check dimension for embedding-3-large
        
        return true;
    }

    validateEnvironmentVariables() {
        const requiredVars = [
            'OPENAI_API_KEY',
            'PINECONE_API_KEY',
            'PINECONE_INDEX_NAME'
        ];

        const missing = requiredVars.filter(varName => !process.env[varName]);
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }
        
        return true;
    }

    async validateProductsDirectory(productsDir) {
        try {
            const fs = require('fs').promises;
            
            // Check directory exists
            await fs.access(productsDir);
            
            // Check for readable/writable JSON files
            const files = await fs.readdir(productsDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            
            if (jsonFiles.length === 0) {
                return {
                    valid: true,
                    warning: 'Directory exists but contains no JSON files',
                    fileCount: 0
                };
            }
            
            // Validate a sample JSON file
            const testFile = jsonFiles[0];
            const filePath = require('path').join(productsDir, testFile);
            const content = await fs.readFile(filePath, 'utf8');
            
            try {
                JSON.parse(content);
            } catch (parseError) {
                return {
                    valid: false,
                    error: 'Directory contains invalid JSON files',
                    fileCount: jsonFiles.length
                };
            }
            
            return {
                valid: true,
                fileCount: jsonFiles.length
            };
        } catch (error) {
            return {
                valid: false,
                error: error.message
            };
        }
    }
}

module.exports = { ProductValidationService };