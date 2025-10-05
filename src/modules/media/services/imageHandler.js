'use strict';

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const sharp = require('sharp');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { resolveDataPath, resolveUploadsPath, resolveProcessedPath } = require('../../../app/paths');

class ImageHandler {
    constructor(logger, aiAssistant, lineHandler, chatHistory) {
        this.logger = logger;
        this.aiAssistant = aiAssistant;
        this.lineHandler = lineHandler;
        this.chatHistory = chatHistory;
        this.initialized = false;
        this.configPath = resolveDataPath('image_config.json');
        
        // Model configuration
        this.currentModel = 'gemini-2.5-pro';
        this.MODEL_NAME = this.currentModel;
        this.availableModels = []; // Will be loaded from API
        this.lastModelUpdate = null;
        this.MODEL_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
        
        // Configuration with default values
        this.uploadDir = resolveUploadsPath('images');
        this.processedDir = resolveProcessedPath('images');
        this.MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
        this.SUPPORTED_FORMATS = ['jpeg', 'jpg', 'png', 'webp', 'gif'];
        
        // Image aggregation configuration
        this.imageBatchMap = new Map(); // To store pending images for aggregation
        this.BATCH_TIMEOUT = 120000; // 20 seconds timeout for batching images
        this.MAX_BATCH_SIZE = 5; // Maximum number of images to process in a batch
        this.MIN_IMAGE_GAP = 120000; // 5 seconds between images to be considered for batching
        
        // User comment configuration
        this.COMMENT_LOOKBACK_WINDOW = 120000; // 15 seconds to look back for user comments
        this.MAX_COMMENT_LENGTH = 120000; // Maximum length of user comment to include
        
        // Prompt template for image analysis
        this.promptTemplate = "ช่วยอธิบายรูปภาพนี้อย่างละเอียด โดยระบุว่าเป็นบรรจุภัณฑ์ประเภทไหน มีลักษณะอย่างไร มีขนาดและรูปทรงใด หากเป็นกล่อง ให้อธิบายว่าเป็นกล่องประเภทไหน ทำจากวัสดุอะไร และเหมาะกับใส่สินค้าประเภทใด";
        
        // Initialize Gemini client during constructor
        if (process.env.GEMINI_API_KEY) {
            this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            this.model = this.genAI.getGenerativeModel({
                model: this.MODEL_NAME,
                generationConfig: {
                    temperature: 1,
                    topK: 60,
                    topP: 0.95,
                    maxOutputTokens: 64000
                }
            });
            this.initialized = true;
        } else {
            this.logger.error('GEMINI_API_KEY not configured for ImageHandler');
        }
    }

    async fetchAvailableModels() {
        try {
            if (!process.env.GEMINI_API_KEY) {
                throw new Error('GEMINI_API_KEY not configured');
            }

            // Check if we have cached models that are still fresh
            if (this.availableModels.length > 0 && this.lastModelUpdate) {
                const age = Date.now() - this.lastModelUpdate;
                if (age < this.MODEL_CACHE_DURATION) {
                    this.logger.info('Using cached model list', {
                        modelCount: this.availableModels.length,
                        ageHours: Math.round(age / (60 * 60 * 1000))
                    });
                    return this.availableModels;
                }
            }

            this.logger.info('Fetching available models from Gemini API...');

            const response = await axios.get(
                'https://generativelanguage.googleapis.com/v1/models',
                {
                    params: {
                        key: process.env.GEMINI_API_KEY
                    },
                    timeout: 10000
                }
            );

            if (response.data && response.data.models) {
                // Filter models that support vision/image tasks
                const visionModels = response.data.models.filter(model => {
                    const name = model.name.replace('models/', '');
                    // Filter for models that likely support vision
                    return (
                        model.supportedGenerationMethods &&
                        model.supportedGenerationMethods.includes('generateContent') &&
                        (name.includes('vision') || 
                         name.includes('pro') || 
                         name.includes('flash') ||
                         name.includes('1.5'))
                    );
                }).map(model => {
                    const name = model.name.replace('models/', '');
                    return {
                        name: name,
                        displayName: model.displayName || name,
                        description: model.description || '',
                        version: model.version || 'latest',
                        inputTokenLimit: model.inputTokenLimit || 30720,
                        outputTokenLimit: model.outputTokenLimit || 2048,
                        supportedGenerationMethods: model.supportedGenerationMethods || [],
                        temperature: model.temperature || 0.4,
                        topP: model.topP || 0.95,
                        topK: model.topK || 32
                    };
                });

                this.availableModels = visionModels;
                this.lastModelUpdate = Date.now();

                this.logger.info('Successfully fetched available models', {
                    totalModels: response.data.models.length,
                    visionModels: visionModels.length,
                    models: visionModels.map(m => m.name)
                });

                return this.availableModels;
            } else {
                throw new Error('Invalid response format from Gemini API');
            }
        } catch (error) {
            this.logger.error('Error fetching available models:', {
                error: error.message,
                stack: error.stack
            });

            // Return fallback models if API call fails
            const fallbackModels = [
                {
                    name: 'gemini-2.5-pro',
                    displayName: 'Gemini 1.5 Pro',
                    description: 'Most capable model for complex tasks',
                    version: 'latest',
                    inputTokenLimit: 1000000,
                    outputTokenLimit: 8192,
                    supportedGenerationMethods: ['generateContent'],
                    temperature: 0.4,
                    topP: 0.95,
                    topK: 32
                },
                {
                    name: 'gemini-1.5-flash',
                    displayName: 'Gemini 1.5 Flash',
                    description: 'Fast and efficient for quick analysis',
                    version: 'latest',
                    inputTokenLimit: 1000000,
                    outputTokenLimit: 8192,
                    supportedGenerationMethods: ['generateContent'],
                    temperature: 0.3,
                    topP: 0.8,
                    topK: 40
                },
                {
                    name: 'gemini-1.0-pro-vision-latest',
                    displayName: 'Gemini Pro Vision',
                    description: 'Specialized for image understanding',
                    version: 'latest',
                    inputTokenLimit: 12288,
                    outputTokenLimit: 4096,
                    supportedGenerationMethods: ['generateContent'],
                    temperature: 0.4,
                    topP: 0.95,
                    topK: 32
                }
            ];

            this.availableModels = fallbackModels;
            this.lastModelUpdate = Date.now();

            this.logger.warn('Using fallback model list due to API error', {
                fallbackCount: fallbackModels.length
            });

            return this.availableModels;
        }
    }

    async getAvailableModels() {
        if (this.availableModels.length === 0 || !this.lastModelUpdate) {
            await this.fetchAvailableModels();
        }
        return this.availableModels;
    }

    async setModel(modelName) {
        try {
            // Ensure we have the latest model list
            await this.fetchAvailableModels();
            
            // Validate model exists
            const modelInfo = this.availableModels.find(m => m.name === modelName);
            if (!modelInfo) {
                throw new Error(`Model ${modelName} not found in available models`);
            }

            // Update current model
            this.currentModel = modelName;
            this.MODEL_NAME = modelName;

            // Recreate the Gemini model instance with new model
            if (this.genAI) {
                this.model = this.genAI.getGenerativeModel({
                    model: this.MODEL_NAME,
                    generationConfig: {
                        temperature: modelInfo.temperature || 0.4,
                        topK: modelInfo.topK || 32,
                        topP: modelInfo.topP || 0.95,
                        maxOutputTokens: Math.min(modelInfo.outputTokenLimit || 1024, 2048)
                    }
                });
            }

            this.logger.info('Model changed successfully', {
                oldModel: this.currentModel !== modelName ? 'unknown' : this.currentModel,
                newModel: modelName,
                modelInfo: {
                    displayName: modelInfo.displayName,
                    description: modelInfo.description,
                    inputTokenLimit: modelInfo.inputTokenLimit,
                    outputTokenLimit: modelInfo.outputTokenLimit
                }
            });

            // Save configuration
            await this.saveConfig();

            return {
                success: true,
                currentModel: this.currentModel,
                modelInfo: modelInfo
            };
        } catch (error) {
            this.logger.error('Error setting model:', {
                error: error.message,
                requestedModel: modelName,
                currentModel: this.currentModel
            });

            return {
                success: false,
                error: error.message,
                currentModel: this.currentModel
            };
        }
    }

    getCurrentModel() {
        const modelInfo = this.availableModels.find(m => m.name === this.currentModel);
        return {
            currentModel: this.currentModel,
            modelInfo: modelInfo || null,
            lastUpdate: this.lastModelUpdate
        };
    }

    async initialize() {
        try {
            // Create necessary directories
            await fs.mkdir(this.uploadDir, { recursive: true });
            await fs.mkdir(this.processedDir, { recursive: true });
            await fs.mkdir(path.dirname(this.configPath), { recursive: true });
            
            // Load configuration from file if exists
            await this.loadConfig();
            
            // Fetch available models
            await this.fetchAvailableModels();
            
            if (!this.initialized) {
                if (!process.env.GEMINI_API_KEY) {
                    throw new Error('GEMINI_API_KEY is not configured');
                }
                
                this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                this.model = this.genAI.getGenerativeModel({
                    model: this.MODEL_NAME
                });
                this.initialized = true;
            }
            
            this.logger.info('ImageHandler initialized successfully', {
                currentModel: this.currentModel,
                availableModels: this.availableModels.length
            });
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize ImageHandler:', {
                error: error.message,
                stack: error.stack
            });
            return false;
        }
    }

    async loadConfig() {
        try {
            const data = await fs.readFile(this.configPath, 'utf8');
            const config = JSON.parse(data);
            
            // Update configuration with loaded values
            if (config.batchTimeout) this.BATCH_TIMEOUT = config.batchTimeout;
            if (config.maxBatchSize) this.MAX_BATCH_SIZE = config.maxBatchSize;
            if (config.minImageGap) this.MIN_IMAGE_GAP = config.minImageGap;
            if (config.commentLookbackWindow) this.COMMENT_LOOKBACK_WINDOW = config.commentLookbackWindow;
            if (config.maxCommentLength) this.MAX_COMMENT_LENGTH = config.maxCommentLength;
            if (config.promptTemplate) this.promptTemplate = config.promptTemplate;
            if (config.currentModel) {
                this.currentModel = config.currentModel;
                this.MODEL_NAME = config.currentModel;
            }
            
            this.logger.info('Loaded image configuration from file', {
                currentModel: this.currentModel,
                batchTimeout: this.BATCH_TIMEOUT,
                maxBatchSize: this.MAX_BATCH_SIZE,
                minImageGap: this.MIN_IMAGE_GAP
            });
            
            return true;
        } catch (error) {
            // If file doesn't exist or has invalid JSON, use defaults and create the file
            if (error.code === 'ENOENT' || error instanceof SyntaxError) {
                await this.saveConfig();
                this.logger.info('Created new image configuration file with defaults');
                return true;
            }
            
            this.logger.error('Error loading image configuration:', {
                error: error.message,
                stack: error.stack
            });
            return false;
        }
    }

    async saveConfig() {
        try {
            const config = {
                currentModel: this.currentModel,
                batchTimeout: this.BATCH_TIMEOUT,
                maxBatchSize: this.MAX_BATCH_SIZE,
                minImageGap: this.MIN_IMAGE_GAP,
                commentLookbackWindow: this.COMMENT_LOOKBACK_WINDOW,
                maxCommentLength: this.MAX_COMMENT_LENGTH,
                promptTemplate: this.promptTemplate,
                lastUpdated: new Date().toISOString()
            };

            // Ensure directory exists before writing
            const configDir = path.dirname(this.configPath);
            await fs.mkdir(configDir, { recursive: true });

            await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf8');
            
            this.logger.info('Saved image configuration to file', {
                configPath: this.configPath,
                currentModel: this.currentModel
            });
            
            return true;
        } catch (error) {
            this.logger.error('Error saving image configuration:', {
                error: error.message,
                stack: error.stack
            });
            return false;
        }
    }

    async processLineImage(messageId, contentProvider, userId, replyToken, userComment = null) {
        try {
            this.logger.info('Processing LINE image:', {
                messageId,
                userId,
                contentType: contentProvider.type,
                hasComment: userComment !== null,
                currentModel: this.currentModel
            });
    
            // Download image from LINE
            const imageBuffer = await this.downloadLineImage(messageId);
            if (!imageBuffer) {
                // Log error but don't reply to user
                this.logger.error('Failed to download image', { 
                    messageId, 
                    userId 
                });
                return { success: false, error: 'Image download failed' };
            }
    
            // Send loading animation while processing
            await this.lineHandler.sendLoadingAnimation(userId);
            
            // Add image to batch processing
            const imageDetails = {
                messageId,
                replyToken,
                buffer: imageBuffer,
                timestamp: Date.now(),
                userComment // Include user comment with the image (ถ้ามี)
            };
            
            this.logger.info('Adding image to batch processor', {
                userId,
                messageId,
                hasComment: userComment !== null,
                currentModel: this.currentModel
            });
            
            return this.addToBatch(userId, imageDetails);
        } catch (error) {
            this.logger.error('Error processing LINE image:', {
                error: error.message,
                stack: error.stack,
                userId,
                messageId
            });
            
            // Don't send error message to user
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getPrecedingUserComment(userId) {
        try {
            // Load the user's chat history
            const chatHistory = await this.chatHistory.loadAIChatHistory(userId);
            if (!chatHistory || !chatHistory.messages || chatHistory.messages.length === 0) {
                return null;
            }
            
            // Get recent user messages (last 5)
            const now = Date.now();
            const recentUserMessages = chatHistory.messages
                .filter(msg => 
                    msg.role === 'user' && 
                    (now - msg.timestamp) <= this.COMMENT_LOOKBACK_WINDOW
                )
                .sort((a, b) => b.timestamp - a.timestamp); // Most recent first
            
            if (recentUserMessages.length === 0) {
                return null;
            }
            
            // Get the most recent user message
            const latestMessage = recentUserMessages[0];
            
            // Truncate if too long
            let comment = latestMessage.content;
            if (comment.length > this.MAX_COMMENT_LENGTH) {
                comment = comment.substring(0, this.MAX_COMMENT_LENGTH) + '...';
            }
            
            this.logger.info('Found preceding user comment for image', {
                userId,
                commentAge: now - latestMessage.timestamp,
                commentLength: comment.length
            });
            
            return comment;
        } catch (error) {
            this.logger.error('Error getting preceding user comment:', {
                error: error.message,
                userId
            });
            return null;
        }
    }

    async addToBatch(userId, imageDetails) {
        const now = Date.now();
        
        // Get current batch for user or create a new one
        if (!this.imageBatchMap.has(userId)) {
            // Create new batch for this user
            const timeoutId = setTimeout(() => this.processBatch(userId), this.BATCH_TIMEOUT);
            this.imageBatchMap.set(userId, {
                images: [imageDetails],
                startTime: now,
                lastImageTime: now,
                timeoutId: timeoutId
            });
            
            this.logger.info('Created new image batch for user', {
                userId,
                batchTimeout: this.BATCH_TIMEOUT,
                hasUserComment: !!imageDetails.userComment,
                currentModel: this.currentModel
            });
            
            return {
                success: true,
                batching: true,
                batchSize: 1
            };
        } else {
            // Add to existing batch
            const batch = this.imageBatchMap.get(userId);
            const timeSinceLastImage = now - batch.lastImageTime;
            
            // If enough time has passed since last image, add to batch
            if (timeSinceLastImage <= this.MIN_IMAGE_GAP) {
                batch.images.push(imageDetails);
                batch.lastImageTime = now;
                
                // Clear existing timeout and set a new one
                clearTimeout(batch.timeoutId);
                batch.timeoutId = setTimeout(() => this.processBatch(userId), this.BATCH_TIMEOUT);
                
                this.logger.info('Added image to existing batch', {
                    userId,
                    batchSize: batch.images.length,
                    timeSinceLastImage,
                    hasUserComment: !!imageDetails.userComment,
                    currentModel: this.currentModel
                });
                
                // If we've reached max batch size, process immediately
                if (batch.images.length >= this.MAX_BATCH_SIZE) {
                    clearTimeout(batch.timeoutId);
                    this.processBatch(userId);
                }
                
                return {
                    success: true,
                    batching: true,
                    batchSize: batch.images.length
                };
            } else {
                // Process the existing batch before starting a new one
                await this.processBatch(userId);
                
                // Create new batch with this image
                const timeoutId = setTimeout(() => this.processBatch(userId), this.BATCH_TIMEOUT);
                this.imageBatchMap.set(userId, {
                    images: [imageDetails],
                    startTime: now,
                    lastImageTime: now,
                    timeoutId: timeoutId
                });
                
                this.logger.info('Created new image batch after timeout', {
                    userId,
                    timeSinceLastImage,
                    hasUserComment: !!imageDetails.userComment,
                    currentModel: this.currentModel
                });
                
                return {
                    success: true,
                    batching: true,
                    batchSize: 1
                };
            }
        }
    }

    async processBatch(userId) {
        // Get the batch for this user
        const batch = this.imageBatchMap.get(userId);
        if (!batch || batch.images.length === 0) {
            this.imageBatchMap.delete(userId);
            return;
        }
        
        // Remove from batch map and clear timeout
        this.imageBatchMap.delete(userId);
        clearTimeout(batch.timeoutId);
        
        this.logger.info('Processing image batch', {
            userId,
            batchSize: batch.images.length,
            batchAge: Date.now() - batch.startTime,
            currentModel: this.currentModel
        });
        
        try {
            // Process each image to get descriptions
            const analysisPromises = batch.images.map(img => this.analyzeImage(img.buffer));
            const imageDescriptions = await Promise.all(analysisPromises);
            
            // Collect all user comments from the batch
            const userComments = batch.images
                .filter(img => img.userComment)
                .map(img => img.userComment);
            
            // Get a unique set of comments (in case multiple images have the same comment)
            const uniqueComments = [...new Set(userComments)];
            
            // Generate combined text
            let combinedText = '';
            
            // Add user comments at the beginning if they exist
            if (uniqueComments.length > 0) {
                combinedText += "ข้อความจากผู้ใช้:\n";
                combinedText += uniqueComments.join("\n") + "\n\n";
            }
            
            // แสดงจำนวนรูปภาพที่ประมวลผล
            if (batch.images.length > 1) {
                combinedText += `.`;
            } else {
                combinedText += `.`;
            }
            
            // Format with numbered descriptions for multiple images
            combinedText += imageDescriptions.map((desc, i) => 
                batch.images.length > 1 ? 
                `รูปที่ ${i+1}: ${desc}` : 
                desc
            ).join('\n\n');
            
            // Use the reply token from the first image
            const replyToken = batch.images[0].replyToken;
            const messageId = `img_batch_${Date.now()}_${batch.images.length}`;
            
            await this.lineHandler.processUserMessage(
                userId, 
                combinedText, 
                replyToken, 
                messageId
            );
            
            this.logger.info('Batch processing completed', {
                userId,
                batchSize: batch.images.length,
                commentCount: uniqueComments.length,
                combinedLength: combinedText.length,
                currentModel: this.currentModel
            });
        } catch (error) {
            this.logger.error('Error processing image batch:', {
                error: error.message,
                userId,
                batchSize: batch.images.length,
                currentModel: this.currentModel
            });
            
            // Don't send error message to user
        }
    }
    
    async downloadLineImage(messageId) {
        try {
            if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
                throw new Error('LINE_CHANNEL_ACCESS_TOKEN not configured');
            }

            const lineContentUrl = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
            const response = await axios({
                method: 'get',
                url: lineContentUrl,
                responseType: 'arraybuffer',
                headers: {
                    'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
                }
            });

            const imageBuffer = Buffer.from(response.data);
            
            // Save the original image
            const filename = `${uuidv4()}_original.jpg`;
            const filepath = path.join(this.uploadDir, filename);
            await fs.writeFile(filepath, imageBuffer);
            
            this.logger.info('LINE image downloaded successfully', {
                messageId,
                size: imageBuffer.length,
                path: filepath
            });
            
            return imageBuffer;
        } catch (error) {
            this.logger.error('Error downloading LINE image:', {
                error: error.message,
                messageId
            });
            return null;
        }
    }

    async analyzeImage(imageBuffer) {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            // Optimize the image if needed
            const optimizedBuffer = await this.optimizeImage(imageBuffer);
            
            // Convert image to base64 for Gemini
            const base64Image = optimizedBuffer.toString('base64');
            
            // Use the configurable promptTemplate instead of hardcoded prompt
            const result = await this.model.generateContent([
                this.promptTemplate,
                {
                    inlineData: {
                        mimeType: "image/jpeg",
                        data: base64Image
                    }
                }
            ]);
            
            const responseText = result.response.text();
            
            this.logger.info('Image analysis completed', {
                descriptionLength: responseText.length,
                currentModel: this.currentModel
            });
            
            return responseText;
        } catch (error) {
            this.logger.error('Error analyzing image:', {
                error: error.message,
                stack: error.stack,
                currentModel: this.currentModel
            });
            throw error;
        }
    }

    async optimizeImage(imageBuffer) {
        try {
            // Check if the image needs optimization
            if (imageBuffer.length < this.MAX_IMAGE_SIZE) {
                return imageBuffer;
            }
            
            // Process with sharp
            const optimized = await sharp(imageBuffer)
                .resize({
                    width: 1200,
                    height: 1200,
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ quality: 85, progressive: true })
                .toBuffer();
            
            this.logger.info('Image optimized successfully', {
                originalSize: imageBuffer.length,
                optimizedSize: optimized.length,
                reduction: `${((1 - optimized.length / imageBuffer.length) * 100).toFixed(2)}%`
            });
            
            return optimized;
        } catch (error) {
            this.logger.error('Error optimizing image:', {
                error: error.message
            });
            // Return original buffer if optimization fails
            return imageBuffer;
        }
    }

    async processUploadedImage(file, userId, userComment = null) {
        try {
            if (!file || !file.buffer) {
                throw new Error('Invalid file upload');
            }
            
            const fileExtension = path.extname(file.originalname).toLowerCase().substring(1);
            if (!this.SUPPORTED_FORMATS.includes(fileExtension)) {
                throw new Error(`Unsupported image format: ${fileExtension}`);
            }
            
            // Save original image
            const filename = `${uuidv4()}_${file.originalname}`;
            const filepath = path.join(this.uploadDir, filename);
            await fs.writeFile(filepath, file.buffer);
            
            // Analyze image
            const imageDescription = await this.analyzeImage(file.buffer);
            
            // Combine user comment with image description if provided
            let combinedText = '';
            if (userComment) {
                combinedText = `ข้อความจากผู้ใช้:\n${userComment}\n\n**วิเคราะห์รูปภาพ (โมเดล: ${this.currentModel})**\n\n${imageDescription}`;
            } else {
                combinedText = `**วิเคราะห์รูปภาพ (โมเดล: ${this.currentModel})**\n\n${imageDescription}`;
            }
            
            // For uploaded images via web interface, we search products and generate a response
            const searchResults = await this.aiAssistant.productManager.searchProducts(combinedText, userId);
            
            const response = await this.aiAssistant.generateResponse(
                combinedText,
                searchResults.results,
                userId
            );
            
            return {
                success: true,
                filename,
                description: imageDescription,
                userComment: userComment,
                combinedText: combinedText,
                response: response.response,
                model: this.currentModel
            };
        } catch (error) {
            this.logger.error('Error processing uploaded image:', {
                error: error.message,
                stack: error.stack,
                userId,
                filename: file?.originalname,
                currentModel: this.currentModel
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    async processLineImageWithComment(messageId, contentProvider, userId, replyToken, userComment) {
        try {
            this.logger.info('Processing LINE image with explicit comment:', {
                messageId,
                userId,
                commentLength: userComment?.length || 0,
                currentModel: this.currentModel
            });
    
            // Download image from LINE
            const imageBuffer = await this.downloadLineImage(messageId);
            if (!imageBuffer) {
                // Log error but don't reply to user
                this.logger.error('Failed to download image with comment', { 
                    messageId, 
                    userId 
                });
                return { success: false, error: 'Image download failed' };
            }
    
            // Process the image
            await this.lineHandler.sendLoadingAnimation(userId);
            
            // Analyze the image
            const imageDescription = await this.analyzeImage(imageBuffer);
            
            // Combine the user comment with the image description
            let combinedText = '';
            if (userComment) {
                combinedText = `.`;
            } else {
               combinedText = `.`;
           }
           
           // Send the combined text to the AI
           await this.lineHandler.processUserMessage(
               userId,
               combinedText,
               replyToken,
               `img_${messageId}`
           );
           
           this.logger.info('Image processed with comment', {
               userId,
               messageId,
               descriptionLength: imageDescription.length,
               commentLength: userComment?.length || 0,
               currentModel: this.currentModel
           });
           
           return {
               success: true,
               description: imageDescription,
               comment: userComment,
               model: this.currentModel
           };
       } catch (error) {
           this.logger.error('Error processing LINE image with comment:', {
               error: error.message,
               stack: error.stack,
               userId,
               messageId,
               currentModel: this.currentModel
           });
           
           // Don't send error message to user
           return {
               success: false,
               error: error.message
           };
       }
   }

   async updatePromptTemplate(newPrompt) {
       try {
           if (!newPrompt || typeof newPrompt !== 'string' || newPrompt.trim() === '') {
               return {
                   success: false,
                   error: 'Invalid prompt template'
               };
           }
           
           this.promptTemplate = newPrompt;
           
           this.logger.info('Updated image analysis prompt template', {
               newPromptLength: newPrompt.length,
               promptPreview: newPrompt.substring(0, 50) + (newPrompt.length > 50 ? '...' : ''),
               currentModel: this.currentModel
           });
           
           // Save the updated configuration
           await this.saveConfig();
           
           return {
               success: true,
               promptTemplate: this.promptTemplate
           };
       } catch (error) {
           this.logger.error('Error updating prompt template:', {
               error: error.message,
               stack: error.stack
           });
           
           return {
               success: false,
               error: error.message
           };
       }
   }

   async healthCheck() {
       try {
           // Verify Gemini connection
           if (!this.initialized) {
               return {
                   status: 'error',
                   message: 'ImageHandler not initialized'
               };
           }
           
           // Check if we can access upload directories
           await fs.access(this.uploadDir);
           await fs.access(this.processedDir);
           
           const modelInfo = this.getCurrentModel();
           
           return {
               status: 'healthy',
               initialized: this.initialized,
               currentModel: {
                   name: this.currentModel,
                   info: modelInfo.modelInfo
               },
               availableModels: this.availableModels.length,
               lastModelUpdate: this.lastModelUpdate,
               supportedFormats: this.SUPPORTED_FORMATS,
               maxImageSize: `${this.MAX_IMAGE_SIZE / (1024 * 1024)}MB`,
               promptTemplate: this.promptTemplate,
               batchingConfig: {
                   batchTimeout: this.BATCH_TIMEOUT,
                   maxBatchSize: this.MAX_BATCH_SIZE,
                   minImageGap: this.MIN_IMAGE_GAP
               },
               commentConfig: {
                   lookbackWindow: `${this.COMMENT_LOOKBACK_WINDOW / 1000} seconds`,
                   maxCommentLength: this.MAX_COMMENT_LENGTH
               },
               activeBatches: this.imageBatchMap.size
           };
       } catch (error) {
           return {
               status: 'error',
               message: error.message,
               initialized: this.initialized,
               currentModel: this.currentModel
           };
       }
   }

   updateBatchingConfig(config) {
       if (config.batchTimeout && typeof config.batchTimeout === 'number') {
           this.BATCH_TIMEOUT = config.batchTimeout;
       }
       
       if (config.maxBatchSize && typeof config.maxBatchSize === 'number') {
           this.MAX_BATCH_SIZE = config.maxBatchSize;
       }
       
       if (config.minImageGap && typeof config.minImageGap === 'number') {
           this.MIN_IMAGE_GAP = config.minImageGap;
       }
       
       if (config.commentLookbackWindow && typeof config.commentLookbackWindow === 'number') {
           this.COMMENT_LOOKBACK_WINDOW = config.commentLookbackWindow;
       }
       
       if (config.maxCommentLength && typeof config.maxCommentLength === 'number') {
           this.MAX_COMMENT_LENGTH = config.maxCommentLength;
       }
       
       this.logger.info('Image handler configuration updated', {
           batchTimeout: this.BATCH_TIMEOUT,
           maxBatchSize: this.MAX_BATCH_SIZE,
           minImageGap: this.MIN_IMAGE_GAP,
           commentLookbackWindow: this.COMMENT_LOOKBACK_WINDOW,
           maxCommentLength: this.MAX_COMMENT_LENGTH,
           currentModel: this.currentModel
       });
       
       // Save the updated configuration
       this.saveConfig().catch(error => {
           this.logger.error('Error saving configuration after update:', error);
       });
       
       return this.getConfig();
   }

   getConfig() {
       const modelInfo = this.getCurrentModel();
       return {
           currentModel: this.currentModel,
           modelInfo: modelInfo.modelInfo,
           availableModels: this.availableModels,
           lastModelUpdate: this.lastModelUpdate,
           promptTemplate: this.promptTemplate,
           batchTimeout: this.BATCH_TIMEOUT,
           maxBatchSize: this.MAX_BATCH_SIZE,
           minImageGap: this.MIN_IMAGE_GAP,
           commentLookbackWindow: this.COMMENT_LOOKBACK_WINDOW,
           maxCommentLength: this.MAX_COMMENT_LENGTH,
           activeBatches: this.imageBatchMap.size
       };
   }

   // Test method for checking model connectivity
   async testModelConnection(modelName = null) {
       try {
           const testModel = modelName || this.currentModel;
           
           // Create a test model instance
           const testGenAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
           const testModelInstance = testGenAI.getGenerativeModel({
               model: testModel
           });
           
           // Test with a simple text prompt
           const testResult = await testModelInstance.generateContent("Hello, test connection");
           const response = testResult.response.text();
           
           this.logger.info('Model connection test successful', {
               testModel: testModel,
               responseLength: response.length
           });
           
           return {
               success: true,
               model: testModel,
               response: response,
               connectionStatus: 'healthy'
           };
       } catch (error) {
           this.logger.error('Model connection test failed:', {
               error: error.message,
               testModel: modelName || this.currentModel
           });
           
           return {
               success: false,
               model: modelName || this.currentModel,
               error: error.message,
               connectionStatus: 'failed'
           };
       }
   }

   // Get model information by name
   getModelInfo(modelName) {
       return this.availableModels.find(m => m.name === modelName) || null;
   }

   // Check if model supports vision/image tasks
   isVisionModel(modelName) {
       const modelInfo = this.getModelInfo(modelName);
       if (!modelInfo) return false;
       
       const name = modelName.toLowerCase();
       return (
           modelInfo.supportedGenerationMethods &&
           modelInfo.supportedGenerationMethods.includes('generateContent') &&
           (name.includes('vision') || 
            name.includes('pro') || 
            name.includes('flash') ||
            name.includes('1.5'))
       );
   }

   // Force refresh models (bypasses cache)
   async forceRefreshModels() {
       this.availableModels = [];
       this.lastModelUpdate = null;
       return await this.fetchAvailableModels();
   }

   // Get statistics about image processing
   getStats() {
       return {
           currentModel: this.currentModel,
           activeBatches: this.imageBatchMap.size,
           availableModelCount: this.availableModels.length,
           lastModelUpdate: this.lastModelUpdate,
           modelCacheAge: this.lastModelUpdate ? Date.now() - this.lastModelUpdate : null,
           supportedFormats: this.SUPPORTED_FORMATS,
           configuration: {
               batchTimeout: this.BATCH_TIMEOUT,
               maxBatchSize: this.MAX_BATCH_SIZE,
               minImageGap: this.MIN_IMAGE_GAP,
               commentLookbackWindow: this.COMMENT_LOOKBACK_WINDOW,
               maxCommentLength: this.MAX_COMMENT_LENGTH,
               maxImageSize: this.MAX_IMAGE_SIZE
           }
       };
   }

   // Cleanup method for clearing old batches
   cleanup() {
       const now = Date.now();
       const maxBatchAge = 10 * 60 * 1000; // 10 minutes
       
       let clearedCount = 0;
       for (const [userId, batch] of this.imageBatchMap.entries()) {
           const batchAge = now - batch.startTime;
           if (batchAge > maxBatchAge) {
               clearTimeout(batch.timeoutId);
               this.imageBatchMap.delete(userId);
               clearedCount++;
               
               this.logger.warn('Cleared stale image batch', {
                   userId,
                   batchAge: Math.round(batchAge / 1000),
                   imageCount: batch.images.length
               });
           }
       }
       
       if (clearedCount > 0) {
           this.logger.info('Image batch cleanup completed', {
               clearedBatches: clearedCount,
               remainingBatches: this.imageBatchMap.size
           });
       }
       
       return {
           clearedBatches: clearedCount,
           remainingBatches: this.imageBatchMap.size
       };
   }
}

module.exports = ImageHandler;
