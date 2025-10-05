'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { resolveUploadsPath } = require('../../../app/paths');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, resolveUploadsPath('knowledge'));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        // Accept text files only
        if (file.mimetype.startsWith('text/') || 
            file.mimetype === 'application/pdf' ||
            file.mimetype === 'application/msword' ||
            file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            cb(null, true);
        } else {
            cb(new Error('Only text files, PDF, and Word documents are allowed'));
        }
    }
});

function createKnowledgeRoutes(knowledgeRAG, knowledgeFormatter, logger) {
    const router = express.Router();

    // Add knowledge
    router.post('/add', async (req, res) => {
        try {
            const { category, file_name, text, tags, language, source } = req.body;

            if (!category || !file_name || !text) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: category, file_name, text'
                });
            }

            const knowledge = {
                category,
                file_name,
                text,
                tags: tags || [],
                language: language || 'th',
                source: source || 'manual'
            };

            const result = await knowledgeRAG.addKnowledge(knowledge);

            if (result.success) {
                logger.info('Knowledge added via API', {
                    id: result.id,
                    category,
                    file_name
                });
            }

            res.json(result);

        } catch (error) {
            logger.error('Error in add knowledge API:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Upload and add knowledge from file
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'ไม่พบไฟล์ที่อัปโหลด'
            });
        }

        const { category, tags, language, source, customName, description } = req.body;

        if (!category) {
            return res.status(400).json({
                success: false,
                error: 'กรุณาระบุหมวดหมู่'
            });
        }

        if (!customName) {
            return res.status(400).json({
                success: false,
                error: 'กรุณาระบุชื่อเอกสาร'
            });
        }

        // ตรวจสอบประเภทไฟล์
        const fileExtension = path.extname(req.file.originalname).toLowerCase();
        const supportedExtensions = ['.pdf', '.docx', '.doc', '.txt'];
        
        if (!supportedExtensions.includes(fileExtension)) {
            // ลบไฟล์ที่อัปโหลด
            await fs.unlink(req.file.path);
            return res.status(400).json({
                success: false,
                error: `ไม่รองรับไฟล์ประเภท ${fileExtension}. รองรับเฉพาะ: ${supportedExtensions.join(', ')}`
            });
        }

        const fileType = fileExtension.substring(1); // ลบ . ออก
        const filePath = req.file.path;

        logger.info('Processing uploaded file:', {
            originalName: req.file.originalname,
            customName,
            category,
            fileType,
            size: req.file.size
        });

        try {
            // ใช้ DocumentProcessor สำหรับประมวลผลไฟล์
            const result = await knowledgeRAG.addKnowledgeFromFile(filePath, {
                customName,
                category,
                description,
                fileType,
                tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
                language: language || 'th',
                source: source || 'file_upload'
            });

            // ลบไฟล์ที่อัปโหลดแล้ว
            await fs.unlink(filePath);

            if (result.success) {
                logger.info('File processed and added to knowledge base:', {
                    id: result.id,
                    customName,
                    category,
                    fileType,
                    processingMethod: result.file_processing?.method,
                    hasOCR: result.file_processing?.hasOCR,
                    chunks: result.chunks
                });

                // เพิ่มข้อมูลการประมวลผลไฟล์ในผลลัพธ์
                result.file_info = {
                    original_name: req.file.originalname,
                    file_type: fileType,
                    file_size: req.file.size,
                    processing_method: result.file_processing?.method,
                    has_ocr: result.file_processing?.hasOCR || false,
                    original_content_length: result.file_processing?.originalLength,
                    chunks_created: result.chunks
                };
            }

            res.json(result);

        } catch (processingError) {
            // ลบไฟล์หากเกิดข้อผิดพลาด
            try {
                await fs.unlink(filePath);
            } catch (unlinkError) {
                logger.warn('Failed to cleanup file after processing error:', unlinkError);
            }
            
            throw processingError;
        }

    } catch (error) {
        logger.error('Error in file upload and processing:', error);
        
        // ลบไฟล์หากยังมีอยู่
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                logger.warn('Failed to cleanup uploaded file:', unlinkError);
            }
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

    // Search knowledge
    router.post('/search', async (req, res) => {
        try {
            const { query, topK, scoreThreshold, category } = req.body;

            if (!query) {
                return res.status(400).json({
                    success: false,
                    error: 'Query is required'
                });
            }

            const options = {
                topK: topK || 5,
                scoreThreshold: scoreThreshold || 0.7,
                filter: category ? { category } : {}
            };

            const searchResult = await knowledgeRAG.searchKnowledge(query, options);

            // Format results for display
            if (searchResult.success && searchResult.results.length > 0) {
                const formattedResults = knowledgeFormatter.formatKnowledgeList(searchResult.results);
                searchResult.formatted_results = formattedResults;
                
                // Create summary
                const summary = knowledgeFormatter.createSummary(searchResult.results);
                searchResult.summary = knowledgeFormatter.formatSummary(summary);
            }

            res.json(searchResult);

        } catch (error) {
            logger.error('Error in search knowledge API:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Get knowledge context for AI
    router.post('/context', async (req, res) => {
        try {
            const { query, topK, scoreThreshold } = req.body;

            if (!query) {
                return res.status(400).json({
                    success: false,
                    error: 'Query is required'
                });
            }

            const options = {
                topK: topK || 3,
                scoreThreshold: scoreThreshold || 0.75
            };

            const result = await knowledgeRAG.generateContext(query, options);
            res.json(result);

        } catch (error) {
            logger.error('Error in generate context API:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // List knowledge by category
    router.get('/list', async (req, res) => {
        try {
            const { category } = req.query;
            const result = await knowledgeRAG.listKnowledgeByCategory(category);

            if (result.success && result.knowledge.length > 0) {
                const formattedList = knowledgeFormatter.formatKnowledgeList(result.knowledge);
                result.formatted_knowledge = formattedList;
            }

            res.json(result);

        } catch (error) {
            logger.error('Error in list knowledge API:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Get categories
    router.get('/categories', async (req, res) => {
        try {
            const result = await knowledgeRAG.getCategories();
            res.json(result);

        } catch (error) {
            logger.error('Error in get categories API:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Get knowledge by ID
    router.get('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const result = await knowledgeRAG.getKnowledge(id);

            if (result.success && result.knowledge) {
                const formattedKnowledge = knowledgeFormatter.formatKnowledge(result.knowledge, 0);
                result.formatted_knowledge = formattedKnowledge;
            }

            res.json(result);

        } catch (error) {
            logger.error('Error in get knowledge API:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Update knowledge
    router.put('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const updates = req.body;

            const result = await knowledgeRAG.updateKnowledge(id, updates);

            if (result.success) {
                logger.info('Knowledge updated via API', {
                    id,
                    updated_fields: result.updated_fields
                });
            }

            res.json(result);

        } catch (error) {
            logger.error('Error in update knowledge API:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Delete knowledge
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const result = await knowledgeRAG.deleteKnowledge(id);

            if (result.success) {
                logger.info('Knowledge deleted via API', { id });
            }

            res.json(result);

        } catch (error) {
            logger.error('Error in delete knowledge API:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Batch add knowledge
    router.post('/batch/add', async (req, res) => {
        try {
            const { knowledge_list } = req.body;

            if (!Array.isArray(knowledge_list)) {
                return res.status(400).json({
                    success: false,
                    error: 'knowledge_list must be an array'
                });
            }

            const result = await knowledgeRAG.addMultipleKnowledge(knowledge_list);
            res.json(result);

        } catch (error) {
            logger.error('Error in batch add knowledge API:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Health check
    router.get('/system/health', async (req, res) => {
        try {
            const result = await knowledgeRAG.healthCheck();
            res.json(result);

        } catch (error) {
            logger.error('Error in knowledge health check API:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Get statistics
    router.get('/system/stats', async (req, res) => {
        try {
            const result = await knowledgeRAG.getStatistics();
            res.json(result);

        } catch (error) {
            logger.error('Error in knowledge statistics API:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    return router;
}

module.exports = createKnowledgeRoutes;
