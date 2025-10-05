// Updated productionRoutes.js with fixed route registration
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for file uploads
const upload = multer({ 
    dest: 'uploads/',
    limits: { 
        fileSize: 50 * 1024 * 1024 // 50MB max file size
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('ไม่รองรับไฟล์ประเภทนี้ (รองรับเฉพาะ .xlsx และ .xls)'));
        }
    }
});

module.exports = (productionHandler, logger) => {
    // GET /api/products/production - Get all production products
    router.get('/', async (req, res) => {
        try {
            const products = await productionHandler.getAllProducts();
            res.json({
                success: true,
                products,
                total: products.length
            });
        } catch (error) {
            logger.error('Error getting production products:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/products/production - Create new production product
    router.post('/', async (req, res) => {
        try {
            const productData = req.body;

            // Validate product data
            if (!productData) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid product data: No data provided'
                });
            }

            // Validate required fields
            const requiredFields = ['mc', 'code', 'name', 'pack_details', 'pricing', 'dimensions', 'category'];
            const missingFields = requiredFields.filter(field => !productData[field]);
            if (missingFields.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: `Missing required fields: ${missingFields.join(', ')}`
                });
            }

            // Validate package details
            const packDetails = productData.pack_details;
            const requiredPackFields = ['pieces_per_pack', 'boxes_per_case', 'pieces_per_case'];
            const missingPackFields = requiredPackFields.filter(field => 
                packDetails[field] === undefined || packDetails[field] === null
            );
            if (missingPackFields.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: `Missing pack details: ${missingPackFields.join(', ')}`
                });
            }

            // Validate pricing structure
            if (!Array.isArray(productData.pricing.regular) || !Array.isArray(productData.pricing.printing)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid pricing structure: regular and printing must be arrays'
                });
            }

            // Check for existing product
            const exists = await productionHandler.checkProductExists(productData.code);
            if (exists) {
                return res.status(409).json({
                    success: false,
                    error: 'Product with this code already exists'
                });
            }

            // Save product
            const result = await productionHandler.saveProduct(productData);
            
            res.json({
                success: true,
                product: result.product
            });

        } catch (error) {
            logger.error('Error creating production product:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error. Please try again later.'
            });
        }
    });

    // GET /api/products/production/:code - Get single production product
    router.get('/:code', async (req, res) => {
        try {
            const { code } = req.params;

            if (!code) {
                return res.status(400).json({
                    success: false,
                    error: 'Product code is required'
                });
            }

            const product = await productionHandler.getProduct(code);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    error: 'Product not found'
                });
            }

            res.json({
                success: true,
                product
            });

        } catch (error) {
            logger.error('Error getting production product:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // PUT /api/products/production/:code - Update production product
    router.put('/:code', async (req, res) => {
        try {
            const { code } = req.params;
            const updates = req.body;

            if (!updates) {
                return res.status(400).json({
                    success: false,
                    error: 'No update data provided'
                });
            }

            const result = await productionHandler.updateProduct(code, updates);
            
            res.json({
                success: true,
                product: result.product
            });

        } catch (error) {
            logger.error('Error updating production product:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // DELETE /api/products/production/:code - Delete production product
    router.delete('/:code', async (req, res) => {
        try {
            const { code } = req.params;
            
            // Check if product exists
            const exists = await productionHandler.checkProductExists(code);
            if (!exists) {
                return res.status(404).json({
                    success: false,
                    error: 'Product not found'
                });
            }

            await productionHandler.deleteProduct(code);
            
            res.json({
                success: true,
                message: 'Product deleted successfully'
            });

        } catch (error) {
            logger.error('Error deleting production product:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/products/production/:code/price - Calculate product price
    router.post('/:code/price', async (req, res) => {
        try {
            const { code } = req.params;
            const { quantity, printingColors } = req.body;

            if (!quantity || quantity < 1) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid quantity'
                });
            }

            const product = await productionHandler.getProduct(code);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    error: 'Product not found'
                });
            }

            const priceResult = productionHandler.calculatePrice(
                product,
                quantity,
                printingColors
            );

            res.json({
                success: true,
                ...priceResult,
                product: {
                    code: product.code,
                    name: product.name
                }
            });

        } catch (error) {
            logger.error('Error calculating product price:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/products/production/bulk - Bulk upload products
    router.post('/bulk', upload.single('file'), async (req, res) => {
        try {
            // Validate file upload
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No file uploaded'
                });
            }

            logger.info('File upload received:', {
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
                size: req.file.size,
                path: req.file.path
            });

            // Validate file type
            const fileType = req.file.mimetype;
            const validTypes = [
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-excel'
            ];
            
            if (!validTypes.includes(fileType)) {
                logger.warn(`Invalid file type received: ${fileType}`);
                await fs.unlink(req.file.path);
                return res.status(400).json({
                    success: false,
                    error: 'Invalid file type. Only Excel files (.xlsx, .xls) are allowed'
                });
            }

            logger.info('Starting Excel file processing');

            // Process Excel file
            const results = await productionHandler.convertExcelToProducts(
                req.file.path,
                (progressData) => {
                    // Emit progress updates if Socket.IO is available
                    if (req.io) {
                        req.io.emit('upload_progress', {
                            current: progressData.current,
                            total: progressData.total,
                            file: progressData.file
                        });

                        // Emit detailed log message
                        req.io.emit('message', {
                            type: 'log',
                            message: progressData.status === 'success' 
                                ? `Processed: ${progressData.file}`
                                : `Failed to process: ${progressData.file} - ${progressData.error}`,
                            logType: progressData.status === 'success' ? 'success' : 'error',
                            timestamp: new Date().toISOString(),
                            details: progressData
                        });
                    }
                }
            );

            // Clean up uploaded file
            await fs.unlink(req.file.path);
            logger.info('Temporary file cleaned up');

            // Send final statistics
            const finalStats = {
                success: true,
                stats: {
                    total: results.total,
                    processed: results.success + results.failed,
                    success: results.success,
                    failed: results.failed
                },
                products: results.products
            };

            logger.info('Upload completed successfully', finalStats.stats);

            // Emit completion message if Socket.IO is available
            if (req.io) {
                req.io.emit('message', {
                    type: 'log',
                    message: `Upload complete: ${results.success} successful, ${results.failed} failed`,
                    logType: results.failed > 0 ? 'warning' : 'success',
                    timestamp: new Date().toISOString(),
                    stats: finalStats.stats
                });
            }

            res.json(finalStats);

        } catch (error) {
            logger.error('Error in bulk upload:', error);

            // Clean up uploaded file if it exists
            if (req.file) {
                await fs.unlink(req.file.path).catch(err => 
                    logger.error('Error deleting temporary file:', err)
                );
            }

            // Emit error message if Socket.IO is available
            if (req.io) {
                req.io.emit('message', {
                    type: 'log',
                    message: `Upload failed: ${error.message}`,
                    logType: 'error',
                    timestamp: new Date().toISOString(),
                    error: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error processing bulk upload',
                message: error.message,
                details: error.stack
            });
        }
    });
    
    // Add JSON schema validation endpoint
    router.post('/validate-schema', async (req, res) => {
        try {
            const productData = req.body;
            
            if (!productData) {
                return res.status(400).json({
                    success: false,
                    error: 'No product data provided'
                });
            }
            
            // Basic schema validation
            const validationResult = {
                valid: true,
                errors: []
            };
            
            // Check required fields
            const requiredFields = ['mc', 'code', 'name', 'pack_details', 'pricing', 'dimensions', 'category'];
            for (const field of requiredFields) {
                if (!productData[field]) {
                    validationResult.valid = false;
                    validationResult.errors.push({
                        field,
                        message: `Field '${field}' is required`
                    });
                }
            }
            
            // Check pack details
            if (productData.pack_details) {
                const packRequiredFields = ['pieces_per_pack', 'boxes_per_case', 'pieces_per_case'];
                for (const field of packRequiredFields) {
                    if (productData.pack_details[field] === undefined || productData.pack_details[field] === null) {
                        validationResult.valid = false;
                        validationResult.errors.push({
                            field: `pack_details.${field}`,
                            message: `Field 'pack_details.${field}' is required`
                        });
                    }
                }
            }
            
            // Check pricing structure
            if (productData.pricing) {
                if (!Array.isArray(productData.pricing.regular)) {
                    validationResult.valid = false;
                    validationResult.errors.push({
                        field: 'pricing.regular',
                        message: 'pricing.regular must be an array'
                    });
                }
                
                if (!Array.isArray(productData.pricing.printing)) {
                    validationResult.valid = false;
                    validationResult.errors.push({
                        field: 'pricing.printing',
                        message: 'pricing.printing must be an array'
                    });
                }
            }
            
            res.json({
                success: true,
                validation: validationResult
            });
            
        } catch (error) {
            logger.error('Error validating product schema:', error);
            res.status(500).json({
                success: false,
                error: 'Schema validation error',
                message: error.message
            });
        }
    });
    
    // GET /api/products/production/categories - Get all production product categories
    router.get('/categories', async (req, res) => {
        try {
            const products = await productionHandler.getAllProducts();
            
            // Extract unique categories
            const categories = [...new Set(products.map(product => product.category))].filter(Boolean);
            
            res.json({
                success: true,
                categories: categories.sort(),
                total: categories.length
            });
            
        } catch (error) {
            logger.error('Error getting production categories:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    // GET /api/products/production/search - Search for production products
    router.get('/search', async (req, res) => {
        try {
            const { query, category, limit = 20, page = 1 } = req.query;
            
            const products = await productionHandler.getAllProducts();
            
            // Filter by search query
            let filteredProducts = products;
            
            if (query) {
                const searchRegex = new RegExp(query, 'i');
                filteredProducts = filteredProducts.filter(product => 
                    searchRegex.test(product.name) || 
                    searchRegex.test(product.code) || 
                    searchRegex.test(product.mc)
                );
            }
            
            // Filter by category
            if (category) {
                filteredProducts = filteredProducts.filter(product => 
                    product.category === category
                );
            }
            
            // Sort by code
            filteredProducts.sort((a, b) => a.code.localeCompare(b.code));
            
            // Pagination
            const startIndex = (parseInt(page) - 1) * parseInt(limit);
            const endIndex = startIndex + parseInt(limit);
            const paginatedResults = filteredProducts.slice(startIndex, endIndex);
            
            res.json({
                success: true,
                products: paginatedResults,
                pagination: {
                    total: filteredProducts.length,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(filteredProducts.length / parseInt(limit))
                }
            });
            
        } catch (error) {
            logger.error('Error searching production products:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    // GET /api/products/production/stats - Get production product statistics
    router.get('/stats', async (req, res) => {
        try {
            const products = await productionHandler.getAllProducts();
            
            // Calculate statistics
            const stats = {
                totalProducts: products.length,
                categories: {},
                priceRanges: {
                    under100: 0,
                    between100And500: 0,
                    between500And1000: 0,
                    over1000: 0
                }
            };
            
            // Calculate category stats
            products.forEach(product => {
                // Category counts
                const category = product.category || 'Uncategorized';
                stats.categories[category] = (stats.categories[category] || 0) + 1;
                
                // Price range counts
                if (product.pricing && product.pricing.regular && product.pricing.regular.length > 0) {
                    const basePrice = product.pricing.regular[0].price;
                    if (basePrice < 100) {
                        stats.priceRanges.under100++;
                    } else if (basePrice < 500) {
                        stats.priceRanges.between100And500++;
                    } else if (basePrice < 1000) {
                        stats.priceRanges.between500And1000++;
                    } else {
                        stats.priceRanges.over1000++;
                    }
                }
            });
            
            res.json({
                success: true,
                stats
            });
            
        } catch (error) {
            logger.error('Error getting production stats:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Error handling middleware
    router.use((err, req, res, next) => {
        logger.error('Production Routes Error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: err.message
        });
    });

    return router;
};