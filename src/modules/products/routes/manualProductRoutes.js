const express = require('express');
const multer = require('multer');

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(file.originalname.toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('รองรับเฉพาะไฟล์รูปภาพ (jpeg, jpg, png, gif, webp)'));
    }
});

const manualProductRoutes = (manualProductService, logger) => {
    const router = express.Router();

    // เพิ่ม URL ใหม่
    router.post('/add-url', express.json(), async (req, res) => {
        try {
            const { url, productName } = req.body;

            if (!url || !productName) {
                return res.status(400).json({
                    success: false,
                    error: 'URL และชื่อสินค้าจำเป็น'
                });
            }

            const result = await manualProductService.addURL(url, productName);

            res.json({
                success: true,
                message: 'เพิ่ม URL สำเร็จ',
                product: result.product
            });

        } catch (error) {
            logger.error('Error adding URL:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // เพิ่มรูปภาพให้ URL
    router.post('/add-image', upload.single('image'), async (req, res) => {
        try {
            const { url } = req.body;

            if (!url) {
                return res.status(400).json({
                    success: false,
                    error: 'URL จำเป็น'
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'ไฟล์รูปภาพจำเป็น'
                });
            }

            const result = await manualProductService.addImage(url, req.file);

            res.json({
                success: true,
                message: 'เพิ่มรูปภาพสำเร็จ',
                image: result.image
            });

        } catch (error) {
            logger.error('Error adding image:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ดูรายการสินค้าทั้งหมด
    router.get('/products', async (req, res) => {
        try {
            const products = await manualProductService.getAllProducts();

            res.json({
                success: true,
                products: products,
                count: products.length
            });

        } catch (error) {
            logger.error('Error getting products:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ดูข้อมูลสินค้าจาก URL
    router.get('/product', async (req, res) => {
        try {
            const { url } = req.query;

            if (!url) {
                return res.status(400).json({
                    success: false,
                    error: 'URL จำเป็น'
                });
            }

            const product = await manualProductService.findProductByUrl(url);

            if (!product) {
                return res.status(404).json({
                    success: false,
                    error: 'ไม่พบสินค้า'
                });
            }

            res.json({
                success: true,
                product: product
            });

        } catch (error) {
            logger.error('Error getting product:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Error handling middleware
    router.use((error, req, res, next) => {
        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    error: 'ไฟล์ใหญ่เกินไป (สูงสุด 10MB)'
                });
            }
        }

        logger.error('Unhandled error in manual product routes:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    });

    return router;
};

module.exports = manualProductRoutes;