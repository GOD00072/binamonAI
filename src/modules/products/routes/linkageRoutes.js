// routes/linkageRoutes.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;

module.exports = (productionHandler, logger, productManager) => {
    // GET /api/products/linkage-info - Get all linkage information
    router.get('/linkage-info', async (req, res) => {
        try {
            const productionProducts = await productionHandler.getAllProducts();
            const mainProductFiles = await fs.readdir(productManager.productsDir);
            const linkageInfo = [];
            
            for (const file of mainProductFiles) {
                if (!file.endsWith('.json')) continue;
                
                try {
                    const content = await fs.readFile(
                        path.join(productManager.productsDir, file), 
                        'utf8'
                    );
                    const mainProduct = JSON.parse(content);
                    
                    if (mainProduct.production_links?.productionDetails?.code) {
                        const linkedProduction = productionProducts.find(prod => 
                            prod.code === mainProduct.production_links.productionDetails.code ||
                            prod.mc === mainProduct.production_links.productionDetails.code
                        );
                        
                        if (linkedProduction) {
                            linkageInfo.push({
                                mainProduct: {
                                    id: file.replace('.json', ''),
                                    name: mainProduct.product_name,
                                    url: mainProduct.url,
                                    category: mainProduct.category
                                },
                                productionProduct: {
                                    code: linkedProduction.code,
                                    mc: linkedProduction.mc,
                                    name: linkedProduction.name,
                                    category: linkedProduction.category,
                                    specs: linkedProduction.specs
                                },
                                linkDetails: {
                                    linkedAt: mainProduct.production_links.linked_at,
                                    hasPackDetails: !!mainProduct.production_pack_details,
                                    hasPricing: !!mainProduct.production_pricing,
                                    hasDimensions: !!mainProduct.production_dimensions
                                }
                            });
                        }
                    }
                } catch (error) {
                    logger.error(`Error processing file ${file}:`, error);
                    continue;
                }
            }
            
            const stats = {
                totalMainProducts: mainProductFiles.filter(f => f.endsWith('.json')).length,
                totalProductionProducts: productionProducts.length,
                totalLinked: linkageInfo.length,
                linkagePercentage: (linkageInfo.length / mainProductFiles.filter(f => f.endsWith('.json')).length * 100).toFixed(2)
            };
            
            const categoryBreakdown = linkageInfo.reduce((acc, item) => {
                const category = item.mainProduct.category || 'Uncategorized';
                if (!acc[category]) {
                    acc[category] = { total: 0, products: [] };
                }
                acc[category].total++;
                acc[category].products.push({
                    mainName: item.mainProduct.name,
                    productionCode: item.productionProduct.code
                });
                return acc;
            }, {});
            
            res.json({
                success: true,
                stats,
                categoryBreakdown,
                linkageDetails: linkageInfo
            });
            
        } catch (error) {
            logger.error('Error getting linkage info:', error);
            res.status(500).json({
                success: false,
                error: 'Error retrieving linkage information',
                details: error.message
            });
        }
    });


    // POST /api/products/unlink - Remove product linkage
router.post('/unlink', async (req, res) => {
    try {
        const { productId } = req.body;

        if (!productId) {
            return res.status(400).json({
                success: false,
                error: 'Main product ID is required'
            });
        }

        const mainProductPath = path.join(productManager.productsDir, `${productId}.json`);
        let mainProduct;
        try {
            const content = await fs.readFile(mainProductPath, 'utf8');
            mainProduct = JSON.parse(content);
        } catch (error) {
            return res.status(404).json({
                success: false,
                error: 'Main product not found'
            });
        }

        // Check if the product has linkage information
        if (!mainProduct.production_links) {
            return res.status(400).json({
                success: false,
                error: 'Product is not linked to any production product'
            });
        }

        // Remove linkage information
        delete mainProduct.production_links;
        delete mainProduct.production_pack_details;
        delete mainProduct.production_pricing;
        delete mainProduct.production_dimensions;

        // Save updated product
        await fs.writeFile(mainProductPath, JSON.stringify(mainProduct, null, 2));

        res.json({
            success: true,
            message: 'Product unlinked successfully',
            productId
        });

    } catch (error) {
        logger.error('Error unlinking product:', error);
        res.status(500).json({
            success: false,
            error: 'Error unlinking product',
            details: error.message
        });
    }
});

    // GET /api/products/linkage-info/:code - Get linkage info for specific product
    router.get('/linkage-info/:code', async (req, res) => {
        try {
            const { code } = req.params;
            
            const productionProduct = await productionHandler.getProduct(code);
            if (!productionProduct) {
                return res.status(404).json({
                    success: false,
                    error: 'Production product not found'
                });
            }
            
            const mainProductFiles = await fs.readdir(productManager.productsDir);
            const linkedProducts = [];
            
            for (const file of mainProductFiles) {
                if (!file.endsWith('.json')) continue;
                
                try {
                    const content = await fs.readFile(
                        path.join(productManager.productsDir, file), 
                        'utf8'
                    );
                    const mainProduct = JSON.parse(content);
                    
                    if (mainProduct.production_links?.productionDetails?.code === code ||
                        mainProduct.production_links?.productionDetails?.mc === productionProduct.mc) {
                        linkedProducts.push({
                            id: file.replace('.json', ''),
                            name: mainProduct.product_name,
                            url: mainProduct.url,
                            category: mainProduct.category,
                            linkDetails: {
                                linkedAt: mainProduct.production_links.linked_at,
                                hasPackDetails: !!mainProduct.production_pack_details,
                                hasPricing: !!mainProduct.production_pricing,
                                hasDimensions: !!mainProduct.production_dimensions
                            }
                        });
                    }
                } catch (error) {
                    logger.error(`Error processing file ${file}:`, error);
                    continue;
                }
            }
            
            res.json({
                success: true,
                productionProduct: {
                    code: productionProduct.code,
                    mc: productionProduct.mc,
                    name: productionProduct.name,
                    category: productionProduct.category,
                    specs: productionProduct.specs
                },
                linkedProducts: linkedProducts,
                totalLinked: linkedProducts.length
            });
            
        } catch (error) {
            logger.error('Error getting specific linkage info:', error);
            res.status(500).json({
                success: false,
                error: 'Error retrieving specific linkage information',
                details: error.message
            });
        }
    });

    // POST /api/products/link - Create product linkage
    router.post('/link', async (req, res) => {
        try {
            const { productionCode, mainProductId } = req.body;

            if (!productionCode || !mainProductId) {
                return res.status(400).json({
                    success: false,
                    error: 'Both production code and main product ID are required'
                });
            }

            const productionProduct = await productionHandler.getProduct(productionCode);
            if (!productionProduct) {
                return res.status(404).json({
                    success: false,
                    error: 'Production product not found'
                });
            }

            const mainProductPath = path.join(productManager.productsDir, `${mainProductId}.json`);
            let mainProduct;
            try {
                const content = await fs.readFile(mainProductPath, 'utf8');
                mainProduct = JSON.parse(content);
            } catch (error) {
                return res.status(404).json({
                    success: false,
                    error: 'Main product not found'
                });
            }

            const linkageMetadata = {
                linkedAt: new Date().toISOString(),
                productionDetails: {
                    code: productionProduct.code,
                    name: productionProduct.name,
                    specs: productionProduct.specs
                },
                mainProductDetails: {
                    id: mainProductId,
                    product_name: mainProduct.product_name
                }
            };

            mainProduct.production_links = linkageMetadata;
            await fs.writeFile(mainProductPath, JSON.stringify(mainProduct, null, 2));

            if (typeof productionHandler.saveLinkageRecord === 'function') {
                await productionHandler.saveLinkageRecord({
                    production_code: productionCode,
                    main_product_id: mainProductId,
                    metadata: linkageMetadata
                });
            }

            res.json({
                success: true,
                message: 'Products linked successfully',
                linkage: {
                    productionCode,
                    mainProductId,
                    linkedAt: linkageMetadata.linkedAt
                }
            });

        } catch (error) {
            logger.error('Error linking products:', error);
            res.status(500).json({
                success: false,
                error: 'Error linking products',
                details: error.message
            });
        }
    });

    // Error handling middleware
    router.use((err, req, res, next) => {
        logger.error('Linkage Routes Error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: err.message
        });
    });

    return router;
};