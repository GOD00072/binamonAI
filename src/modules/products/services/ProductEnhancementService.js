// services/ProductEnhancementService.js
'use strict';

class ProductEnhancementService {
    constructor(logger) {
        this.logger = logger;
        this.initialized = false;
    }

    initialize() {
        this.initialized = true;
        return true;
    }

    enhanceProductWithProductionData(product, productionData) {
        try {
            if (!productionData || !productionData.code) {
                return product;
            }

            const enhanced = { ...product };

            // Add production links
            enhanced.production_links = {
                code: productionData.code,
                mc: productionData.mc,
                linked_at: new Date().toISOString()
            };

            // Add production details
            if (productionData.specs || productionData.name) {
                enhanced.production_details = {
                    mc: productionData.mc,
                    code: productionData.code,
                    name: productionData.name,
                    specs: productionData.specs,
                    category: productionData.category,
                    version: productionData.version
                };
            }

            // Add stock information
            if (productionData.stock) {
                enhanced.stock_quantity = productionData.stock.quantity || 0;
                enhanced.stock_status = productionData.stock.status || 'unknown';
            }

            // Add pack details
            if (productionData.pack_details) {
                enhanced.production_pack_details = {
                    pieces_per_pack: productionData.pack_details.pieces_per_pack,
                    boxes_per_case: productionData.pack_details.boxes_per_case,
                    pieces_per_case: productionData.pack_details.pieces_per_case
                };
            }

            // Add pricing information
            if (productionData.pricing) {
                enhanced.production_pricing = {
                    regular: productionData.pricing.regular || [],
                    printing: productionData.pricing.printing || []
                };
            }

            // Add dimensions
            if (productionData.dimensions) {
                enhanced.production_dimensions = {
                    length: productionData.dimensions.length,
                    width: productionData.dimensions.width,
                    height: productionData.dimensions.height,
                    weight: productionData.dimensions.weight
                };
            }

            // Update last_updated if newer
            if (productionData.last_updated && (!enhanced.last_updated || 
                new Date(productionData.last_updated) > new Date(enhanced.last_updated))) {
                enhanced.last_updated = productionData.last_updated;
            }

            return enhanced;
        } catch (error) {
            this.logger.error('Error enhancing product with production data:', error);
            return product;
        }
    }

    async processProductionLinks(products, productionProducts) {
        try {
            if (!products || !productionProducts) {
                return products;
            }
    
            const productionMap = new Map();
            productionProducts.forEach(prod => {
                if (prod.code) productionMap.set(prod.code, prod);
                if (prod.mc) productionMap.set(prod.mc, prod);
            });
    
            const enhancedProducts = products.map(product => {
                const matchingProduction = Array.from(productionMap.values()).find(prod => 
                    prod.code === product.id || 
                    prod.mc === product.id || 
                    prod.code === product.code || 
                    prod.mc === product.code
                );
    
                if (matchingProduction) {
                    return this.enhanceProductWithProductionData(product, matchingProduction);
                }
    
                return product;
            });
    
            return enhancedProducts;
        } catch (error) {
            this.logger.error('Error processing production links:', error);
            return products;
        }
    }
}

module.exports = { ProductEnhancementService };