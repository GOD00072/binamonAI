// routes/productRoutes.js - ใช้ Prisma แทน JSON files
const express = require('express');
const prisma = require('../../../../lib/prisma');

module.exports = (productManager, logger, vectorDBRouter) => {
    const router = express.Router();

    // Get vector DB sync functions if available
    const syncToVectorDB = vectorDBRouter?.syncSingleProduct;
    const deleteFromVectorDB = vectorDBRouter?.deleteProductFromVectorDB;

    // GET /api/products/manage - Manage products with extended search
    router.get('/manage', async (req, res) => {
        try {
            const {
                search,
                category,
                limit = 20,
                page = 1,
                sort = 'product_name',
                order = 'asc'
            } = req.query;

            // Build where clause
            const where = {};

            if (search) {
                where.OR = [
                    { product_name: { contains: search } },
                    { sku: { contains: search } },
                    { short_description: { contains: search } }
                ];
            }

            if (category) {
                where.category = category;
            }

            // Count total
            const total = await prisma.product.count({ where });

            // Get products
            const products = await prisma.product.findMany({
                where,
                include: {
                    images: {
                        orderBy: { order: 'asc' },
                        take: 1
                    }
                },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
                orderBy: { [sort]: order }
            });

            res.json({
                success: true,
                results: products.map(p => ({
                    id: p.id,
                    product_name: p.product_name,
                    category: p.category,
                    sku: p.sku,
                    price: p.price,
                    url: p.url,
                    stock_quantity: p.stock_quantity,
                    last_updated: p.last_updated
                })),
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / parseInt(limit))
                }
            });
        } catch (error) {
            logger.error('Error managing products:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to manage products',
                details: error.message
            });
        }
    });

    // GET /api/products - Get all products with pagination
    router.get('/', async (req, res) => {
        try {
            const {
                page = 1,
                limit = 20,
                category,
                sort = 'product_name',
                order = 'asc'
            } = req.query;

            const where = category ? { category } : {};

            const total = await prisma.product.count({ where });

            const products = await prisma.product.findMany({
                where,
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
                orderBy: { [sort]: order },
                select: {
                    id: true,
                    product_name: true,
                    category: true,
                    sku: true,
                    price: true,
                    url: true,
                    stock_quantity: true,
                    last_updated: true
                }
            });

            res.json({
                success: true,
                products,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / parseInt(limit))
                }
            });
        } catch (error) {
            logger.error('Error getting all products:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve products',
                details: error.message
            });
        }
    });

    // POST /api/products/upload-all - Upload all products to production
    router.post('/upload-all', async (req, res) => {
        logger.info('POST /api/products/upload-all endpoint called - Upload existing products only');

        try {
            if (!productManager.initialized) {
                logger.info('Initializing product manager for upload-all');
                await productManager.initialize();
            }

            logger.info('Starting upload all products process');

            const progressCallback = (progress) => {
                logger.info('Upload progress update', progress);
                if (req.io) {
                    req.io.emit('message', {
                        type: 'uploadProgress',
                        ...progress,
                        timestamp: Date.now()
                    });
                }
            };

            process.nextTick(async () => {
                try {
                    logger.info('Beginning background upload task');
                    const result = await productManager.uploadAllProducts(progressCallback);

                    logger.info('Background upload completed successfully', result);

                    if (req.io) {
                        req.io.emit('upload_complete', {
                            success: true,
                            result,
                            timestamp: Date.now()
                        });
                    }
                } catch (uploadError) {
                    logger.error('Background upload failed', uploadError);

                    if (req.io) {
                        req.io.emit('upload_error', {
                            success: false,
                            error: uploadError.message,
                            timestamp: Date.now()
                        });
                    }
                }
            });

            res.json({
                success: true,
                message: 'Product upload process initiated (existing products only)',
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error('Error in upload-all endpoint handler', error);
            res.status(500).json({
                success: false,
                error: 'Failed to start upload process',
                details: error.message
            });
        }
    });

    // GET /api/products/all-urls - Get all product URLs
    router.get('/all-urls', async (req, res) => {
        try {
            const products = await prisma.product.findMany({
                where: {
                    url: { not: null }
                },
                select: { url: true },
                orderBy: { url: 'asc' }
            });

            const urls = products.map(p => p.url).filter(Boolean);
            const format = req.query.format;

            if (format === 'text' || req.get('Accept') === 'text/plain') {
                res.setHeader('Content-Type', 'text/plain');
                res.send(urls.join('\n'));
            } else {
                res.json({
                    success: true,
                    urls,
                    total: urls.length
                });
            }

        } catch (error) {
            logger.error('Error getting all product URLs:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve product URLs',
                details: error.message
            });
        }
    });

    // GET /api/products/categories - Get all product categories
    router.get('/categories', async (req, res) => {
        try {
            const categories = await prisma.product.findMany({
                where: {
                    category: { not: null }
                },
                select: { category: true },
                distinct: ['category'],
                orderBy: { category: 'asc' }
            });

            res.json({
                success: true,
                categories: categories.map(c => c.category).filter(Boolean)
            });
        } catch (error) {
            logger.error('Error getting product categories:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve categories',
                details: error.message
            });
        }
    });

    // GET /api/products/search - Search products
    router.get('/search', async (req, res) => {
        try {
            const {
                query,
                category,
                limit = 20,
                page = 1,
                sort = 'product_name',
                order = 'asc'
            } = req.query;

            if (!query) {
                return res.status(400).json({
                    success: false,
                    error: 'Search query is required'
                });
            }

            const where = {
                OR: [
                    { product_name: { contains: query } },
                    { sku: { contains: query } },
                    { short_description: { contains: query } }
                ]
            };

            if (category) {
                where.category = category;
            }

            const total = await prisma.product.count({ where });

            const products = await prisma.product.findMany({
                where,
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
                orderBy: { [sort]: order },
                select: {
                    id: true,
                    product_name: true,
                    category: true,
                    sku: true,
                    price: true,
                    url: true,
                    stock_quantity: true,
                    last_updated: true
                }
            });

            res.json({
                success: true,
                results: products,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / parseInt(limit))
                }
            });
        } catch (error) {
            logger.error('Error searching products:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to search products',
                details: error.message
            });
        }
    });

    // GET /api/products/:id - Get a single product by ID
    router.get('/:id', async (req, res) => {
        try {
            const { id } = req.params;

            const product = await prisma.product.findUnique({
                where: { id },
                include: {
                    images: {
                        orderBy: { order: 'asc' }
                    },
                    priceTiers: {
                        orderBy: { min_quantity: 'asc' }
                    }
                }
            });

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
            logger.error('Error getting product details:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve product details',
                details: error.message
            });
        }
    });

    // POST /api/products - Create a new product manually
    router.post('/', async (req, res) => {
        try {
            const productData = req.body;

            if (!productData || !productData.product_name) {
                return res.status(400).json({
                    success: false,
                    error: 'Product name is required'
                });
            }

            // สร้างสินค้าใหม่ใน database
            const newProduct = await prisma.product.create({
                data: {
                    product_name: productData.product_name,
                    sku: productData.sku || null,
                    url: productData.url || null,
                    category: productData.category || null,
                    price: productData.price || null,
                    stock_quantity: productData.stock_quantity || null,
                    unit: productData.unit || null,
                    short_description: productData.short_description || null,
                    description: productData.description || null,
                    details: productData.details ? JSON.stringify(productData.details) : null,
                    specifications: productData.specifications ? JSON.stringify(productData.specifications) : null,
                    manual: true
                },
                include: {
                    priceTiers: true
                }
            });

            // Auto-sync to Vector DB
            if (syncToVectorDB) {
                logger.info(`Triggering auto-sync for new product: ${newProduct.id}`);
                syncToVectorDB(newProduct)
                    .then(result => {
                        if (result.success) {
                            logger.info(`✅ Auto-sync successful for product ${newProduct.id}`);
                        } else {
                            logger.warn(`⚠️ Auto-sync skipped for product ${newProduct.id}: ${result.reason || result.error}`);
                        }
                    })
                    .catch(err => {
                        logger.error(`❌ Auto-sync failed for product ${newProduct.id}:`, err);
                    });
            } else {
                logger.warn('syncToVectorDB function not available');
            }

            res.status(201).json({
                success: true,
                message: 'Product created successfully',
                product: newProduct
            });
        } catch (error) {
            logger.error('Error creating new product:', error);

            if (error.code === 'P2002') {
                return res.status(409).json({
                    success: false,
                    error: 'A product with this SKU already exists'
                });
            }

            res.status(500).json({
                success: false,
                error: 'Failed to create product',
                details: error.message
            });
        }
    });

    // PUT /api/products/:id - Update an existing product
    router.put('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            if (!updates) {
                return res.status(400).json({
                    success: false,
                    error: 'No update data provided'
                });
            }

            // Prepare update data
            const updateData = {};
            const allowedFields = [
                'product_name', 'sku', 'url', 'category', 'price',
                'stock_quantity', 'unit', 'short_description', 'description'
            ];

            for (const field of allowedFields) {
                if (updates[field] !== undefined) {
                    updateData[field] = updates[field];
                }
            }

            // Handle JSON fields
            if (updates.details) {
                updateData.details = JSON.stringify(updates.details);
            }
            if (updates.specifications) {
                updateData.specifications = JSON.stringify(updates.specifications);
            }

            const updatedProduct = await prisma.product.update({
                where: { id },
                data: updateData,
                include: {
                    priceTiers: true
                }
            });

            // Auto-sync to Vector DB
            if (syncToVectorDB) {
                logger.info(`Triggering auto-sync for updated product: ${updatedProduct.id}`);
                syncToVectorDB(updatedProduct)
                    .then(result => {
                        if (result.success) {
                            logger.info(`✅ Auto-sync successful for product ${updatedProduct.id}`);
                        } else {
                            logger.warn(`⚠️ Auto-sync skipped for product ${updatedProduct.id}: ${result.reason || result.error}`);
                        }
                    })
                    .catch(err => {
                        logger.error(`❌ Auto-sync failed for product ${updatedProduct.id}:`, err);
                    });
            } else {
                logger.warn('syncToVectorDB function not available');
            }

            res.json({
                success: true,
                message: 'Product updated successfully',
                product: updatedProduct
            });
        } catch (error) {
            logger.error('Error updating product:', error);

            if (error.code === 'P2025') {
                return res.status(404).json({
                    success: false,
                    error: 'Product not found'
                });
            }

            res.status(500).json({
                success: false,
                error: 'Failed to update product',
                details: error.message
            });
        }
    });

    // DELETE /api/products/:id - Delete a product
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;

            // Delete from database
            await prisma.product.delete({
                where: { id }
            });

            // Auto-delete from Vector DB
            if (deleteFromVectorDB) {
                logger.info(`Triggering auto-delete for product: ${id}`);
                deleteFromVectorDB(id)
                    .then(result => {
                        if (result.success) {
                            logger.info(`✅ Auto-delete successful for product ${id}`);
                        } else {
                            logger.warn(`⚠️ Auto-delete skipped for product ${id}: ${result.reason || result.error}`);
                        }
                    })
                    .catch(err => {
                        logger.error(`❌ Auto-delete failed for product ${id}:`, err);
                    });
            } else {
                logger.warn('deleteFromVectorDB function not available');
            }

            res.json({
                success: true,
                message: 'Product deleted successfully'
            });
        } catch (error) {
            logger.error('Error deleting product:', error);

            if (error.code === 'P2025') {
                return res.status(404).json({
                    success: false,
                    error: 'Product not found'
                });
            }

            res.status(500).json({
                success: false,
                error: 'Failed to delete product',
                details: error.message
            });
        }
    });

    // POST /api/products/batch-update - Update multiple products
    router.post('/batch-update', async (req, res) => {
        try {
            const { products } = req.body;

            if (!Array.isArray(products)) {
                return res.status(400).json({
                    success: false,
                    error: 'Products must be an array'
                });
            }

            const results = {
                updated: 0,
                failed: 0,
                failures: []
            };

            for (const update of products) {
                try {
                    if (!update.id) {
                        throw new Error('Product ID is required');
                    }

                    await prisma.product.update({
                        where: { id: update.id },
                        data: update
                    });

                    results.updated++;
                } catch (error) {
                    results.failed++;
                    results.failures.push({
                        id: update.id,
                        error: error.message
                    });
                }
            }

            res.json({
                success: true,
                updated: results.updated,
                failed: results.failed,
                failures: results.failures,
                total: products.length
            });
        } catch (error) {
            logger.error('Error batch updating products:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to batch update products',
                details: error.message
            });
        }
    });

    // ==================== Price Tier Routes ====================

    // GET /api/products/:id/price-tiers - Get price tiers for a product
    router.get('/:id/price-tiers', async (req, res) => {
        try {
            const { id } = req.params;

            const priceTiers = await prisma.priceTier.findMany({
                where: { product_id: id },
                orderBy: { min_quantity: 'asc' }
            });

            res.json({
                success: true,
                priceTiers
            });
        } catch (error) {
            logger.error('Error getting price tiers:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get price tiers',
                details: error.message
            });
        }
    });

    // POST /api/products/:id/price-tiers - Add price tier to a product
    router.post('/:id/price-tiers', async (req, res) => {
        try {
            const { id } = req.params;
            const { min_quantity, max_quantity, price } = req.body;

            if (!min_quantity || !price) {
                return res.status(400).json({
                    success: false,
                    error: 'min_quantity and price are required'
                });
            }

            const priceTier = await prisma.priceTier.create({
                data: {
                    product_id: id,
                    min_quantity: parseInt(min_quantity),
                    max_quantity: max_quantity ? parseInt(max_quantity) : null,
                    price: parseFloat(price)
                }
            });

            res.status(201).json({
                success: true,
                message: 'Price tier added successfully',
                priceTier
            });
        } catch (error) {
            logger.error('Error adding price tier:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to add price tier',
                details: error.message
            });
        }
    });

    // PUT /api/products/:id/price-tiers/:tierId - Update a price tier
    router.put('/:id/price-tiers/:tierId', async (req, res) => {
        try {
            const { tierId } = req.params;
            const { min_quantity, max_quantity, price } = req.body;

            const updateData = {};
            if (min_quantity !== undefined) updateData.min_quantity = parseInt(min_quantity);
            if (max_quantity !== undefined) updateData.max_quantity = max_quantity ? parseInt(max_quantity) : null;
            if (price !== undefined) updateData.price = parseFloat(price);

            const priceTier = await prisma.priceTier.update({
                where: { id: tierId },
                data: updateData
            });

            res.json({
                success: true,
                message: 'Price tier updated successfully',
                priceTier
            });
        } catch (error) {
            logger.error('Error updating price tier:', error);

            if (error.code === 'P2025') {
                return res.status(404).json({
                    success: false,
                    error: 'Price tier not found'
                });
            }

            res.status(500).json({
                success: false,
                error: 'Failed to update price tier',
                details: error.message
            });
        }
    });

    // DELETE /api/products/:id/price-tiers/:tierId - Delete a price tier
    router.delete('/:id/price-tiers/:tierId', async (req, res) => {
        try {
            const { tierId } = req.params;

            await prisma.priceTier.delete({
                where: { id: tierId }
            });

            res.json({
                success: true,
                message: 'Price tier deleted successfully'
            });
        } catch (error) {
            logger.error('Error deleting price tier:', error);

            if (error.code === 'P2025') {
                return res.status(404).json({
                    success: false,
                    error: 'Price tier not found'
                });
            }

            res.status(500).json({
                success: false,
                error: 'Failed to delete price tier',
                details: error.message
            });
        }
    });

    // POST /api/products/:id/price-tiers/batch - Batch update price tiers
    router.post('/:id/price-tiers/batch', async (req, res) => {
        try {
            const { id } = req.params;
            const { priceTiers } = req.body;

            if (!Array.isArray(priceTiers)) {
                return res.status(400).json({
                    success: false,
                    error: 'priceTiers must be an array'
                });
            }

            // Delete existing price tiers
            await prisma.priceTier.deleteMany({
                where: { product_id: id }
            });

            // Create new price tiers
            const createdTiers = [];
            for (const tier of priceTiers) {
                if (tier.min_quantity && tier.price) {
                    const newTier = await prisma.priceTier.create({
                        data: {
                            product_id: id,
                            min_quantity: parseInt(tier.min_quantity),
                            max_quantity: tier.max_quantity ? parseInt(tier.max_quantity) : null,
                            price: parseFloat(tier.price)
                        }
                    });
                    createdTiers.push(newTier);
                }
            }

            res.json({
                success: true,
                message: 'Price tiers updated successfully',
                priceTiers: createdTiers
            });
        } catch (error) {
            logger.error('Error batch updating price tiers:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to batch update price tiers',
                details: error.message
            });
        }
    });

    return router;
};
