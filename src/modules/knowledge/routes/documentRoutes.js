// routes/documentRoutes.js
'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { resolveUploadsPath, ROOT_DIR } = require('../../../app/paths');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const pdfLib = require('pdf-parse');

const prisma = new PrismaClient();

// Import Google Cloud Vision (for service account auth)
const vision = require('@google-cloud/vision');

// Initialize Vision API client
let visionClient;
let useRestAPI = false;
const GOOGLE_CLOUD_API_KEY = process.env.GOOGLE_CLOUD_API_KEY;

if (GOOGLE_CLOUD_API_KEY) {
    // Use REST API with API key
    useRestAPI = true;
    console.log('✅ Google Cloud Vision API configured with API key');
} else {
    // Try to use client library with service account
    try {
        visionClient = new vision.ImageAnnotatorClient({
            keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(ROOT_DIR, 'google-cloud-key.json')
        });
        console.log('✅ Google Cloud Vision API configured with service account');
    } catch (error) {
        console.warn('⚠️ Google Cloud Vision API not configured:', error.message);
    }
}

// Helper function to decode filename properly
function decodeFilename(filename) {
    try {
        // Try to decode if it's URL encoded or has encoding issues
        return Buffer.from(filename, 'latin1').toString('utf8');
    } catch (error) {
        return filename;
    }
}

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = resolveUploadsPath('documents');
        await fs.mkdir(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Decode the original filename to handle UTF-8 properly
        const decodedName = decodeFilename(file.originalname);
        const ext = path.extname(decodedName);
        const baseName = path.basename(decodedName, ext);

        // Use decoded name with timestamp for uniqueness
        const uniqueName = `${Date.now()}-${baseName}${ext}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.doc', '.docx', '.txt', '.md', '.png', '.jpg', '.jpeg', '.tiff', '.bmp'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('ประเภทไฟล์ไม่รองรับ'));
        }
    }
});

// OCR function using Google Cloud Vision API (REST API)
async function extractTextWithOCRRestAPI(filePath) {
    try {
        // Read file and convert to base64
        const imageBuffer = await fs.readFile(filePath);
        const base64Image = imageBuffer.toString('base64');

        // Call Google Cloud Vision API
        const response = await axios.post(
            `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_CLOUD_API_KEY}`,
            {
                requests: [
                    {
                        image: {
                            content: base64Image
                        },
                        features: [
                            {
                                type: 'DOCUMENT_TEXT_DETECTION'
                            }
                        ]
                    }
                ]
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        const result = response.data.responses[0];
        if (result.error) {
            throw new Error(result.error.message);
        }

        return result.fullTextAnnotation ? result.fullTextAnnotation.text : '';
    } catch (error) {
        throw new Error(`OCR failed: ${error.message}`);
    }
}

// OCR function using Google Cloud Vision API (Client Library)
async function extractTextWithOCRClientLib(filePath) {
    if (!visionClient) {
        throw new Error('Google Cloud Vision API not configured');
    }

    try {
        const [result] = await visionClient.documentTextDetection(filePath);
        const fullTextAnnotation = result.fullTextAnnotation;
        return fullTextAnnotation ? fullTextAnnotation.text : '';
    } catch (error) {
        throw new Error(`OCR failed: ${error.message}`);
    }
}

// Main OCR function that chooses the right method
async function extractTextWithOCR(filePath, fileType) {
    if (useRestAPI) {
        return await extractTextWithOCRRestAPI(filePath);
    } else {
        return await extractTextWithOCRClientLib(filePath);
    }
}

// PDF text extraction function
async function extractTextFromPDF(filePath) {
    try {
        const dataBuffer = await fs.readFile(filePath);
        // Use the pdf function from pdf-parse library (not PDFParse class)
        const data = await pdfLib.pdf(dataBuffer, {
            max: 0 // Parse all pages
        });
        return data.text || '';
    } catch (error) {
        throw new Error(`PDF extraction failed: ${error.message}`);
    }
}

module.exports = (logger) => {
    // GET all documents
    router.get('/', async (req, res) => {
        try {
            const documents = await prisma.document.findMany({
                orderBy: { uploaded_at: 'desc' }
            });

            res.json({
                success: true,
                documents: documents
            });
        } catch (error) {
            logger.error('Error fetching documents:', error);
            res.status(500).json({
                success: false,
                error: 'ไม่สามารถโหลดเอกสารได้'
            });
        }
    });

    // POST upload document
    router.post('/upload', upload.single('file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'ไม่พบไฟล์'
                });
            }

            const { title } = req.body;
            // Decode the original filename to handle UTF-8 properly
            const decodedOriginalName = decodeFilename(req.file.originalname);
            const fileExt = path.extname(decodedOriginalName).toLowerCase();
            const filePath = req.file.path;

            // Extract text content based on file type
            let content = '';
            let ocrUsed = false;

            try {
                if (fileExt === '.txt' || fileExt === '.md') {
                    // Plain text files
                    content = await fs.readFile(filePath, 'utf-8');
                } else if (fileExt === '.pdf') {
                    // PDF files - use pdf-parse
                    logger.info(`Extracting text from PDF: ${decodedOriginalName}`);
                    content = await extractTextFromPDF(filePath);
                    logger.info(`PDF extraction completed: ${content.length} characters extracted`);
                } else if (['.png', '.jpg', '.jpeg', '.tiff', '.bmp'].includes(fileExt)) {
                    // Image files - Use Google Cloud Vision API for OCR
                    if (useRestAPI || visionClient) {
                        logger.info(`Performing OCR on ${decodedOriginalName} (${useRestAPI ? 'REST API' : 'Client Library'})`);
                        content = await extractTextWithOCR(filePath, fileExt);
                        ocrUsed = true;
                        logger.info(`OCR completed: ${content.length} characters extracted`);
                    } else {
                        content = '[Google Cloud Vision API not configured - OCR unavailable]';
                        logger.warn('Attempted OCR but Vision API not configured');
                    }
                } else if (fileExt === '.doc' || fileExt === '.docx') {
                    content = '[DOCX content extraction not yet implemented]';
                } else {
                    content = '[Content extraction not supported for this file type]';
                }
            } catch (extractionError) {
                logger.error('Text extraction error:', extractionError);
                content = `[Error extracting content: ${extractionError.message}]`;
            }

            // Save to database
            const document = await prisma.document.create({
                data: {
                    id: uuidv4(),
                    title: title || decodedOriginalName,
                    filename: decodedOriginalName,
                    file_path: req.file.path,
                    file_type: fileExt.replace('.', ''),
                    file_size: req.file.size,
                    content: content,
                    uploaded_at: new Date()
                }
            });

            logger.info(`Document uploaded: ${document.id} (OCR: ${ocrUsed})`);

            res.json({
                success: true,
                document: document,
                ocrUsed: ocrUsed,
                extractedLength: content.length
            });
        } catch (error) {
            logger.error('Error uploading document:', error);

            // Clean up uploaded file on error
            if (req.file && req.file.path) {
                try {
                    await fs.unlink(req.file.path);
                } catch (unlinkError) {
                    logger.error('Failed to delete file after error:', unlinkError);
                }
            }

            res.status(500).json({
                success: false,
                error: error.message || 'ไม่สามารถอัปโหลดได้'
            });
        }
    });

    // GET document content
    router.get('/:id/content', async (req, res) => {
        try {
            const document = await prisma.document.findUnique({
                where: { id: req.params.id }
            });

            if (!document) {
                return res.status(404).json({
                    success: false,
                    error: 'ไม่พบเอกสาร'
                });
            }

            res.json({
                success: true,
                content: document.content
            });
        } catch (error) {
            logger.error('Error fetching document content:', error);
            res.status(500).json({
                success: false,
                error: 'ไม่สามารถโหลดเนื้อหาได้'
            });
        }
    });

    // PUT update document
    router.put('/:id', async (req, res) => {
        try {
            const { title, content } = req.body;
            const document = await prisma.document.findUnique({
                where: { id: req.params.id }
            });

            if (!document) {
                return res.status(404).json({
                    success: false,
                    error: 'ไม่พบเอกสาร'
                });
            }

            // Update document
            const updatedDocument = await prisma.document.update({
                where: { id: req.params.id },
                data: {
                    title: title !== undefined ? title : document.title,
                    content: content !== undefined ? content : document.content
                }
            });

            logger.info(`Document updated: ${req.params.id}`);

            res.json({
                success: true,
                document: updatedDocument,
                message: 'แก้ไขเอกสารสำเร็จ'
            });
        } catch (error) {
            logger.error('Error updating document:', error);
            res.status(500).json({
                success: false,
                error: 'ไม่สามารถแก้ไขได้'
            });
        }
    });

    // POST index document to Knowledge RAG
    router.post('/:id/index-to-rag', async (req, res) => {
        try {
            const document = await prisma.document.findUnique({
                where: { id: req.params.id }
            });

            if (!document) {
                return res.status(404).json({
                    success: false,
                    error: 'ไม่พบเอกสาร'
                });
            }

            if (!document.content || document.content.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'เอกสารนี้ไม่มีเนื้อหาที่จะ index ได้'
                });
            }

            // Create or update KnowledgeEntry
            let knowledgeEntry;

            if (document.rag_entry_id) {
                // Update existing entry
                knowledgeEntry = await prisma.knowledgeEntry.update({
                    where: { id: document.rag_entry_id },
                    data: {
                        title: document.title,
                        content: document.content,
                        category: document.file_type,
                        tags: JSON.stringify([document.file_type, 'document']),
                        enabled: true
                    }
                });
            } else {
                // Create new entry
                knowledgeEntry = await prisma.knowledgeEntry.create({
                    data: {
                        id: uuidv4(),
                        title: document.title,
                        content: document.content,
                        category: document.file_type,
                        tags: JSON.stringify([document.file_type, 'document']),
                        enabled: true
                    }
                });
            }

            // Index to Vector DB using KnowledgeRAG service
            // Get KnowledgeRAG instance from req.app.locals
            const knowledgeRAG = req.app.locals.knowledgeRAG;

            if (knowledgeRAG) {
                try {
                    logger.info('Indexing document to Vector DB via KnowledgeRAG', {
                        documentId: document.id,
                        knowledgeEntryId: knowledgeEntry.id
                    });

                    // Add knowledge to RAG with proper format
                    await knowledgeRAG.addKnowledge({
                        category: document.file_type || 'document',
                        file_name: document.filename,
                        text: document.content,
                        tags: [document.file_type, 'document'],
                        source: 'document_upload',
                        title: document.title
                    });

                    logger.info('Document successfully indexed to Vector DB', {
                        documentId: document.id
                    });
                } catch (vectorError) {
                    logger.error('Failed to index to Vector DB, but KnowledgeEntry created:', vectorError);
                    // Continue even if vector indexing fails
                }
            } else {
                logger.warn('KnowledgeRAG service not available, skipping vector indexing');
            }

            // Update document with RAG info
            const updatedDocument = await prisma.document.update({
                where: { id: req.params.id },
                data: {
                    indexed_to_rag: true,
                    rag_entry_id: knowledgeEntry.id,
                    last_indexed_at: new Date()
                }
            });

            logger.info(`Document indexed to RAG: ${document.id} -> KnowledgeEntry: ${knowledgeEntry.id}`);

            res.json({
                success: true,
                document: updatedDocument,
                knowledgeEntry: knowledgeEntry,
                message: 'Index เข้า Knowledge RAG สำเร็จ'
            });
        } catch (error) {
            logger.error('Error indexing document to RAG:', error);
            res.status(500).json({
                success: false,
                error: 'ไม่สามารถ index เข้า Knowledge RAG ได้'
            });
        }
    });

    // DELETE remove document from Knowledge RAG
    router.delete('/:id/remove-from-rag', async (req, res) => {
        try {
            const document = await prisma.document.findUnique({
                where: { id: req.params.id }
            });

            if (!document) {
                return res.status(404).json({
                    success: false,
                    error: 'ไม่พบเอกสาร'
                });
            }

            // Delete vectors from LanceDB first
            const knowledgeRAG = req.app.locals.knowledgeRAG;
            if (knowledgeRAG && document.rag_entry_id) {
                try {
                    // Get KnowledgeEntry to find the metadata
                    const knowledgeEntry = await prisma.knowledgeEntry.findUnique({
                        where: { id: document.rag_entry_id }
                    });

                    if (knowledgeEntry) {
                        // Delete from LanceDB by searching for matching vectors
                        // We need to delete all vectors that were created from this document
                        if (knowledgeRAG.db) {
                            const table = await knowledgeRAG.db.openTable('knowledge');

                            // Delete vectors by file_name match
                            await table.delete(`file_name = '${document.filename}'`);

                            logger.info(`Deleted vectors from LanceDB for file: ${document.filename}`);
                        }
                    }
                } catch (vectorError) {
                    logger.error('Failed to delete vectors from LanceDB:', vectorError);
                    // Continue even if vector deletion fails
                }
            }

            if (document.rag_entry_id) {
                // Delete from KnowledgeEntry
                await prisma.knowledgeEntry.delete({
                    where: { id: document.rag_entry_id }
                });

                logger.info(`Removed KnowledgeEntry: ${document.rag_entry_id}`);
            }

            // Update document
            const updatedDocument = await prisma.document.update({
                where: { id: req.params.id },
                data: {
                    indexed_to_rag: false,
                    rag_entry_id: null,
                    last_indexed_at: null
                }
            });

            logger.info(`Document removed from RAG: ${req.params.id}`);

            res.json({
                success: true,
                document: updatedDocument,
                message: 'ลบออกจาก Knowledge RAG สำเร็จ'
            });
        } catch (error) {
            logger.error('Error removing document from RAG:', error);
            res.status(500).json({
                success: false,
                error: 'ไม่สามารถลบออกจาก Knowledge RAG ได้'
            });
        }
    });

    // DELETE document
    router.delete('/:id', async (req, res) => {
        try {
            const document = await prisma.document.findUnique({
                where: { id: req.params.id }
            });

            if (!document) {
                return res.status(404).json({
                    success: false,
                    error: 'ไม่พบเอกสาร'
                });
            }

            // Delete from KnowledgeEntry if indexed
            if (document.rag_entry_id) {
                try {
                    await prisma.knowledgeEntry.delete({
                        where: { id: document.rag_entry_id }
                    });
                    logger.info(`Deleted associated KnowledgeEntry: ${document.rag_entry_id}`);
                } catch (err) {
                    logger.warn(`Failed to delete KnowledgeEntry: ${document.rag_entry_id}`, err);
                }
            }

            // Delete file from disk
            try {
                await fs.unlink(document.file_path);
            } catch (err) {
                logger.warn(`Failed to delete file: ${document.file_path}`, err);
            }

            // Delete from database
            await prisma.document.delete({
                where: { id: req.params.id }
            });

            logger.info(`Document deleted: ${req.params.id}`);

            res.json({
                success: true,
                message: 'ลบเอกสารสำเร็จ'
            });
        } catch (error) {
            logger.error('Error deleting document:', error);
            res.status(500).json({
                success: false,
                error: 'ไม่สามารถลบได้'
            });
        }
    });

    return router;
};
