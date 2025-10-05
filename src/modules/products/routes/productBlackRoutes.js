const express = require('express');
const router = express.Router();
const { 
    getAllProducts, 
    getProductById, 
    getStoredStockData,
    syncMultipleStockData,
    getAllStoredStockSKUs,
    getAllUserInteractions,
    getUserInteractions,
    analyzeProductData,
    combineProductsWithInteractions,
    analyzeMovementHistory,
    findProductByUrlFuzzy
} = require('../services/productDataService');



router.get('/slow-move-analysis', async (req, res) => {
    try {
        const { category, limit = 50 } = req.query;
        const products = await getAllProducts();
        const allInteractions = await getAllUserInteractions();
        const analysis = analyzeProductData(products, allInteractions);
        
        // กรองตามหมวดหมู่ถ้าระบุ
        let slowMoveData = analysis.slowMoveCategories;
        if (category) {
            Object.keys(slowMoveData).forEach(key => {
                slowMoveData[key] = slowMoveData[key].filter(p => 
                    p.category?.toLowerCase().includes(category.toLowerCase())
                );
            });
        }
        
        // จำกัดจำนวนรายการต่อหมวดหมู่    
        Object.keys(slowMoveData).forEach(key => {
            slowMoveData[key] = slowMoveData[key].slice(0, parseInt(limit)).map(p => ({
                 id: p.id,
    name: p.product_name,
    sku: p.sku,
    category: p.category,
    stock: p.stock_quantity,
    daysSinceLastMovement: p.movementAnalysis.daysSinceLastMovement, // เปลี่ยนจาก daysSinceLastRestock
    daysSinceLastRestock: p.movementAnalysis.daysSinceLastRestock,
    latestMovement: p.movementAnalysis.latestMovement, // เพิ่มฟิลด์นี้
    lastRestockDate: p.movementAnalysis.lastRestockDate,
    slowMoveLevel: p.movementAnalysis.ageAnalysis.slowMoveLevel,
    salesVelocity: parseFloat((p.movementAnalysis?.salesVelocity || 0).toFixed(2)),
    totalSold: p.movementAnalysis?.totalSold || 0,
    averageRelevance: parseFloat((p.averageRelevance || 0).toFixed(4)),
    recentActivity: p.movementAnalysis?.recentActivity || false,
    hasStoredStock: !!p.stock_data,
    movementAnalysis: p.movementAnalysis,
    stock_data: p.stock_data,
    url: p.url
            }));
        });
        
        // สถิติรวม
        const summary = {
            totalProducts: analysis.totalProducts,
            totalWithRestockHistory: analysis.ageAnalysis.totalWithRestockHistory,
            averageDaysSinceRestock: analysis.ageAnalysis.averageDaysSinceRestock,
            
            categoryCounts: {
                normal: analysis.slowMoveCategories.normal.length,
                slowMove: analysis.slowMoveCategories.slowMove.length,
                verySlowMove1: analysis.slowMoveCategories.verySlowMove1.length,
                verySlowMove2: analysis.slowMoveCategories.verySlowMove2.length,
                verySlowMove3: analysis.slowMoveCategories.verySlowMove3.length,
                deadStock: analysis.slowMoveCategories.deadStock.length,
                noData: analysis.slowMoveCategories.noData.length
            },
            
            stockValue: {
                slowMove: analysis.slowMoveCategories.slowMove.reduce((sum, p) => sum + (p.stock_quantity || 0), 0),
                verySlowMove1: analysis.slowMoveCategories.verySlowMove1.reduce((sum, p) => sum + (p.stock_quantity || 0), 0),
                verySlowMove2: analysis.slowMoveCategories.verySlowMove2.reduce((sum, p) => sum + (p.stock_quantity || 0), 0),
                verySlowMove3: analysis.slowMoveCategories.verySlowMove3.reduce((sum, p) => sum + (p.stock_quantity || 0), 0),
                deadStock: analysis.slowMoveCategories.deadStock.reduce((sum, p) => sum + (p.stock_quantity || 0), 0)
            },
            
            oldestStock: analysis.ageAnalysis.oldestStock,
            newestStock: analysis.ageAnalysis.newestStock,
            
            percentages: {
                normal: ((analysis.slowMoveCategories.normal.length / analysis.totalProducts) * 100).toFixed(2) + '%',
                slowMove: ((analysis.slowMoveCategories.slowMove.length / analysis.totalProducts) * 100).toFixed(2) + '%',
                verySlowMove1: ((analysis.slowMoveCategories.verySlowMove1.length / analysis.totalProducts) * 100).toFixed(2) + '%',
                verySlowMove2: ((analysis.slowMoveCategories.verySlowMove2.length / analysis.totalProducts) * 100).toFixed(2) + '%',
                verySlowMove3: ((analysis.slowMoveCategories.verySlowMove3.length / analysis.totalProducts) * 100).toFixed(2) + '%',
                deadStock: ((analysis.slowMoveCategories.deadStock.length / analysis.totalProducts) * 100).toFixed(2) + '%',
                noData: ((analysis.slowMoveCategories.noData.length / analysis.totalProducts) * 100).toFixed(2) + '%'
            }
        };
        
        res.json({
            success: true,
            data: {
                summary,
                categories: slowMoveData,
                definitions: {
                    normal: 'สต็อกอายุ ≤ 60 วัน',
                    slowMove: 'สต็อกอายุ 61-90 วัน',
                    verySlowMove1: 'สต็อกอายุ 91-120 วัน',
                    verySlowMove2: 'สต็อกอายุ 121-150 วัน',
                    verySlowMove3: 'สต็อกอายุ 151-180 วัน',
                    deadStock: 'สต็อกอายุ > 180 วัน',
                    noData: 'ไม่มีข้อมูลการเติมสต็อก'
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการวิเคราะห์ slow move',
            error: error.message
        });
    }
});

// 📋 GET /api/products - ดึงข้อมูลสินค้าทั้งหมด
router.get('/products', async (req, res) => {
    try {
        const products = await getAllProducts();
        res.json({
            success: true,
            count: products.length,
            data: products,
            metadata: {
                with_stored_stock: products.filter(p => p.stock_data).length,
                without_stored_stock: products.filter(p => !p.stock_data).length,
                with_stock_history: products.filter(p => p.has_stock_history).length
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสินค้า',
            error: error.message
        });
    }
});

// 🔍 GET /api/products/:id - ดึงข้อมูลสินค้าตาม ID
router.get('/products/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await getProductById(productId);
        
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'ไม่พบข้อมูลสินค้า'
            });
        }

        res.json({
            success: true,
            data: product,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสินค้า',
            error: error.message
        });
    }
});

// 📦 GET /api/stock/:sku - ดึงข้อมูล stock จากไฟล์ที่บันทึกไว้
router.get('/stock/:sku', async (req, res) => {
    try {
        const sku = req.params.sku;
        const stockData = await getStoredStockData(sku);
        
        if (!stockData) {
            return res.status(404).json({
                success: false,
                message: 'ไม่พบข้อมูล stock สำหรับ SKU นี้ กรุณาทำการซิงข้อมูลก่อน'
            });
        }

        res.json({
            success: true,
            data: stockData,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูล stock',
            error: error.message
        });
    }
});

// 🔄 POST /api/sync-stock - ซิงข้อมูล stock จาก API และบันทึกลงไฟล์
router.post('/sync-stock', async (req, res) => {
    try {
        const { skus = [], productIds = [], syncAll = false } = req.body;
        
        let skusToSync = [...skus];
        
        // ถ้าต้องการซิงข้อมูลทั้งหมด
        if (syncAll) {
            const products = await getAllProducts();
            const allSKUs = products
                .filter(product => product.sku)
                .map(product => product.sku);
            skusToSync = [...new Set([...skusToSync, ...allSKUs])];
        }
        
        // ถ้าระบุ Product IDs ให้แปลงเป็น SKUs
        if (productIds.length > 0) {
            for (const productId of productIds) {
                const product = await getProductById(productId);
                if (product && product.sku) {
                    skusToSync.push(product.sku);
                }
            }
        }
        
        // ลบ SKU ซ้ำ
        skusToSync = [...new Set(skusToSync)];
        
        if (skusToSync.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'กรุณาระบุ SKUs, Product IDs หรือเลือก syncAll'
            });
        }
        
        console.log(`Starting sync for ${skusToSync.length} SKUs`);
        
        // ซิงข้อมูล stock
        const syncResults = await syncMultipleStockData(skusToSync);
        
        const summary = {
            total: skusToSync.length,
            success: syncResults.filter(r => r.success).length,
            failed: syncResults.filter(r => !r.success).length,
            results: syncResults
        };
        
        res.json({
            success: true,
            message: `ซิงข้อมูล stock เสร็จสิ้น: สำเร็จ ${summary.success}/${summary.total} รายการ`,
            data: summary,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการซิงข้อมูล stock',
            error: error.message
        });
    }
});

// 📊 GET /api/stock-status - ตรวจสอบสถานะข้อมูล stock ที่บันทึกไว้
router.get('/stock-status', async (req, res) => {
    try {
        const products = await getAllProducts();
        const storedSKUs = await getAllStoredStockSKUs();
        
        const status = {
            totalProducts: products.length,
            productsWithSKU: products.filter(p => p.sku).length,
            storedStockFiles: storedSKUs.length,
            missingStockData: [],
            outdatedStockData: [],
            recentlyUpdated: []
        };
        
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        for (const product of products) {
            if (product.sku) {
                const stockData = await getStoredStockData(product.sku);
                
                if (!stockData) {
                    status.missingStockData.push({
                        sku: product.sku,
                        productId: product.id,
                        productName: product.product_name
                    });
                } else {
                    const lastUpdated = new Date(stockData.sync_timestamp || stockData.last_updated);
                    
                    if (lastUpdated < oneWeekAgo) {
                        status.outdatedStockData.push({
                            sku: product.sku,
                            productId: product.id,
                            productName: product.product_name,
                            lastUpdated: stockData.sync_timestamp || stockData.last_updated,
                            daysOld: Math.floor((now - lastUpdated) / (24 * 60 * 60 * 1000))
                        });
                    } else if (lastUpdated > oneDayAgo) {
                        status.recentlyUpdated.push({
                            sku: product.sku,
                            productId: product.id,
                            productName: product.product_name,
                            lastUpdated: stockData.sync_timestamp || stockData.last_updated,
                            hoursAgo: Math.floor((now - lastUpdated) / (60 * 60 * 1000))
                        });
                    }
                }
            }
        }
        
        // เรียงลำดับ
        status.outdatedStockData.sort((a, b) => b.daysOld - a.daysOld);
        status.recentlyUpdated.sort((a, b) => a.hoursAgo - b.hoursAgo);
        
        res.json({
            success: true,
            data: status,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการตรวจสอบสถานะ stock',
            error: error.message
        });
    }
});

// 📈 GET /api/interactions - ดึงข้อมูล interactions ทั้งหมด
router.get('/interactions', async (req, res) => {
    try {
        const allInteractions = await getAllUserInteractions();
        
        // สร้างสถิติรวม
        let totalInteractions = 0;
        let totalProducts = new Set();
        
        Object.values(allInteractions).forEach(userData => {
            if (userData.products) {
                Object.entries(userData.products).forEach(([productId, data]) => {
                    totalInteractions += data.total_interactions || 0;
                    totalProducts.add(productId);
                });
            }
        });

        res.json({
            success: true,
            data: {
                users: allInteractions,
                summary: {
                    totalUsers: Object.keys(allInteractions).length,
                    totalInteractions: totalInteractions,
                    uniqueProducts: totalProducts.size
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูล interactions',
            error: error.message
        });
    }
});

// 👤 GET /api/interactions/:userId - ดึงข้อมูล interactions ของ user คนเดียว
router.get('/interactions/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const userInteractions = await getUserInteractions(userId);
        
        if (!userInteractions) {
            return res.status(404).json({
                success: false,
                message: 'ไม่พบข้อมูล interactions ของ user นี้'
            });
        }

        res.json({
            success: true,
            data: userInteractions,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูล interactions',
            error: error.message
        });
    }
});

// 📊 GET /api/analysis - วิเคราะห์ข้อมูลสินค้า
router.get('/analysis', async (req, res) => {
    try {
        const products = await getAllProducts();
        const allInteractions = await getAllUserInteractions();
        const analysis = analyzeProductData(products, allInteractions);
        
        res.json({
            success: true,
            data: analysis,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการวิเคราะห์ข้อมูล',
            error: error.message
        });
    }
});

// 🔥 GET /api/dashboard - ข้อมูลหลักสำหรับ dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const products = await getAllProducts();
        const allInteractions = await getAllUserInteractions();
        const analysis = analyzeProductData(products, allInteractions);

        // สร้างข้อมูลสำหรับ dashboard
        const dashboardData = {
            summary: {
                totalProducts: products.length,
                totalUsers: Object.keys(allInteractions).length,
                totalCategories: Object.keys(analysis.categories).length,
                lowStockCount: analysis.stockLevels.low.length,
                mediumStockCount: analysis.stockLevels.medium.length,
                highStockCount: analysis.stockLevels.high.length,
                deadStockCount: analysis.deadStock.length,
                hotProductsCount: analysis.hotProducts.length,
                totalInteractions: analysis.totalInteractions,
                totalQualityInteractions: analysis.totalQualityInteractions,
                totalUserInteractions: analysis.matchingStats.totalUserInteractions,
                totalSalesMovements: analysis.totalSalesMovements,
                totalSalesVolume: analysis.totalSalesVolume,
                productsWithInteractions: analysis.matchingStats.productsWithInteractions,
                productsWithQualityInteractions: analysis.matchingStats.productsWithQualityInteractions,
                productsWithMovementHistory: analysis.matchingStats.productsWithMovementHistory,
                productsWithRecentMovement: analysis.matchingStats.productsWithRecentMovement,
                productsWithStoredStock: analysis.matchingStats.productsWithStoredStock,
                productsWithoutStoredStock: analysis.matchingStats.productsWithoutStoredStock,
                productsWithStockHistory: analysis.matchingStats.productsWithStockHistory,
                productsWithRestockHistory: analysis.matchingStats.productsWithRestockHistory || 0,
                averageInteractionsPerProduct: analysis.matchingStats.averageInteractionsPerProduct,
                averageRelevanceOverall: analysis.matchingStats.averageRelevanceOverall,
                averageSalesVelocity: analysis.matchingStats.averageSalesVelocity,
                averageDaysSinceRestock: analysis.matchingStats.averageDaysSinceRestock || 0,
                
                // Slow Move Categories
                normalCount: analysis.slowMoveCategories?.normal?.length || 0,
                slowMoveCount: analysis.slowMoveCategories?.slowMove?.length || 0,
                verySlowMove1Count: analysis.slowMoveCategories?.verySlowMove1?.length || 0,
                verySlowMove2Count: analysis.slowMoveCategories?.verySlowMove2?.length || 0,
                verySlowMove3Count: analysis.slowMoveCategories?.verySlowMove3?.length || 0,
                noDataCount: analysis.slowMoveCategories?.noData?.length || 0,
                
                // เพิ่มอัตราส่วนต่างๆ
                matchingRate: ((analysis.matchingStats.productsWithInteractions / products.length) * 100).toFixed(2) + '%',
                qualityInteractionRate: ((analysis.matchingStats.productsWithQualityInteractions / products.length) * 100).toFixed(2) + '%',
                storedStockRate: ((analysis.matchingStats.productsWithStoredStock / products.length) * 100).toFixed(2) + '%',
                movementRate: ((analysis.matchingStats.productsWithMovementHistory / products.length) * 100).toFixed(2) + '%',
                restockHistoryRate: analysis.matchingStats.productsWithRestockHistory > 0 ? 
                    ((analysis.matchingStats.productsWithRestockHistory / products.length) * 100).toFixed(2) + '%' : '0%',
                
                // สถิติความสนใจ
                highInterestCount: analysis.interestLevels.highInterest.length,
                mediumInterestCount: analysis.interestLevels.mediumInterest.length,
                lowInterestCount: analysis.interestLevels.lowInterest.length,
                noInterestCount: analysis.interestLevels.noInterest.length,
                
                // สถิติ movement
                highMovementCount: analysis.movementLevels.highMovement.length,
                mediumMovementCount: analysis.movementLevels.mediumMovement.length,
                lowMovementCount: analysis.movementLevels.lowMovement.length,
                noMovementCount: analysis.movementLevels.noMovement.length,
                
                // Slow Move Percentages
                normalPercentage: ((analysis.slowMoveCategories?.normal?.length || 0) / products.length * 100).toFixed(2) + '%',
                slowMovePercentage: ((analysis.slowMoveCategories?.slowMove?.length || 0) / products.length * 100).toFixed(2) + '%',
                verySlowMove1Percentage: ((analysis.slowMoveCategories?.verySlowMove1?.length || 0) / products.length * 100).toFixed(2) + '%',
                verySlowMove2Percentage: ((analysis.slowMoveCategories?.verySlowMove2?.length || 0) / products.length * 100).toFixed(2) + '%',
                verySlowMove3Percentage: ((analysis.slowMoveCategories?.verySlowMove3?.length || 0) / products.length * 100).toFixed(2) + '%',
                deadStockPercentage: ((analysis.slowMoveCategories?.deadStock?.length || 0) / products.length * 100).toFixed(2) + '%',
                noDataPercentage: ((analysis.slowMoveCategories?.noData?.length || 0) / products.length * 100).toFixed(2) + '%',
                
                // Age Analysis Summary
                oldestStockDays: analysis.ageAnalysis?.oldestStock?.days || 0,
                newestStockDays: analysis.ageAnalysis?.newestStock?.days || 0,
                oldestStockName: analysis.ageAnalysis?.oldestStock?.name || null,
                newestStockName: analysis.ageAnalysis?.newestStock?.name || null,
                
                // Critical Alerts
                criticalSlowMoveCount: (analysis.slowMoveCategories?.verySlowMove3?.length || 0) + 
                                     (analysis.slowMoveCategories?.deadStock?.length || 0),
                alertSlowMoveCount: (analysis.slowMoveCategories?.slowMove?.length || 0) + 
                                   (analysis.slowMoveCategories?.verySlowMove1?.length || 0) + 
                                   (analysis.slowMoveCategories?.verySlowMove2?.length || 0),
                
                // Stock Value Summary (ถ้ามีข้อมูลราคา)
                totalStockValue: 0, // คำนวณจากราคา × จำนวน
                slowMoveStockValue: 0,
                deadStockValue: 0
            },
            
            topCategories: Object.entries(analysis.categories)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([name, count]) => ({ name, count })),
            
            // สินค้าที่มีความสนใจสูง (relevance > 0.25)
            qualityInteractionProducts: analysis.qualityInteractions.slice(0, 10).map(p => ({
                id: p.id,
                name: p.product_name,
                sku: p.sku,
                stock: p.stock_quantity,
                category: p.category,
                interactions: p.totalInteractions,
                userInteractions: p.userInteractions?.length || 0,
                averageRelevance: parseFloat(p.averageRelevance.toFixed(4)),
                userCount: p.userCount,
                hasStoredStock: !!p.stock_data,
                hasStockHistory: p.has_stock_history,
                stockLastUpdated: p.stock_last_updated,
                stockSyncTimestamp: p.stock_sync_timestamp,
                salesVelocity: p.movementAnalysis?.salesVelocity || 0,
                totalSold: p.movementAnalysis?.totalSold || 0,
                movementFrequency: p.movementAnalysis?.movementFrequency || 0,
                recentActivity: p.movementAnalysis?.recentActivity || false,
                movementAnalysis: p.movementAnalysis,
                stock_data: p.stock_data,
                interestLevel: p.averageRelevance > 0.7 ? 'สูง' : 
                              p.averageRelevance > 0.5 ? 'ปานกลาง' : 'ต่ำ'
            })),
            
            // Hot Products ใหม่ - ตาม movement history และ relevance > 0.25
            hotProducts: analysis.hotProducts.slice(0, 15).map(p => ({
                id: p.id,
                name: p.product_name,
                sku: p.sku,
                stock: p.stock_quantity,
                category: p.category,
                interactions: p.totalInteractions,
                userInteractions: p.userInteractions?.length || 0,
                averageRelevance: parseFloat(p.averageRelevance.toFixed(4)),
                userCount: p.userCount,
                hasStoredStock: !!p.stock_data,
                hasStockHistory: p.has_stock_history,
                stockLastUpdated: p.stock_last_updated,
                stockSyncTimestamp: p.stock_sync_timestamp,
                
                // ข้อมูล movement analysis
                salesVelocity: parseFloat((p.movementAnalysis?.salesVelocity || 0).toFixed(2)),
                totalSold: p.movementAnalysis?.totalSold || 0,
                movementFrequency: parseFloat((p.movementAnalysis?.movementFrequency || 0).toFixed(2)),
                recentActivity: p.movementAnalysis?.recentActivity || false,
                orderCompletions: p.movementAnalysis?.orderCompletions || 0,
                averageOrderSize: parseFloat((p.movementAnalysis?.averageOrderSize || 0).toFixed(2)),
                hotScore: parseFloat((p.hotScore || 0).toFixed(1)),
                lastMovementDate: p.movementAnalysis?.lastMovementDate,
                movementAnalysis: p.movementAnalysis,
                stock_data: p.stock_data,
                
                interestLevel: p.averageRelevance > 0.7 ? 'สูง' : 
                              p.averageRelevance > 0.5 ? 'ปานกลาง' : 'ต่ำ'
            })),
            
            // Top Movement Products
            topMovementProducts: analysis.movementLevels.highMovement.slice(0, 10).map(p => ({
                id: p.id,
                name: p.product_name,
                sku: p.sku,
                stock: p.stock_quantity,
                category: p.category,
                salesVelocity: parseFloat((p.movementAnalysis?.salesVelocity || 0).toFixed(2)),
                totalSold: p.movementAnalysis?.totalSold || 0,
                movementFrequency: parseFloat((p.movementAnalysis?.movementFrequency || 0).toFixed(2)),
                averageRelevance: parseFloat((p.averageRelevance || 0).toFixed(4)),
                recentActivity: p.movementAnalysis?.recentActivity || false,
                hotScore: parseFloat((p.hotScore || 0).toFixed(1)),
                movementAnalysis: p.movementAnalysis,
                stock_data: p.stock_data
            })),
            
            lowStockProducts: analysis.stockLevels.low.slice(0, 10).map(p => ({
                id: p.id,
                name: p.product_name,
                sku: p.sku,
                stock: p.stock_quantity,
                category: p.category,
                interactions: p.totalInteractions,
                userInteractions: p.userInteractions?.length || 0,
                averageRelevance: parseFloat((p.averageRelevance || 0).toFixed(4)),
                userCount: p.userCount,
                hasStoredStock: !!p.stock_data,
                hasStockHistory: p.has_stock_history,
                stockLastUpdated: p.stock_last_updated,
                stockSyncTimestamp: p.stock_sync_timestamp,
                salesVelocity: p.movementAnalysis?.salesVelocity || 0,
                totalSold: p.movementAnalysis?.totalSold || 0,
                recentActivity: p.movementAnalysis?.recentActivity || false,
                movementAnalysis: p.movementAnalysis,
                stock_data: p.stock_data,
                interestLevel: p.averageRelevance > 0.7 ? 'สูง' : 
                              p.averageRelevance > 0.5 ? 'ปานกลาง' : 
                              p.averageRelevance > 0.25 ? 'ต่ำ' : 'ไม่มี'
            })),
            
            highStockProducts: analysis.stockLevels.high.slice(0, 10).map(p => ({
                id: p.id,
                name: p.product_name,
                sku: p.sku,
                stock: p.stock_quantity,
                category: p.category,
                interactions: p.totalInteractions,
                userInteractions: p.userInteractions?.length || 0,
                averageRelevance: parseFloat((p.averageRelevance || 0).toFixed(4)),
                userCount: p.userCount,
                hasStoredStock: !!p.stock_data,
                hasStockHistory: p.has_stock_history,
                stockLastUpdated: p.stock_last_updated,
                stockSyncTimestamp: p.stock_sync_timestamp,
                salesVelocity: p.movementAnalysis?.salesVelocity || 0,
                totalSold: p.movementAnalysis?.totalSold || 0,
                recentActivity: p.movementAnalysis?.recentActivity || false,
                movementAnalysis: p.movementAnalysis,
                stock_data: p.stock_data,
                interestLevel: p.averageRelevance > 0.7 ? 'สูง' : 
                              p.averageRelevance > 0.5 ? 'ปานกลาง' : 
                              p.averageRelevance > 0.25 ? 'ต่ำ' : 'ไม่มี'
            })),
            
            deadStockProducts: analysis.deadStock.slice(0, 10).map(p => ({
                id: p.id,
                name: p.product_name,
                sku: p.sku,
                stock: p.stock_quantity,
                category: p.category,
                interactions: p.totalInteractions,
                userInteractions: p.userInteractions?.length || 0,
                averageRelevance: parseFloat((p.averageRelevance || 0).toFixed(4)),
                userCount: p.userCount,
                hasStoredStock: !!p.stock_data,
                hasStockHistory: p.has_stock_history,
                stockLastUpdated: p.stock_last_updated,
                stockSyncTimestamp: p.stock_sync_timestamp,
                salesVelocity: p.movementAnalysis?.salesVelocity || 0,
                totalSold: p.movementAnalysis?.totalSold || 0,
                movementFrequency: p.movementAnalysis?.movementFrequency || 0,
                movementAnalysis: p.movementAnalysis,
                stock_data: p.stock_data
            })),
            
            // Slow Move Products Summary
            slowMoveProducts: {
                normal: analysis.slowMoveCategories?.normal?.slice(0, 5).map(p => ({
                    id: p.id,
                    name: p.product_name,
                    sku: p.sku,
                    stock: p.stock_quantity,
                    category: p.category,
                    daysSinceLastRestock: p.movementAnalysis?.daysSinceLastRestock || 0,
                    lastRestockDate: p.movementAnalysis?.lastRestockDate,
                    salesVelocity: p.movementAnalysis?.salesVelocity || 0,
                    averageRelevance: parseFloat((p.averageRelevance || 0).toFixed(4)),
                    movementAnalysis: p.movementAnalysis,
                    stock_data: p.stock_data
                })) || [],
                
                slowMove: analysis.slowMoveCategories?.slowMove?.slice(0, 5).map(p => ({
                    id: p.id,
                    name: p.product_name,
                    sku: p.sku,
                    stock: p.stock_quantity,
                    category: p.category,
                    daysSinceLastRestock: p.movementAnalysis?.daysSinceLastRestock || 0,
                    lastRestockDate: p.movementAnalysis?.lastRestockDate,
                    salesVelocity: p.movementAnalysis?.salesVelocity || 0,
                    averageRelevance: parseFloat((p.averageRelevance || 0).toFixed(4)),
                    movementAnalysis: p.movementAnalysis,
                    stock_data: p.stock_data
                })) || [],
                
                verySlowMove1: analysis.slowMoveCategories?.verySlowMove1?.slice(0, 5).map(p => ({
                    id: p.id,
                    name: p.product_name,
                    sku: p.sku,
                    stock: p.stock_quantity,
                    category: p.category,
                    daysSinceLastRestock: p.movementAnalysis?.daysSinceLastRestock || 0,
                    lastRestockDate: p.movementAnalysis?.lastRestockDate,
                    salesVelocity: p.movementAnalysis?.salesVelocity || 0,
                    averageRelevance: parseFloat((p.averageRelevance || 0).toFixed(4)),
                    movementAnalysis: p.movementAnalysis,
                    stock_data: p.stock_data
                })) || [],
                
                verySlowMove2: analysis.slowMoveCategories?.verySlowMove2?.slice(0, 5).map(p => ({
                    id: p.id,
                    name: p.product_name,
                    sku: p.sku,
                    stock: p.stock_quantity,
                    category: p.category,
                    daysSinceLastRestock: p.movementAnalysis?.daysSinceLastRestock || 0,
                    lastRestockDate: p.movementAnalysis?.lastRestockDate,
                    salesVelocity: p.movementAnalysis?.salesVelocity || 0,
                    averageRelevance: parseFloat((p.averageRelevance || 0).toFixed(4)),
                    movementAnalysis: p.movementAnalysis,
                    stock_data: p.stock_data
                })) || [],
                
                verySlowMove3: analysis.slowMoveCategories?.verySlowMove3?.slice(0, 5).map(p => ({
                    id: p.id,
                    name: p.product_name,
                    sku: p.sku,
                    stock: p.stock_quantity,
                    category: p.category,
                    daysSinceLastRestock: p.movementAnalysis?.daysSinceLastRestock || 0,
                    lastRestockDate: p.movementAnalysis?.lastRestockDate,
                    salesVelocity: p.movementAnalysis?.salesVelocity || 0,
                    averageRelevance: parseFloat((p.averageRelevance || 0).toFixed(4)),
                    movementAnalysis: p.movementAnalysis,
                    stock_data: p.stock_data
                })) || [],
                
                deadStock: analysis.slowMoveCategories?.deadStock?.slice(0, 5).map(p => ({
                    id: p.id,
                    name: p.product_name,
                    sku: p.sku,
                    stock: p.stock_quantity,
                    category: p.category,
                    daysSinceLastRestock: p.movementAnalysis?.daysSinceLastRestock || 0,
                    lastRestockDate: p.movementAnalysis?.lastRestockDate,
                    salesVelocity: p.movementAnalysis?.salesVelocity || 0,
                    averageRelevance: parseFloat((p.averageRelevance || 0).toFixed(4)),
                    movementAnalysis: p.movementAnalysis,
                    stock_data: p.stock_data
                })) || []
            },
            
            // สถิติความสนใจและ movement แยกตามระดับ
            interestLevelStats: {
                highInterest: {
                    count: analysis.interestLevels.highInterest.length,
                    totalInteractions: analysis.interestLevels.highInterest.reduce((sum, p) => sum + p.totalInteractions, 0),
                    totalSalesVolume: analysis.interestLevels.highInterest.reduce((sum, p) => sum + (p.movementAnalysis?.totalSold || 0), 0),
                    avgRelevance: analysis.interestLevels.highInterest.length > 0 ? 
                        (analysis.interestLevels.highInterest.reduce((sum, p) => sum + p.averageRelevance, 0) / analysis.interestLevels.highInterest.length).toFixed(4) : '0.0000'
                },
                mediumInterest: {
                    count: analysis.interestLevels.mediumInterest.length,
                    totalInteractions: analysis.interestLevels.mediumInterest.reduce((sum, p) => sum + p.totalInteractions, 0),
                    totalSalesVolume: analysis.interestLevels.mediumInterest.reduce((sum, p) => sum + (p.movementAnalysis?.totalSold || 0), 0),
                    avgRelevance: analysis.interestLevels.mediumInterest.length > 0 ? 
                        (analysis.interestLevels.mediumInterest.reduce((sum, p) => sum + p.averageRelevance, 0) / analysis.interestLevels.mediumInterest.length).toFixed(4) : '0.0000'
                },
                lowInterest: {
                    count: analysis.interestLevels.lowInterest.length,
                    totalInteractions: analysis.interestLevels.lowInterest.reduce((sum, p) => sum + p.totalInteractions, 0),
                    totalSalesVolume: analysis.interestLevels.lowInterest.reduce((sum, p) => sum + (p.movementAnalysis?.totalSold || 0), 0),
                    avgRelevance: analysis.interestLevels.lowInterest.length > 0 ? 
                        (analysis.interestLevels.lowInterest.reduce((sum, p) => sum + p.averageRelevance, 0) / analysis.interestLevels.lowInterest.length).toFixed(4) : '0.0000'
                },
                noInterest: {
                    count: analysis.interestLevels.noInterest.length,
                    totalInteractions: analysis.interestLevels.noInterest.reduce((sum, p) => sum + p.totalInteractions, 0),
                    totalSalesVolume: analysis.interestLevels.noInterest.reduce((sum, p) => sum + (p.movementAnalysis?.totalSold || 0), 0),
                    avgRelevance: '0.0000'
                }
            },
            
            movementLevelStats: {
                highMovement: {
                    count: analysis.movementLevels.highMovement.length,
                    totalSalesVolume: analysis.movementLevels.highMovement.reduce((sum, p) => sum + (p.movementAnalysis?.totalSold || 0), 0),
                    avgSalesVelocity: analysis.movementLevels.highMovement.length > 0 ? 
                        (analysis.movementLevels.highMovement.reduce((sum, p) => sum + (p.movementAnalysis?.salesVelocity || 0), 0) / analysis.movementLevels.highMovement.length).toFixed(2) : '0.00'
                },
                mediumMovement: {
                    count: analysis.movementLevels.mediumMovement.length,
                    totalSalesVolume: analysis.movementLevels.mediumMovement.reduce((sum, p) => sum + (p.movementAnalysis?.totalSold || 0), 0),
                    avgSalesVelocity: analysis.movementLevels.mediumMovement.length > 0 ? 
                        (analysis.movementLevels.mediumMovement.reduce((sum, p) => sum + (p.movementAnalysis?.salesVelocity || 0), 0) / analysis.movementLevels.mediumMovement.length).toFixed(2) : '0.00'
                },
                lowMovement: {
                    count: analysis.movementLevels.lowMovement.length,
                    totalSalesVolume: analysis.movementLevels.lowMovement.reduce((sum, p) => sum + (p.movementAnalysis?.totalSold || 0), 0),
                    avgSalesVelocity: analysis.movementLevels.lowMovement.length > 0 ? 
                        (analysis.movementLevels.lowMovement.reduce((sum, p) => sum + (p.movementAnalysis?.salesVelocity || 0), 0) / analysis.movementLevels.lowMovement.length).toFixed(2) : '0.00'
                },
                noMovement: {
                    count: analysis.movementLevels.noMovement.length,
                    totalSalesVolume: 0,
                    avgSalesVelocity: '0.00'
                }
            },
            
            // Slow Move Level Stats
            slowMoveLevelStats: {
                normal: {
                    count: analysis.slowMoveCategories?.normal?.length || 0,
                    totalStock: analysis.slowMoveCategories?.normal?.reduce((sum, p) => sum + (p.stock_quantity || 0), 0) || 0,
                    avgDaysSinceRestock: analysis.slowMoveCategories?.normal?.length > 0 ? 
                        (analysis.slowMoveCategories.normal.reduce((sum, p) => sum + (p.movementAnalysis?.daysSinceLastRestock || 0), 0) / analysis.slowMoveCategories.normal.length).toFixed(1) : '0.0'
                },
                slowMove: {
                    count: analysis.slowMoveCategories?.slowMove?.length || 0,
                    totalStock: analysis.slowMoveCategories?.slowMove?.reduce((sum, p) => sum + (p.stock_quantity || 0), 0) || 0,
                    avgDaysSinceRestock: analysis.slowMoveCategories?.slowMove?.length > 0 ? 
                        (analysis.slowMoveCategories.slowMove.reduce((sum, p) => sum + (p.movementAnalysis?.daysSinceLastRestock || 0), 0) / analysis.slowMoveCategories.slowMove.length).toFixed(1) : '0.0'
                },
                verySlowMove1: {
                    count: analysis.slowMoveCategories?.verySlowMove1?.length || 0,
                    totalStock: analysis.slowMoveCategories?.verySlowMove1?.reduce((sum, p) => sum + (p.stock_quantity || 0), 0) || 0,
                    avgDaysSinceRestock: analysis.slowMoveCategories?.verySlowMove1?.length > 0 ? 
                        (analysis.slowMoveCategories.verySlowMove1.reduce((sum, p) => sum + (p.movementAnalysis?.daysSinceLastRestock || 0), 0) / analysis.slowMoveCategories.verySlowMove1.length).toFixed(1) : '0.0'
                },
                verySlowMove2: {
                    count: analysis.slowMoveCategories?.verySlowMove2?.length || 0,
                    totalStock: analysis.slowMoveCategories?.verySlowMove2?.reduce((sum, p) => sum + (p.stock_quantity || 0), 0) || 0,
                    avgDaysSinceRestock: analysis.slowMoveCategories?.verySlowMove2?.length > 0 ? 
                        (analysis.slowMoveCategories.verySlowMove2.reduce((sum, p) => sum + (p.movementAnalysis?.daysSinceLastRestock || 0), 0) / analysis.slowMoveCategories.verySlowMove2.length).toFixed(1) : '0.0'
                },
                verySlowMove3: {
                    count: analysis.slowMoveCategories?.verySlowMove3?.length || 0,
                    totalStock: analysis.slowMoveCategories?.verySlowMove3?.reduce((sum, p) => sum + (p.stock_quantity || 0), 0) || 0,
                    avgDaysSinceRestock: analysis.slowMoveCategories?.verySlowMove3?.length > 0 ? 
                        (analysis.slowMoveCategories.verySlowMove3.reduce((sum, p) => sum + (p.movementAnalysis?.daysSinceLastRestock || 0), 0) / analysis.slowMoveCategories.verySlowMove3.length).toFixed(1) : '0.0'
                },
                deadStock: {
                    count: analysis.slowMoveCategories?.deadStock?.length || 0,
                    totalStock: analysis.slowMoveCategories?.deadStock?.reduce((sum, p) => sum + (p.stock_quantity || 0), 0) || 0,
                    avgDaysSinceRestock: analysis.slowMoveCategories?.deadStock?.length > 0 ? 
                        (analysis.slowMoveCategories.deadStock.reduce((sum, p) => sum + (p.movementAnalysis?.daysSinceLastRestock || 0), 0) / analysis.slowMoveCategories.deadStock.length).toFixed(1) : '0.0'
                }
            },
            
            // Age Distribution
            ageDistribution: analysis.ageAnalysis?.distributionByAge || {
                '0-30': 0,
                '31-60': 0,
                '61-90': 0,
                '91-120': 0,
                '121-150': 0,
                '151-180': 0,
                '181+': 0
            }
        };

        res.json({
           success: true,
           data: dashboardData,
           timestamp: new Date().toISOString()
       });
   } catch (error) {
       res.status(500).json({
           success: false,
           message: 'เกิดข้อผิดพลาดในการสร้าง dashboard',
           error: error.message
       });
   }
});


// 🎯 GET /api/quality-interactions - ดึงสินค้าที่มี quality interactions (relevance > 0.25)
router.get('/quality-interactions', async (req, res) => {
    try {
        const { limit = 50, sortBy = 'relevance' } = req.query;
        const products = await getAllProducts();
        const allInteractions = await getAllUserInteractions();
        const analysis = analyzeProductData(products, allInteractions);
        
        let qualityProducts = analysis.qualityInteractions;
        
        // เรียงลำดับ
        switch (sortBy) {
            case 'relevance':
                qualityProducts.sort((a, b) => b.averageRelevance - a.averageRelevance);
                break;
            case 'interactions':
                qualityProducts.sort((a, b) => b.totalInteractions - a.totalInteractions);
                break;
            case 'users':
                qualityProducts.sort((a, b) => b.userCount - a.userCount);
                break;
            case 'stock':
                qualityProducts.sort((a, b) => (a.stock_quantity || 0) - (b.stock_quantity || 0));
               break;
           case 'sales':
               qualityProducts.sort((a, b) => (b.movementAnalysis?.salesVelocity || 0) - (a.movementAnalysis?.salesVelocity || 0));
               break;
           case 'hotScore':
               qualityProducts.sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0));
               break;
           default:
               qualityProducts.sort((a, b) => b.averageRelevance - a.averageRelevance);
       }
       
       const limitedProducts = qualityProducts.slice(0, parseInt(limit));
       
       res.json({
           success: true,
           count: limitedProducts.length,
           total: qualityProducts.length,
           data: limitedProducts.map(p => ({
               id: p.id,
               name: p.product_name,
               sku: p.sku,
               category: p.category,
               stock: p.stock_quantity,
               totalInteractions: p.totalInteractions,
               userInteractions: p.userInteractions?.length || 0,
               averageRelevance: parseFloat(p.averageRelevance.toFixed(4)),
               userCount: p.userCount,
               hasStoredStock: !!p.stock_data,
               hasStockHistory: p.has_stock_history,
               stockLastUpdated: p.stock_last_updated,
               stockSyncTimestamp: p.stock_sync_timestamp,
               salesVelocity: parseFloat((p.movementAnalysis?.salesVelocity || 0).toFixed(2)),
               totalSold: p.movementAnalysis?.totalSold || 0,
               movementFrequency: parseFloat((p.movementAnalysis?.movementFrequency || 0).toFixed(2)),
               recentActivity: p.movementAnalysis?.recentActivity || false,
               hotScore: parseFloat((p.hotScore || 0).toFixed(1)),
               interestLevel: p.averageRelevance > 0.7 ? 'สูง' : 
                             p.averageRelevance > 0.5 ? 'ปานกลาง' : 'ต่ำ',
               url: p.url
           })),
           summary: {
               totalQualityProducts: qualityProducts.length,
               averageRelevance: qualityProducts.length > 0 ? 
                   (qualityProducts.reduce((sum, p) => sum + p.averageRelevance, 0) / qualityProducts.length).toFixed(4) : '0.0000',
               totalInteractions: qualityProducts.reduce((sum, p) => sum + p.totalInteractions, 0),
               totalUserInteractions: qualityProducts.reduce((sum, p) => sum + (p.userInteractions?.length || 0), 0),
               totalSalesVolume: qualityProducts.reduce((sum, p) => sum + (p.movementAnalysis?.totalSold || 0), 0),
               averageSalesVelocity: qualityProducts.length > 0 ? 
                   (qualityProducts.reduce((sum, p) => sum + (p.movementAnalysis?.salesVelocity || 0), 0) / qualityProducts.length).toFixed(2) : '0.00'
           },
           query: { limit, sortBy },
           timestamp: new Date().toISOString()
       });
   } catch (error) {
       res.status(500).json({
           success: false,
           message: 'เกิดข้อผิดพลาดในการดึงข้อมูล quality interactions',
           error: error.message
       });
   }
});

// 🔥 GET /api/hot-products - ดึงสินค้า Hot Products ตามเกณฑ์ใหม่
router.get('/hot-products', async (req, res) => {
   try {
       const { limit = 50, sortBy = 'hotScore' } = req.query;
       const products = await getAllProducts();
       const allInteractions = await getAllUserInteractions();
       const analysis = analyzeProductData(products, allInteractions);
       
       let hotProducts = analysis.hotProducts;
       
       // เรียงลำดับ
       switch (sortBy) {
           case 'hotScore':
               hotProducts.sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0));
               break;
           case 'salesVelocity':
               hotProducts.sort((a, b) => (b.movementAnalysis?.salesVelocity || 0) - (a.movementAnalysis?.salesVelocity || 0));
               break;
           case 'relevance':
               hotProducts.sort((a, b) => b.averageRelevance - a.averageRelevance);
               break;
           case 'totalSold':
               hotProducts.sort((a, b) => (b.movementAnalysis?.totalSold || 0) - (a.movementAnalysis?.totalSold || 0));
               break;
           case 'interactions':
               hotProducts.sort((a, b) => b.totalInteractions - a.totalInteractions);
               break;
           default:
               hotProducts.sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0));
       }
       
       const limitedProducts = hotProducts.slice(0, parseInt(limit));
       
       res.json({
           success: true,
           count: limitedProducts.length,
           total: hotProducts.length,
           data: limitedProducts.map(p => ({
               id: p.id,
               name: p.product_name,
               sku: p.sku,
               category: p.category,
               stock: p.stock_quantity,
               totalInteractions: p.totalInteractions,
               userInteractions: p.userInteractions?.length || 0,
               averageRelevance: parseFloat(p.averageRelevance.toFixed(4)),
               userCount: p.userCount,
               hasStoredStock: !!p.stock_data,
               hasStockHistory: p.has_stock_history,
               stockLastUpdated: p.stock_last_updated,
               stockSyncTimestamp: p.stock_sync_timestamp,
               
               // Movement Analysis
               salesVelocity: parseFloat((p.movementAnalysis?.salesVelocity || 0).toFixed(2)),
               totalSold: p.movementAnalysis?.totalSold || 0,
               movementFrequency: parseFloat((p.movementAnalysis?.movementFrequency || 0).toFixed(2)),
               recentActivity: p.movementAnalysis?.recentActivity || false,
               orderCompletions: p.movementAnalysis?.orderCompletions || 0,
               averageOrderSize: parseFloat((p.movementAnalysis?.averageOrderSize || 0).toFixed(2)),
               lastMovementDate: p.movementAnalysis?.lastMovementDate,
               
               // Hot Product Score
               hotScore: parseFloat((p.hotScore || 0).toFixed(1)),
               
               interestLevel: p.averageRelevance > 0.7 ? 'สูง' : 
                             p.averageRelevance > 0.5 ? 'ปานกลาง' : 'ต่ำ',
               url: p.url
           })),
           summary: {
               totalHotProducts: hotProducts.length,
               averageHotScore: hotProducts.length > 0 ? 
                   (hotProducts.reduce((sum, p) => sum + (p.hotScore || 0), 0) / hotProducts.length).toFixed(1) : '0.0',
               averageRelevance: hotProducts.length > 0 ? 
                   (hotProducts.reduce((sum, p) => sum + p.averageRelevance, 0) / hotProducts.length).toFixed(4) : '0.0000',
               totalSalesVolume: hotProducts.reduce((sum, p) => sum + (p.movementAnalysis?.totalSold || 0), 0),
               averageSalesVelocity: hotProducts.length > 0 ? 
                   (hotProducts.reduce((sum, p) => sum + (p.movementAnalysis?.salesVelocity || 0), 0) / hotProducts.length).toFixed(2) : '0.00',
               totalInteractions: hotProducts.reduce((sum, p) => sum + p.totalInteractions, 0),
               recentActivityCount: hotProducts.filter(p => p.movementAnalysis?.recentActivity).length
           },
           query: { limit, sortBy },
           timestamp: new Date().toISOString()
       });
   } catch (error) {
       res.status(500).json({
           success: false,
           message: 'เกิดข้อผิดพลาดในการดึงข้อมูล hot products',
           error: error.message
       });
   }
});

// 📊 GET /api/movement-analysis - วิเคราะห์ movement history
router.get('/movement-analysis', async (req, res) => {
   try {
       const { sku, period = 30 } = req.query;
       
       if (sku) {
           // วิเคราะห์ movement สำหรับ SKU เดียว
           const stockData = await getStoredStockData(sku);
           if (!stockData) {
               return res.status(404).json({
                   success: false,
                   message: 'ไม่พบข้อมูล stock สำหรับ SKU นี้'
               });
           }
           
           const movementAnalysis = analyzeMovementHistory(stockData.movement_history, parseInt(period));
           
           res.json({
               success: true,
               data: {
                   sku: sku,
                   period: parseInt(period),
                   analysis: movementAnalysis,
                   movementHistory: stockData.movement_history
               },
               timestamp: new Date().toISOString()
           });
       } else {
           // วิเคราะห์ movement สำหรับสินค้าทั้งหมด
           const products = await getAllProducts();
           const allInteractions = await getAllUserInteractions();
           const analysis = analyzeProductData(products, allInteractions);
           
           const movementSummary = {
               totalProducts: products.length,
               productsWithMovement: analysis.matchingStats.productsWithMovementHistory,
               productsWithRecentActivity: analysis.matchingStats.productsWithRecentMovement,
               totalSalesVolume: analysis.totalSalesVolume,
               totalSalesMovements: analysis.totalSalesMovements,
               averageSalesVelocity: analysis.matchingStats.averageSalesVelocity,
               
               movementLevels: {
                   high: {
                       count: analysis.movementLevels.highMovement.length,
                       totalSales: analysis.movementLevels.highMovement.reduce((sum, p) => sum + (p.movementAnalysis?.totalSold || 0), 0),
                       avgVelocity: analysis.movementLevels.highMovement.length > 0 ? 
                           (analysis.movementLevels.highMovement.reduce((sum, p) => sum + (p.movementAnalysis?.salesVelocity || 0), 0) / analysis.movementLevels.highMovement.length).toFixed(2) : '0.00'
                   },
                   medium: {
                       count: analysis.movementLevels.mediumMovement.length,
                       totalSales: analysis.movementLevels.mediumMovement.reduce((sum, p) => sum + (p.movementAnalysis?.totalSold || 0), 0),
                       avgVelocity: analysis.movementLevels.mediumMovement.length > 0 ? 
                           (analysis.movementLevels.mediumMovement.reduce((sum, p) => sum + (p.movementAnalysis?.salesVelocity || 0), 0) / analysis.movementLevels.mediumMovement.length).toFixed(2) : '0.00'
                   },
                   low: {
                       count: analysis.movementLevels.lowMovement.length,
                       totalSales: analysis.movementLevels.lowMovement.reduce((sum, p) => sum + (p.movementAnalysis?.totalSold || 0), 0),
                       avgVelocity: analysis.movementLevels.lowMovement.length > 0 ? 
                           (analysis.movementLevels.lowMovement.reduce((sum, p) => sum + (p.movementAnalysis?.salesVelocity || 0), 0) / analysis.movementLevels.lowMovement.length).toFixed(2) : '0.00'
                   },
                   none: {
                       count: analysis.movementLevels.noMovement.length,
                       totalSales: 0,
                       avgVelocity: '0.00'
                   }
               },
               
               topMovers: analysis.movementLevels.highMovement.slice(0, 10).map(p => ({
                   id: p.id,
                   name: p.product_name,
                   sku: p.sku,
                   salesVelocity: parseFloat((p.movementAnalysis?.salesVelocity || 0).toFixed(2)),
                   totalSold: p.movementAnalysis?.totalSold || 0,
                   movementFrequency: parseFloat((p.movementAnalysis?.movementFrequency || 0).toFixed(2)),
                   averageOrderSize: parseFloat((p.movementAnalysis?.averageOrderSize || 0).toFixed(2)),
                   recentActivity: p.movementAnalysis?.recentActivity || false
               }))
           };
           
           res.json({
               success: true,
               data: movementSummary,
               period: parseInt(period),
               timestamp: new Date().toISOString()
           });
       }
   } catch (error) {
       res.status(500).json({
           success: false,
           message: 'เกิดข้อผิดพลาดในการวิเคราะห์ movement',
           error: error.message
       });
   }
});

// 🔍 GET /api/debug/mapping - ตรวจสอบการจับคู่ข้อมูล
router.get('/debug/mapping', async (req, res) => {
   try {
       const products = await getAllProducts();
       const allInteractions = await getAllUserInteractions();
       
       // สร้าง URL mapping
       const productByUrl = new Map();
       const urlStats = {
           totalProducts: products.length,
           productsWithUrl: 0,
           productsWithStoredStock: products.filter(p => p.stock_data).length,
           productsWithoutStoredStock: products.filter(p => !p.stock_data).length,
           productsWithStockHistory: products.filter(p => p.has_stock_history).length,
           sampleProducts: [],
           interactionUrls: new Set(),
           matchedUrls: new Set(),
           unmatchedUrls: new Set()
       };
       
       products.forEach(product => {
           if (product.url) {
               productByUrl.set(product.url, product.id);
               urlStats.productsWithUrl++;
               if (urlStats.sampleProducts.length < 5) {
                   urlStats.sampleProducts.push({
                       id: product.id,
                       name: product.product_name,
                       sku: product.sku,
                       url: product.url,
                       stock: product.stock_quantity,
                       hasStoredStock: !!product.stock_data,
                       hasStockHistory: product.has_stock_history,
                       stockLastUpdated: product.stock_last_updated,
                       stockSyncTimestamp: product.stock_sync_timestamp
                   });
               }
           }
       });
       
       // รวบรวม URLs จาก interactions
       Object.values(allInteractions).forEach(userData => {
           if (userData.products) {
               Object.values(userData.products).forEach(interactionData => {
                   if (interactionData.interactions) {
                       interactionData.interactions.forEach(interaction => {
                           const url = interaction.context?.url;
                           if (url) {
                               urlStats.interactionUrls.add(url);
                               
                               if (productByUrl.has(url) || findProductByUrlFuzzy(url, productByUrl)) {
                                   urlStats.matchedUrls.add(url);
                               } else {
                                   urlStats.unmatchedUrls.add(url);
                               }
                           }
                       });
                   }
               });
           }
       });
       
       res.json({
           success: true,
           data: {
               stats: {
                   totalProducts: urlStats.totalProducts,
                   productsWithUrl: urlStats.productsWithUrl,
                   productsWithStoredStock: urlStats.productsWithStoredStock,
                   productsWithoutStoredStock: urlStats.productsWithoutStoredStock,
                   productsWithStockHistory: urlStats.productsWithStockHistory,
                   totalInteractionUrls: urlStats.interactionUrls.size,
                   matchedUrls: urlStats.matchedUrls.size,
                   unmatchedUrls: urlStats.unmatchedUrls.size,
                   matchRate: urlStats.interactionUrls.size > 0 ? 
                       ((urlStats.matchedUrls.size / urlStats.interactionUrls.size) * 100).toFixed(2) + '%' : '0%',
                   storedStockRate: ((urlStats.productsWithStoredStock / urlStats.totalProducts) * 100).toFixed(2) + '%',
                   stockHistoryRate: ((urlStats.productsWithStockHistory / urlStats.totalProducts) * 100).toFixed(2) + '%'
               },
               sampleProducts: urlStats.sampleProducts,
               sampleUnmatchedUrls: [...urlStats.unmatchedUrls].slice(0, 10),
               sampleMatchedUrls: [...urlStats.matchedUrls].slice(0, 10)
           },
           timestamp: new Date().toISOString()
       });
   } catch (error) {
       res.status(500).json({
           success: false,
           message: 'เกิดข้อผิดพลาดในการตรวจสอบการจับคู่ข้อมูล',
           error: error.message
       });
   }
});

// 🔍 GET /api/search - ค้นหาสินค้า (อยู่ในโค้ดเดิมแล้ว)
router.get('/search', async (req, res) => {
   try {
       const { 
           q, 
           category, 
           minStock, 
           maxStock, 
           hasStockHistory, 
           needsSync, 
           minRelevance,
           maxRelevance,
           interestLevel,
           minSalesVelocity,
           maxSalesVelocity,
           movementLevel
       } = req.query;
       
       const products = await getAllProducts();
       const allInteractions = await getAllUserInteractions();
       const combinedProducts = combineProductsWithInteractions(products, allInteractions);
       
       let filteredProducts = combinedProducts;
       
       // Filter by search query
       if (q) {
           const query = q.toLowerCase();
           filteredProducts = filteredProducts.filter(product => 
               product.product_name?.toLowerCase().includes(query) ||
               product.category?.toLowerCase().includes(query) ||
               product.sku?.toLowerCase().includes(query)
           );
       }
       
       // Filter by category
       if (category) {
           filteredProducts = filteredProducts.filter(product => 
               product.category?.toLowerCase().includes(category.toLowerCase())
           );
       }
       
       // Filter by stock range
       if (minStock !== undefined) {
           const min = parseInt(minStock);
           filteredProducts = filteredProducts.filter(product => 
               (product.stock_quantity || 0) >= min
           );
       }
       
       if (maxStock !== undefined) {
           const max = parseInt(maxStock);
           filteredProducts = filteredProducts.filter(product => 
               (product.stock_quantity || 0) <= max
           );
       }
       
       // Filter by relevance range
       if (minRelevance !== undefined) {
           const min = parseFloat(minRelevance);
           filteredProducts = filteredProducts.filter(product => 
               (product.averageRelevance || 0) >= min
           );
       }
       
       if (maxRelevance !== undefined) {
           const max = parseFloat(maxRelevance);
           filteredProducts = filteredProducts.filter(product => 
               (product.averageRelevance || 0) <= max
           );
       }
       
       // Filter by sales velocity range
       if (minSalesVelocity !== undefined) {
           const min = parseFloat(minSalesVelocity);
           filteredProducts = filteredProducts.filter(product => 
               (product.movementAnalysis?.salesVelocity || 0) >= min
           );
       }
       
       if (maxSalesVelocity !== undefined) {
           const max = parseFloat(maxSalesVelocity);
           filteredProducts = filteredProducts.filter(product => 
               (product.movementAnalysis?.salesVelocity || 0) <= max
           );
       }
       
       // Filter by interest level
       if (interestLevel) {
           filteredProducts = filteredProducts.filter(product => {
               const relevance = product.averageRelevance || 0;
               switch (interestLevel.toLowerCase()) {
                   case 'high':
                       return relevance > 0.7;
                   case 'medium':
                       return relevance > 0.5 && relevance <= 0.7;
                   case 'low':
                       return relevance > 0.25 && relevance <= 0.5;
                   case 'none':
                       return relevance <= 0.25;
                   case 'quality':
                       return relevance > 0.25;
                   default:
                       return true;
               }
           });
       }
       
       // Filter by movement level
       if (movementLevel) {
           filteredProducts = filteredProducts.filter(product => {
               const salesVelocity = product.movementAnalysis?.salesVelocity || 0;
               switch (movementLevel.toLowerCase()) {
                   case 'high':
                       return salesVelocity > 50;
                   case 'medium':
                       return salesVelocity >= 10 && salesVelocity <= 50;
                   case 'low':
                       return salesVelocity > 0 && salesVelocity < 10;
                   case 'none':
                       return salesVelocity === 0;
                   default:
                       return true;
               }
           });
       }
       
       // Filter by stock history
       if (hasStockHistory === 'true') {
           filteredProducts = filteredProducts.filter(product => product.has_stock_history);
       } else if (hasStockHistory === 'false') {
           filteredProducts = filteredProducts.filter(product => !product.has_stock_history);
       }
       
       // Filter products that need sync
       if (needsSync === 'true') {
           filteredProducts = filteredProducts.filter(product => {
               if (!product.sku || !product.stock_data) return true;
               
               const lastUpdated = new Date(product.stock_sync_timestamp || product.stock_last_updated);
               const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
               return lastUpdated < oneWeekAgo;
           });
       }

       // เพิ่มข้อมูลระดับความสนใจและ movement analysis
       const enhancedProducts = filteredProducts.map(p => ({
           ...p,
           hasStoredStock: !!p.stock_data,
           hasStockHistory: p.has_stock_history,
           stockLastUpdated: p.stock_last_updated,
           stockSyncTimestamp: p.stock_sync_timestamp,
           userInteractions: p.userInteractions?.length || 0,
           averageRelevance: parseFloat((p.averageRelevance || 0).toFixed(4)),
           salesVelocity: parseFloat((p.movementAnalysis?.salesVelocity || 0).toFixed(2)),
           totalSold: p.movementAnalysis?.totalSold || 0,
           movementFrequency: parseFloat((p.movementAnalysis?.movementFrequency || 0).toFixed(2)),
           recentActivity: p.movementAnalysis?.recentActivity || false,
           hotScore: parseFloat((p.hotScore || 0).toFixed(1)),
           interestLevel: p.averageRelevance > 0.7 ? 'สูง' : 
                         p.averageRelevance > 0.5 ? 'ปานกลาง' : 
                         p.averageRelevance > 0.25 ? 'ต่ำ' : 'ไม่มี',
           movementLevel: (p.movementAnalysis?.salesVelocity || 0) > 50 ? 'สูง' :
                         (p.movementAnalysis?.salesVelocity || 0) >= 10 ? 'ปานกลาง' :
                         (p.movementAnalysis?.salesVelocity || 0) > 0 ? 'ต่ำ' : 'ไม่มี',
           qualityInteraction: (p.averageRelevance || 0) > 0.25
       }));

       res.json({
           success: true,
           count: enhancedProducts.length,
           data: enhancedProducts,
           query: { 
               q, 
               category, 
               minStock, 
               maxStock, 
               hasStockHistory, 
               needsSync,
               minRelevance,
               maxRelevance,
               interestLevel,
               minSalesVelocity,
               maxSalesVelocity,
               movementLevel
           },
           filters: {
               qualityInteractions: enhancedProducts.filter(p => p.qualityInteraction).length,
               highInterest: enhancedProducts.filter(p => p.interestLevel === 'สูง').length,
               mediumInterest: enhancedProducts.filter(p => p.interestLevel === 'ปานกลาง').length,
               lowInterest: enhancedProducts.filter(p => p.interestLevel === 'ต่ำ').length,
               noInterest: enhancedProducts.filter(p => p.interestLevel === 'ไม่มี').length,
               highMovement: enhancedProducts.filter(p => p.movementLevel === 'สูง').length,
               mediumMovement: enhancedProducts.filter(p => p.movementLevel === 'ปานกลาง').length,
               lowMovement: enhancedProducts.filter(p => p.movementLevel === 'ต่ำ').length,
               noMovement: enhancedProducts.filter(p => p.movementLevel === 'ไม่มี').length
           },
           timestamp: new Date().toISOString()
       });
   } catch (error) {
       res.status(500).json({
           success: false,
           message: 'เกิดข้อผิดพลาดในการค้นหา',
           error: error.message
       });
   }
});

module.exports = router;