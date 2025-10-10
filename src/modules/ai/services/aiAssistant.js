'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const NodeCache = require('node-cache');
const { PrismaClient } = require('@prisma/client');
const ConfigManager = require('./ConfigManager');
const ChatHistoryHandler = require('./ChatHistoryHandler');
const ContextAnalyzer = require('./ContextAnalyzer');
const GeminiAPIService = require('./GeminiAPIService');
const UnifiedContextFormatter = require('./UnifiedContextFormatter');
const MessageContentCleaner = require('../../../core/utils/messageContentCleaner');

const prisma = new PrismaClient();

class AIAssistant {
    constructor(logger, chatHistoryManager, productManager, productionHandler, knowledgeRAG = null) {
        this.logger = logger;
        this.chatHistoryManager = chatHistoryManager;
        this.productManager = productManager;
        this.productionHandler = productionHandler;
        this.knowledgeRAG = knowledgeRAG;
        
        // Cache สำหรับเก็บข้อมูลชั่วคราว
        this.cache = new NodeCache({ stdTTL: 1800, checkperiod: 120 });
        
        // *** Enhanced Request & Response Tracking ***
        this.requestCache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // 5 นาที
        this.responseCache = new NodeCache({ stdTTL: 600, checkperiod: 120 }); // 10 นาที
        this.activeRequests = new Map(); // Track ongoing requests
        this.requestQueue = new Map(); // Queue for similar requests
        
        // Initialize components
        this.configManager = new ConfigManager(logger);
        this.chatHistoryHandler = new ChatHistoryHandler(logger, chatHistoryManager, this.cache);
        this.contextAnalyzer = new ContextAnalyzer(logger);
        this.geminiAPIService = new GeminiAPIService(logger);
        
        // Initialize UnifiedContextFormatter
        this.unifiedContextFormatter = null;
        if (knowledgeRAG) {
            this.unifiedContextFormatter = new UnifiedContextFormatter(logger, knowledgeRAG);
        }

        // Knowledge formatter (will be set externally)
        this.knowledgeFormatter = null;
        
        // State management
        this.initialized = false;
        this.lastResponseTime = null;
        this.responseCount = 0;
        this.currentModel = null;
        this.genAI = null;
        
        // Error handling
        this.consecutiveErrors = 0;
        this.maxConsecutiveErrors = 3;
        
        // Current user context
        this.currentUserId = null;
        this.userContexts = new Map(); // เก็บ context ของแต่ละ user
        
        // *** Enhanced Statistics & Monitoring ***
        this.requestStats = {
            totalRequests: 0,
            duplicateRequests: 0,
            cachedResponses: 0,
            uniqueResponses: 0,
            errorResponses: 0,
            averageResponseTime: 0,
            lastRequestTime: null,
            peakConcurrency: 0,
            totalTokensUsed: 0
        };

        // *** Performance Monitoring ***
        this.performanceMetrics = {
            requestTimestamps: [],
            responseTimes: [],
            memoryUsage: [],
            errorCounts: new Map(),
            startTime: Date.now()
        };
        
        this.logger.info('AIAssistant initialized with enhanced duplicate prevention and comprehensive logging', {
            hasKnowledgeRAG: !!this.knowledgeRAG,
            hasUnifiedFormatter: !!this.unifiedContextFormatter,
            cacheSettings: {
                requestCacheTTL: 300,
                responseCacheTTL: 600,
                mainCacheTTL: 1800
            },
            components: [
                'ConfigManager',
                'ChatHistoryHandler', 
                'ContextAnalyzer',
                'GeminiAPIService',
                this.unifiedContextFormatter ? 'UnifiedContextFormatter' : null
            ].filter(Boolean),
            version: '2.0.0'
        });

        // Start performance monitoring
        this.startPerformanceMonitoring();
    }

    /**
     * Start performance monitoring
     */
    startPerformanceMonitoring() {
        setInterval(() => {
            this.performanceMetrics.memoryUsage.push({
                timestamp: Date.now(),
                memory: process.memoryUsage()
            });

            // Keep only last 100 entries
            if (this.performanceMetrics.memoryUsage.length > 100) {
                this.performanceMetrics.memoryUsage = this.performanceMetrics.memoryUsage.slice(-100);
            }
        }, 60000); // Every minute
    }

    /**
     * Load chat history from SQL (ChatHistoryAI table)
     * @param {string} userId - User ID
     * @param {number} limit - Number of recent messages to load
     * @returns {Promise<Array>} Chat history messages
     */
    async loadChatHistoryFromSQL(userId, limit = 10) {
        try {
            const messages = await prisma.chatHistoryAI.findMany({
                where: { userId },
                orderBy: { timestamp: 'desc' },
                take: limit
            });

            // Convert to format expected by AI
            const formattedMessages = messages
                .reverse() // Order from oldest to newest
                .map(msg => ({
                    role: msg.role === 'model' ? 'model' : 'user',
                    content: msg.content,
                    timestamp: Number(msg.timestamp),
                    products: msg.products ? JSON.parse(msg.products) : undefined
                }));

            this.logger.info('Chat history loaded from SQL', {
                userId: userId.substring(0, 10) + '...',
                messagesLoaded: formattedMessages.length
            });

            return formattedMessages;
        } catch (error) {
            this.logger.error('Error loading chat history from SQL:', error);
            return [];
        }
    }

    /**
     * Save chat message to SQL (ChatHistoryAI table)
     * @param {string} userId - User ID
     * @param {string} role - Message role (user/model)
     * @param {string} content - Message content
     * @param {Array} products - Associated products (optional)
     */
    async saveChatMessageToSQL(userId, role, content, products = null) {
        try {
            await prisma.chatHistoryAI.create({
                data: {
                    userId,
                    role,
                    content,
                    products: products ? JSON.stringify(products) : null,
                    timestamp: BigInt(Date.now()),
                    saved_at: BigInt(Date.now())
                }
            });

            this.logger.info('Chat message saved to SQL', {
                userId: userId.substring(0, 10) + '...',
                role,
                contentLength: content.length
            });
        } catch (error) {
            this.logger.error('Error saving chat message to SQL:', error);
        }
    }

    /**
     * Load Vector DB configuration from SQL with caching
     */
    async loadVectorDBConfig(forceRefresh = false) {
        const cacheKey = 'vectorDBConfig';

        if (!forceRefresh) {
            const cachedConfig = this.cache.get(cacheKey);
            if (cachedConfig) {
                return cachedConfig;
            }
        }

        try {
            let config = await prisma.vectorDBConfig.findUnique({
                where: { key: 'default' }
            });

            if (!config) {
                config = await prisma.vectorDBConfig.create({
                    data: {
                        key: 'default',
                        enabled: false,
                        dbPath: 'data/lancedb',
                        embeddingModel: 'text-embedding-3-large',
                        embeddingDimension: 3072,
                        maxRetries: 3,
                        timeout: 30000,
                        apiKey: null,
                        productVectorEnabled: true,
                        knowledgeVectorEnabled: false,
                        productMaxResults: 5,
                        productSimilarityThreshold: 0.7,
                        knowledgeMaxResults: 5,
                        knowledgeSimilarityThreshold: 0.7
                    }
                });
            }

            this.cache.set(cacheKey, config, 60);
            return config;
        } catch (error) {
            this.logger.error('Error loading Vector DB config:', error);
            return null;
        }
    }

    invalidateVectorDBConfigCache() {
        this.cache.del('vectorDBConfig');
    }

    /**
     * Generate comprehensive request signature for duplicate detection
     */
    generateRequestSignature(query, userId, products, options = {}) {
        const crypto = require('crypto');
        
        // Normalize query
        const normalizedQuery = (query || '').trim().toLowerCase().replace(/\s+/g, ' ');
        
        // Create product signature
        const productSignature = (products || [])
            .map(p => `${p.id || p.product_id || ''}_${p.category || ''}`)
            .sort()
            .join('|');
        
        // Create options signature
        const optionsSignature = JSON.stringify(options || {});
        
        const combinedString = `${userId || 'anonymous'}_${normalizedQuery}_${productSignature}_${optionsSignature}`;
        const signature = crypto.createHash('sha256').update(combinedString).digest('hex');
        
        return signature;
    }

    /**
     * Check if request is duplicate or similar
     */
    isDuplicateRequest(signature) {
        const isActive = this.activeRequests.has(signature);
        const isCached = this.requestCache.has(signature);
        const isQueued = this.requestQueue.has(signature);
        
        return isActive || isCached || isQueued;
    }

    /**
     * Mark request as active and track concurrency
     */
    markRequestActive(signature, requestData) {
        this.activeRequests.set(signature, {
            ...requestData,
            timestamp: Date.now(),
            status: 'processing'
        });

        // Update peak concurrency
        if (this.activeRequests.size > this.requestStats.peakConcurrency) {
            this.requestStats.peakConcurrency = this.activeRequests.size;
        }
    }

    /**
     * Mark request as completed and update statistics
     */
    markRequestCompleted(signature, responseTime = null) {
        this.activeRequests.delete(signature);
        this.requestCache.set(signature, Date.now());
        
        if (responseTime) {
            this.performanceMetrics.responseTimes.push(responseTime);
            if (this.performanceMetrics.responseTimes.length > 1000) {
                this.performanceMetrics.responseTimes = this.performanceMetrics.responseTimes.slice(-1000);
            }
            
            // Update average response time
            const times = this.performanceMetrics.responseTimes;
            this.requestStats.averageResponseTime = times.reduce((a, b) => a + b, 0) / times.length;
        }
    }

    /**
     * Set user context for language and settings management
     */
async setUserContext(userId) {
    try {
        if (!userId) {
            this.logger.warn('No user ID provided for context setting');
            return false;
        }

        this.currentUserId = userId;
        
        // Set current user in config manager (will load from file)
        if (this.configManager && typeof this.configManager.setCurrentUser === 'function') {
            await this.configManager.setCurrentUser(userId);
            
            // โหลด settings สำหรับ user นี้
            await this.configManager.reloadSettings();
            
            const userLangStatus = this.configManager.getUserLanguageLockStatus(userId);
            
            this.logger.info('User context set for AI Assistant with file data', {
                userId: userId.substring(0, 10) + '...',
                userLanguage: this.configManager.getUserLanguage(userId),
                lockStatus: userLangStatus,
                hasDetectionHistory: !!(userLangStatus.detectionHistory && userLangStatus.detectionHistory.length > 0)
            });
            
            return true;
        }
        
        return false;
    } catch (error) {
        this.logger.error('Error setting user context:', error);
        return false;
    }
}

    /**
     * Process user language detection and setting
     */
async processUserLanguage(userId, userText) {
    try {
        if (!this.configManager || !userId || !userText) {
            return this.configManager?.defaultLanguage || 'TH';
        }
        
        // Set user context and load from file
        await this.setUserContext(userId);
        
        // ตรวจจับและตั้งค่าภาษาด้วย CLD
        const detectedLanguage = await this.configManager.detectLanguage(userText, userId);
        await this.configManager.setLanguage(detectedLanguage, userText, userId);
        
        const finalLanguage = this.configManager.getUserLanguage(userId);
        
        this.logger.info('User language processed with CLD', {
            userId: userId.substring,
            detectedLanguage,
            finalLanguage,
            lockStatus: this.configManager.getUserLanguageLockStatus(userId),
            textLength: userText.length,
            wordCount: userText.split(/\s+/).length
        });
        
        return finalLanguage;
    } catch (error) {
        this.logger.error('Error processing user language:', error);
        return this.configManager?.defaultLanguage || 'TH';
    }
}
    /**
     * Get user's current language
     */
    getUserLanguage(userId) {
        if (!this.configManager || !userId) {
            return this.configManager?.defaultLanguage || 'TH';
        }
        return this.configManager.getUserLanguage(userId);
    }

    /**
     * Get user's language lock status
     */
    getUserLanguageLockStatus(userId) {
        if (!this.configManager || !userId) {
            return { isLocked: false, language: 'TH' };
        }
        return this.configManager.getUserLanguageLockStatus(userId);
    }

    /**
     * Set knowledge formatter
     */
    setKnowledgeFormatter(knowledgeFormatter) {
        this.knowledgeFormatter = knowledgeFormatter;
        this.logger.info('Knowledge formatter connected to AI Assistant');
    }

    /**
     * Initialize AI Assistant
     */
    async initialize() {
        try {
            this.logger.info('Starting AI Assistant initialization...');

            // Initialize Google AI if a global API key is provided
            if (process.env.GEMINI_API_KEY) {
                this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                this.logger.info('Google AI instance created successfully with global API key');

                // Test model connection (skip if in development)
                if (process.env.NODE_ENV !== 'development') {
                    try {
                        await this.testModelConnection();
                    } catch (error) {
                        this.logger.warn('Global model connection test failed, but continuing initialization:', {
                            error: error.message
                        });
                    }
                } else {
                    this.logger.info('Skipping global model connection test (development mode)');
                }
            } else {
                this.logger.warn('GEMINI_API_KEY environment variable is not set. Relying on personality-specific API keys.');
                this.genAI = null; // Explicitly set to null if no global key
            }
            
            // Initialize UnifiedContextFormatter if knowledge RAG is available
            if (this.knowledgeRAG && this.knowledgeRAG.initialized && !this.unifiedContextFormatter) {
                this.unifiedContextFormatter = new UnifiedContextFormatter(this.logger, this.knowledgeRAG);
                this.logger.info('UnifiedContextFormatter initialized with knowledge RAG');
            }
            
            this.initialized = true;
            this.logger.info('AI Assistant initialized successfully', {
                modelName: this.configManager.MODEL_NAME,
                hasKnowledgeRAG: !!this.knowledgeRAG,
                hasUnifiedFormatter: !!this.unifiedContextFormatter,
                knowledgeRAGInitialized: this.knowledgeRAG?.initialized || false,
                initializationTime: Date.now() - this.performanceMetrics.startTime
            });
            
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize AI Assistant:', {
                error: error.message,
                stack: error.stack
            });
            this.initialized = false;
            throw error;
        }
    }

    /**
     * Test model connection
     */
    async testModelConnection() {
        try {
            this.logger.info('Testing AI model connection...', {
                modelName: this.configManager.MODEL_NAME
            });

            const model = this.genAI.getGenerativeModel({ 
                model: this.configManager.MODEL_NAME 
            });
            
            const testStart = Date.now();
            const result = await model.generateContent("Test connection - please respond with 'Connection successful'");
            const response = result.response.text();
            const testTime = Date.now() - testStart;
            
            if (response) {
                this.currentModel = model;
                this.logger.info('Model connection test successful', {
                    modelName: this.configManager.MODEL_NAME,
                    responseLength: response.length,
                    testTime: `${testTime}ms`,
                    response: response.substring(0, 100)
                });
                return true;
            }
            
            throw new Error('No response from model');
        } catch (error) {
            this.logger.error('Model connection test failed:', {
                modelName: this.configManager.MODEL_NAME,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Main method for generating AI responses with comprehensive logging and duplicate prevention
     */
    async generateResponse(query, products = [], userId = null, options = {}, contextWindow = null) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const startTime = Date.now();
        
        try {
            // *** Initialize if needed ***
            if (!this.initialized) {
                this.logger.info('AI Assistant not initialized, initializing now...', { requestId });
                await this.initialize();
            }

            // *** Update statistics ***
            this.requestStats.totalRequests++;
            this.requestStats.lastRequestTime = Date.now();
            this.performanceMetrics.requestTimestamps.push(Date.now());

            // Process user language first
            let userLanguage = 'TH';
            if (userId && query) {
                userLanguage = await this.processUserLanguage(userId, query);
            }

            // *** Generate request signature for duplicate detection ***
            const requestSignature = this.generateRequestSignature(query, userId, products, options);
            
            this.logger.info('Starting AI response generation', {
                requestId,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                requestSignature: requestSignature.substring(0, 16) + '...',
                queryStats: {
                    length: query?.length || 0,
                    preview: query ? query.substring(0, 100) + (query.length > 100 ? '...' : '') : 'undefined',
                    language: userLanguage
                },
                productsCount: products?.length || 0,
                options,
                systemStats: {
                    totalRequests: this.requestStats.totalRequests,
                    activeRequests: this.activeRequests.size,
                    peakConcurrency: this.requestStats.peakConcurrency
                }
            });

            // *** Check for duplicate request ***
            if (this.isDuplicateRequest(requestSignature)) {
                this.requestStats.duplicateRequests++;
                
                this.logger.warn('Duplicate request detected', {
                    requestId,
                    userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                    requestSignature: requestSignature.substring(0, 16) + '...',
                    userLanguage,
                    duplicateStats: {
                        totalDuplicates: this.requestStats.duplicateRequests,
                        duplicateRate: `${((this.requestStats.duplicateRequests / this.requestStats.totalRequests) * 100).toFixed(2)}%`
                    }
                });

                // Check for cached response
                const cachedResponse = this.responseCache.get(requestSignature);
                if (cachedResponse) {
                    this.requestStats.cachedResponses++;
                    const responseTime = Date.now() - startTime;
                    
                    this.logger.info('Returning cached response for duplicate request', {
                        requestId,
                        userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                        responseTime: `${responseTime}ms`,
                        cachedResponseStats: {
                            responseLength: cachedResponse.response?.length || 0,
                            totalCachedResponses: this.requestStats.cachedResponses,
                            cacheHitRate: `${((this.requestStats.cachedResponses / this.requestStats.totalRequests) * 100).toFixed(2)}%`
                        }
                    });
                    
                    return {
                        ...cachedResponse,
                        cached: true,
                        responseTime,
                        requestId
                    };
                }

                // If no cached response, queue the request
                return new Promise((resolve, reject) => {
                    if (!this.requestQueue.has(requestSignature)) {
                        this.requestQueue.set(requestSignature, []);
                    }
                    this.requestQueue.get(requestSignature).push({ resolve, reject, requestId });
                    
                    this.logger.info('Request queued for duplicate processing', {
                        requestId,
                        queueLength: this.requestQueue.get(requestSignature).length
                    });
                });
            }

            // *** Mark request as active ***
            this.markRequestActive(requestSignature, {
                requestId,
                userId,
                query: query?.substring(0, 100),
                userLanguage
            });

            this.logger.info('Preparing input data for AI model', {
                requestId,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                inputPreparation: {
                    queryProcessing: {
                        originalLength: query?.length || 0,
                        normalizedPreview: query ? query.substring(0, 200) + (query.length > 200 ? '...' : '') : 'undefined',
                        language: userLanguage,
                        containsSpecialChars: query ? /[^\w\s\u0E00-\u0E7F]/.test(query) : false
                    },
                    productsProcessing: {
                        count: products?.length || 0,
                        categories: products ? [...new Set(products.map(p => p.category))].slice(0, 5) : [],
                        sampleProductNames: products ? products.slice(0, 3).map(p => p.product_name) : [],
                        totalProductDataSize: products ? JSON.stringify(products).length : 0
                    },
                    contextSettings: {
                        knowledgeEnabled: this.configManager?.knowledgeConfig?.enabled || false,
                        unifiedFormatterEnabled: this.configManager?.unifiedFormatterConfig?.enabled || false,
                        hasHistoricalContext: !!userId
                    }
                }
            });

            // *** Enhanced context gathering ***
            const contextData = await this.gatherEnhancedContext(query, products, userId, requestId, contextWindow);
            
            this.logger.info('Context data prepared for AI processing', {
                requestId,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                contextSummary: {
                    knowledgeResults: {
                        count: contextData.knowledgeResults?.length || 0,
                        totalSize: contextData.knowledgeResults ? JSON.stringify(contextData.knowledgeResults).length : 0,
                        categories: contextData.knowledgeResults ? 
                            [...new Set(contextData.knowledgeResults.map(k => k.category))].slice(0, 3) : [],
                        avgConfidence: contextData.knowledgeResults?.length > 0 ? 
                            (contextData.knowledgeResults.reduce((sum, k) => sum + (k.relevance_score || 0), 0) / contextData.knowledgeResults.length).toFixed(3) : 0
                    },
                    products: {
                        count: contextData.products?.length || 0,
                        enriched: contextData.products?.some(p => p.enriched) || false,
                        totalDataSize: contextData.products ? JSON.stringify(contextData.products).length : 0
                    },
                    userContext: {
                        hasProfile: !!contextData.userProfile,
                        hasHistory: !!contextData.historicalContext,
                        language: contextData.userLanguage
                    }
                }
            });
            
            // *** Generate enhanced response ***
            const response = await this.generateEnhancedResponse(query, contextData, userId, requestId);
            
            const processingTime = Date.now() - startTime;
            this.lastResponseTime = processingTime;
            this.responseCount++;
            this.consecutiveErrors = 0;
            this.requestStats.uniqueResponses++;

            // Track token usage
            if (response.tokens) {
                this.requestStats.totalTokensUsed += response.tokens.total || 0;
            }

            // *** Cache the response ***
            this.responseCache.set(requestSignature, response);

            // *** Process queued requests ***
            const queuedRequests = this.requestQueue.get(requestSignature);
            if (queuedRequests) {
                this.logger.info('Processing queued requests', {
                    requestId,
                    queueLength: queuedRequests.length
                });
                
                queuedRequests.forEach(({ resolve, requestId: queuedRequestId }) => {
                    resolve({
                        ...response,
                        cached: true,
                        queueProcessed: true,
                        originalRequestId: requestId,
                        requestId: queuedRequestId
                    });
                });
                this.requestQueue.delete(requestSignature);
            }

            // *** Mark request as completed ***
            this.markRequestCompleted(requestSignature, processingTime);

            this.logger.info('AI response generation completed successfully', {
                requestId,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                processingStats: {
                    totalTime: `${processingTime}ms`,
                    responseLength: response.response?.length || 0,
                    responsePreview: response.response ? response.response.substring(0, 200) + (response.response.length > 200 ? '...' : '') : 'undefined',
                    tokensUsed: response.tokens,
                    userLanguage: userLanguage
                },
                contextStats: {
                    productsUsed: (contextData.products?.length || 0),
                    knowledgeUsed: (contextData.knowledgeResults?.length || 0),
                    unifiedFormatterUsed: response.processingInfo?.unifiedFormatterUsed || false
                },
                systemStats: {
                    totalRequests: this.requestStats.totalRequests,
                    uniqueResponses: this.requestStats.uniqueResponses,
                    duplicateRate: `${((this.requestStats.duplicateRequests / this.requestStats.totalRequests) * 100).toFixed(2)}%`,
                    averageResponseTime: `${this.requestStats.averageResponseTime.toFixed(0)}ms`,
                    totalTokensUsed: this.requestStats.totalTokensUsed,
                    activeRequests: this.activeRequests.size
                }
            });

            return {
                ...response,
                requestId,
                processingTime,
                cached: false
            };

        } catch (error) {
            this.consecutiveErrors++;
            this.requestStats.errorResponses++;
            
            // Track error types
            const errorType = error.name || 'UnknownError';
            this.performanceMetrics.errorCounts.set(errorType, (this.performanceMetrics.errorCounts.get(errorType) || 0) + 1);
            
            const processingTime = Date.now() - startTime;
            
            this.logger.error('Error generating AI response', {
                requestId,
                error: {
                    message: error.message,
                    name: error.name,
                    stack: error.stack
                },
                requestInfo: {
                    userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                    queryLength: query?.length || 0,
                    queryPreview: query ? query.substring(0, 100) + (query.length > 100 ? '...' : '') : 'undefined',
                    productsCount: products?.length || 0,
                    userLanguage: this.getUserLanguage(userId),
                    processingTime: `${processingTime}ms`
                },
                errorStats: {
                    consecutiveErrors: this.consecutiveErrors,
                    totalErrors: this.requestStats.errorResponses,
                    errorRate: `${((this.requestStats.errorResponses / this.requestStats.totalRequests) * 100).toFixed(2)}%`,
                    errorsByType: Object.fromEntries(this.performanceMetrics.errorCounts)
                }
            });

            // *** Cleanup on error ***
            const requestSignature = this.generateRequestSignature(query, userId, products, options);
            this.markRequestCompleted(requestSignature, processingTime);

            // Process any queued requests with error
            const queuedRequests = this.requestQueue.get(requestSignature);
            if (queuedRequests) {
                queuedRequests.forEach(({ reject, requestId: queuedRequestId }) => {
                    reject(new Error(`Queued request failed: ${error.message}`));
                });
                this.requestQueue.delete(requestSignature);
            }

            if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
                this.logger.error('Maximum consecutive errors reached, flagging for reinitalization', {
                    maxErrors: this.maxConsecutiveErrors,
                    consecutiveErrors: this.consecutiveErrors,
                    willReinitialize: true
                });
                this.initialized = false;
            }

            // Return fallback response in user's language
            const userLanguage = this.getUserLanguage(userId);
            const fallbackResponse = this.createFallbackResponse(error, userLanguage);
            
            return {
                ...fallbackResponse,
                requestId,
                processingTime,
                error: true
            };
        }
    }

    /**
     * Gather enhanced context with comprehensive logging
     */
    async gatherEnhancedContext(query, products = [], userId = null, requestId = null, contextWindow = null) {
        const context = {
            query,
            products: products || [],
            knowledgeResults: [],
            historicalContext: null,
            userLanguage: this.getUserLanguage(userId),
            userProfile: null,
            timestamp: Date.now()
        };

        try {
            this.logger.info('Starting enhanced context gathering', {
                requestId,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                contextGathering: {
                    queryLength: query ? query.length : 0,
                    queryPreview: query ? query.substring(0, 100) + (query.length > 100 ? '...' : '') : 'undefined',
                    productsProvided: context.products.length,
                    userLanguage: context.userLanguage,
                    timestamp: context.timestamp
                }
            });

            // *** Use provided context window or fallback to default ***
            const contextConfig = contextWindow || {
                system_prompt: 'คุณคือผู้ช่วยที่ชาญฉลาดในการให้ข้อมูลเกี่ยวกับสินค้า',
                use_product_rag: true,
                use_knowledge_rag: true,
                max_context_messages: 10,
                include_user_history: true,
                temperature: 0.7,
                model_name: 'gemini-2.5-pro',
                max_tokens: 2000
            };

            this.logger.info('Using context window config', {
                requestId,
                source: contextWindow ? 'Provided' : 'Default Fallback',
                useProductRAG: contextConfig.use_product_rag,
                useKnowledgeRAG: contextConfig.use_knowledge_rag,
                modelName: contextConfig.model_name
            });

            // *** Get user's chat history from SQL ***
            if (userId && contextConfig.include_user_history) {
                this.logger.info('Loading user chat history from SQL', {
                    requestId,
                    userId: userId.substring(0, 10) + '...',
                    maxMessages: contextConfig.max_context_messages
                });

                const chatHistory = await this.loadChatHistoryFromSQL(userId, contextConfig.max_context_messages);
                if (chatHistory && chatHistory.length > 0) {
                    context.historicalContext = {
                        messages: chatHistory,
                        totalInteractions: chatHistory.length,
                        uniqueCategories: 0,
                        uniqueProducts: 0
                    };

                    this.logger.info('Historical context loaded from SQL', {
                        requestId,
                        userId: userId.substring(0, 10) + '...',
                        historyStats: {
                            totalMessages: chatHistory.length,
                            hasUserProfile: false,
                            contextAnalyzed: true,
                            contextSummary: {
                                totalInteractions: chatHistory.length,
                                uniqueCategories: 0,
                                uniqueProducts: 0
                            }
                        }
                    });
                } else {
                    this.logger.info('No chat history found for user in SQL', {
                        requestId,
                        userId: userId.substring(0, 10) + '...'
                    });
                }
            }

            // *** Search knowledge if available and enabled in config ***
            const knowledgeConfig = this.configManager?.knowledgeConfig || {};
            const knowledgeEnabled = knowledgeConfig.enabled !== false;
            const knowledgeSearchSettings = knowledgeConfig.searchSettings || {};
            const vectorDBConfig = await this.loadVectorDBConfig();
            const knowledgeVectorEnabled = !!(vectorDBConfig?.enabled && vectorDBConfig?.knowledgeVectorEnabled);

            this.logger.info('Checking knowledge RAG status', {
                requestId,
                hasQuery: !!query,
                hasKnowledgeRAG: !!this.knowledgeRAG,
                isInitialized: this.knowledgeRAG?.initialized,
                configEnabled: contextConfig.use_knowledge_rag,
                knowledgeConfigEnabled: knowledgeEnabled,
                vectorKnowledgeEnabled: knowledgeVectorEnabled
            });

            if (
                query &&
                knowledgeEnabled &&
                knowledgeVectorEnabled &&
                contextConfig.use_knowledge_rag &&
                this.knowledgeRAG &&
                this.knowledgeRAG.initialized
            ) {
                try {
                    const knowledgeSearchStart = Date.now();
                    const topK = knowledgeSearchSettings?.topK !== undefined
                        ? knowledgeSearchSettings.topK
                        : undefined;
                    const scoreThreshold = knowledgeSearchSettings?.scoreThreshold !== undefined
                        ? knowledgeSearchSettings.scoreThreshold
                        : undefined;
                    const vectorTopK = vectorDBConfig?.knowledgeMaxResults;
                    const vectorThreshold = vectorDBConfig?.knowledgeSimilarityThreshold;
                    const languagePreference = knowledgeSearchSettings.languageOverride || context.userLanguage;
                    const resolvedTopK = topK ?? vectorTopK ?? 3;
                    const resolvedThreshold = scoreThreshold ?? vectorThreshold ?? 0.5;

                    this.logger.info('Searching knowledge base (enabled by config)', {
                        requestId,
                        userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                        knowledgeSearch: {
                            query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
                            searchOptions: {
                                topK: resolvedTopK,
                                scoreThreshold: resolvedThreshold,
                                language: languagePreference
                            },
                            knowledgeRAGStatus: {
                                initialized: this.knowledgeRAG.initialized,
                                available: !!this.knowledgeRAG,
                                enabledInContext: contextConfig.use_knowledge_rag,
                                enabledInConfig: knowledgeEnabled,
                                vectorKnowledgeEnabled: knowledgeVectorEnabled,
                                vectorTopK,
                                vectorThreshold
                            }
                        }
                    });

                    const knowledgeSearch = await this.knowledgeRAG.searchKnowledge(query, {
                        topK: resolvedTopK,
                        scoreThreshold: resolvedThreshold,
                        language: languagePreference,
                        filter: knowledgeSearchSettings.filter ?? {}
                    });

                    const knowledgeSearchTime = Date.now() - knowledgeSearchStart;

                    if (knowledgeSearch.success && knowledgeSearch.results.length > 0) {
                        context.knowledgeResults = knowledgeSearch.results;

                        this.logger.info('Knowledge search completed successfully', {
                            requestId,
                            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                            knowledgeResults: {
                                count: context.knowledgeResults.length,
                                searchTime: `${knowledgeSearchTime}ms`,
                                results: context.knowledgeResults.map((k, index) => ({
                                    index: index + 1,
                                    category: k.category,
                                    fileName: k.file_name,
                                    confidence: k.relevance_score?.toFixed(3),
                                    contentLength: k.text?.length || 0,
                                    contentPreview: k.text ? k.text.substring(0, 100) + '...' : ''
                                })),
                                categories: [...new Set(context.knowledgeResults.map(k => k.category))],
                                avgConfidence: context.knowledgeResults.length > 0 ?
                                    (context.knowledgeResults.reduce((sum, k) => sum + (k.relevance_score || 0), 0) / context.knowledgeResults.length).toFixed(3) : 0,
                                totalContentLength: context.knowledgeResults.reduce((sum, k) => sum + (k.text?.length || 0), 0)
                            },
                            userLanguage: context.userLanguage
                        });
                    } else {
                        this.logger.info('Knowledge search completed with no results', {
                            requestId,
                            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                            knowledgeResults: {
                                searchSuccess: knowledgeSearch.success,
                                resultsCount: knowledgeSearch.results?.length || 0,
                                searchTime: `${knowledgeSearchTime}ms`,
                                reason: knowledgeSearch.error || 'No matching knowledge found'
                            }
                        });
                    }
                } catch (knowledgeError) {
                    this.logger.warn('Knowledge search failed, continuing without knowledge context', {
                        requestId,
                        userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                        knowledgeError: {
                            message: knowledgeError.message,
                            name: knowledgeError.name,
                            stack: knowledgeError.stack
                        }
                    });
                }
            } else {
                const reason = !query ? 'No query provided' :
                    !knowledgeEnabled ? 'Knowledge RAG disabled in configuration' :
                    !knowledgeVectorEnabled ? 'VectorDBConfig disabled or missing knowledge vector search' :
                    !contextConfig.use_knowledge_rag ? 'Context config disabled Knowledge RAG' :
                    !this.knowledgeRAG ? 'Knowledge RAG not available' :
                    !this.knowledgeRAG.initialized ? 'Knowledge RAG not initialized' :
                    'Unknown reason';

                this.logger.info('Knowledge search skipped', {
                    requestId,
                    userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                    reason,
                    knowledgeRAGStatus: {
                        available: !!this.knowledgeRAG,
                        initialized: this.knowledgeRAG?.initialized || false,
                        configEnabled: contextConfig.use_knowledge_rag,
                        knowledgeConfigEnabled: knowledgeEnabled,
                        vectorKnowledgeEnabled: knowledgeVectorEnabled
                    }
                });
            }

            // *** Enhance products with historical context ***
            if (context.products.length > 0 && context.historicalContext) {
                const originalProductsCount = context.products.length;
                const enrichmentStart = Date.now();
                
                this.logger.info('Enriching products with historical context', {
                    requestId,
                    userId: userId.substring(0, 10) + '...',
                    productEnrichment: {
                        originalProductsCount,
                        historicalContextAvailable: !!context.historicalContext,
                        contextStats: {
                            totalInteractions: context.historicalContext.totalInteractions,
                            uniqueCategories: context.historicalContext.uniqueCategories
                        }
                    }
                });

                context.products = this.contextAnalyzer.enrichProductsWithContext(
                    context.products, 
                    context.historicalContext
                );
                
                const enrichmentTime = Date.now() - enrichmentStart;
                
                this.logger.info('Product enrichment completed', {
                    requestId,
                    userId: userId.substring(0, 10) + '...',
                    enrichmentResults: {
                        originalCount: originalProductsCount,
                        enrichedCount: context.products.length,
                        enrichmentTime: `${enrichmentTime}ms`,
                        enrichedProducts: context.products.filter(p => p.enriched).length,
                        contextApplied: !!context.historicalContext
                    }
                });
            }

            this.logger.info('Enhanced context gathering completed', {
                requestId,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                contextSummary: {
                    userLanguage: context.userLanguage,
                    products: {
                        count: context.products.length,
                        enriched: context.products.filter(p => p.enriched).length,
                        categories: [...new Set(context.products.map(p => p.category))].slice(0, 5)
                    },
                    knowledge: {
                        count: context.knowledgeResults.length,
                        categories: [...new Set(context.knowledgeResults.map(k => k.category))],
                        avgConfidence: context.knowledgeResults.length > 0 ? 
                            (context.knowledgeResults.reduce((sum, k) => sum + (k.relevance_score || 0), 0) / context.knowledgeResults.length).toFixed(3) : 0
                    },
                    userContext: {
                        hasHistoricalContext: !!context.historicalContext,
                        hasUserProfile: !!context.userProfile,
                        totalHistoricalInteractions: context.historicalContext?.totalInteractions || 0
                    },
                    timestamp: context.timestamp,
                    totalDataSize: JSON.stringify(context).length
                }
            });

            context.contextConfig = contextConfig; // Add contextConfig to the returned context
            return context;

        } catch (error) {
            this.logger.error('Error gathering enhanced context', {
                requestId,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                contextError: {
                    message: error.message,
                    name: error.name,
                    stack: error.stack
                },
                partialContext: {
                    productsLoaded: context.products.length,
                    knowledgeLoaded: context.knowledgeResults.length,
                    userLanguage: context.userLanguage
                }
            });
            return context; // Return partial context on error
        }
    }

    /**
     * Generate enhanced response with detailed logging
     */
    // แก้ไขในส่วน generateEnhancedResponse (บรรทัดประมาณ 1050-1100)

async generateEnhancedResponse(query, contextData, userId = null, requestId = null) {
    try {
        let contextualPrompt = '';
        let formattedContext = '';

        this.logger.info('Starting enhanced response generation', {
            requestId,
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            responseGeneration: {
                unifiedFormatterAvailable: !!this.unifiedContextFormatter,
                unifiedFormatterEnabled: this.configManager.unifiedFormatterConfig.enabled,
                contextDataSize: JSON.stringify(contextData).length,
                userLanguage: contextData.userLanguage
            }
        });

        // *** Use UnifiedContextFormatter if available ***
        if (this.unifiedContextFormatter && this.configManager.unifiedFormatterConfig.enabled) {
            try {
                const formatterStart = Date.now();
                
                this.logger.info('Using UnifiedContextFormatter', {
                    requestId,
                    userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                    formatterInput: {
                        query: contextData.query?.substring(0, 100) + '...',
                        productsCount: contextData.products?.length || 0,
                        knowledgeCount: contextData.knowledgeResults?.length || 0,
                        language: contextData.userLanguage,
                        hasUserProfile: !!contextData.userProfile,
                        hasHistoricalContext: !!contextData.historicalContext,
                        customConfig: Object.keys(this.configManager.unifiedFormatterConfig)
                    }
                });

                const unifiedResult = await this.unifiedContextFormatter.formatUnifiedContext({
                    query: contextData.query,
                    products: contextData.products,
                    knowledgeResults: contextData.knowledgeResults,
                    language: contextData.userLanguage,
                    userProfile: contextData.userProfile,
                    historicalContext: contextData.historicalContext,
                    customConfig: this.configManager.unifiedFormatterConfig
                });

                const formatterTime = Date.now() - formatterStart;

                if (unifiedResult && unifiedResult.length > 0) {
                    formattedContext = unifiedResult;
                    this.logger.info('Unified context formatted successfully', {
                        requestId,
                        userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                        formatterResults: {
                            contextLength: formattedContext.length,
                            formatterTime: `${formatterTime}ms`,
                            contextPreview: formattedContext.substring(0, 300) + '...',
                            userLanguage: contextData.userLanguage,
                            sectionsIncluded: this.configManager.unifiedFormatterConfig.sections || {}
                        }
                    });
                } else {
                    throw new Error('Unified formatter returned empty result');
                }
            } catch (formatterError) {
                this.logger.warn('UnifiedContextFormatter failed, using fallback formatting', {
                    requestId,
                    userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                    formatterError: {
                        message: formatterError.message,
                        name: formatterError.name
                    },
                    fallbackReason: 'Will use createFallbackContext method'
                });
                formattedContext = this.createFallbackContext(contextData);
            }
        } else {
            const reason = !this.unifiedContextFormatter ? 'Unified formatter not available' : 'Unified formatter disabled in config';
            
            this.logger.info('Using fallback context formatting', {
                requestId,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                reason,
                unifiedFormatterConfig: {
                    available: !!this.unifiedContextFormatter,
                    enabled: this.configManager.unifiedFormatterConfig.enabled
                }
            });
            formattedContext = this.createFallbackContext(contextData);
        }

        // *** Build the complete prompt ***
        const promptBuildStart = Date.now();
        const languagePrompt = await this.buildLanguageSpecificPrompt(contextData.userLanguage);
        const userInstruction = this.buildUserInstruction(query, contextData);

        contextualPrompt = `${languagePrompt}\n\n${formattedContext}\n\n${userInstruction}`;
        const promptBuildTime = Date.now() - promptBuildStart;

        this.logger.info('AI prompt constructed', {
            requestId,
            userId: userId ? userId.substring(0, 1000000) + '...' : 'unknown',
            promptConstruction: {
                totalLength: contextualPrompt.length,
                buildTime: `${promptBuildTime}ms`,
                components: {
                    languagePromptLength: languagePrompt.length,
                    formattedContextLength: formattedContext.length,
                    userInstructionLength: userInstruction.length
                },
                userLanguage: contextData.userLanguage,
                promptPreview: contextualPrompt.substring(0, 500) + '...'
            }
        });

        // *** Enhanced Chat History Loading - โหลดจาก AI history โดยตรง ***
        const historyStart = Date.now();
        let chatHistory = [];
        
        if (userId) {
            const aiHistory = await this.chatHistoryHandler.loadAIChatHistory(userId);
            if (aiHistory && aiHistory.messages && aiHistory.messages.length > 0) {
                chatHistory = await this.chatHistoryHandler.formatChatHistoryForGemini(
                    aiHistory,
                    languagePrompt
                );

                this.logger.info('AI chat history loaded from database', {
                    requestId,
                    userId: userId.substring(0, 10) + '...',
                    totalMessages: aiHistory.messages.length,
                    formattedHistoryLength: chatHistory.length
                });
            }
        }
        
        // ถ้าไม่มีประวัติ ให้ใช้ language prompt เป็นข้อความเริ่มต้น
        if (chatHistory.length === 0) {
            chatHistory = [{ role: 'model', parts: [{ text: languagePrompt }] }];
        }
        
        const historyTime = Date.now() - historyStart;

        this.logger.info('Chat history prepared for AI model', {
            requestId,
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            chatHistory: {
                historyLength: chatHistory.length,
                prepTime: `${historyTime}ms`,
                recentHistoryPreview: chatHistory.slice(-5).map((h, index) => ({
                    position: `last-${5 - index}`,
                    role: h.role,
                    contentLength: h.parts?.[0]?.text?.length || 0,
                    contentPreview: h.parts?.[0]?.text?.substring(0, 100) + '...' || ''
                }))
            }
        });

        // *** Call Gemini API ***
        const apiCallStart = Date.now();
        
        this.logger.info('Calling Gemini API', {
            requestId,
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            apiCall: {
                modelName: this.configManager.MODEL_NAME,
                promptLength: contextualPrompt.length,
                historyLength: chatHistory.length,
                generationConfig: this.configManager.generationConfig,
                apiKeyConfigured: !!process.env.GEMINI_API_KEY
            }
        });

        const geminiApiKey = contextData.contextConfig?.text_api_key || process.env.GEMINI_API_KEY;
        const result = await this.geminiAPIService.callGeminiAPI(
            contextualPrompt,
            chatHistory,
            this.configManager.generationConfig,
            geminiApiKey
        );

        const apiCallTime = Date.now() - apiCallStart;
        let responseText = result.response.text();
        
        this.logger.info('Raw response received from Gemini API', {
            requestId,
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            apiResponse: {
                responseLength: responseText?.length || 0,
                apiCallTime: `${apiCallTime}ms`,
                rawResponsePreview: responseText ? responseText.substring(0, 400) + '...' : 'undefined',
                usageMetadata: result.response.usageMetadata,
                modelUsed: this.configManager.MODEL_NAME,
                finishReason: result.response.candidates?.[0]?.finishReason
            }
        });
        
        // *** Validate response ***
        if (!responseText || typeof responseText !== 'string') {
            throw new Error('Invalid response from AI model - empty or non-string response');
        }

        // *** Clean and process response ***
        const cleaningStart = Date.now();
        const originalLength = responseText.length;
        responseText = MessageContentCleaner.processUrls(responseText);
        const cleaningTime = Date.now() - cleaningStart;

        this.logger.info('Response cleaned and processed', {
            requestId,
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            responseCleaning: {
                originalLength,
                cleanedLength: responseText.length,
                cleaningTime: `${cleaningTime}ms`,
                urlsProcessed: originalLength !== responseText.length,
                cleanedResponsePreview: responseText.substring(0, 400) + '...'
            }
        });

        // *** Save conversation to history ***
        if (userId) {
            const savingStart = Date.now();
            
            this.logger.info('Saving conversation to history', {
                requestId,
                userId: userId.substring(0, 10) + '...',
                historySaving: {
                    queryLength: query?.length || 0,
                    responseLength: responseText.length,
                    productsCount: contextData.products?.length || 0,
                    tokensUsed: result.response.usageMetadata
                }
            });

            await this.saveConversationToHistory(
                userId, 
                query, 
                responseText, 
                result.response.usageMetadata,
                contextData.products
            );

            const savingTime = Date.now() - savingStart;
            this.logger.info('Conversation saved to history successfully', {
                requestId,
                userId: userId.substring(0, 10) + '...',
                savingTime: `${savingTime}ms`
            });
        }

        // *** Construct final response ***
        const finalResponse = {
            response: responseText,
            tokens: {
                input: result.response.usageMetadata?.promptTokenCount || 0,
                output: result.response.usageMetadata?.candidatesTokenCount || 0,
                total: (result.response.usageMetadata?.promptTokenCount || 0) + 
                       (result.response.usageMetadata?.candidatesTokenCount || 0)
            },
            contextUsed: {
                products: contextData.products.length,
                knowledge: contextData.knowledgeResults.length,
                userLanguage: contextData.userLanguage,
                hasHistoricalContext: !!contextData.historicalContext
            },
            products: contextData.products,
            processingInfo: {
                unifiedFormatterUsed: !!this.unifiedContextFormatter && this.configManager.unifiedFormatterConfig.enabled,
                contextLength: formattedContext.length,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                requestId,
                modelUsed: this.configManager.MODEL_NAME,
                processingTimes: {
                    promptBuild: promptBuildTime,
                    historyPrep: historyTime,
                    apiCall: apiCallTime,
                    responseCleaning: cleaningTime
                }
            }
        };

        this.logger.info('Enhanced response generation completed successfully', {
            requestId,
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            finalResponse: {
                responseLength: finalResponse.response.length,
                responsePreview: finalResponse.response.substring(0, 300) + '...',
                tokens: finalResponse.tokens,
                contextUsed: finalResponse.contextUsed,
                productsReturned: finalResponse.products.length,
                processingInfo: finalResponse.processingInfo
            }
        });

        return finalResponse;

    } catch (error) {
        this.logger.error('Error in enhanced response generation', {
            requestId,
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            responseGenerationError: {
                message: error.message,
                name: error.name,
                stack: error.stack
            },
            contextData: {
                query: contextData.query?.substring(0, 100) + '...',
                productsCount: contextData.products?.length || 0,
                knowledgeCount: contextData.knowledgeResults?.length || 0,
                userLanguage: contextData.userLanguage
            }
        });
        throw error;
    }
}


    /**
     * Build language-specific prompt
     */
    async buildLanguageSpecificPrompt(userLanguage) {
        // Load system prompt from Context Window config
        const contextConfig = await this.loadContextWindowConfig();
        return contextConfig.system_prompt;
    }

    /**
     * Build user instruction
     */
    buildUserInstruction(query, contextData) {
        const userLanguage = contextData.userLanguage;
        
        let instruction = '';
        
        if (userLanguage === 'TH') {
            instruction = `คำถามจากลูกค้า: "${query}"\n\n`;
            instruction += '- ';
            instruction += '-';
        } else if (userLanguage === 'EN') {
            instruction = `Customer Question: "${query}"\n\n`;
            instruction += '.-';
            instruction += 'If there are relevant products, recommend them with pricing and product URLs.';
        } else {
            // Fallback to Thai for other languages
            instruction = `คำถามจากลูกค้า: "${query}"\n\n`;
            instruction += '-';
        }

        return instruction;
    }

    /**
     * Create fallback context when unified formatter is not available
     */
    createFallbackContext(contextData) {
        let context = '';

        // Add knowledge context if available
        if (contextData.knowledgeResults && contextData.knowledgeResults.length > 0) {
            if (contextData.userLanguage === 'TH') {
                context += 'ความรู้ที่เกี่ยวข้อง:\n';
            } else {
                context += 'Relevant Knowledge:\n';
            }

            contextData.knowledgeResults.forEach((knowledge, index) => {
                context += `${index + 1}. ${knowledge.category} - ${knowledge.file_name}\n`;
                context += `${knowledge.text}\n\n`;
            });
        }

        // Add product context if available
        if (contextData.products && contextData.products.length > 0) {
            if (contextData.userLanguage === 'TH') {
                context += 'สินค้าที่เกี่ยวข้อง:\n';
            } else {
                context += 'Relevant Products:\n';
            }
            
            contextData.products.forEach((product, index) => {
                context += `${index + 1}. ${product.product_name}\n`;
                context += `หมวดหมู่: ${product.category}\n`;
                if (product.short_description) {
                    context += `รายละเอียด: ${product.short_description}\n`;
                }
                if (product.url) {
                    context += `URL: ${product.url}\n`;
                }
                context += '\n';
            });
        }

        return context;
    }

    /**
     * Save conversation to history with products
     */
    async saveConversationToHistory(userId, query, response, usageMetadata, products = []) {
        try {
            // Save user message to SQL
            await this.saveChatMessageToSQL(userId, 'user', query, null);

            // Save AI response to SQL
            await this.saveChatMessageToSQL(userId, 'model', response, products);

            this.logger.info('Conversation saved to SQL with products', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                productsCount: products.length,
                inputTokens: usageMetadata?.promptTokenCount || 0,
                outputTokens: usageMetadata?.candidatesTokenCount || 0
            });

        } catch (historyError) {
            this.logger.warn('Failed to save conversation to SQL:', {
                error: historyError.message,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown'
            });
        }
    }

    /**
     * Create fallback response in user's language
     */
    createFallbackResponse(error, userLanguage = 'TH') {
        let fallbackMessage = '';
        
        if (userLanguage === 'TH') {
            fallbackMessage = 'ขออภัยค่ะ ขณะนี้ระบบมีปัญหาชั่วคราว กรุณาลองใหม่อีกครั้งในภายหลัง หรือติดต่อเจ้าหน้าที่เพื่อขอความช่วยเหลือค่ะ';
        } else if (userLanguage === 'EN') {
            fallbackMessage = 'I apologize, but I\'m experiencing technical difficulties at the moment. Please try again later or contact our staff for assistance.';
        } else {
            // Fallback to Thai
            fallbackMessage = 'ขออภัยค่ะ ขณะนี้ระบบมีปัญหาชั่วคราว กรุณาลองใหม่อีกครั้งในภายหลัง';
        }

        return {
            response: fallbackMessage,
            tokens: { input: 0, output: 0, total: 0 },
            error: true,
            errorType: error.name || 'UnknownError',
            products: [],
            contextUsed: {
                products: 0,
                knowledge: 0,
                userLanguage: userLanguage
            }
        };
    }

    // *** Language and Configuration Methods ***
    getUserLanguageStatistics() {
        return this.configManager ? this.configManager.getUserLanguageStatistics() : null;
    }

    getSupportedLanguages() {
        return this.configManager ? this.configManager.getSupportedLanguages() : {
            languages: ['TH'],
            defaultLanguage: 'TH'
        };
    }

    getLanguageDetectionConfig() {
        return this.configManager ? this.configManager.languageDetectionConfig : null;
    }

    clearLanguageDetectionCache(userId = null) {
        return this.configManager ? this.configManager.clearLanguageDetectionCache(userId) : false;
    }

    unlockUserLanguage(userId) {
        return this.configManager ? this.configManager.unlockUserLanguage(userId) : false;
    }

    resetUserConversation(userId) {
        return this.configManager ? this.configManager.resetUserConversation(userId) : false;
    }

    getUnifiedFormatterConfig() {
        return this.configManager ? this.configManager.getUnifiedFormatterConfig() : null;
    }

    async updateUnifiedFormatterConfig(config, language = null) {
        return this.configManager ? await this.configManager.updateUnifiedFormatterConfig(config, language) : false;
    }

    getKnowledgeConfig() {
        return this.configManager ? this.configManager.getKnowledgeConfig() : null;
    }

    async updateKnowledgeConfig(config, language = null) {
        return this.configManager ? await this.configManager.updateKnowledgeConfig(config, language) : false;
    }

    getTemplateConfig(language = null) {
        return this.configManager ? this.configManager.getTemplateConfig(language) : null;
    }

    async updateTemplateConfig(config, language = null) {
        return this.configManager ? await this.configManager.updateTemplateConfig(config, language) : false;
    }

    // *** Knowledge Integration Methods ***
    async searchKnowledge(query, options = {}) {
        const knowledgeConfig = this.configManager?.knowledgeConfig || {};
        const knowledgeSearchSettings = knowledgeConfig.searchSettings || {};
        const vectorDBConfig = await this.loadVectorDBConfig();
        const knowledgeVectorEnabled = !!(vectorDBConfig?.enabled && vectorDBConfig?.knowledgeVectorEnabled);

        if (knowledgeConfig.enabled === false) {
            this.logger.info('Knowledge search skipped (Knowledge RAG disabled in configuration)', {
                queryPreview: query ? query.substring(0, 100) : ''
            });
            return {
                success: true,
                results: [],
                disabled: true,
                message: 'Knowledge RAG disabled in configuration'
            };
        }

        if (!knowledgeVectorEnabled) {
            this.logger.info('Knowledge search skipped (VectorDBConfig disabled or missing knowledge vector search)', {
                queryPreview: query ? query.substring(0, 100) : ''
            });
            return {
                success: true,
                results: [],
                disabled: true,
                message: 'Knowledge vector search disabled or unavailable via VectorDBConfig'
            };
        }

        if (!this.knowledgeRAG || !this.knowledgeRAG.initialized) {
            return {
                success: false,
                error: 'Knowledge RAG system not available',
                results: []
            };
        }

        const searchOptions = {
            topK: options.topK ?? vectorDBConfig?.knowledgeMaxResults ?? knowledgeSearchSettings.topK ?? 3,
            scoreThreshold: options.scoreThreshold ?? vectorDBConfig?.knowledgeSimilarityThreshold ?? knowledgeSearchSettings.scoreThreshold ?? 0.5,
            language: options.language ?? knowledgeSearchSettings.languageOverride ?? null,
            filter: options.filter ?? knowledgeSearchSettings.filter ?? {}
        };

        if (!searchOptions.language) {
            searchOptions.language = 'TH';
        }

        this.logger.info('Searching knowledge via AIAssistant helper', {
            queryPreview: query ? query.substring(0, 100) : '',
            searchOptions
        });

        try {
            return await this.knowledgeRAG.searchKnowledge(query, searchOptions);
        } catch (error) {
            this.logger.error('Error searching knowledge:', error);
            return {
                success: false,
                error: error.message,
                results: []
            };
        }
    }

    async generateKnowledgeContext(query, options = {}) {
        const knowledgeConfig = this.configManager?.knowledgeConfig || {};
        const vectorDBConfig = await this.loadVectorDBConfig();
        const knowledgeVectorEnabled = !!(vectorDBConfig?.enabled && vectorDBConfig?.knowledgeVectorEnabled);

        if (knowledgeConfig.enabled === false) {
            this.logger.info('Knowledge context generation skipped (Knowledge RAG disabled in configuration)', {
                queryPreview: query ? query.substring(0, 100) : ''
            });
            return {
                success: true,
                context: '',
                disabled: true,
                message: 'Knowledge RAG disabled in configuration'
            };
        }

        if (!knowledgeVectorEnabled) {
            this.logger.info('Knowledge context generation skipped (VectorDBConfig disabled or missing knowledge vector search)', {
                queryPreview: query ? query.substring(0, 100) : ''
            });
            return {
                success: true,
                context: '',
                disabled: true,
                message: 'Knowledge vector search disabled or unavailable via VectorDBConfig'
            };
        }

        if (!this.knowledgeRAG || !this.knowledgeRAG.initialized) {
            return {
                success: false,
                error: 'Knowledge RAG system not available',
                context: ''
            };
        }

        try {
            const resolvedOptions = {
                ...options,
                topK: options.topK ?? vectorDBConfig?.knowledgeMaxResults ?? knowledgeConfig?.searchSettings?.topK ?? 3,
                scoreThreshold: options.scoreThreshold ?? vectorDBConfig?.knowledgeSimilarityThreshold ?? knowledgeConfig?.searchSettings?.scoreThreshold ?? 0.5,
                filter: options.filter ?? knowledgeConfig?.searchSettings?.filter ?? {}
            };

            return await this.knowledgeRAG.generateContext(query, resolvedOptions);
        } catch (error) {
            this.logger.error('Error generating knowledge context:', error);
            return {
                success: false,
                error: error.message,
                context: ''
            };
        }
    }

    async chatWithKnowledge(query, userId, options = {}) {
        const requestId = `chat_knowledge_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        try {
            const {
                useKnowledge = true,
                knowledgeOptions = {},
                productOptions = {}
            } = options;

            this.logger.info('Starting chat with knowledge integration', {
                requestId,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                useKnowledge,
                knowledgeOptions,
                productOptions
            });

            // Set user context
            await this.setUserContext(userId);
            
            let products = [];
            let knowledgeResults = [];

            // *** Load context config to check if Product RAG is enabled ***
            const contextConfig = await this.loadContextWindowConfig();

            // Get products if requested and enabled in config
            if (productOptions.products) {
                products = productOptions.products;
            } else if (contextConfig.use_product_rag) {
                try {
                    const productSearchResult = await this.getProducts(query, userId);
                    products = productSearchResult || [];
                    this.logger.info('Products retrieved for chat with knowledge (enabled by context config)', {
                        requestId,
                        productsCount: products.length,
                        productRAGEnabled: contextConfig.use_product_rag
                    });
                } catch (productError) {
                    this.logger.warn('Product search failed in chatWithKnowledge:', {
                        requestId,
                        error: productError.message
                    });
                }
            }

            // Search knowledge if enabled in config and options
            if (useKnowledge && contextConfig.use_knowledge_rag) {
                const knowledgeSearch = await this.searchKnowledge(query, knowledgeOptions);

                if (knowledgeSearch.success && knowledgeSearch.results.length > 0) {
                    knowledgeResults = knowledgeSearch.results;
                    this.logger.info('Knowledge retrieved for chat (enabled by context config)', {
                        requestId,
                        knowledgeCount: knowledgeResults.length,
                        knowledgeRAGEnabled: contextConfig.use_knowledge_rag
                    });
                } else if (knowledgeSearch.disabled) {
                    this.logger.info('Knowledge search skipped for chat (configuration disabled)', {
                        requestId,
                        message: knowledgeSearch.message
                    });
                } else {
                    this.logger.info('Knowledge search returned no results for chat', {
                        requestId,
                        knowledgeRAGEnabled: contextConfig.use_knowledge_rag,
                        reason: knowledgeSearch.error || 'No knowledge found'
                    });
                }
            } else if (!contextConfig.use_knowledge_rag) {
                this.logger.info('Knowledge RAG disabled by context config', {
                    requestId,
                    useKnowledgeRAG: contextConfig.use_knowledge_rag
                });
            }

            // Generate response using enhanced context
            const response = await this.generateResponse(query, products, userId, { requestId });

            return {
                success: true,
                response: response.response,
                tokens: response.tokens,
                contextUsed: {
                    ...response.contextUsed,
                    knowledgeResults: knowledgeResults.length,
                    products: products.length
                },
                products: response.products || products,
                sources: {
                    knowledge: knowledgeResults.map(k => ({
                        id: k.id,
                        category: k.category,
                        file_name: k.file_name,
                        relevance_score: k.relevance_score
                    })),
                    products: (response.products || products).map(p => ({
                        id: p.id,
                        name: p.product_name,
                        category: p.category,
                        url: p.url
                    }))
                },
                userLanguage: this.getUserLanguage(userId),
                requestId,
                timestamp: Date.now()
            };

        } catch (error) {
            this.logger.error('Error in chatWithKnowledge:', {
                requestId,
                error: error.message,
                stack: error.stack,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown'
            });
            
            return {
                success: false,
                error: error.message,
                response: this.createFallbackResponse(error, this.getUserLanguage(userId)).response,
                products: [],
                userLanguage: this.getUserLanguage(userId),
                requestId,
                timestamp: Date.now()
            };
        }
    }

    // *** Testing and Debugging Methods ***
    async testUnifiedContext(query, products = [], knowledgeResults = []) {
        try {
            if (!this.unifiedContextFormatter) {
                return {
                    success: false,
                    error: 'UnifiedContextFormatter not available'
                };
            }

            const result = await this.unifiedContextFormatter.formatUnifiedContext({
                query,
                products,
                knowledgeResults,
                language: this.configManager.getCurrentLanguage(),
                customConfig: this.configManager.unifiedFormatterConfig
            });

            return {
                success: true,
                result,
                stats: {
                    contextLength: result ? result.length : 0,
                    productsUsed: products.length,
                    knowledgeUsed: knowledgeResults.length,
                    language: this.configManager.getCurrentLanguage()
                }
            };

        } catch (error) {
            this.logger.error('Error testing unified context:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // *** Product Management ***
    async getProducts(query, userId = null) {
        try {
            if (!this.productManager) {
                return [];
            }

            const searchResult = await this.productManager.searchProducts(query, userId);
            return searchResult.results || [];
        } catch (error) {
            this.logger.error('Error getting products:', error);
            return [];
        }
    }

    // *** Cache and Performance Management ***
    clearCache() {
        try {
            this.cache.flushAll();
            this.requestCache.flushAll();
            this.responseCache.flushAll();
            this.activeRequests.clear();
            this.requestQueue.clear();
            
            // Reset statistics
            this.requestStats = {
                totalRequests: 0,
                duplicateRequests: 0,
                cachedResponses: 0,
                uniqueResponses: 0,
                errorResponses: 0,
                averageResponseTime: 0,
                lastRequestTime: null,
                peakConcurrency: 0,
                totalTokensUsed: 0
            };

            this.performanceMetrics.responseTimes = [];
            this.performanceMetrics.errorCounts.clear();
            
            if (this.configManager) {
                this.configManager.clearLanguageDetectionCache();
            }
            
            this.logger.info('AI Assistant cache and statistics cleared completely', {
                clearedCaches: ['main', 'request', 'response'],
                clearedMaps: ['activeRequests', 'requestQueue'],
                resetStatistics: true,
                resetPerformanceMetrics: true
            });
        } catch (error) {
            this.logger.error('Error clearing cache:', error);
        }
    }

    getStatistics() {
        return {
            ...this.requestStats,
            cacheStats: {
                requestCacheSize: this.requestCache.keys().length,
                responseCacheSize: this.responseCache.keys().length,
                activeRequests: this.activeRequests.size,
                queuedRequests: this.requestQueue.size,
                mainCacheSize: this.cache.keys().length
            },
            performance: {
                lastResponseTime: this.lastResponseTime,
                responseCount: this.responseCount,
                consecutiveErrors: this.consecutiveErrors,
                initialized: this.initialized,
                uptime: Date.now() - this.performanceMetrics.startTime,
                memorySnapshots: this.performanceMetrics.memoryUsage.length,
                errorsByType: Object.fromEntries(this.performanceMetrics.errorCounts)
            },
            timestamp: Date.now()
        };
    }

    async healthCheck() {
        try {
            const health = {
                systemStatus: this.initialized ? 'healthy' : 'unhealthy',
                modelConnection: null,
                configManager: !!this.configManager,
                knowledgeRAG: {
                    available: !!this.knowledgeRAG,
                    initialized: this.knowledgeRAG?.initialized || false
                },
                unifiedFormatter: {
                    available: !!this.unifiedContextFormatter,
                    enabled: this.configManager?.unifiedFormatterConfig?.enabled || false
                },
                userLanguageStats: this.getUserLanguageStatistics(),
                statistics: this.getStatistics(),
                cacheHealth: {
                    requestCache: this.requestCache.keys().length,
                    responseCache: this.responseCache.keys().length,
                    activeRequests: this.activeRequests.size,
                    queuedRequests: this.requestQueue.size
                },
                timestamp: Date.now()
            };

            // Test model connection if initialized
            if (this.initialized) {
                try {
                    await this.testModelConnection();
                    health.modelConnection = 'healthy';
                } catch (error) {
                    health.modelConnection = 'failed';
                    health.modelError = error.message;
                }
            }

            return health;
        } catch (error) {
            this.logger.error('Health check failed:', {
                error: error.message,
                stack: error.stack
            });
            return {
                systemStatus: 'error',
                error: error.message,
                timestamp: Date.now()
            };
        }
    }
}

module.exports = AIAssistant;
