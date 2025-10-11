'use strict';
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const cors = require('cors');
const winston = require('winston');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs').promises;
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PrismaClient } = require('@prisma/client');
const schedule = require('node-schedule');
require('dotenv').config();

const { ROOT_DIR, DATA_DIR, TEMP_IMAGES_DIR, STATIC_DIR } = require('./paths');

// Import route modules
const productRoutes = require('../modules/products/routes/productRoutes');
const productSearchConfigRoutes = require('../modules/products/routes/productSearchConfigRoutes');
const productionRoutes = require('../modules/products/routes/productionRoutes');
const linkageRoutes = require('../modules/products/routes/linkageRoutes');
const aiRoutes = require('../modules/ai/routes/aiRoutes');
const messageRoutes = require('../modules/messaging/routes/messageRoutes');
const userRoutes = require('../modules/chat/routes/userRoutes');
const chatRoutes = require('../modules/chat/routes/chatRoutes');
const configRoutes = require('../modules/system/routes/configRoutes');
const messageConfigRoutes = require('../modules/messaging/routes/messageConfigRoutes');
const backupRoutes = require('../modules/system/routes/backupRoutes');
const imageRoutes = require('../modules/media/routes/imageRoutes');
const websocketRoutes = require('../modules/system/routes/websocketRoutes');
const systemRoutes = require('../modules/system/routes/systemRoutes');
const productImageRoutes = require('../modules/media/routes/productImageRoutes');
const productImageManagerRoutes = require('../modules/media/routes/productImageManagerRoutes');
const createKeywordImageRoutes = require('../modules/media/routes/keywordImageRoutes');
const createKeywordRoutes = require('../modules/messaging/routes/keyRoutes');
const productBlackRoutes = require('../modules/products/routes/productBlackRoutes');
const createKnowledgeRoutes = require('../modules/knowledge/routes/knowledgeRoutes');
const configurationRoutes = require('../modules/system/routes/configurationRoutes');
const manualProductRoutes = require('../modules/products/routes/manualProductRoutes');
const lineApiRoutes = require('../modules/messaging/routes/lineApiRoutes');
const vectorDBRoutes = require('../modules/knowledge/routes/vectorDBRoutes');
const documentRoutes = require('../modules/knowledge/routes/documentRoutes');
const contextWindowRoutes = require('../modules/ai/routes/contextWindowRoutes');
const createLineOaConfigRoutes = require('../modules/messaging/routes/lineOaConfigRoutes');
const createRoleRoutes = require('../modules/auth/routes/roleRoutes');

// Import service modules
const ChatHistoryManager = require('../modules/chat/services/chatHistoryManager');
const AIAssistant = require('../modules/ai/services/aiAssistant');
const LineMessageHandler = require('../modules/messaging/services/lineMessageHandler');
const MessageHandler = require('../modules/messaging/services/messageHandler');
const ProductManager = require('../modules/products/services/productManager');
const SettingsManager = require('../core/settings/settingsManager');
const ProductionProductHandler = require('../modules/products/services/productionProductHandler');
const MessageTracker = require('../core/tracking/messageTracker');
const ImageHandler = require('../modules/media/services/imageHandler');
const KeywordDetector = require('../modules/messaging/services/keywordDetector');
const WebSocketManager = require('./websocket/webSocketManager');
const ProductImageSender = require('../modules/media/services/productImageSender');
const KeywordImageSender = require('../modules/media/services/keywordImageSender');
const ManualProductService = require('../modules/products/services/manualProductService');

// Import Knowledge Management modules
const KnowledgeFormatter = require('../modules/ai/services/knowledgeFormatter');
const KnowledgeRAG = require('../modules/ai/services/knowledgerag');
const UnifiedContextFormatter = require('../modules/ai/services/UnifiedContextFormatter');

// Import auth modules
const createAuthRoutes = require('../modules/auth/routes/authRoutes');
const authMiddleware = require('../modules/auth/middleware/authMiddleware');

// Setup logger
const logger = winston.createLogger({   
  level: 'info',
  format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message, ...rest }) => {
          const extras = Object.keys(rest).length ? JSON.stringify(rest) : '';
          return `${timestamp} ${level}: ${message} ${extras}`;
      })
  ),
  transports: [
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/info.log' }),
      new winston.transports.File({ filename: 'logs/chat.log' }),
      new winston.transports.File({ filename: 'logs/auth.log', level: 'info' }),
      new winston.transports.File({ filename: 'logs/product_images.log', level: 'info' }),
      new winston.transports.File({ filename: 'logs/system.log', level: 'info' }),
      new winston.transports.File({ filename: 'logs/keyword.log', level: 'info' }),
      new winston.transports.File({ filename: 'logs/keyword_images.log', level: 'info' }),
      new winston.transports.File({ filename: 'logs/image_handler.log', level: 'info' }),
      new winston.transports.File({ filename: 'logs/rag.log', level: 'info' }),
      new winston.transports.File({ filename: 'logs/product.log', level: 'info' }),
      new winston.transports.File({ filename: 'logs/knowledge.log', level: 'info' }),
      new winston.transports.File({ filename: 'logs/unified_formatter.log', level: 'info' }),
      new winston.transports.File({ filename: 'logs/configuration.log', level: 'info' }) 
  ]
});

if (typeof logger.setMaxListeners === 'function') {
  logger.setMaxListeners(30);
}

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
      format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
      )
  }));     
}

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
      origin: "*",
      methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

global.io = io;

const prisma = new PrismaClient();
app.locals.prisma = prisma;

// Initialize service instances
const messageHandler = new MessageHandler(logger);
const chatHistory = new ChatHistoryManager(logger);
const productManager = new ProductManager(logger, chatHistory);
const productionHandler = new ProductionProductHandler(logger);
const settingsManager = new SettingsManager(logger);
const messageTracker = new MessageTracker();
const keywordDetector = new KeywordDetector(logger);
const knowledgeFormatter = new KnowledgeFormatter(logger);
const knowledgeRAG = new KnowledgeRAG(logger);
const aiAssistant = new AIAssistant(logger, chatHistory, productManager, productionHandler, knowledgeRAG);
aiAssistant.setKnowledgeFormatter(knowledgeFormatter);

// Initialize authentication system (initialized after WebSocketManager is created)
let authRouter;
let authManager;
let roleRoutes;

// Initialize LINE Message Handler
const lineHandler = new LineMessageHandler(
  logger,
  aiAssistant,
  productManager,
  chatHistory,
  messageHandler
);

const productImageSender = new ProductImageSender(logger, lineHandler);
const keywordImageSender = new KeywordImageSender(logger, lineHandler);
const manualProductService = new ManualProductService(logger);
const imageHandler = new ImageHandler(logger, aiAssistant, lineHandler, chatHistory);
let webSocketManager = new WebSocketManager(
  io,
  logger,
  lineHandler,
  aiAssistant,
  chatHistory
);
logger.info('🔧 Starting service connections...');
lineHandler.setProductImageSender(productImageSender);
lineHandler.setKeywordImageSender(keywordImageSender);
lineHandler.setImageHandler(imageHandler);
lineHandler.setWebSocketManager(webSocketManager);
lineHandler.setKeywordDetector(keywordDetector);
keywordDetector.setLineHandler(lineHandler);
webSocketManager.lineHandler = lineHandler;
logger.info('✅ Service connections established');

// Now that webSocketManager is available, initialize auth and role routes
({ router: authRouter, authManager } = createAuthRoutes(logger, webSocketManager));
roleRoutes = createRoleRoutes(authManager, webSocketManager);

app.use(cors());
app.use('/webhook/line/:oaId', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '64mb' }));
app.use(express.urlencoded({ limit: '64mb', extended: true }));
app.use(morgan('dev'));
app.use(express.static(STATIC_DIR));

app.use((req, res, next) => {
  req.io = io;
  req.webSocketManager = webSocketManager;
  req.imageHandler = imageHandler;
  req.knowledgeFormatter = knowledgeFormatter;
  req.knowledgeRAG = knowledgeRAG;
  req.aiAssistant = aiAssistant;
  next();
});

app.locals.knowledgeRAG = knowledgeRAG;
app.use(authMiddleware(authManager));

const routes = {
  vectorDB: vectorDBRoutes(logger),
  auth: authRouter,
  roles: roleRoutes,
  product: productRoutes(productManager, logger, vectorDBRoutes(logger)),
  production: productionRoutes(productionHandler, logger),
  linkage: linkageRoutes(productionHandler, logger, productManager),
  ai: aiRoutes(aiAssistant, lineHandler, logger),
  message: messageRoutes({ chatHistory, lineHandler, messageHandler, logger, webSocketManager }),
  user: userRoutes({ chatHistory, lineHandler, aiAssistant, logger }),
  chat: chatRoutes({ chatHistory, logger }),
  config: configRoutes({ aiAssistant, messageHandler, productManager, logger }),
  messageConfig: messageConfigRoutes({ messageHandler, chatHistory, logger, lineHandler, webSocketManager }),
  backup: backupRoutes(logger),
  image: imageRoutes(imageHandler, logger),
  websocket: websocketRoutes({ webSocketManager, lineHandler, logger }),
  system: systemRoutes({ logger, webSocketManager, lineHandler, aiAssistant, chatHistory }),
  productImages: productImageRoutes(productImageSender, logger),
  productImageManager: productImageManagerRoutes(productImageSender, logger),
  keywordImages: createKeywordImageRoutes(keywordImageSender, logger),
  keyword: createKeywordRoutes(keywordDetector, logger),
  productBlack: productBlackRoutes,
  knowledge: createKnowledgeRoutes(knowledgeRAG, knowledgeFormatter, logger),
  configuration: configurationRoutes(aiAssistant, knowledgeRAG, logger),
  manualProducts: manualProductRoutes(manualProductService, logger),
  lineApi: lineApiRoutes,
  documents: documentRoutes(logger),
  contextWindow: contextWindowRoutes(logger),
  productSearchConfig: productSearchConfigRoutes(logger),
  lineOaConfig: createLineOaConfigRoutes(logger)
};

// Register routes with permissions
app.use('/api/auth', routes.auth);
app.use('/api/roles', routes.roles);

// Products
app.use('/api/products/production', authManager.authorizeRequest('products:manage'), routes.production);
app.use('/api/products/status', authManager.authorizeRequest('products:view'), routes.product);
app.use('/api/products', authManager.authorizeRequest('products:manage'), routes.linkage);
app.use('/api/products', authManager.authorizeRequest('products:view'), routes.product);
app.use('/api/manual-products', authManager.authorizeRequest('products:manage'), routes.manualProducts);
app.use('/api/product-search-config', authManager.authorizeRequest('config:manage'), routes.productSearchConfig);
app.use('/api', authManager.authorizeRequest('products:manage'), routes.productBlack);

// AI & Messaging
app.use('/api/ai', authManager.authorizeRequest('ai:interact'), routes.ai);
app.use('/api/messages', authManager.authorizeRequest('messages:view'), routes.message);
app.use('/api/users', authManager.authorizeRequest('users:view'), routes.user);
app.use('/api/chat', authManager.authorizeRequest('chat:view'), routes.chat);
app.use('/api/message-config', authManager.authorizeRequest('config:manage'), routes.messageConfig);
app.use('/api/line', authManager.authorizeRequest('system:admin'), routes.lineApi);
app.use('/api/line-oa-configs', authManager.authorizeRequest('config:manage'), routes.lineOaConfig);

// Knowledge & Documents
app.use('/api/knowledge', authManager.authorizeRequest('knowledge:view'), routes.knowledge);
app.use('/api/vector-db', authManager.authorizeRequest('system:admin'), routes.vectorDB);
app.use('/api/documents', authManager.authorizeRequest('documents:manage'), routes.documents);
app.use('/api/context-window', authManager.authorizeRequest('config:manage'), routes.contextWindow);

// Media
app.use('/api/images', authManager.authorizeRequest('media:view'), routes.image);
app.use('/api/product-images', authManager.authorizeRequest('media:manage'), routes.productImages);
app.use('/api/product-image-manager', authManager.authorizeRequest('media:manage'), routes.productImageManager);
app.use('/api/keyword-images', authManager.authorizeRequest('media:manage'), routes.keywordImages);
app.use('/api', authManager.authorizeRequest('keywords:manage'), routes.keyword);

// System & Config
app.use('/api/config', authManager.authorizeRequest('config:view'), routes.config);
app.use('/api/backup', authManager.authorizeRequest('system:admin'), routes.backup);
app.use('/api/websocket', authManager.authorizeRequest('system:view'), routes.websocket);
app.use('/api/system', authManager.authorizeRequest('system:view'), routes.system);
app.use('/api/configuration', authManager.authorizeRequest('config:manage'), routes.configuration);

app.get('/api/gemini/models', async (req, res) => {
   try {
       if (!process.env.GEMINI_API_KEY) {
           return res.status(500).json({
               success: false,
               error: 'GEMINI_API_KEY not configured'
           });
       }

       const response = await axios.get(
           'https://generativelanguage.googleapis.com/v1/models',
           {
               params: {
                   key: process.env.GEMINI_API_KEY
               },
               timeout: 15000
           }
       );

       if (response.data && response.data.models) {
           const models = response.data.models.map(model => {
               const name = model.name.replace('models/', '');
               return {
                   name: name,
                   displayName: model.displayName || name,
                   description: model.description || '',
                   version: model.version || 'latest',
                   inputTokenLimit: model.inputTokenLimit || 0,
                   outputTokenLimit: model.outputTokenLimit || 0,
                   supportedGenerationMethods: model.supportedGenerationMethods || []
               };
           });

           const visionModels = models.filter(model => {
               const name = model.name.toLowerCase();
               return (
                   model.supportedGenerationMethods.includes('generateContent') &&
                   (name.includes('vision') || name.includes('pro') || name.includes('flash') || name.includes('1.5'))
               );
           });

           res.json({
               success: true,
               totalModels: models.length,
               visionModels: visionModels.length,
               models: {
                   all: models,
                   vision: visionModels
               },
               timestamp: Date.now()
           });
       } else {
           throw new Error('Invalid response format from Gemini API');
       }
   } catch (error) {
       logger.error('Error fetching Gemini models:', error);
       res.status(500).json({
           success: false,
           error: 'Failed to fetch Gemini models',
           details: error.message
       });
   }
});

app.post('/api/gemini/models/fetch', express.json(), async (req, res) => {
   try {
       const { apiKey } = req.body;

       if (!apiKey) {
           return res.status(400).json({
               success: false,
               error: 'apiKey is required to fetch models.'
           });
       }

       const response = await axios.get(
           'https://generativelanguage.googleapis.com/v1/models',
           {
               params: {
                   key: apiKey
               },
               timeout: 15000
           }
       );

       if (response.data && response.data.models) {
           const models = response.data.models.map(model => {
               const name = model.name.replace('models/', '');
               return {
                   name: name,
                   displayName: model.displayName || name,
                   description: model.description || '',
                   version: model.version || 'latest',
                   inputTokenLimit: model.inputTokenLimit || 0,
                   outputTokenLimit: model.outputTokenLimit || 0,
                   supportedGenerationMethods: model.supportedGenerationMethods || []
               };
           });

           const visionModels = models.filter(model => {
               const name = model.name.toLowerCase();
               return (
                   model.supportedGenerationMethods.includes('generateContent') &&
                   (name.includes('vision') || name.includes('pro') || name.includes('flash') || name.includes('1.5'))
               );
           });

           res.json({
               success: true,
               totalModels: models.length,
               visionModels: visionModels.length,
               models: {
                   all: models,
                   vision: visionModels
               },
               timestamp: Date.now()
           });
       } else {
           throw new Error('Invalid response format from Gemini API');
       }
   } catch (error) {
       logger.error('Error fetching Gemini models with provided key:', error);
       res.status(500).json({
           success: false,
           error: 'Failed to fetch Gemini models. The API key may be invalid or lack permissions.',
           details: error.message
       });
   }
});

app.post('/api/gemini/models/test', express.json(), async (req, res) => {
   try {
       const { modelName } = req.body;
       
       if (!modelName) {
           return res.status(400).json({
               success: false,
               error: 'Model name is required'
           });
       }

       const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
       const model = genAI.getGenerativeModel({ model: modelName });

       const testPrompt = "Hello, this is a connection test. Please respond with 'Connection successful'.";
       const result = await model.generateContent(testPrompt);
       const response = result.response.text();

       res.json({
           success: true,
           modelName: modelName,
           testPrompt: testPrompt,
           response: response,
           responseLength: response.length,
           connectionStatus: 'healthy',
           timestamp: Date.now()
       });
   } catch (error) {
       logger.error('Error testing Gemini model:', error);
       res.status(500).json({
           success: false,
           modelName: req.body.modelName || 'unknown',
           error: error.message,
           connectionStatus: 'failed',
           timestamp: Date.now()
       });
   }
});

app.get('/api/config/unified-formatter', async (req, res) => {
    try {
        const config = aiAssistant.getUnifiedFormatterConfig();
        res.json({
            success: true,
            config,
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Error getting unified formatter config:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/config/unified-formatter', async (req, res) => {
    try {
        const { config, language } = req.body;
        
        if (!config) {
            return res.status(400).json({
                success: false,
                error: 'Configuration is required'
            });
        }

        const success = await aiAssistant.updateUnifiedFormatterConfig(config, language);
        
        res.json({
            success,
            message: success ? 'Unified formatter configuration updated successfully' : 'Failed to update configuration',
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Error updating unified formatter config:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/users/:userId/language', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!aiAssistant.configManager) {
            return res.status(500).json({
                success: false,
                error: 'ConfigManager not available'
            });
        }
        
        const languageData = aiAssistant.configManager.getUserLanguageLockStatus(userId);
        const currentLanguage = aiAssistant.configManager.getUserLanguage(userId);
        
        res.json({
            success: true,
            userId: userId,
            currentLanguage: currentLanguage,
            ...languageData,
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Error getting user language data:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/users/:userId/language/reset', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!aiAssistant.configManager) {
            return res.status(500).json({
                success: false,
                error: 'ConfigManager not available'
            });
        }
        
        const success = await aiAssistant.configManager.resetUserConversation(userId);
        
        res.json({
            success,
            message: success ? 'User language reset successfully' : 'Failed to reset user language',
            userId: userId,
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Error resetting user language:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/language/statistics', async (req, res) => {
    try {
        if (!aiAssistant.configManager) {
            return res.status(500).json({
                success: false,
                error: 'ConfigManager not available'
            });
        }
        
        const stats = await aiAssistant.configManager.getUserLanguageStatistics();
        
        res.json({
            success: true,
            statistics: stats,
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Error getting language statistics:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/language/load-all', async (req, res) => {
    try {
        if (!aiAssistant.configManager) {
            return res.status(500).json({
                success: false,
                error: 'ConfigManager not available'
            });
        }
        
        const result = await aiAssistant.configManager.loadAllUserLanguageData();
        
        res.json({
            success: true,
            result: result,
            message: `Loaded ${result.loaded} user language files`,
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Error loading all user language data:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/language/test-detection', async (req, res) => {
    try {
        const { text, userId } = req.body;
        
        if (!text) {
            return res.status(400).json({
                success: false,
                error: 'Text is required'
            });
        }
        
        if (!aiAssistant.configManager) {
            return res.status(500).json({
                success: false,
                error: 'ConfigManager not available'
            });
        }
        
        const detectedLanguage = await aiAssistant.configManager.detectLanguage(text, userId);
        const confidence = aiAssistant.configManager.calculateLanguageConfidence(text, detectedLanguage);
        
        res.json({
            success: true,
            input: {
                text: text,
                textLength: text.length,
                wordCount: text.split(/\s+/).length,
                userId: userId
            },
            result: {
                detectedLanguage: detectedLanguage,
                confidence: confidence,
                supportedLanguages: aiAssistant.configManager.supportedLanguages,
                defaultLanguage: aiAssistant.configManager.defaultLanguage
            },
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Error testing language detection:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/language-detection/users', async (req, res) => {
    try {
        if (!aiAssistant.configManager) {
            return res.status(500).json({
                success: false,
                error: 'ConfigManager not available'
            });
        }

        const stats = await aiAssistant.configManager.getUserLanguageStatistics();
        const users = [];
        const userLanguagesPath = path.join(DATA_DIR, 'user_languages');

        try {
            const userFiles = await fs.readdir(userLanguagesPath);
            const jsonFiles = userFiles.filter(file => file.endsWith('.json'));

            for (const file of jsonFiles) {
                try {
                    const filePath = path.join(userLanguagesPath, file);
                    const fileContent = await fs.readFile(filePath, 'utf8');
                    const userData = JSON.parse(fileContent);

                    let averageConfidence = 0.9;
                    if (userData.detectionHistory && userData.detectionHistory.length > 0) {
                        const entriesWithConfidence = userData.detectionHistory.filter(d =>
                            d.confidence !== undefined && d.confidence !== null && !isNaN(d.confidence)
                        );

                        if (entriesWithConfidence.length > 0) {
                            const totalConfidence = entriesWithConfidence.reduce((sum, d) => sum + d.confidence, 0);
                            averageConfidence = totalConfidence / entriesWithConfidence.length;
                        } else {
                            const currentLang = userData.language ? userData.language.toLowerCase() : 'th';
                            const sameLanguageDetections = userData.detectionHistory.filter(d =>
                                d.language && d.language.toLowerCase() === currentLang
                            ).length;
                            averageConfidence = Math.min(0.95, sameLanguageDetections / userData.detectionHistory.length);
                        }
                    }

                    let lastDetection = userData.lastUpdateTime || userData.createdAt || Date.now();
                    if (userData.detectionHistory && userData.detectionHistory.length > 0) {
                        lastDetection = userData.detectionHistory[userData.detectionHistory.length - 1].timestamp;
                    }

                    users.push({
                        userId: userData.userId,
                        detectedLanguage: userData.language ? userData.language.toLowerCase() : 'th',
                        confidence: averageConfidence,
                        messageCount: userData.detectionHistory ? userData.detectionHistory.length : 0,
                        lastDetection: new Date(lastDetection).toISOString(),
                        isLocked: userData.isLocked || false,
                        manualOverride: userData.manualOverride || null,
                        conversationStarted: userData.conversationStarted || false,
                        firstDetected: userData.firstDetected ? userData.firstDetected.toLowerCase() : null,
                        detectionHistoryCount: userData.detectionHistory ? userData.detectionHistory.length : 0,
                        createdAt: userData.createdAt ? new Date(userData.createdAt).toISOString() : null
                    });
                } catch (fileError) {
                    logger.error(`Error reading user file ${file}:`, fileError);
                }
            }

            logger.info(`Loaded ${users.length} users from ${jsonFiles.length} user language files`);
        } catch (dirError) {
            logger.error('Error reading user_languages directory:', dirError);
        }

        res.json({
            success: true,
            users: users,
            totalUsers: users.length,
            statistics: stats,
            dataSource: 'file_system',
            filesFound: users.length,
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Error getting users language data:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.put('/api/language-detection/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { language, isManual } = req.body;
        const fs = require('fs').promises;
        const path = require('path');

        const userLanguageFile = path.join(DATA_DIR, 'user_languages', `${userId}.json`);

        try {
            let userData = {};
            try {
                const fileContent = await fs.readFile(userLanguageFile, 'utf8');
                userData = JSON.parse(fileContent);
            } catch (readError) {
                userData = {
                    userId: userId,
                    language: language,
                    detectionHistory: [],
                    isLocked: false
                };
            }

            userData.language = language;
            userData.manualOverride = isManual ? language : null;
            userData.lastUpdate = new Date().toISOString();

            if (!userData.detectionHistory) {
                userData.detectionHistory = [];
            }

            userData.detectionHistory.push({
                language: language,
                confidence: isManual ? 1.0 : (userData.detectionHistory.length > 0 ? userData.detectionHistory[userData.detectionHistory.length - 1].confidence : 0.9),
                timestamp: new Date().toISOString(),
                isManual: isManual || false
            });

            await fs.writeFile(userLanguageFile, JSON.stringify(userData, null, 2));

            res.json({
                success: true,
                message: 'User language updated successfully',
                userId: userId,
                language: language,
                isManual: isManual,
                timestamp: Date.now()
            });
        } catch (fileError) {
            logger.error('Error writing user language file:', fileError);
            res.status(500).json({
                success: false,
                error: 'Failed to update user language file'
            });
        }
    } catch (error) {
        logger.error('Error updating user language:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/language-detection/users/:userId/reset', async (req, res) => {
    try {
        const { userId } = req.params;

        if (!aiAssistant.configManager) {
            return res.status(500).json({
                success: false,
                error: 'ConfigManager not available'
            });
        }

        const success = await aiAssistant.configManager.resetUserConversation(userId);

        res.json({
            success,
            message: success ? 'User language detection reset successfully' : 'Failed to reset user language detection',
            userId: userId,
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Error resetting user language detection:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/configuration/language-detection', async (req, res) => {
    try {
        if (!aiAssistant.configManager) {
            return res.status(500).json({
                success: false,
                error: 'ConfigManager not available'
            });
        }

        const config = aiAssistant.configManager.getLanguageDetectionConfig ?
            aiAssistant.configManager.getLanguageDetectionConfig() :
            {
                enabled: true,
                minTextLength: 10,
                englishConfidenceThreshold: 0.7,
                minEnglishWordsRatio: 0.3,
                minEnglishWords: 2,
                cacheTimeout: 300000,
                lockAfterFirstDetection: false,
                supportedLanguages: ['th', 'en', 'zh', 'ja', 'ko'],
                defaultLanguage: 'th'
            };

        res.json({
            success: true,
            config: config,
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Error getting language detection configuration:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            config: {
                enabled: true,
                minTextLength: 10,
                englishConfidenceThreshold: 0.7,
                minEnglishWordsRatio: 0.3,
                minEnglishWords: 2,
                cacheTimeout: 300000,
                lockAfterFirstDetection: false,
                supportedLanguages: ['th', 'en', 'zh', 'ja', 'ko'],
                defaultLanguage: 'th'
            }
        });
    }
});

app.post('/api/config/unified-formatter/reset', async (req, res) => {
    try {
        const { language } = req.body;
        
        const defaultConfig = {
            enabled: true,
            sections: {
                knowledgeContext: { enabled: true, order: 1 },
                productContext: { enabled: true, order: 2 },
                contextIntegration: { enabled: true }
            }
        };

        const success = await aiAssistant.updateUnifiedFormatterConfig(defaultConfig, language);
        
        res.json({
            success,
            message: success ? 'Unified formatter configuration reset to defaults' : 'Failed to reset configuration',
            config: defaultConfig,
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Error resetting unified formatter config:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/config/knowledge', async (req, res) => {
    try {
        const config = aiAssistant.getKnowledgeConfig();
        res.json({
            success: true,
            config,
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Error getting knowledge config:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/products/sync-single', async (req, res) => {
    try {
        const { url, syncOptions } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL is required'
            });
        }
        
        logger.info(`Single sync request: ${url}`);
        req.body = { url, syncOptions };
        return productRoutes.handle(req, res);
        
    } catch (error) {
        logger.error('Error in single sync endpoint:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/products/sync-status', async (req, res) => {
    try {
        const syncStatus = await productScraper.getScrapingStatus();
        
        res.json({
            success: true,
            sync_status: {
                ...syncStatus,
                mode: 'sync_only',
                note: 'This tracks syncing to local storage only'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/products/upload-status', async (req, res) => {
    try {
        const uploadStatus = await productManager.getUploadStatus?.() || {
            isActive: false,
            message: 'No active upload process'
        };
        
        res.json({
            success: true,
            upload_status: {
                ...uploadStatus,
                mode: 'upload_only',
                note: 'This tracks uploading from local storage to production'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/schedules/job-types', (req, res) => {
    try {
        const jobTypes = {
            'sync-only': {
                name: 'ซิงค์เฉพาะ',
                description: 'ซิงค์ข้อมูลสินค้าเก็บไว้ในเครื่อง ไม่อัพโหลดไปยังเว็บไซต์',
                icon: '🔄',
                color: 'blue',
                requiresSyncOptions: true,
                canSchedule: true,
                actions: ['ดาวน์โหลดข้อมูลจากเว็บไซต์', 'บันทึกลงในเครื่อง', 'ตรวจสอบ Duplicates'],
                estimatedTime: 'ขึ้นอยู่กับ Sync Options และจำนวน URLs',
                bestFor: 'การทดสอบ, การอัพเดตข้อมูลก่อนอัพโหลด'
            },
            'upload-only': {
                name: 'อัพโหลดเฉพาะ',
                description: 'อัพโหลดข้อมูลสินค้าที่ซิงค์แล้วไปยังเว็บไซต์ ไม่ซิงค์ข้อมูลใหม่',
                icon: '⬆️',
                color: 'green',
                requiresSyncOptions: false,
                canSchedule: true,
                actions: ['อ่านไฟล์จากเครื่อง', 'อัพโหลดไปยัง Production', 'ตรวจสอบความสำเร็จ'],
                estimatedTime: 'ขึ้นอยู่กับจำนวนไฟล์และขนาด',
                bestFor: 'การอัพโหลดหลังจากซิงค์เสร็จแล้ว'
            },
            'sync-all': {
                name: 'ซิงค์ทั้งหมด',
                description: 'ซิงค์ข้อมูลสินค้าทั้งหมดจาก URLs ที่มี (ไม่รวมการอัพโหลด)',
                icon: '🔄📦',
                color: 'purple',
                requiresSyncOptions: true,
                canSchedule: true,
                actions: ['ค้นหา URLs ทั้งหมด', 'ซิงค์ทีละ URL', 'บันทึกลงในเครื่อง'],
                estimatedTime: 'นาน (ขึ้นอยู่กับจำนวนสินค้าและ Sync Options)',
                bestFor: 'การอัพเดตข้อมูลสินค้าครั้งใหญ่'
            },
            'upload-all': {
                name: 'อัพโหลดทั้งหมด',
                description: 'อัพโหลดไฟล์สินค้าทั้งหมดที่มีในเครื่องไปยังเว็บไซต์',
                icon: '⬆️📦',
                color: 'orange',
                requiresSyncOptions: false,
                canSchedule: true,
                actions: ['สแกนไฟล์ทั้งหมด', 'อัพโหลดทีละไฟล์', 'รายงานผล'],
                estimatedTime: 'ขึ้นอยู่กับจำนวนไฟล์ทั้งหมด',
                bestFor: 'การอัพโหลดสินค้าทั้งหมดหลังจากซิงค์เสร็จ'
            }
        };
        
        const workflow = {
            recommended: [
                {
                    step: 1,
                    action: 'sync-only หรือ sync-all',
                    description: 'ซิงค์ข้อมูลเก็บไว้ในเครื่องก่อน',
                    icon: '🔄'
                },
                {
                    step: 2,
                    action: 'ตรวจสอบผลลัพธ์',
                    description: 'ดูว่าข้อมูลถูกต้องหรือไม่',
                    icon: '👀'
                },
                {
                    step: 3,
                    action: 'upload-only หรือ upload-all',
                    description: 'อัพโหลดไปยัง Production',
                    icon: '⬆️'
                }
            ],
            alternatives: [
                {
                    name: 'การทดสอบ',
                    steps: ['sync-only (URLs น้อยๆ)', 'ตรวจสอบผล', 'sync-only (ทั้งหมด)', 'upload-all']
                },
                {
                    name: 'การอัพเดตประจำ',
                    steps: ['sync-all (Quick Sync)', 'upload-all']
                },
                {
                    name: 'การอัพเดตครั้งใหญ่',
                    steps: ['sync-all (Full Sync)', 'ตรวจสอบผล', 'upload-all']
                }
            ]
        };
        
        res.json({
            success: true,
            job_types: jobTypes,
            workflow: workflow,
            total_types: Object.keys(jobTypes).length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/config/knowledge', async (req, res) => {
    try {
        const { config, language } = req.body;
        
        if (!config) {
            return res.status(400).json({
                success: false,
                error: 'Configuration is required'
            });
        }

        const success = await aiAssistant.updateKnowledgeConfig(config, language);
        
        res.json({
            success,
            message: success ? 'Knowledge configuration updated successfully' : 'Failed to update configuration',
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Error updating knowledge config:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/config/knowledge/reset', async (req, res) => {
    try {
        const { language } = req.body;
        
        const defaultConfig = {
            enabled: true,
            searchSettings: {
                topK: 3,
                scoreThreshold: 0.75,
                maxContentLength: 200000
            },
            formatting: {
                maxPreviewLength: 300,
                includeSource: true,
                includeConfidence: true,
                groupByCategory: true
            },
            integration: {
                withProducts: true,
                enhanceProductData: true,
                crossReference: true
            }
        };

        const success = await aiAssistant.updateKnowledgeConfig(defaultConfig, language);
        
        res.json({
            success,
            message: success ? 'Knowledge configuration reset to defaults' : 'Failed to reset configuration',
            config: defaultConfig,
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Error resetting knowledge config:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/ai/chat-with-knowledge', async (req, res) => {
    try {
        const { query, userId, useKnowledge = true, knowledgeOptions = {}, productOptions = {} } = req.body;

        if (!query || !userId) {
            return res.status(400).json({
                success: false,
                error: 'Query and userId are required'
            });
        }

        const result = await aiAssistant.chatWithKnowledge(query, userId, {
            useKnowledge,
            knowledgeOptions,
            productOptions
        });

        res.json(result);

    } catch (error) {
        logger.error('Error in AI chat with knowledge:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/ai/search-knowledge', async (req, res) => {
    try {
        const { query, options = {} } = req.body;

        if (!query) {
            return res.status(400).json({
                success: false,
                error: 'Query is required'
            });
        }

        const searchResult = await aiAssistant.searchKnowledge(query, options);
        
        if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
            const formattedResults = knowledgeFormatter.formatKnowledgeList(searchResult.results);
            searchResult.formatted_results = formattedResults;
        }

        res.json({
            ...searchResult,
            timestamp: Date.now()
        });

    } catch (error) {
        logger.error('Error searching knowledge:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/ai/generate-knowledge-context', async (req, res) => {
    try {
        const { query, options = {} } = req.body;

        if (!query) {
            return res.status(400).json({
                success: false,
                error: 'Query is required'
            });
        }

        const contextResult = await aiAssistant.generateKnowledgeContext(query, options);

        res.json({
            ...contextResult,
            timestamp: Date.now()
        });

    } catch (error) {
        logger.error('Error generating knowledge context:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/debug/connections', (req, res) => {
  try {
      const debug = {
          lineHandler: {
              exists: !!lineHandler,
              productImageSender: !!lineHandler?.productImageSender,
              imageHandler: !!lineHandler?.imageHandler,
              webSocketManager: !!lineHandler?.webSocketManager,
              keywordDetector: !!lineHandler?.keywordDetector
          },
          productImageSender: {
              exists: !!productImageSender,
              config: productImageSender ? productImageSender.getConfig() : null,
              lineHandlerConnected: !!productImageSender?.lineHandler
          },
          imageHandler: {
              exists: !!imageHandler,
              initialized: imageHandler?.initialized || false,
              currentModel: imageHandler?.currentModel || null,
              availableModels: imageHandler?.availableModels?.length || 0
          },
          knowledgeRAG: {
              exists: !!knowledgeRAG,
              initialized: knowledgeRAG?.initialized || false
          },
          knowledgeFormatter: {
              exists: !!knowledgeFormatter,
              config: knowledgeFormatter ? Object.keys(knowledgeFormatter.getConfig()) : null
          },
          aiAssistant: {
              exists: !!aiAssistant,
              initialized: aiAssistant?.initialized || false,
              hasKnowledgeRAG: !!aiAssistant?.knowledgeRAG,
              hasUnifiedFormatter: !!aiAssistant?.unifiedContextFormatter,
              knowledgeConfig: aiAssistant ? aiAssistant.getKnowledgeConfig() : null,
              unifiedFormatterConfig: aiAssistant ? aiAssistant.getUnifiedFormatterConfig() : null
          },
          services: {
              chatHistory: !!chatHistory,
              productManager: !!productManager
          }
      };

      res.json({
          success: true,
          debug,
          timestamp: Date.now()
      });
  } catch (error) {
      logger.error('Error in debug connections:', error);
      res.status(500).json({
          success: false,
          error: error.message
      });
  }
});

app.post('/api/debug/test-url-detection', async (req, res) => {
  try {
      const { message } = req.body;
      
      if (!message) {
          return res.status(400).json({
              success: false,
              error: 'message is required'
          });
      }

      let result = null;
      
      if (productImageSender && typeof productImageSender.testUrlDetection === 'function') {
          result = await productImageSender.testUrlDetection(message);
      } else {
          result = {
              error: 'ProductImageSender or testUrlDetection method not available'
          };
      }

      res.json({
          success: true,
          result: result
      });

  } catch (error) {
      logger.error('Error in URL detection test:', error);
      res.status(500).json({
          success: false,
          error: error.message
      });
  }
});

app.post('/api/debug/test-knowledge', async (req, res) => {
    try {
        const { query } = req.body;
        
        if (!query) {
            return res.status(400).json({
                success: false,
                error: 'query is required'
            });
        }

        const healthCheck = await knowledgeRAG.healthCheck();
        const searchResult = await knowledgeRAG.searchKnowledge(query, { topK: 3 });
        
        let formattedResults = '';
        if (searchResult.success && searchResult.results.length > 0) {
            formattedResults = knowledgeFormatter.formatKnowledgeList(searchResult.results);
        }

        res.json({
            success: true,
            healthCheck,
            searchResult,
            formattedResults,
            timestamp: Date.now()
        });

    } catch (error) {
        logger.error('Error in knowledge test:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/debug/test-unified-context', async (req, res) => {
    try {
        const { query, includeProducts = true, includeKnowledge = true, customConfig } = req.body;
        
        if (!query) {
            return res.status(400).json({
                success: false,
                error: 'query is required'
            });
        }

        let products = [];
        let knowledgeResults = [];

        if (includeProducts) {
            products = await aiAssistant.getProducts(query, 'test-user');
        }

        if (includeKnowledge && knowledgeRAG) {
            const searchResult = await knowledgeRAG.searchKnowledge(query, { topK: 3 });
            if (searchResult.success) {
                knowledgeResults = searchResult.results;
            }
        }

        const testResult = await aiAssistant.testUnifiedContext(query, products, knowledgeResults);

        let directFormatterTest = null;
        if (aiAssistant.unifiedContextFormatter) {
            try {
                directFormatterTest = await aiAssistant.unifiedContextFormatter.formatUnifiedContext({
                    query,
                    products,
                    knowledgeResults,
                    language: aiAssistant.configManager.currentLanguage,
                    customConfig
                });
            } catch (formatterError) {
                directFormatterTest = { error: formatterError.message };
            }
        }

        res.json({
            success: true,
            testResult,
            directFormatterTest: directFormatterTest ? {
                success: !directFormatterTest.error,
                result: directFormatterTest.error || directFormatterTest,
                length: directFormatterTest.error ? 0 : directFormatterTest.length
            } : null,
            input: {
                query,
                productsFound: products.length,
                knowledgeFound: knowledgeResults.length,
                customConfigProvided: !!customConfig
            },
            config: {
                unifiedFormatterEnabled: aiAssistant.configManager.unifiedFormatterConfig.enabled,
                knowledgeEnabled: aiAssistant.configManager.knowledgeConfig.enabled,
                currentLanguage: aiAssistant.configManager.currentLanguage
            },
            timestamp: Date.now()
        });

    } catch (error) {
        logger.error('Error testing unified context:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/debug/test-ai-chat-with-knowledge', async (req, res) => {
    try {
        const { query, useKnowledge = true, knowledgeOptions = {}, testMode = true } = req.body;
        
        if (!query) {
            return res.status(400).json({
                success: false,
                error: 'query is required'
            });
        }

        const userId = 'test-user-' + Date.now();
        
        let knowledgeSearchResult = null;
        if (useKnowledge && knowledgeRAG) {
            knowledgeSearchResult = await knowledgeRAG.searchKnowledge(query, {
                topK: knowledgeOptions.topK || 3,
                scoreThreshold: knowledgeOptions.scoreThreshold || 0.75
            });
        }

        const chatResult = await aiAssistant.chatWithKnowledge(query, userId, {
            useKnowledge,
            knowledgeOptions,
            productOptions: { products: [] }
        });

        res.json({
            success: true,
            knowledgeSearchResult,
            chatResult,
            metadata: {
                userId,
                testMode,
                knowledgeEnabled: useKnowledge,
                knowledgeOptions,
                systemConfig: {
                    knowledgeRAGAvailable: !!knowledgeRAG,
                    knowledgeRAGInitialized: knowledgeRAG?.initialized || false,
                    unifiedFormatterEnabled: aiAssistant.configManager.unifiedFormatterConfig.enabled
                }
            },
            timestamp: Date.now()
        });

    } catch (error) {
        logger.error('Error testing AI chat with knowledge:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/debug/test-language-config', async (req, res) => {
    try {
        const language = req.query.language || 'TH';
        
        const config = {
            supportedLanguages: aiAssistant.getSupportedLanguages(),
            currentLanguage: aiAssistant.configManager.currentLanguage,
            languageLockStatus: aiAssistant.getLanguageLockStatus(),
            templateConfig: aiAssistant.getTemplateConfig(language),
            unifiedFormatterConfig: aiAssistant.getUnifiedFormatterConfig(),
            knowledgeConfig: aiAssistant.getKnowledgeConfig(),
            languageDetectionConfig: aiAssistant.getLanguageDetectionConfig()
        };

        res.json({
            success: true,
            config,
            requestedLanguage: language,
            timestamp: Date.now()
        });

    } catch (error) {
        logger.error('Error testing language config:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/product-images/images/:filename', async (req, res) => {
 try {
    const { filename } = req.params;
     const tempDir = TEMP_IMAGES_DIR;
     const filePath = path.join(tempDir, filename);
     
     const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
     
     if (!fileExists) {
         return res.status(404).json({
             success: false,
             error: 'Image not found'
         });
     }
     
     const imageBuffer = await fs.readFile(filePath);
     const ext = path.extname(filename).toLowerCase();
     let contentType = 'application/octet-stream';
     
     switch (ext) {
         case '.png': contentType = 'image/png'; break;
         case '.jpg':
         case '.jpeg': contentType = 'image/jpeg'; break;
         case '.gif': contentType = 'image/gif'; break;
         case '.webp': contentType = 'image/webp'; break;
     }
     
     res.setHeader('Content-Type', contentType);
     res.setHeader('Content-Length', imageBuffer.length);
     res.setHeader('Cache-Control', 'public, max-age=86400');
     res.send(imageBuffer);
     
 } catch (error) {
     logger.error('Error serving image:', error);
     res.status(500).json({
         success: false,
         error: 'Internal server error'
     });
 }
});

const crypto = require('crypto');

app.post('/webhook/line/:oaId', async (req, res) => {
    const { oaId } = req.params;
    const signature = req.headers['x-line-signature'];
    const body = req.body;

    if (!signature) {
        return res.status(401).json({ error: 'Signature not found' });
    }

    try {
        const oaConfig = await app.locals.prisma.lineOaConfig.findUnique({
            where: { id: oaId },
        });

        if (!oaConfig) {
            logger.error(`Webhook received for unknown OA ID: ${oaId}`);
            return res.status(404).json({ error: 'LINE OA configuration not found' });
        }

        const channelSecret = oaConfig.channelSecret;
        const hash = crypto.createHmac('sha256', channelSecret).update(body).digest('base64');

        if (hash !== signature) {
            logger.error(`Invalid webhook signature for OA ID: ${oaId}`);
            return res.status(403).json({ error: 'Invalid signature' });
        }

        const events = JSON.parse(body.toString()).events || [];

        await Promise.all(events.map(async (event) => {
            event.channelAccessToken = oaConfig.channelAccessToken;

            if (event.type === 'message') {
                await lineHandler.handleMessage(event);
            } else if (event.type === 'postback') {
                await keywordDetector.handlePostback({
                    data: event.postback.data,
                    userId: event.source.userId,
                    channelAccessToken: oaConfig.channelAccessToken
                });
            }
        }));

        res.status(200).end();
    } catch (error) {
        logger.error('Webhook processing error:', { 
            errorMessage: error.message,
            stack: error.stack,
            oaId: oaId
        });
        res.status(500).json({ error: 'Internal server error' });
    }
});

io.on('connection', (socket) => {
 logger.info('WebSocket client connected', { socketId: socket.id });
 
 try {
     webSocketManager.handleSocketConnection(socket);
 } catch (error) {
     logger.error('Error in WebSocket Manager:', error);
 }
 
 socket.on('authenticate', (data) => {
     try {
         const { token } = data;
         if (!token) {
             socket.emit('auth_error', { message: 'Token required' });
             return;
         }
         
         const decoded = authManager.verifyToken(token);
         if (!decoded) {
             socket.emit('auth_error', { message: 'Invalid token' });
             return;
         }
         
         socket.authenticated = true;
         socket.user = decoded;
         
         socket.emit('authenticated', {
             status: true,
             user: {
                 id: decoded.id,
                 username: decoded.username,
                 role: decoded.role
             }
         });
         
     } catch (error) {
         logger.error('Socket authentication error:', error);
         socket.emit('auth_error', { message: 'Authentication failed' });
     }
 });

 socket.on('get_image_models', async () => {
     try {
         const models = await imageHandler.getAvailableModels();
         const currentModel = imageHandler.getCurrentModel();
         
         socket.emit('image_models_response', {
             models,
             currentModel: currentModel.currentModel,
             modelInfo: currentModel.modelInfo,
             timestamp: Date.now()
         });
     } catch (error) {
         socket.emit('error', { message: 'Error getting image models' });
     }
 });

 socket.on('set_image_model', async ({ modelName }) => {
     try {
         const result = await imageHandler.setModel(modelName);
         
         if (result.success) {
             socket.emit('image_model_changed', {
                 currentModel: result.currentModel,
                 modelInfo: result.modelInfo,
                 timestamp: Date.now()
             });
         } else {
             socket.emit('error', { 
                 message: `Failed to set model: ${result.error}`
             });
         }
     } catch (error) {
         socket.emit('error', { message: 'Error setting image model' });
     }
 });

 socket.on('search_knowledge', async (data) => {
     try {
         const { query, options = {} } = data;
         const result = await knowledgeRAG.searchKnowledge(query, options);
         
         if (result.success && result.results.length > 0) {
             const formattedResults = knowledgeFormatter.formatKnowledgeList(result.results);
             result.formatted_results = formattedResults;
         }
         
         socket.emit('knowledge_search_response', {
             ...result,
             timestamp: Date.now()
         });
     } catch (error) {
         socket.emit('error', { message: 'Error searching knowledge' });
     }
 });

 socket.on('get_knowledge_stats', async () => {
     try {
         const stats = await knowledgeRAG.getStatistics();
         const categories = await knowledgeRAG.getCategories();
         
         socket.emit('knowledge_stats_response', {
             stats,
             categories,
             timestamp: Date.now()
         });
     } catch (error) {
         socket.emit('error', { message: 'Error getting knowledge statistics' });
     }
 });

 socket.on('test_unified_formatter', async (data) => {
     try {
         const { query, products = [], knowledgeResults = [], customConfig } = data;
         
         const testResult = await aiAssistant.testUnifiedContext(query, products, knowledgeResults);
         
         socket.emit('unified_formatter_test_response', {
             ...testResult,
             customConfig,
             timestamp: Date.now()
         });
     } catch (error) {
         socket.emit('error', { message: 'Error testing unified formatter' });
     }
 });

 socket.on('get_unified_formatter_config', async () => {
     try {
         const config = aiAssistant.getUnifiedFormatterConfig();
         
         socket.emit('unified_formatter_config_response', {
             success: true,
             config,
             timestamp: Date.now()
         });
     } catch (error) {
         socket.emit('error', { message: 'Error getting unified formatter config' });
     }
 });

 socket.on('update_unified_formatter_config', async (data) => {
     try {
         const { config, language } = data;
         const success = await aiAssistant.updateUnifiedFormatterConfig(config, language);
         
         socket.emit('unified_formatter_config_updated', {
             success,
             message: success ? 'Configuration updated' : 'Failed to update configuration',
             timestamp: Date.now()
         });
     } catch (error) {
         socket.emit('error', { message: 'Error updating unified formatter config' });
     }
 });

 socket.on('get_knowledge_config', async () => {
     try {
         const config = aiAssistant.getKnowledgeConfig();
         
         socket.emit('knowledge_config_response', {
             success: true,
             config,
             timestamp: Date.now()
         });
     } catch (error) {
         socket.emit('error', { message: 'Error getting knowledge config' });
     }
 });

 socket.on('update_knowledge_config', async (data) => {
     try {
         const { config, language } = data;
         const success = await aiAssistant.updateKnowledgeConfig(config, language);
         
         socket.emit('knowledge_config_updated', {
             success,
             message: success ? 'Configuration updated' : 'Failed to update configuration',
             timestamp: Date.now()
         });
     } catch (error) {
         socket.emit('error', { message: 'Error updating knowledge config' });
     }
 });

 socket.on('chat_with_knowledge', async (data) => {
     try {
         const { query, userId, useKnowledge = true, knowledgeOptions = {}, productOptions = {} } = data;
         
         if (!query || !userId) {
             socket.emit('error', { message: 'Query and userId are required' });
             return;
         }

         const result = await aiAssistant.chatWithKnowledge(query, userId, {
             useKnowledge,
             knowledgeOptions,
             productOptions
         });
         
         socket.emit('chat_with_knowledge_response', {
             ...result,
             timestamp: Date.now()
         });
     } catch (error) {
         socket.emit('error', { message: 'Error in chat with knowledge' });
     }
 });

 socket.on('get_system_config', async (data) => {
     try {
         const { section = 'all' } = data || {};
         const response = await axios.get(`http://localhost:${process.env.PORT || 3000}/api/configuration/${section}`);
         
         socket.emit('system_config_response', {
             ...response.data,
             timestamp: Date.now()
         });
     } catch (error) {
         socket.emit('error', { message: 'Error getting system configuration' });
     }
 });

 socket.on('update_system_config', async (data) => {
     try {
         const { section, config } = data;
         const response = await axios.post(
             `http://localhost:${process.env.PORT || 3000}/api/configuration/${section}`,
             config,
             { headers: { 'Content-Type': 'application/json' } }
         );
         
         socket.emit('system_config_updated', {
             ...response.data,
             timestamp: Date.now()
         });
     } catch (error) {
         socket.emit('error', { message: 'Error updating system configuration' });
     }
 });
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason, promise });
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', error);
    setTimeout(() => process.exit(1), 1000);
});

app.use((req, res, next) => {
    // Allow health endpoint to be served and not redirected
    if (req.path === '/health') {
        return next();
    }
    if (req.path.startsWith('/api/') || req.path === '/webhook') {
        return res.status(404).json({
            success: false,
            error: 'API endpoint not found',
            path: req.path,
            method: req.method
        });
    }
    res.redirect('/');
});

const staticRoutes = {
    main: '/',
    login: '/login',
    userManagement: '/user-management',
    productImageManager: '/product-image-manager',
    keywordManager: '/keyword-manager',
    imageManager: '/image-manager',
    knowledgeManager: '/knowledge-manager',
    unifiedFormatterManager: '/unified-formatter-manager',
    configurationManager: '/configuration-manager'
};

Object.entries(staticRoutes).forEach(([key, route]) => {
    let filename = 'index.html';

    if (key === 'productImageManager') {
        filename = 'product-image-manager.html';
    } else if (key === 'keywordManager') {
        filename = 'keyword-manager.html';
    } else if (key === 'imageManager') {
        filename = 'image-manager.html';
    } else if (key === 'knowledgeManager') {
        filename = 'knowledge-manager.html';
    } else if (key === 'unifiedFormatterManager') {
        filename = 'unified-formatter-manager.html';
    } else if (key === 'configurationManager') {
        filename = 'configuration-manager.html';
    }

    app.get(route, (req, res) => {
        res.sendFile(path.join(STATIC_DIR, filename));
    });
});

app.get('/health', async (req, res) => {
    try {
        const healthChecks = {
            webSocket: webSocketManager ? 'running' : 'stopped',
            lineHandler: lineHandler ? 'running' : 'stopped',
            productImageSender: productImageSender ? 'running' : 'stopped',
            keywordDetector: keywordDetector ? 'running' : 'stopped',
            imageHandler: imageHandler ? 'running' : 'stopped',
            knowledgeRAG: knowledgeRAG ? (knowledgeRAG.initialized ? 'initialized' : 'not_initialized') : 'unavailable',
            knowledgeFormatter: knowledgeFormatter ? 'available' : 'unavailable',
            aiAssistant: aiAssistant ? (aiAssistant.initialized ? 'initialized' : 'not_initialized') : 'unavailable'
        };

        let aiAssistantHealth = null;
        if (aiAssistant && aiAssistant.initialized) {
            try {
                aiAssistantHealth = await aiAssistant.healthCheck();
            } catch (error) {
                logger.warn('AI Assistant health check failed:', error);
            }
        }

        let knowledgeHealth = null;
        if (knowledgeRAG && knowledgeRAG.initialized) {
            try {
                knowledgeHealth = await knowledgeRAG.healthCheck();
            } catch (error) {
                logger.warn('Knowledge health check failed:', error);
            }
        }

        let languageStatus = null;
        if (aiAssistant) {
            try {
                languageStatus = {
                    supportedLanguages: aiAssistant.getSupportedLanguages(),
                    lockStatus: aiAssistant.getLanguageLockStatus(),
                    detectionConfig: aiAssistant.getLanguageDetectionConfig(),
                    unifiedFormatterEnabled: aiAssistant.configManager?.unifiedFormatterConfig?.enabled || false,
                    knowledgeEnabled: aiAssistant.configManager?.knowledgeConfig?.enabled || false
                };
            } catch (error) {
                logger.warn('Language status check failed:', error);
            }
        }

        res.json({
            status: 'healthy',
            timestamp: Date.now(),
            services: healthChecks,
            aiAssistantHealth,
            knowledgeHealth,
            languageStatus,
            systemInfo: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                nodeVersion: process.version,
                platform: process.platform
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: Date.now()
        });
    }
});

class EnhancedWebSocketManager extends WebSocketManager {
    constructor(io, logger, lineHandler, aiAssistant, chatHistory) {
        super(io, logger, lineHandler, aiAssistant, chatHistory);
        this.mainMessageSentTimestamps = new Map();
        this.keywordProcessingStatus = new Map();
    }

    async handleAIResponseReceived(userId, messageId, response, channelAccessToken) {
        try {
            const responseText = response?.response || '';
            
            if (!responseText) {
                this.logger.warn('Empty response text - cannot send');
                return;
            }

            if (this.lineHandler) {
                await this.lineHandler.sendAIResponseDirectly(userId, responseText, response, null, channelAccessToken);
                this.mainMessageSentTimestamps.set(userId, Date.now());
                
                this.io.emit('ai_response_sent', {
                    userId: userId,
                    messageId: messageId,
                    responseLength: responseText.length,
                    timestamp: Date.now()
                });
            }

            if (this.lineHandler?.productImageSender && responseText) {
                setTimeout(async () => {
                    try {
                        const imageResult = await this.lineHandler.productImageSender.processOutgoingMessage(userId, responseText, channelAccessToken);
                        
                        if (imageResult.processed && imageResult.imagesSent > 0) {
                            this.io.emit('product_images_sent_after_message', {
                                userId: userId,
                                imagesSent: imageResult.imagesSent,
                                timestamp: Date.now()
                            });
                        }
                    } catch (imageError) {
                        this.logger.error('Error processing images (delayed):', imageError);
                    }
                }, 10000);
            }

            if (this.lineHandler?.keywordDetector && responseText) {
                const keywordKey = `${userId}_${Date.now()}`;
                if (!this.keywordProcessingStatus.has(userId)) {
                    this.keywordProcessingStatus.set(userId, keywordKey);
                    
                    setTimeout(async () => {
                        try {
                            if (this.keywordProcessingStatus.get(userId) === keywordKey) {
                                await this.lineHandler.keywordDetector.processOutgoingMessage(userId, responseText, channelAccessToken);
                                this.keywordProcessingStatus.delete(userId);
                            }
                        } catch (keywordError) {
                            this.logger.error('Error processing keywords (delayed):', keywordError);
                            this.keywordProcessingStatus.delete(userId);
                        }
                    }, 15000);
                }
            }

        } catch (error) {
            this.logger.error('Error in Enhanced WebSocket handleAIResponseReceived:', error);
            throw error;
        }
    }

    cleanupMessageTimestamps() {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        for (const [userId, timestamp] of this.mainMessageSentTimestamps.entries()) {
            if (timestamp < oneHourAgo) {
                this.mainMessageSentTimestamps.delete(userId);
            }
        }
        
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        for (const [userId, keywordKey] of this.keywordProcessingStatus.entries()) {
            const keywordTimestamp = parseInt(keywordKey.split('_')[1]);
            if (keywordTimestamp < fiveMinutesAgo) {
                this.keywordProcessingStatus.delete(userId);
            }
        }
    }

    startAIProcessing(userId, messageId, userMessage) {
        try {
            this.io.emit('ai_processing_started', {
                userId: userId,
                messageId: messageId,
                status: 'AI processing started',
                timestamp: Date.now()
            });

            return true;
        } catch (error) {
            this.logger.error('Error starting AI processing:', error);
            return false;
        }
    }
}

const enhancedWebSocketManager = new EnhancedWebSocketManager(
    io,
    logger,
    lineHandler,
    aiAssistant,
    chatHistory
);

webSocketManager = enhancedWebSocketManager;
lineHandler.setWebSocketManager(webSocketManager);

async function initializeServices() {
    try {
        const requiredDirs = [
            'logs',
            'data',
            'products',
            'temp_images',
            'data/product_image_sender',
            'data/product_image_sender/user_send_history',
            'data/Stock',
            'data/Product',
            'data/product_histories',
            'data/knowledge',
            'uploads/images',
            'uploads/knowledge',
            'uploads/documents',
            'processed_files/images',
            'src/modules/ai/data'
        ];

        for (const dir of requiredDirs) {
            await fs.mkdir(path.join(ROOT_DIR, dir), { recursive: true });
        }

        logger.info('📁 Required directories created/verified');

        await Promise.all([
            chatHistory.ensureDirectoryExists(),
            productManager.initialize?.() || Promise.resolve(),
            aiAssistant.initialize?.() || Promise.resolve()
        ]);

        await productImageSender.initialize();
        await imageHandler.initialize();
        await keywordDetector.loadConfiguration();
        await keywordDetector.loadCustomFlexMessage();

        try {
            await knowledgeRAG.initialize();
            logger.info('✅ Knowledge RAG system initialized successfully');
        } catch (knowledgeError) {
            logger.error('❌ Knowledge RAG initialization failed:', knowledgeError);
            logger.warn('🔄 Continuing without Knowledge RAG system');
        }

        logger.info('✅ All services initialized successfully');

    } catch (error) {
        logger.error('❌ Initialization error:', error);
        process.exit(1);
    }
}

const scheduleDailyCleanup = () => {
    schedule.scheduleJob('0 2 * * *', async () => {
        try {
            const cleanupResult = await productImageSender.cleanup();
            logger.info('ProductImageSender cleanup completed', cleanupResult);
            
            await keywordDetector.saveStats();
            logger.info('KeywordDetector stats saved');

            const imageCleanup = imageHandler.cleanup();
            logger.info('ImageHandler cleanup completed', imageCleanup);

            if (knowledgeRAG && knowledgeRAG.initialized) {
                try {
                    const knowledgeStats = await knowledgeRAG.getStatistics();
                    logger.info('Knowledge system daily statistics:', knowledgeStats);
                } catch (error) {
                    logger.warn('Knowledge system statistics collection failed:', error);
                }
            }

            if (aiAssistant) {
                try {
                    aiAssistant.clearCache();
                    aiAssistant.clearLanguageDetectionCache();
                    logger.info('AI Assistant cache cleanup completed');
                } catch (error) {
                    logger.warn('AI Assistant cleanup failed:', error);
                }
            }
        } catch (error) {
            logger.error('Error during daily cleanup:', error);
        }
    });
};

process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, starting graceful shutdown...');
    try {
        if (productImageSender?.cleanup) {
            await productImageSender.cleanup();
        }
        
        if (keywordDetector?.saveStats) {
            await keywordDetector.saveStats();
        }

        if (imageHandler?.cleanup) {
            imageHandler.cleanup();
        }

        if (aiAssistant?.clearCache) {
            aiAssistant.clearCache();
        }
        
        if (webSocketManager?.cleanupMessageTimestamps) {
            webSocketManager.cleanupMessageTimestamps();
        }
        
        server.close(() => {
            logger.info('Server closed gracefully');
            process.exit(0);
        });
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
});

(async () => {
    try {
        await initializeServices();
        scheduleDailyCleanup();
        
        setInterval(() => {
            if (webSocketManager?.cleanupMessageTimestamps) {
                webSocketManager.cleanupMessageTimestamps();
            }
        }, 60 * 60 * 1000);

        setInterval(() => {
            if (imageHandler?.cleanup) {
                imageHandler.cleanup();
            }
        }, 30 * 60 * 1000);
        
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            logger.info(`🚀 Server running on http://localhost:${PORT}`);
            logger.info(`📷 Product Image Manager: http://localhost:${PORT}/product-image-manager`);
            logger.info(`🖼️ Image Manager: http://localhost:${PORT}/image-manager`);
            logger.info(`🔑 Keyword Manager: http://localhost:${PORT}/keyword-manager`);
            logger.info(`📚 Knowledge Manager: http://localhost:${PORT}/knowledge-manager`);
            logger.info(`🎛️ Unified Formatter Manager: http://localhost:${PORT}/unified-formatter-manager`);
            logger.info(`⚙️ Configuration Manager: http://localhost:${PORT}/configuration-manager`);
            logger.info('🔗 Service connections established');
            
            setTimeout(async () => {
                try {
                    const testMessage = "ทดสอบการเชื่อมต่อ https://hongthaipackaging.com/product/paper-glasses-4-oz/ ระบบ";
                    
                    if (productImageSender && typeof productImageSender.testUrlDetection === 'function') {
                        const imageTestResult = await productImageSender.testUrlDetection(testMessage);
                        logger.info('✅ Product image startup test completed', imageTestResult);
                    }

                    if (keywordDetector && typeof keywordDetector.processOutgoingMessage === 'function') {
                        const keywords = keywordDetector.getKeywords();
                        const containsKeyword = keywords.some(keyword => 
                            testMessage.toLowerCase().includes(keyword.toLowerCase())
                        );
                        logger.info('✅ Keyword detection startup test completed', {
                            containsKeyword,
                            keywordCount: keywords.length
                        });
                    }

                    if (imageHandler && imageHandler.initialized) {
                        const imageHealthCheck = await imageHandler.healthCheck();
                        logger.info('✅ Image handler startup test completed', {
                            status: imageHealthCheck.status,
                            currentModel: imageHandler.currentModel
                        });
                    }

                    if (knowledgeRAG && knowledgeRAG.initialized) {
                        try {
                            const knowledgeHealth = await knowledgeRAG.healthCheck();
                            const knowledgeStats = await knowledgeRAG.getStatistics();
                            logger.info('✅ Knowledge system startup test completed', {
                                health: knowledgeHealth.status,
                                totalKnowledge: knowledgeStats.statistics?.total_knowledge || 0
                            });
                        } catch (error) {
                            logger.warn('⚠️ Knowledge system startup test failed:', error);
                        }
                    }

                    if (aiAssistant && aiAssistant.initialized) {
                        try {
                            const aiHealth = await aiAssistant.healthCheck();
                            logger.info('✅ AI Assistant startup test completed', {
                                status: aiHealth.systemStatus,
                                modelConnection: aiHealth.modelConnection,
                                knowledgeRAGAvailable: aiHealth.knowledgeRAG?.available || false,
                                unifiedFormatterAvailable: aiHealth.unifiedFormatter?.available || false
                            });

                            if (aiAssistant.unifiedContextFormatter) {
                                const unifiedTest = await aiAssistant.testUnifiedContext("test query", [], []);
                                logger.info('✅ Unified context formatter test completed', {
                                    success: unifiedTest.success,
                                    contextLength: unifiedTest.stats?.contextLength || 0
                                });
                            }
                        } catch (error) {
                            logger.warn('⚠️ AI Assistant startup test failed:', error);
                        }
                    }

                } catch (error) {
                    logger.error('❌ Startup test failed:', error);
                }
            }, 5000);
        });
    } catch (error) {
        logger.error('❌ Application start error:', error);
        process.exit(1);
    }
})();

module.exports = { 
    app, 
    server, 
    io, 
    logger, 
    productImageSender, 
    keywordDetector,
    imageHandler,
    lineHandler,
    webSocketManager,
    enhancedWebSocketManager,
    knowledgeRAG,
    knowledgeFormatter,
    aiAssistant,
    chatHistory,
    productManager
};
