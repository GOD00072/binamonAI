// routes/productImageManagerRoutes.js
'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');

// Setup multer สำหรับ upload รูปภาพ
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '..', 'products', 'images'));
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `manual_${timestamp}_${name}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images are allowed.'));
        }
    }
});

function createProductImageManagerRoutes(productImageSender, logger) {
    const router = express.Router();

    // ดึงรายการสินค้าทั้งหมดที่มีรูปภาพ
    router.get('/products', async (req, res) => {
        try {
            const products = await productImageSender.readAllProductFiles();
            const productsWithImages = products
                .filter(product => product.images && product.images.length > 0)
                .map(product => {
                    const config = productImageSender.imageManager.getProductImageConfig(product.url);
                    const selectedCount = config ? 
                        config.selectedImages.filter(img => img.selected).length : 
                        Math.min(3, product.images.length);

                    return {
                        url: product.url,
                        productName: product.product_name,
                        sku: product.sku,
                        category: product.category,
                        totalImages: product.images.length,
                        selectedImages: selectedCount,
                        hasCustomSelection: !!config,
                        lastUpdated: config ? config.lastUpdated : null
                    };
                });

            res.json({
                success: true,
                products: productsWithImages,
                total: productsWithImages.length
            });

        } catch (error) {
            logger.error('Error getting products with images:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ดึงรายละเอียดรูปภาพของสินค้า
    router.get('/products/:encodedUrl/images', async (req, res) => {
        try {
            const productUrl = decodeURIComponent(req.params.encodedUrl);
            const productData = await productImageSender.findProductByUrl(productUrl);

            if (!productData) {
                return res.status(404).json({
                    success: false,
                    error: 'Product not found'
                });
            }

            // ดึงการตั้งค่าการเลือกรูป
            let config = productImageSender.imageManager.getProductImageConfig(productUrl);
            
            if (!config) {
                // สร้างการตั้งค่าเริ่มต้น
                config = productImageSender.imageManager.createDefaultSelection(productData);
                await productImageSender.imageManager.setProductImageSelection(
                    productUrl, 
                    config.selectedImages, 
                    productData
                );
            }

            res.json({
                success: true,
                productUrl: productUrl,
                productName: productData.productName,
                sku: productData.sku,
                totalImages: config.totalImages,
                selectedCount: config.selectedImages.filter(img => img.selected).length,
                images: config.selectedImages.map(img => ({
                    filename: img.filename,
                    localPath: img.localPath,
                    url: img.url,
                    isPrimary: img.isPrimary,
                    order: img.order,
                    size: img.size,
                    alt: img.alt,
                    title: img.title,
                    selected: img.selected,
                    selectionOrder: img.selectionOrder,
                    addedManually: img.addedManually || false,
                    addedAt: img.addedAt,
                    status: img.status
                })),
                lastUpdated: config.lastUpdated
            });

        } catch (error) {
            logger.error('Error getting product images:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // อัปเดตการเลือกรูปภาพ
    router.post('/products/:encodedUrl/images/selection', async (req, res) => {
        try {
            const productUrl = decodeURIComponent(req.params.encodedUrl);
            const { selections } = req.body; // array of {filename, selected, selectionOrder}

            if (!selections || !Array.isArray(selections)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid selections data'
                });
            }

            const config = productImageSender.imageManager.getProductImageConfig(productUrl);
            if (!config) {
                return res.status(404).json({
                    success: false,
                    error: 'Product configuration not found'
                });
            }

            // อัปเดตการเลือกแต่ละรูป
            for (const selection of selections) {
                await productImageSender.imageManager.updateImageSelection(
                    productUrl,
                    selection.filename,
                    selection.selected,
                    selection.selectionOrder
                );
            }

            const updatedConfig = productImageSender.imageManager.getProductImageConfig(productUrl);
            const selectedCount = updatedConfig.selectedImages.filter(img => img.selected).length;

            logger.info('Image selection updated', {
                productUrl: productUrl,
                selectedCount: selectedCount,
                totalSelections: selections.length
            });

            res.json({
                success: true,
                productUrl: productUrl,
                selectedCount: selectedCount,
                totalImages: updatedConfig.totalImages,
                lastUpdated: updatedConfig.lastUpdated
            });

        } catch (error) {
            logger.error('Error updating image selection:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // รีเซ็ตการเลือกเป็น 3 รูปแรก
    router.post('/products/:encodedUrl/images/reset', async (req, res) => {
        try {
            const productUrl = decodeURIComponent(req.params.encodedUrl);
            
            const config = await productImageSender.imageManager.resetToDefaultSelection(productUrl);

            res.json({
                success: true,
                productUrl: productUrl,
                selectedCount: config.selectedImages.filter(img => img.selected).length,
                message: 'Selection reset to first 3 images'
            });

        } catch (error) {
            logger.error('Error resetting image selection:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // เคลียร์การเลือกทั้งหมด
    router.post('/products/:encodedUrl/images/clear', async (req, res) => {
        try {
            const productUrl = decodeURIComponent(req.params.encodedUrl);
            
            const config = await productImageSender.imageManager.clearProductSelection(productUrl);

            res.json({
                success: true,
                productUrl: productUrl,
                selectedCount: 0,
                message: 'All selections cleared'
            });

        } catch (error) {
            logger.error('Error clearing image selection:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // อัปโหลดรูปภาพใหม่ให้สินค้า
    router.post('/products/:encodedUrl/images/upload', upload.single('image'), async (req, res) => {
        try {
            const productUrl = decodeURIComponent(req.params.encodedUrl);
            const { selected = false, alt = '', title = '' } = req.body;

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No image file uploaded'
                });
            }

            const imageFile = {
                filename: req.file.filename,
                path: req.file.path,
                size: req.file.size,
                alt: alt,
                title: title
            };

            const config = await productImageSender.imageManager.addImageToProduct(
                productUrl,
                imageFile,
                selected === 'true' || selected === true
            );

            logger.info('Image uploaded and added to product', {
                productUrl: productUrl,
                filename: req.file.filename,
                selected: selected
            });

            res.json({
                success: true,
                productUrl: productUrl,
                uploadedImage: {
                    filename: req.file.filename,
                    size: req.file.size,
                    selected: selected
                },
                totalImages: config.totalImages,
                selectedCount: config.selectedImages.filter(img => img.selected).length
            });

        } catch (error) {
            logger.error('Error uploading image:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ลบรูปภาพออกจากสินค้า
    router.delete('/products/:encodedUrl/images/:filename', async (req, res) => {
        try {
            const productUrl = decodeURIComponent(req.params.encodedUrl);
            const filename = req.params.filename;

            const result = await productImageSender.imageManager.removeImageFromProduct(productUrl, filename);

            logger.info('Image removed from product', {
                productUrl: productUrl,
                filename: filename
            });

            res.json({
                success: true,
                productUrl: productUrl,
                removedImage: result.removedImage.filename,
                totalImages: result.config.totalImages,
                selectedCount: result.config.selectedImages.filter(img => img.selected).length
            });

        } catch (error) {
            logger.error('Error removing image:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ทดสอบส่งรูปภาพที่เลือก
    router.post('/products/:encodedUrl/test-send', async (req, res) => {
        try {
            const productUrl = decodeURIComponent(req.params.encodedUrl);
            const { userId } = req.body;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'userId is required'
                });
            }

            const result = await productImageSender.processUrlForImages(userId, productUrl);

            res.json({
                success: true,
                testResult: result,
                message: result.sent ? 
                    `Successfully sent ${result.imagesSent} selected images` : 
                    `Images not sent: ${result.reason}`
            });

        } catch (error) {
            logger.error('Error testing image send:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ดึงสถิติการเลือกรูป
    router.get('/statistics', async (req, res) => {
        try {
            const stats = productImageSender.imageManager.getSelectionStatistics();

            res.json({
                success: true,
                statistics: stats
            });

        } catch (error) {
            logger.error('Error getting selection statistics:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    return router;
}

module.exports = createProductImageManagerRoutes;