// services/ProductIndexingService.js
'use strict';

const fs = require('fs').promises;
const path = require('path');

class ProductIndexingService {
    constructor(logger, vectorDBService, metadataService, cacheService) {
        this.logger = logger;
        this.vectorDBService = vectorDBService;
        this.metadataService = metadataService;
        this.cacheService = cacheService;
        
        // Upload statistics tracking
        this.uploadStats = {
            total: 0,
            processed: 0,
            succeeded: 0,
            failed: 0,
            startTime: null,
            endTime: null,
            errors: []
        };
        
        // Configuration parameters
        this.BATCH_SIZE = 100;
        this.RETRY_ATTEMPTS = 3;
        this.RETRY_DELAY = 1000;
    }

    resetUploadStats() {
        this.uploadStats = {
            total: 0,
            processed: 0,
            succeeded: 0,
            failed: 0,
            startTime: null,
            endTime: null,
            errors: []
        };
    }

    async uploadAllProducts(productsDir, progressCallback) {
        try {
            this.resetUploadStats();
            this.uploadStats.startTime = Date.now();
    
            // Get list of files
            const files = await fs.readdir(productsDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            this.uploadStats.total = jsonFiles.length;
            
            this.logger.info(`Starting upload process for ${jsonFiles.length} products`);
    
            // Process files in batches
            const batches = this.createBatches(jsonFiles, this.BATCH_SIZE);
    
            for (const [batchIndex, batch] of batches.entries()) {
                await this.processBatch(
                    batch, 
                    batchIndex, 
                    batches.length, 
                    progressCallback,
                    productsDir
                );
    
                if (batchIndex < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
                }
            }
    
            this.uploadStats.endTime = Date.now();
            return this.generateUploadReport();
    
        } catch (error) {
            this.logger.error('Error in upload process:', error);
            throw error;
        }
    }

    async enhanceProductWithLinkedProductionData(product, productsDir) {
        try {
            // Don't depend on the property in the product, look for a linkage record instead
            const productId = product.id || product.sku;
            if (!productId) {
                return product;
            }
            
            // Check if we already have production_links in the product
            let linkedProductionCode = null;
            
            if (product.production_links && product.production_links.productionDetails && 
                product.production_links.productionDetails.code) {
                // Use the code from existing production_links if available
                linkedProductionCode = product.production_links.productionDetails.code;
                this.logger.info(`Using production code from existing links: ${linkedProductionCode}`);
            } else {
                // Try to find linkage record
                try {
                    const linkageDir = path.join(productsDir, '..', 'linkage_records');
                    await fs.mkdir(linkageDir, { recursive: true });
                    const files = await fs.readdir(linkageDir);
                    
                    // Find linkage file that references this product
                    for (const file of files) {
                        if (file.endsWith('_linkage.json')) {
                            try {
                                const linkageFilePath = path.join(linkageDir, file);
                                const content = await fs.readFile(linkageFilePath, 'utf8');
                                const linkage = JSON.parse(content);
                                
                                if (linkage.main_product_id === productId) {
                                    linkedProductionCode = linkage.production_code;
                                    this.logger.info(`Found linkage record: ${file} for product ${productId}`);
                                    break;
                                }
                            } catch (err) {
                                this.logger.warn(`Error reading linkage file ${file}: ${err.message}`);
                            }
                        }
                    }
                } catch (err) {
                    this.logger.warn(`Error reading linkage directory: ${err.message}`);
                }
            }
            
            if (!linkedProductionCode) {
                this.logger.info(`No production code found for product ${productId}`);
                return product;
            }
            
            this.logger.info(`Enhancing product with linked production data: ${linkedProductionCode}`);
            
            // Find the production product file
            const productionDir = path.join(productsDir, '..', 'production');
            await fs.mkdir(productionDir, { recursive: true });
            
            // Try different file naming patterns
            const possibleFilePaths = [
                path.join(productionDir, `${linkedProductionCode}.json`),
                path.join(productionDir, `${linkedProductionCode}_*.json`) // Using glob pattern
            ];
            
            let productionProduct = null;
            
            // Try exact filename match first
            try {
                const filePath = possibleFilePaths[0];
                this.logger.info(`Trying to read production file: ${filePath}`);
                const content = await fs.readFile(filePath, 'utf8');
                productionProduct = JSON.parse(content);
                this.logger.info(`Successfully read production file: ${filePath}`);
            } catch (err) {
                this.logger.warn(`Could not read exact production file: ${err.message}`);
                
                // Try to find matching files if exact match fails
                try {
                    const files = await fs.readdir(productionDir);
                    const matchingFile = files.find(file => 
                        file.startsWith(`${linkedProductionCode}_`) && file.endsWith('.json')
                    );
                    
                    if (matchingFile) {
                        const filePath = path.join(productionDir, matchingFile);
                        this.logger.info(`Found matching production file: ${filePath}`);
                        const content = await fs.readFile(filePath, 'utf8');
                        productionProduct = JSON.parse(content);
                        this.logger.info(`Successfully read matching production file: ${filePath}`);
                    } else {
                        this.logger.warn(`No matching production file found for code: ${linkedProductionCode}`);
                    }
                } catch (searchErr) {
                    this.logger.warn(`Error searching for production files: ${searchErr.message}`);
                }
            }
            
            // If we still don't have a production product, check in the main products directory
            // Some systems might store production products directly there
            if (!productionProduct) {
                try {
                    const filePath = path.join(productsDir, `${linkedProductionCode}.json`);
                    this.logger.info(`Trying to read production file from main products directory: ${filePath}`);
                    const content = await fs.readFile(filePath, 'utf8');
                    productionProduct = JSON.parse(content);
                    this.logger.info(`Successfully read production file from main directory: ${filePath}`);
                } catch (err) {
                    this.logger.warn(`Could not read production file from main directory: ${err.message}`);
                }
            }
            
            if (!productionProduct) {
                this.logger.warn(`No production product found for code: ${linkedProductionCode}`);
                return product;
            }
            
            // Now that we have the production product, extract the data we need
            this.logger.info(`Found production product: ${productionProduct.name || productionProduct.code || 'unnamed'}`);
            
            // Log the production product pricing structure
            if (productionProduct.pricing) {
                this.logger.info(`Production product has pricing data:`, {
                    hasRegular: !!productionProduct.pricing.regular,
                    regularTiers: productionProduct.pricing.regular?.length || 0,
                    hasPrinting: !!productionProduct.pricing.printing,
                    printingTiers: productionProduct.pricing.printing?.length || 0
                });
                
                // Add pricing data from production
                product.production_pricing = JSON.parse(JSON.stringify(productionProduct.pricing));
                this.logger.info(`Added production pricing data to main product`);
            } else {
                this.logger.warn(`Production product does not have pricing data`);
            }
            
            // Add dimensions data if available
            if (productionProduct.dimensions) {
                product.production_dimensions = JSON.parse(JSON.stringify(productionProduct.dimensions));
                this.logger.info(`Added production dimensions data`);
            }
            
            // Add pack_details data if available
            if (productionProduct.pack_details) {
                product.production_pack_details = JSON.parse(JSON.stringify(productionProduct.pack_details));
                this.logger.info(`Added production pack details data`);
            }
            
            return product;
        } catch (error) {
            this.logger.error('Error enhancing product with linked data:', error);
            return product; // Return original product data if there's an error
        }
    }
    
    async processBatch(batch, batchIndex, totalBatches, progressCallback, productsDir) {
        const batchPromises = batch.map(async (file) => {
            try {
                const filePath = path.join(productsDir, file);
                this.logger.info(`Reading product file: ${file}`);
                
                // Read product data
                const productData = JSON.parse(await fs.readFile(filePath, 'utf8'));
                
                // เพิ่มข้อมูลจาก linked production product
                const enhancedProductData = await this.enhanceProductWithLinkedProductionData(productData, productsDir);
                
                // Generate embedding
                const textForEmbedding = this.metadataService.createProductEmbeddingText(enhancedProductData);
                const embedding = await this.vectorDBService.getEmbedding(textForEmbedding);
    
                // Prepare optimized metadata
                const metadata = this.metadataService.prepareMetadata(enhancedProductData);
    
                // Upload to Pinecone
                const vectorId = `product_${file.replace('.json', '')}`;
                await this.vectorDBService.upsertVector(vectorId, embedding, metadata);
    
                // Update progress
                this.uploadStats.processed++;
                this.uploadStats.succeeded++;
    
                // Log successful upload
                this.logger.info(`Successfully uploaded ${file}`);
    
                if (progressCallback) {
                    progressCallback({
                        current: this.uploadStats.processed,
                        total: this.uploadStats.total,
                        file,
                        product_name: enhancedProductData.product_name,
                        status: 'success',
                        batch: {
                            current: batchIndex + 1,
                            total: totalBatches
                        }
                    });
                }
    
                return {
                    success: true,
                    file,
                    vectorId
                };
    
            } catch (error) {
                this.logger.error(`Error processing file ${file}:`, error);
                this.uploadStats.processed++;
                this.uploadStats.failed++;
                this.uploadStats.errors.push({
                    file,
                    error: error.message
                });
    
                if (progressCallback) {
                    progressCallback({
                        current: this.uploadStats.processed,
                        total: this.uploadStats.total,
                        file,
                        error: error.message,
                        status: 'error',
                        batch: {
                            current: batchIndex + 1,
                            total: totalBatches
                        }
                    });
                }
    
                return {
                    success: false,
                    file,
                    error: error.message
                };
            }
        });
    
        return Promise.all(batchPromises);
    }

    async getProductById(id, productsDir) {
        try {
            if (!id || typeof id !== 'string') {
                throw new Error('Invalid product ID');
            }

            this.logger.info('Retrieving product', { id });

            // Try to get from cache first
            const cacheKey = `product_${id}`;
            const cachedProduct = this.cacheService.get(cacheKey);
            if (cachedProduct) {
                this.logger.info('Product retrieved from cache', { id });
                return cachedProduct;
            }

            // Not in cache, try to find in file system
            const idVariants = [
                id,
                id.replace(/^product_/, ''),
                id.split('__')[0].replace(/^product_/, '')];

            for (const variant of idVariants) {
                const possiblePaths = [
                    path.join(productsDir, `${variant}.json`),
                    path.join(productsDir, `product_${variant}.json`)
                ];

                for (const filePath of possiblePaths) {
                    try {
                        const content = await fs.readFile(filePath, 'utf8');
                        const product = JSON.parse(content);
                        product.id = variant;

                        // Cache the result
                        this.cacheService.set(cacheKey, product);

                        this.logger.info('Product retrieved from file', {
                            id: variant,
                            path: filePath
                        });

                        return product;
                    } catch (fileError) {
                        continue;
                    }
                }
            }

            this.logger.warn('Product not found', { id, variants: idVariants });
            return null;

        } catch (error) {
            this.logger.error('Error retrieving product', {
                id,
                error: error.message
            });
            throw error;
        }
    }

    async updateProduct(id, updates, productsDir) {
        try {
            if (!id || !updates) {
                throw new Error('Both product ID and updates are required');
            }

            this.logger.info('Starting product update', { 
                id, 
                updateKeys: Object.keys(updates) 
            });

            // Construct file path
            const filePath = path.join(productsDir, `${id}.json`);
            
            // Read existing product
            let existingProduct;
            try {
                const content = await fs.readFile(filePath, 'utf8');
                existingProduct = JSON.parse(content);
                this.logger.info('Successfully read existing product', { id });
            } catch (readError) {
                this.logger.error('Error reading product file', {
                    id,
                    error: readError.message
                });
                throw new Error(`Product not found: ${id}`);
            }

            // Merge updates with existing data
            const updatedProduct = {
                ...existingProduct,
                ...updates,
                last_updated: new Date().toISOString()
            };

            // Save updated product to file
            try {
                await fs.writeFile(
                    filePath,
                    JSON.stringify(updatedProduct, null, 2),
                    'utf8'
                );
                this.logger.info('Successfully wrote updated product to file', { id });
            } catch (writeError) {
                this.logger.error('Error writing product file', {
                    id,
                    error: writeError.message
                });
                throw new Error('Failed to save product updates');
            }

            // Update vector in Pinecone
            try {
                // ดึงข้อมูล production ที่ linked ก่อนทำการอัพเดท Pinecone
                const enhancedProduct = await this.enhanceProductWithLinkedProductionData(updatedProduct, productsDir);
                
                const textForEmbedding = this.metadataService.createProductEmbeddingText(enhancedProduct);
                const embedding = await this.vectorDBService.getEmbedding(textForEmbedding);
                const metadata = this.metadataService.prepareMetadata(enhancedProduct);

                await this.vectorDBService.upsertVector(`product_${id}`, embedding, metadata);
                this.logger.info('Successfully updated vector in Pinecone', { id });
            } catch (vectorError) {
                this.logger.error('Error updating vector in Pinecone', {
                    id,
                    error: vectorError.message
                });
                // Don't throw here - file update was successful
            }

            // Clear any cached data
            const cacheKey = `product_${id}`;
            this.cacheService.del(cacheKey);

            this.logger.info('Product update completed successfully', {
                id,
                updateKeys: Object.keys(updates)
            });

            return updatedProduct;

        } catch (error) {
            this.logger.error('Product update failed', {
                id,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    createBatches(items, size) {
        return Array.from(
            { length: Math.ceil(items.length / size) },
            (_, i) => items.slice(i * size, (i + 1) * size)
        );
    }

    generateUploadReport() {
        const duration = this.uploadStats.endTime - this.uploadStats.startTime;
        const successRate = (this.uploadStats.succeeded / this.uploadStats.total) * 100;
    
        return {
            summary: {
                total: this.uploadStats.total,
                succeeded: this.uploadStats.succeeded,
                failed: this.uploadStats.failed,
                successRate: `${successRate.toFixed(2)}%`,
                duration: `${(duration / 1000).toFixed(2)} seconds`
            },
            errors: this.uploadStats.errors,
            timing: {
                startTime: new Date(this.uploadStats.startTime).toISOString(),
                endTime: new Date(this.uploadStats.endTime).toISOString(),
                durationSeconds: (duration / 1000).toFixed(2)
            },
            batches: {
                size: this.BATCH_SIZE,
                total: Math.ceil(this.uploadStats.total / this.BATCH_SIZE)
            }
        };
    }
}

module.exports = { ProductIndexingService };