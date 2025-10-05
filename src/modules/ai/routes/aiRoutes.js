// aiRoutes.js

/**
 * AI Routes Module
 * Handles all AI-related endpoints and functionality
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: { 
        fileSize: 50 * 1024 * 1024 // 50MB max file size
    }
});

// Helper Functions for AI Processing
async function autoDetectAndProcess(model, content) {
    const prompt = `วิเคราะห์และสกัดข้อมูลสำคัญจากข้อความต่อไปนี้:

${content}

กรุณาสรุปประเภทของเนื้อหา และสกัดข้อมูลสำคัญออกมาในรูปแบบ JSON โดยมีโครงสร้าง:
- content_type: ประเภทของเนื้อหา
- key_information: ข้อมูลสำคัญ
- summary: สรุปเนื้อหา
- language: ภาษาของเอกสาร`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
}

async function createProductCatalog(model, content) {
    const prompt = `แปลงข้อความต่อไปนี้เป็นแคตตาล็อกสินค้าในรูปแบบ JSON:

${content}

โครงสร้าง JSON ควรประกอบด้วย:
- products: รายการสินค้า
  - product_name: ชื่อสินค้า
  - price: ราคา
  - description: คำอธิบายสินค้า
  - category: หมวดหมู่สินค้า
  - additional_details: รายละเอียดเพิ่มเติม`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
}

async function createKnowledgeBase(model, content) {
    const prompt = `สกัดข้อมูลที่สำคัญและจัดระเบียบเป็นฐานความรู้จากข้อความต่อไปนี้:

${content}

โครงสร้าง JSON ควรประกอบด้วย:
- main_categories: หมวดหมู่หลัก
- key_concepts: แนวคิดสำคัญ
- relationships: ความเชื่อมโยงระหว่างข้อมูล
- additional_context: บริบทเพิ่มเติม
- references: แหล่งอ้างอิง`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
}

module.exports = (aiAssistant, lineHandler, logger) => {
    // GET /api/ai/status - Get system status
    router.get('/status', async (req, res) => {
        try {
            // Get AI system status
            const aiStatus = lineHandler?.getAiStatus ? lineHandler.getAiStatus() : { globalEnabled: false, userSettings: {} };
            
            // Initialize default values for modelConfig and generationConfig
            let modelConfig = {
                name: 'Unknown',
                configuration: {
                    temperature: 0.7,
                    maxOutputTokens: 1999,
                    topK: 40,
                    topP: 0.9
                }
            };
            let usageStats = { tokens: { input: 0, output: 0 }, requests: 0 };

            // Safely access aiAssistant properties if it exists
            if (aiAssistant) {
                modelConfig.name = aiAssistant.MODEL_NAME || modelConfig.name;
                if (aiAssistant.generationConfig) {
                    modelConfig.configuration.temperature = aiAssistant.generationConfig.temperature !== undefined ? aiAssistant.generationConfig.temperature : 0.7;
                    modelConfig.configuration.maxOutputTokens = aiAssistant.generationConfig.maxOutputTokens !== undefined ? aiAssistant.generationConfig.maxOutputTokens : 1999;
                    modelConfig.configuration.topK = aiAssistant.generationConfig.topK !== undefined ? aiAssistant.generationConfig.topK : 40;
                    modelConfig.configuration.topP = aiAssistant.generationConfig.topP !== undefined ? aiAssistant.generationConfig.topP : 0.9;
                }
                if (typeof aiAssistant.getUsageStats === 'function') {
                    usageStats = await aiAssistant.getUsageStats();
                }
            }

            // Get system health metrics
            const systemMetrics = {
                memoryUsage: process.memoryUsage(),
                uptime: process.uptime(),
                lastRestart: new Date(Date.now() - process.uptime() * 1000).toISOString()
            };

            res.json({
                success: true,
                timestamp: Date.now(),
                status: {
                    global: aiStatus.globalEnabled,
                    userSettings: aiStatus.userSettings,
                    model: {
                        ...modelConfig,
                        ready: !!aiAssistant // Indicates if aiAssistant dependency was provided
                    }
                },
                system: systemMetrics,
                usage: usageStats
            });

        } catch (error) {
            logger.error('Error getting AI status:', error);
            res.status(500).json({
                success: false,
                error: 'Error retrieving AI status',
                details: error.message
            });
        }
    });

    // POST /api/ai/toggle-global - Toggle global AI status
    router.post('/toggle-global', (req, res) => {
        try {
            const { enabled } = req.body;
            
            if (typeof enabled !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid enabled parameter - must be boolean'
                });
            }

            const status = lineHandler.setGlobalAiStatus(enabled);
            
            // Emit real-time update if Socket.IO is available
            if (req.io) {
                req.io.emit('ai_status_changed', { 
                    global: status,
                    timestamp: Date.now()
                });
            }
            
            res.json({ 
                success: true, 
                status,
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error('Error toggling global AI:', error);
            res.status(500).json({
                success: false,
                error: 'Error toggling global AI status',
                details: error.message
            });
        }
    });

    // POST /api/ai/test - Simple AI test endpoint
    router.post('/test', async (req, res) => {
        try {
            const { query, userId, options = {} } = req.body;

            if (!query) {
                return res.status(400).json({
                    success: false,
                    error: 'Query is required'
                });
            }

            const testUserId = userId || `test-user-${Date.now()}`;
            const startTime = Date.now();

            logger.info('AI Test Request', {
                query: query.substring(0, 100),
                userId: testUserId,
                options
            });

            // Call AI assistant to generate response
            const result = await aiAssistant.generateResponse(query, [], testUserId, options);
            const processingTime = Date.now() - startTime;

            res.json({
                success: true,
                query: query,
                response: result.response || result,
                tokens: result.tokens || { input: 0, output: 0, total: 0 },
                processingTime: processingTime,
                metadata: {
                    userId: testUserId,
                    modelUsed: aiAssistant?.configManager?.MODEL_NAME || 'Unknown',
                    language: result.contextUsed?.userLanguage || 'Unknown',
                    timestamp: Date.now()
                }
            });
        } catch (error) {
            logger.error('Error in AI test:', error);
            res.status(500).json({
                success: false,
                error: 'Error generating AI test response',
                details: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    });

    // Backward compatibility endpoint
    router.post('/test-response', async (req, res) => {
        try {
            const { query, userId, options = {} } = req.body;

            if (!query) {
                return res.status(400).json({
                    success: false,
                    error: 'Query is required'
                });
            }

            const testUserId = userId || 'test-user-multilang';

            // Call AI assistant to generate response
            const result = await aiAssistant.generateResponse(query, [], testUserId, options);

            res.json({
                success: true,
                result: result,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error in AI test response:', error);
            res.status(500).json({
                success: false,
                error: 'Error generating AI test response',
                details: error.message
            });
        }
    });

    // POST /api/ai/toggle-user/:userId - Toggle user-specific AI status
    router.post('/toggle-user/:userId', (req, res) => {
        try {
            const { userId } = req.params;
            const { enabled } = req.body;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required'
                });
            }

            if (typeof enabled !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid enabled parameter - must be boolean'
                });
            }

            const status = lineHandler.setUserAiStatus(userId, enabled);
            
            // Emit real-time update if Socket.IO is available
            if (req.io) {
                req.io.emit('user_ai_status_changed', { 
                    userId, 
                    enabled: status,
                    timestamp: Date.now()
                });
            }

            res.json({ 
                success: true, 
                userId,
                enabled: status,
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error('Error toggling user AI:', error);
            res.status(500).json({
                success: false,
                error: 'Error toggling user AI status',
                details: error.message
            });
        }
    });

    // POST /api/ai/process-files - Process files with AI
    router.post('/process-files', upload.array('files'), async (req, res) => {
        try {
            const files = req.files;
            const processingType = req.body.processingType || 'auto-detect';
            const customInstructions = req.body.customInstructions;

            // Validate file upload
            if (!files || files.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No files uploaded'
                });
            }

            // Initialize AI model
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

            const processedFiles = [];
            const failedFiles = [];

            // Create output directory
            const outputDir = path.join(__dirname, '..', 'processed_files');
            await fs.mkdir(outputDir, { recursive: true });

            // Emit start message
            if (req.io) {
                req.io.emit('message', {
                    type: 'log',
                    message: `เริ่มประมวลผลไฟล์ด้วย AI: ${processingType}`,
                    logType: 'info'
                });
            }

            // Process each file
            for (const file of files) {
                try {
                    const fileContent = await fs.readFile(file.path, 'utf8');

                    // Emit progress
                    if (req.io) {
                        req.io.emit('upload_progress', {
                            current: processedFiles.length + failedFiles.length + 1,
                            total: files.length,
                            file: file.originalname
                        });
                    }

                    // Process based on type
                    let processedContent;
                    switch(processingType) {
                        case 'auto-detect':
                            processedContent = await autoDetectAndProcess(model, fileContent);
                            break;
                        case 'product-catalog':
                            processedContent = await createProductCatalog(model, fileContent);
                            break;
                        case 'knowledge-base':
                            processedContent = await createKnowledgeBase(model, fileContent);
                            break;
                        default:
                            throw new Error('Invalid processing type');
                    }

                    // Save processed content
                    const outputFileName = `processed_${Date.now()}_${file.originalname}`;
                    const outputPath = path.join(outputDir, outputFileName);
                    await fs.writeFile(outputPath, JSON.stringify(processedContent, null, 2));

                    if (req.io) {
                        req.io.emit('message', {
                            type: 'log',
                            message: `ประมวลผลไฟล์สำเร็จ: ${file.originalname}`,
                            logType: 'success'
                        });
                    }

                    processedFiles.push({
                        originalName: file.originalname,
                        processedName: outputFileName,
                        outputPath: outputPath
                    });

                    // Clean up uploaded file
                    await fs.unlink(file.path);

                } catch (fileError) {
                    logger.error('File processing error:', fileError);
                    
                    if (req.io) {
                        req.io.emit('message', {
                            type: 'log',
                            message: `ประมวลผลไฟล์ล้มเหลว: ${file.originalname}`,
                            logType: 'error',
                            error: fileError.message
                        });
                    }

                    failedFiles.push({
                        originalName: file.originalname,
                        error: fileError.message
                    });

                    try {
                        await fs.unlink(file.path);
                    } catch (unlinkError) {
                        logger.error('Error deleting failed file:', unlinkError);
                    }
                }
            }

            res.json({
                success: true,
                total: files.length,
                processed: processedFiles.length,
                failed: failedFiles.length,
                processedFiles,
                failedFiles,
                outputPath: outputDir
            });

        } catch (error) {
            logger.error('Error processing files:', error);

            // Clean up any remaining files
            if (req.files) {
                for (const file of req.files) {
                    try {
                        await fs.unlink(file.path);
                    } catch (unlinkError) {
                        logger.error('Error deleting file:', unlinkError);
                    }
                }
            }

            if (req.io) {
                req.io.emit('message', {
                    type: 'log',
                    message: `เกิดข้อผิดพลาดในการประมวลผล: ${error.message}`,
                    logType: 'error'
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error processing files',
                details: error.message
            });
        }
    });

    // GET /api/ai/config - Get AI configuration
    router.get('/config', (req, res) => {
        try {
            const config = {
                modelName: aiAssistant?.MODEL_NAME || 'Unknown', // Safely access
                generationConfig: {
                    temperature: aiAssistant?.generationConfig?.temperature || 0.7,
                    topK: aiAssistant?.generationConfig?.topK || 40,
                    topP: aiAssistant?.generationConfig?.topP || 0.9,
                    maxOutputTokens: aiAssistant?.generationConfig?.maxOutputTokens || 1999,
                },
                aiStatus: lineHandler?.getAiStatus ? lineHandler.getAiStatus() : {} // Safely access
            };
            
            res.json({ 
                success: true, 
                config,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting AI configuration:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Error getting AI configuration',
                details: error.message
            });
        }
    });

    // POST /api/ai/config - Update AI configuration
    router.post('/config', async (req, res) => {
        try {
            const { temperature, topK, topP, maxOutputTokens } = req.body;
            
            // Ensure aiAssistant and generationConfig exist before attempting to update
            if (!aiAssistant || !aiAssistant.generationConfig) {
                return res.status(500).json({
                    success: false,
                    error: 'AI Assistant or its configuration is not initialized on the server.'
                });
            }

            // Validate temperature
            if (temperature !== undefined) {
                if (temperature < 0 || temperature > 1) {
                    return res.status(400).json({
                        success: false,
                        error: 'Temperature must be between 0 and 1'
                    });
                }
                aiAssistant.generationConfig.temperature = temperature;
            }

            // Validate topK
            if (topK !== undefined) {
                if (topK < 1) {
                    return res.status(400).json({
                        success: false,
                        error: 'TopK must be greater than 0'
                    });
                }
                aiAssistant.generationConfig.topK = topK;
            }

            // Validate topP
            if (topP !== undefined) {
                if (topP < 0 || topP > 1) {
                    return res.status(400).json({
                        success: false,
                        error: 'TopP must be between 0 and 1'
                    });
                }
                aiAssistant.generationConfig.topP = topP;
            }

            // Validate maxOutputTokens
            if (maxOutputTokens !== undefined) {
                if (maxOutputTokens < 1) {
                    return res.status(400).json({
                        success: false,
                        error: 'MaxOutputTokens must be greater than 0'
                    });
                }
                aiAssistant.generationConfig.maxOutputTokens = maxOutputTokens;
            }

            // Return updated configuration
            res.json({ 
                success: true, 
                config: {
                    temperature: aiAssistant.generationConfig.temperature,
                    topK: aiAssistant.generationConfig.topK,
                    topP: aiAssistant.generationConfig.topP,
                    maxOutputTokens: aiAssistant.generationConfig.maxOutputTokens
                },
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error('Error updating AI configuration:', error);
            res.status(500).json({
                success: false,
                error: 'Error updating AI configuration',
                details: error.message
            });
        }
    });

    // POST /api/ai/reset-config - Reset AI configuration to defaults
    router.post('/reset-config', async (req, res) => {
        try {
            if (!aiAssistant) {
                return res.status(500).json({
                    success: false,
                    error: 'AI Assistant is not initialized on the server.'
                });
            }
            // Reset generation configuration to defaults
            aiAssistant.generationConfig = {
                temperature: 0.7,
                topK: 40,
                topP: 0.9,
                maxOutputTokens: 1999
            };

            res.json({
                success: true,
                message: 'AI configuration reset to defaults',
                config: aiAssistant.generationConfig,
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error('Error resetting AI configuration:', error);
            res.status(500).json({
                success: false,
                error: 'Error resetting AI configuration',
                details: error.message
            });
        }
    });

    // GET /api/ai/usage - Get AI usage statistics
    router.get('/usage', async (req, res) => {
        try {
            let usageStats;
            if (aiAssistant && typeof aiAssistant.getUsageStats === 'function') {
                usageStats = await aiAssistant.getUsageStats();
            } else {
                usageStats = {
                    totalRequests: 0,
                    tokens: {
                        input: 0,
                        output: 0,
                        total: 0
                    },
                    costs: {
                        input: 0,
                        output: 0,
                        total: 0
                    }
                };
            }

            // Get active users with AI enabled
            const aiStatus = lineHandler?.getAiStatus ? lineHandler.getAiStatus() : { userSettings: {} };
            const activeAiUsers = Object.entries(aiStatus.userSettings)
                .filter(([_, enabled]) => enabled)
                .map(([userId]) => userId);

            res.json({
                success: true,
                timestamp: Date.now(),
                usage: {
                    ...usageStats,
                    activeUsers: {
                        total: activeAiUsers.length,
                        users: activeAiUsers
                    }
                }
            });

        } catch (error) {
            logger.error('Error getting AI usage statistics:', error);
            res.status(500).json({
                success: false,
                error: 'Error getting AI usage statistics',
                details: error.message
            });
        }
    });


    // POST /api/ai/chat-test - Full-featured chat test with knowledge and products
    router.post('/chat-test', async (req, res) => {
        try {
            const {
                query,
                userId,
                useKnowledge = true,
                includeProducts = true,
                knowledgeOptions = {},
                productOptions = {},
                generationConfig = {}
            } = req.body;

            if (!query) {
                return res.status(400).json({
                    success: false,
                    error: 'Query is required'
                });
            }

            const testUserId = userId || `test-chat-${Date.now()}`;
            const startTime = Date.now();

            logger.info('AI Chat Test Request', {
                query: query.substring(0, 100),
                userId: testUserId,
                useKnowledge,
                includeProducts
            });

            // Prepare chat options
            const chatOptions = {
                useKnowledge,
                knowledgeOptions: {
                    topK: knowledgeOptions.topK || 5,
                    scoreThreshold: knowledgeOptions.scoreThreshold || 0.3,
                    ...knowledgeOptions
                },
                productOptions: {
                    includeProducts,
                    ...productOptions
                },
                generationConfig: {
                    temperature: generationConfig.temperature,
                    maxOutputTokens: generationConfig.maxOutputTokens,
                    topP: generationConfig.topP,
                    topK: generationConfig.topK
                }
            };

            // Use chatWithKnowledge if available, otherwise use generateResponse
            let result;
            if (aiAssistant && typeof aiAssistant.chatWithKnowledge === 'function') {
                result = await aiAssistant.chatWithKnowledge(query, testUserId, chatOptions);
            } else {
                // Fallback to basic generateResponse
                result = await aiAssistant.generateResponse(query, [], testUserId, chatOptions);
            }

            const processingTime = Date.now() - startTime;

            res.json({
                success: true,
                query: query,
                response: result.response || result,
                tokens: result.tokens || { input: 0, output: 0, total: 0 },
                processingTime: processingTime,
                contextUsed: result.contextUsed || {},
                products: result.products || [],
                sources: result.sources || {},
                metadata: {
                    userId: testUserId,
                    modelUsed: aiAssistant?.configManager?.MODEL_NAME || 'Unknown',
                    language: result.userLanguage || result.contextUsed?.userLanguage || 'Unknown',
                    useKnowledge: useKnowledge,
                    includeProducts: includeProducts,
                    timestamp: Date.now()
                }
            });
        } catch (error) {
            logger.error('Error in AI chat test:', error);
            res.status(500).json({
                success: false,
                error: 'Error in AI chat test',
                details: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    });

    // POST /api/ai/test-model - Test specific model
    router.post('/test-model', async (req, res) => {
        try {
            const { modelName, testQuery = "สวัสดีครับ ทดสอบโมเดล AI", generationConfig = {} } = req.body;

            if (!modelName) {
                return res.status(400).json({
                    success: false,
                    error: 'Model name is required'
                });
            }

            const startTime = Date.now();

            logger.info('AI Model Test Request', {
                modelName,
                testQuery: testQuery.substring(0, 100)
            });

            // Initialize Google AI directly for testing
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

            // Prepare generation config
            const testConfig = {
                temperature: generationConfig.temperature || 0.7,
                topK: generationConfig.topK || 60,
                topP: generationConfig.topP || 0.6,
                maxOutputTokens: generationConfig.maxOutputTokens || 2000
            };

            // Create model instance
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: testConfig
            });

            // Test the model
            const result = await model.generateContent(testQuery);
            const response = result.response;
            const responseText = response.text();
            const processingTime = Date.now() - startTime;

            res.json({
                success: true,
                modelName: modelName,
                testQuery: testQuery,
                response: responseText,
                tokens: {
                    input: response.usageMetadata?.promptTokenCount || 0,
                    output: response.usageMetadata?.candidatesTokenCount || 0,
                    total: response.usageMetadata?.totalTokenCount || 0
                },
                processingTime: processingTime,
                generationConfig: testConfig,
                metadata: {
                    finishReason: response.candidates?.[0]?.finishReason,
                    safetyRatings: response.candidates?.[0]?.safetyRatings,
                    timestamp: Date.now()
                }
            });

        } catch (error) {
            logger.error('Error testing model:', error);
            res.status(500).json({
                success: false,
                error: 'Error testing model',
                details: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    });

    // POST /api/ai/process-products - Process products with AI
    router.post('/process-products', async (req, res) => {
        try {
            const { productCodes } = req.body;

            if (!Array.isArray(productCodes)) {
                return res.status(400).json({
                    success: false,
                    error: 'Product codes must be provided as an array'
                });
            }

            // Process products with AI
            const results = await Promise.all(
                productCodes.map(async (code) => {
                    try {
                        // Ensure aiAssistant exists and has processProduct method
                        if (!aiAssistant || typeof aiAssistant.processProduct !== 'function') {
                            throw new Error('AI Assistant is not available or not configured to process products.');
                        }
                        const result = await aiAssistant.processProduct(code);
                        return {
                            code,
                            success: true,
                            result
                        };
                    } catch (error) {
                        logger.error(`Error processing product ${code}:`, error);
                        return {
                            code,
                            success: false,
                            error: error.message
                        };
                    }
                })
            );

            // Calculate summary statistics
            const summary = {
                total: results.length,
                successful: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length
            };

            // Emit real-time update if Socket.IO is available
            if (req.io) {
                req.io.emit('product_processing_complete', {
                    summary,
                    timestamp: Date.now()
                });
            }

            res.json({
                success: true,
                summary,
                results,
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error('Error processing products:', error);
            res.status(500).json({
                success: false,
                error: 'Error processing products',
                details: error.message
            });
        }
    });

    // Error handling middleware
    router.use((err, req, res, next) => {
        logger.error('AI Routes Error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: err.message
        });
    });

    return router;
};
