// routes/keywordImageRoutes.js
'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads', 'keyword_images');
        await fs.mkdir(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'keyword_' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'));
        }
    }
});

// Initialize router with keywordImageSender instance
function createKeywordImageRoutes(keywordImageSender, logger) {

    // GET /api/keyword-images/config - Get current configuration
    router.get('/config', async (req, res) => {
        try {
            const config = keywordImageSender.getConfig();
            res.json({
                success: true,
                config: config
            });
        } catch (error) {
            logger.error('Error getting keyword image config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // PUT /api/keyword-images/config - Update configuration
    router.put('/config', async (req, res) => {
        try {
            const result = await keywordImageSender.updateConfig(req.body);
            res.json(result);
        } catch (error) {
            logger.error('Error updating keyword image config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // GET /api/keywords - Get all keyword mappings
    router.get('/keywords', async (req, res) => {
        try {
            const keywords = keywordImageSender.getAllKeywordMappings();
            res.json({
                success: true,
                keywords: keywords,
                count: keywords.length
            });
        } catch (error) {
            logger.error('Error getting keyword mappings:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // GET /api/keyword-images/keywords/:keyword - Get specific keyword mapping
    router.get('/keywords/:keyword', async (req, res) => {
        try {
            const keyword = decodeURIComponent(req.params.keyword);
            const mapping = keywordImageSender.getKeywordMapping(keyword);

            if (!mapping) {
                return res.status(404).json({
                    success: false,
                    error: 'Keyword mapping not found'
                });
            }

            res.json({
                success: true,
                keyword: keyword,
                mapping: mapping
            });
        } catch (error) {
            logger.error('Error getting keyword mapping:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/keyword-images/keywords - Add new keyword mapping (supports multiple images)
    router.post('/keywords', async (req, res) => {
        try {
            const { keyword, imageUrl, imageUrls, imageType, description, enabled, caseSensitive, exactMatch, introMessage } = req.body;

            // Support both single imageUrl and multiple imageUrls
            const finalImageUrls = imageUrls && Array.isArray(imageUrls) ? imageUrls : (imageUrl ? [imageUrl] : []);

            if (!keyword || finalImageUrls.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Keyword and at least one imageUrl/imageUrls are required'
                });
            }

            // Check if keyword already exists
            if (keywordImageSender.getKeywordMapping(keyword)) {
                return res.status(409).json({
                    success: false,
                    error: 'Keyword mapping already exists'
                });
            }

            const options = {
                imageType: imageType || 'url',
                description: description || '',
                enabled: enabled !== false,
                caseSensitive: caseSensitive || false,
                exactMatch: exactMatch || false,
                introMessage: introMessage || null
            };

            const result = await keywordImageSender.addKeywordMapping(keyword, finalImageUrls, options);

            res.status(201).json({
                success: true,
                message: 'Keyword mapping added successfully',
                keyword: keyword,
                mapping: result
            });

        } catch (error) {
            logger.error('Error adding keyword mapping:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // PUT /api/keyword-images/keywords/:keyword - Update keyword mapping
    router.put('/keywords/:keyword', async (req, res) => {
        try {
            const keyword = decodeURIComponent(req.params.keyword);
            const updates = req.body;

            // Remove keyword from updates to prevent accidental change
            delete updates.keyword;
            delete updates.createdAt;

            const result = await keywordImageSender.updateKeywordMapping(keyword, updates);

            res.json({
                success: true,
                message: 'Keyword mapping updated successfully',
                keyword: keyword,
                mapping: result
            });

        } catch (error) {
            logger.error('Error updating keyword mapping:', error);

            if (error.message === 'Keyword mapping not found') {
                res.status(404).json({
                    success: false,
                    error: error.message
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        }
    });

    // DELETE /api/keyword-images/keywords/:keyword - Remove keyword mapping
    router.delete('/keywords/:keyword', async (req, res) => {
        try {
            const keyword = decodeURIComponent(req.params.keyword);
            const existed = await keywordImageSender.removeKeywordMapping(keyword);

            if (!existed) {
                return res.status(404).json({
                    success: false,
                    error: 'Keyword mapping not found'
                });
            }

            res.json({
                success: true,
                message: 'Keyword mapping removed successfully',
                keyword: keyword
            });

        } catch (error) {
            logger.error('Error removing keyword mapping:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/keyword-images/upload - Upload image file for keyword
    router.post('/upload', upload.single('image'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No image file uploaded'
                });
            }

            const { keyword, description, enabled, caseSensitive, exactMatch, introMessage } = req.body;

            if (!keyword) {
                // Clean up uploaded file
                await fs.unlink(req.file.path).catch(() => {});
                return res.status(400).json({
                    success: false,
                    error: 'Keyword is required'
                });
            }

            // Check if keyword already exists
            if (keywordImageSender.getKeywordMapping(keyword)) {
                // Clean up uploaded file
                await fs.unlink(req.file.path).catch(() => {});
                return res.status(409).json({
                    success: false,
                    error: 'Keyword mapping already exists'
                });
            }

            const options = {
                imageType: 'file',
                description: description || '',
                enabled: enabled !== 'false',
                caseSensitive: caseSensitive === 'true',
                exactMatch: exactMatch === 'true',
                introMessage: introMessage || null
            };

            const result = await keywordImageSender.addKeywordMapping(keyword, req.file.path, options);

            res.status(201).json({
                success: true,
                message: 'Keyword mapping with image uploaded successfully',
                keyword: keyword,
                mapping: result,
                file: {
                    originalName: req.file.originalname,
                    filename: req.file.filename,
                    size: req.file.size,
                    path: req.file.path
                }
            });

        } catch (error) {
            logger.error('Error uploading keyword image:', error);

            // Clean up uploaded file on error
            if (req.file) {
                await fs.unlink(req.file.path).catch(() => {});
            }

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // GET /api/keyword-images/images/:filename - Serve temp images
    router.get('/images/:filename', async (req, res) => {
        try {
            const filename = req.params.filename;

            // Security check: only allow keyword temp images
            if (!filename.startsWith('kw_')) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }

            const imagePath = path.join(__dirname, '..', 'temp_images', filename);

            // Check if file exists
            try {
                await fs.access(imagePath);
            } catch {
                return res.status(404).json({
                    success: false,
                    error: 'Image not found'
                });
            }

            // Set cache headers
            res.set({
                'Cache-Control': 'public, max-age=86400', // 1 day
                'Content-Type': 'image/jpeg'
            });

            res.sendFile(imagePath);

        } catch (error) {
            logger.error('Error serving keyword image:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/keyword-images/test-detection - Test keyword detection
    router.post('/test-detection', async (req, res) => {
        try {
            const { message } = req.body;

            if (!message) {
                return res.status(400).json({
                    success: false,
                    error: 'Message is required'
                });
            }

            const result = await keywordImageSender.testKeywordDetection(message);

            res.json({
                success: true,
                result: result
            });

        } catch (error) {
            logger.error('Error testing keyword detection:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/keyword-images/test-send - Test keyword image sending
    router.post('/test-send', async (req, res) => {
        try {
            const { userId, keyword } = req.body;

            if (!userId || !keyword) {
                return res.status(400).json({
                    success: false,
                    error: 'UserId and keyword are required'
                });
            }

            const result = await keywordImageSender.testKeywordSend(userId, keyword);

            res.json(result);

        } catch (error) {
            logger.error('Error testing keyword send:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // GET /api/keyword-images/statistics - Get statistics
    router.get('/statistics', async (req, res) => {
        try {
            const stats = keywordImageSender.getStatistics();
            res.json({
                success: true,
                statistics: stats
            });
        } catch (error) {
            logger.error('Error getting keyword image statistics:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // GET /api/keyword-images/health - Health check
    router.get('/health', async (req, res) => {
        try {
            const health = await keywordImageSender.healthCheck();
            res.json({
                success: true,
                health: health
            });
        } catch (error) {
            logger.error('Error checking keyword image health:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/keyword-images/cleanup - Manual cleanup
    router.post('/cleanup', async (req, res) => {
        try {
            const result = await keywordImageSender.cleanup();
            res.json({
                success: true,
                message: 'Cleanup completed successfully',
                result: result
            });
        } catch (error) {
            logger.error('Error during keyword image cleanup:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // GET /api/keyword-images/user-history/:userId - Get user send history
    router.get('/user-history/:userId', async (req, res) => {
        try {
            const userId = req.params.userId;
            const userHistory = keywordImageSender.userSendHistory.get(userId) || {};

            res.json({
                success: true,
                userId: userId,
                history: userHistory,
                totalKeywords: Object.keys(userHistory).length
            });

        } catch (error) {
            logger.error('Error getting user history:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Error handling middleware
    router.use((error, req, res, next) => {
        logger.error('Keyword image route error:', error);

        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({
                    success: false,
                    error: 'File too large. Maximum size is 10MB.'
                });
            }
            if (error.code === 'LIMIT_FILE_COUNT') {
                return res.status(413).json({
                    success: false,
                    error: 'Too many files. Only one file allowed.'
                });
            }
        }

        if (error.message.includes('Invalid file type')) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    });

    return router;
}

module.exports = createKeywordImageRoutes;