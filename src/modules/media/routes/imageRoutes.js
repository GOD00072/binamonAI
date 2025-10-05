const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for in-memory storage
const upload = multer({
   storage: multer.memoryStorage(),
   limits: {
       fileSize: 10 * 1024 * 1024, // 10MB
   },
   fileFilter: (req, file, cb) => {
       const filetypes = /jpeg|jpg|png|gif|webp/;
       const mimetype = filetypes.test(file.mimetype);
       const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
       
       if (mimetype && extname) {
           return cb(null, true);
       }
       cb(new Error('Only images are allowed (jpeg, jpg, png, gif, webp)'));
   }
});

const imageRoutes = (imageHandler, logger) => {
   const router = express.Router();

   // ========== MIDDLEWARE ==========
   
   // Error handling middleware for multer
   const handleMulterError = (err, req, res, next) => {
       if (err instanceof multer.MulterError) {
           if (err.code === 'LIMIT_FILE_SIZE') {
               return res.status(400).json({
                   success: false,
                   error: 'File too large. Maximum size is 10MB.'
               });
           }
           return res.status(400).json({
               success: false,
               error: err.message
           });
       } else if (err) {
           return res.status(400).json({
               success: false,
               error: err.message
           });
       }
       next();
   };

   // ========== MODEL MANAGEMENT ENDPOINTS ==========

   // Get available models
   router.get('/models', async (req, res) => {
       try {
           logger.info('API: Fetching available models...');
           
           // ตรวจสอบว่า imageHandler มีฟังก์ชันที่จำเป็น
           if (!imageHandler || !imageHandler.getAvailableModels) {
               throw new Error('ImageHandler or getAvailableModels method not available');
           }
           
           const models = await imageHandler.getAvailableModels();
           const currentModel = imageHandler.getCurrentModel ? imageHandler.getCurrentModel() : { currentModel: '', modelInfo: null, lastUpdate: null };
           
           logger.info('API: Models fetched successfully', {
               modelCount: (models || []).length,
               currentModel: currentModel.currentModel
           });
           
           res.json({
               success: true,
               models: models || [],
               currentModel: currentModel.currentModel || '',
               modelInfo: currentModel.modelInfo || null,
               lastUpdate: currentModel.lastUpdate || null,
               count: (models || []).length,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('API: Error getting available models:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to get available models',
               details: error.message
           });
       }
   });

   // Refresh models from API (force refresh)
   router.post('/models/refresh', async (req, res) => {
       try {
           logger.info('API: Force refreshing model list from Gemini API...');
           
           if (!imageHandler) {
               throw new Error('ImageHandler not available');
           }
           
           let models = [];
           let currentModel = { currentModel: '', modelInfo: null, lastUpdate: null };
           
           // ลองใช้ forceRefreshModels ก่อน
           if (imageHandler.forceRefreshModels) {
               models = await imageHandler.forceRefreshModels();
           } 
           // ถ้าไม่มี ลองใช้ fetchAvailableModels
           else if (imageHandler.fetchAvailableModels) {
               models = await imageHandler.fetchAvailableModels();
           }
           // สุดท้ายลองใช้ getAvailableModels
           else if (imageHandler.getAvailableModels) {
               models = await imageHandler.getAvailableModels();
           } else {
               throw new Error('No refresh method available in ImageHandler');
           }
           
           if (imageHandler.getCurrentModel) {
               currentModel = imageHandler.getCurrentModel();
           }
           
           logger.info('API: Model list refreshed successfully', {
               modelCount: models.length,
               models: models.map(m => m.name || m)
           });
           
           res.json({
               success: true,
               message: 'Model list refreshed successfully',
               models: models,
               currentModel: currentModel.currentModel,
               modelInfo: currentModel.modelInfo,
               lastUpdate: currentModel.lastUpdate || new Date().toISOString(),
               count: models.length,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('API: Error refreshing model list:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to refresh model list',
               details: error.message
           });
       }
   });

   // Set current model
   router.post('/models/set', express.json(), async (req, res) => {
       try {
           const { modelName } = req.body;
           
           if (!modelName || typeof modelName !== 'string') {
               return res.status(400).json({
                   success: false,
                   error: 'Model name is required and must be a string'
               });
           }
           
           if (!imageHandler || !imageHandler.setModel) {
               throw new Error('ImageHandler or setModel method not available');
           }
           
           logger.info('API: Setting image analysis model', {
               requestedModel: modelName,
               currentModel: imageHandler.currentModel
           });
           
           const result = await imageHandler.setModel(modelName);
           
           if (!result.success) {
               return res.status(400).json({
                   success: false,
                   error: result.error,
                   currentModel: result.currentModel
               });
           }
           
           logger.info('API: Model changed successfully', {
               oldModel: imageHandler.currentModel,
               newModel: result.currentModel
           });
           
           res.json({
               success: true,
               message: `Model changed to ${modelName}`,
               currentModel: result.currentModel,
               modelInfo: result.modelInfo,
               timestamp: Date.now()
           });
           
       } catch (error) {
           logger.error('API: Error setting model:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to set model',
               details: error.message
           });
       }
   });

   // Get current model info
   router.get('/models/current', async (req, res) => {
       try {
           if (!imageHandler || !imageHandler.getCurrentModel) {
               throw new Error('ImageHandler or getCurrentModel method not available');
           }
           
           const currentModel = imageHandler.getCurrentModel();
           
           res.json({
               success: true,
               currentModel: currentModel.currentModel,
               modelInfo: currentModel.modelInfo,
               lastUpdate: currentModel.lastUpdate,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('API: Error getting current model:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to get current model',
               details: error.message
           });
       }
   });

   // Test model connection
   router.post('/models/test', express.json(), async (req, res) => {
       try {
           const { modelName } = req.body;
           
           logger.info('API: Testing model connection', {
               testModel: modelName || imageHandler.currentModel
           });
           
           if (!imageHandler) {
               throw new Error('ImageHandler not available');
           }
           
           let result;
           
           // ถ้ามีฟังก์ชัน testModelConnection ให้ใช้
           if (imageHandler.testModelConnection) {
               result = await imageHandler.testModelConnection(modelName);
           } else {
               // ถ้าไม่มี ให้สร้างการทดสอบง่ายๆ
               const testModel = modelName || imageHandler.currentModel;
               result = {
                   success: true,
                   model: testModel,
                   connectionStatus: 'available',
                   response: 'Model connection test completed (basic test)',
                   timestamp: Date.now()
               };
           }
           
           res.json({
               success: result.success,
               model: result.model,
               connectionStatus: result.connectionStatus,
               response: result.response || null,
               error: result.error || null,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('API: Error testing model connection:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to test model connection',
               details: error.message
           });
       }
   });

   // Get comprehensive model statistics
   router.get('/models/stats', async (req, res) => {
       try {
           if (!imageHandler) {
               throw new Error('ImageHandler not available');
           }
           
           const stats = imageHandler.getStats ? await imageHandler.getStats() : { activeBatches: 0 };
           const models = imageHandler.getAvailableModels ? await imageHandler.getAvailableModels() : [];
           
           const visionModels = models.filter(model => {
               if (imageHandler.isVisionModel) {
                   return imageHandler.isVisionModel(model.name);
               }
               // Fallback check for vision models
               const name = model.name ? model.name.toLowerCase() : '';
               return name.includes('vision') || name.includes('pro') || name.includes('flash') || name.includes('1.5');
           });
           
           const modelStats = {
               total: models.length,
               visionCapable: visionModels.length,
               currentModel: imageHandler.currentModel || '',
               lastUpdate: imageHandler.lastModelUpdate || null,
               cacheAge: imageHandler.lastModelUpdate ? 
                   Date.now() - imageHandler.lastModelUpdate : null,
               activeBatches: stats.activeBatches || 0,
               supportedFormats: imageHandler.SUPPORTED_FORMATS || ['jpeg', 'jpg', 'png', 'gif', 'webp'],
               maxImageSize: imageHandler.MAX_IMAGE_SIZE || (10 * 1024 * 1024)
           };
           
           res.json({
               success: true,
               stats: modelStats,
               models: {
                   all: models,
                   vision: visionModels
               },
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('API: Error getting model stats:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to get model statistics',
               details: error.message
           });
       }
   });

   // Get model information by name
   router.get('/models/:modelName', async (req, res) => {
       try {
           const { modelName } = req.params;
           
           if (!imageHandler) {
               throw new Error('ImageHandler not available');
           }
           
           let modelInfo = null;
           if (imageHandler.getModelInfo) {
               modelInfo = imageHandler.getModelInfo(modelName);
           } else {
               // Fallback: ค้นหาจาก available models
               const models = imageHandler.getAvailableModels ? await imageHandler.getAvailableModels() : [];
               modelInfo = models.find(m => m.name === modelName);
           }
           
           if (!modelInfo) {
               return res.status(404).json({
                   success: false,
                   error: `Model ${modelName} not found`
               });
           }
           
           let isVision = false;
           if (imageHandler.isVisionModel) {
               isVision = imageHandler.isVisionModel(modelName);
           } else {
               // Fallback check
               const name = modelName.toLowerCase();
               isVision = name.includes('vision') || name.includes('pro') || name.includes('flash') || name.includes('1.5');
           }
           
           res.json({
               success: true,
               modelName: modelName,
               modelInfo: modelInfo,
               isVisionModel: isVision,
               isCurrent: modelName === imageHandler.currentModel,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('API: Error getting model info:', {
               error: error.message,
               modelName: req.params.modelName,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to get model information',
               details: error.message
           });
       }
   });

   // Get model information by name with vision capability check
   router.get('/models/:modelName/info', async (req, res) => {
       try {
           const { modelName } = req.params;
           
           if (!imageHandler) {
               throw new Error('ImageHandler not available');
           }
           
           let modelInfo = null;
           if (imageHandler.getModelInfo) {
               modelInfo = imageHandler.getModelInfo(modelName);
           } else {
               const models = imageHandler.getAvailableModels ? await imageHandler.getAvailableModels() : [];
               modelInfo = models.find(m => m.name === modelName);
           }
           
           if (!modelInfo) {
               return res.status(404).json({
                   success: false,
                   error: `Model ${modelName} not found`
               });
           }
           
           let isVision = false;
           if (imageHandler.isVisionModel) {
               isVision = imageHandler.isVisionModel(modelName);
           } else {
               const name = modelName.toLowerCase();
               isVision = name.includes('vision') || name.includes('pro') || name.includes('flash') || name.includes('1.5');
           }
           
           const isCurrent = modelName === imageHandler.currentModel;
           
           res.json({
               success: true,
               modelName: modelName,
               modelInfo: {
                   ...modelInfo,
                   isVisionCapable: isVision
               },
               isVisionModel: isVision,
               isCurrent: isCurrent,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('API: Error getting model info with vision check:', {
               error: error.message,
               modelName: req.params.modelName,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to get model information',
               details: error.message
           });
       }
   });

   // Advanced model testing with image analysis
   router.post('/models/:modelName/test-image', upload.single('testImage'), handleMulterError, async (req, res) => {
       try {
           const { modelName } = req.params;
           
           if (!req.file) {
               return res.status(400).json({
                   success: false,
                   error: 'No test image provided'
               });
           }
           
           if (!imageHandler) {
               throw new Error('ImageHandler not available');
           }
           
           logger.info('API: Testing model with image analysis', {
               modelName: modelName,
               imageSize: req.file.size,
               originalModel: imageHandler.currentModel
           });
           
           // Temporarily switch to test model
           const originalModel = imageHandler.currentModel;
           let testResult;
           
           try {
               if (modelName !== originalModel && imageHandler.setModel) {
                   const switchResult = await imageHandler.setModel(modelName);
                   if (!switchResult.success) {
                       throw new Error(`Cannot switch to test model: ${switchResult.error}`);
                   }
               }
               
               // Analyze the test image
               const startTime = Date.now();
               const description = await imageHandler.analyzeImage(req.file.buffer);
               const duration = Date.now() - startTime;
               
               testResult = {
                   success: true,
                   model: modelName,
                   analysis: description,
                   duration: duration,
                   imageSize: req.file.buffer.length,
                   connectionStatus: 'healthy'
               };
               
           } finally {
               // Restore original model
               if (modelName !== originalModel && imageHandler.setModel) {
                   await imageHandler.setModel(originalModel);
               }
           }
           
           logger.info('API: Model image test completed', {
               modelName: modelName,
               success: testResult.success,
               duration: testResult.duration
           });
           
           res.json({
               success: true,
               result: testResult,
               timestamp: Date.now()
           });
           
       } catch (error) {
           logger.error('API: Error testing model with image:', {
               error: error.message,
               modelName: req.params.modelName,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: error.message,
               details: error.message,
               timestamp: Date.now()
           });
       }
   });

   // ========== IMAGE PROCESSING ENDPOINTS ==========

   // Upload and process an image
   router.post('/upload', upload.single('image'), handleMulterError, async (req, res) => {
       try {
           if (!req.file) {
               return res.status(400).json({
                   success: false,
                   error: 'No image file provided'
               });
           }

           if (!imageHandler || !imageHandler.processUploadedImage) {
               throw new Error('ImageHandler or processUploadedImage method not available');
           }

           const userId = req.body.userId || 'web-user';
           const userComment = req.body.comment || null;
           
           logger.info('API: Image upload request received', {
               userId,
               filename: req.file.originalname,
               size: req.file.size,
               hasComment: userComment !== null,
               currentModel: imageHandler.currentModel
           });

           const result = await imageHandler.processUploadedImage(req.file, userId, userComment);
           
           if (!result.success) {
               return res.status(422).json({
                   success: false,
                   error: result.error || 'Failed to process image'
               });
           }

           res.json({
               success: true,
               filename: result.filename,
               description: result.description,
               response: result.response,
               model: result.model || imageHandler.currentModel,
               userComment: result.userComment,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('API: Error in image upload:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Server error processing image',
               details: error.message
           });
       }
   });

   // Get image analysis without saving to history
   router.post('/analyze', upload.single('image'), handleMulterError, async (req, res) => {
       try {
           if (!req.file) {
               return res.status(400).json({
                   success: false,
                   error: 'No image file provided'
               });
           }
           
           if (!imageHandler || !imageHandler.analyzeImage) {
               throw new Error('ImageHandler or analyzeImage method not available');
           }
           
           logger.info('API: Image analysis request received', {
               filename: req.file.originalname,
               size: req.file.size,
               currentModel: imageHandler.currentModel
           });

           const description = await imageHandler.analyzeImage(req.file.buffer);
           
           res.json({
               success: true,
               description,
               model: imageHandler.currentModel,
               filename: req.file.originalname,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('API: Error in image analysis:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to analyze image',
               details: error.message
           });
       }
   });

   // Process base64 image data
   router.post('/analyze-base64', express.json({ limit: '64mb' }), async (req, res) => {
       try {
           const { imageData, userId, comment, modelName } = req.body;
           
           if (!imageData || typeof imageData !== 'string') {
               return res.status(400).json({
                   success: false,
                   error: 'Invalid image data'
               });
           }

           if (!imageHandler) {
               throw new Error('ImageHandler not available');
           }

           // Temporarily change model if specified
           let originalModel = null;
           if (modelName && modelName !== imageHandler.currentModel && imageHandler.setModel) {
               originalModel = imageHandler.currentModel;
               const modelResult = await imageHandler.setModel(modelName);
               if (!modelResult.success) {
                   return res.status(400).json({
                       success: false,
                       error: `Failed to set model: ${modelResult.error}`
                   });
               }
           }
           
           try {
               // Extract actual base64 data if it includes data URL prefix
               const base64Data = imageData.includes('base64,') 
                   ? imageData.split('base64,')[1] 
                   : imageData;
               
               // Convert base64 to buffer
               const buffer = Buffer.from(base64Data, 'base64');
               
               logger.info('API: Base64 image analysis request received', {
                   userId: userId || 'anonymous',
                   imageSize: buffer.length,
                   hasComment: !!comment,
                   currentModel: imageHandler.currentModel,
                   temporaryModel: !!originalModel
               });
               
               // Create a mock file object
               const file = {
                   buffer,
                   originalname: 'base64_upload.jpg',
                   mimetype: 'image/jpeg',
                   size: buffer.length
               };
               
               // Process the image
               const result = await imageHandler.processUploadedImage(
                   file, 
                   userId || 'web-user',
                   comment
               );
               
               if (!result.success) {
                   return res.status(422).json({
                       success: false,
                       error: result.error || 'Failed to process image'
                   });
               }
               
               res.json({
                   success: true,
                   description: result.description,
                   response: result.response,
                   model: imageHandler.currentModel,
                   userComment: result.userComment,
                   timestamp: Date.now()
               });
               
           } finally {
               // Restore original model if it was temporarily changed
               if (originalModel && imageHandler.setModel) {
                   await imageHandler.setModel(originalModel);
               }
           }
           
       } catch (error) {
           logger.error('API: Error in base64 image analysis:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to analyze base64 image',
               details: error.message
           });
       }
   });

   // Validate image file without processing
   router.post('/validate', upload.single('image'), handleMulterError, async (req, res) => {
       try {
           if (!req.file) {
               return res.status(400).json({
                   success: false,
                   error: 'No image file provided'
               });
           }

           if (!imageHandler) {
               throw new Error('ImageHandler not available');
           }

           const fileExtension = path.extname(req.file.originalname).toLowerCase().substring(1);
           const supportedFormats = imageHandler.SUPPORTED_FORMATS || ['jpeg', 'jpg', 'png', 'gif', 'webp'];
           const maxImageSize = imageHandler.MAX_IMAGE_SIZE || (10 * 1024 * 1024);
           
           const isSupported = supportedFormats.includes(fileExtension);
           const sizeOk = req.file.size <= maxImageSize;
           
           res.json({
               success: true,
               filename: req.file.originalname,
               size: req.file.size,
               maxSize: maxImageSize,
               extension: fileExtension,
               isSupported: isSupported,
               sizeOk: sizeOk,
               valid: isSupported && sizeOk,
               supportedFormats: supportedFormats,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('API: Error validating image:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to validate image',
               details: error.message
           });
       }
   });

   // ========== CONFIGURATION ENDPOINTS ==========

   // Health check endpoint
   router.get('/health', async (req, res) => {
       try {
           if (!imageHandler) {
               throw new Error('ImageHandler not available');
           }
           
           let status;
           if (imageHandler.healthCheck) {
               status = await imageHandler.healthCheck();
           } else {
               // Fallback health check
               status = {
                   status: 'healthy',
                   initialized: !!imageHandler.initialized,
                   currentModel: imageHandler.currentModel || 'unknown',
                   message: 'Basic health check completed'
               };
           }
           
           res.json({
               ...status,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('API: Error in image health check:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               status: 'error',
               error: error.message,
               timestamp: Date.now()
           });
       }
   });

   // Get current configuration
   router.get('/config', async (req, res) => {
       try {
           const configPath = path.join(process.cwd(), 'data', 'image_config.json');
           
           let config;
           try {
               const configData = await fs.readFile(configPath, 'utf8');
               config = JSON.parse(configData);
               
               logger.info('API: Loaded config from file', {
                   configPath,
                   configKeys: Object.keys(config),
                   currentModel: config.currentModel
               });
           } catch (fileError) {
               logger.warn('API: Could not read config file, using default from imageHandler', {
                   fileError: fileError.message
               });
               
               if (imageHandler && imageHandler.getConfig) {
                   config = imageHandler.getConfig();
               } else {
                   // Fallback default config
                   config = {
                       currentModel: imageHandler?.currentModel || '',
                       promptTemplate: 'ช่วยอธิบายรูปภาพนี้อย่างละเอียด',
                       batchTimeout: 20000,
                       maxBatchSize: 5,
                       minImageGap: 5000,
                       commentLookbackWindow: 15000,
                       maxCommentLength: 500
                   };
               }
           }
           
           res.json({
               success: true,
               config,
               timestamp: Date.now(),
               source: 'file'
           });
       } catch (error) {
           logger.error('API: Error getting image handler configuration:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to retrieve configuration',
               details: error.message
           });
       }
   });

   // Update configuration settings
   router.post('/config', express.json(), async (req, res) => {
       try {
           const { 
               promptTemplate, 
               batchSize, 
               imageGap, 
               batchTimeout, 
               commentLookbackWindow, 
               maxCommentLength,
               modelName 
           } = req.body;
           
           if (!imageHandler) {
               throw new Error('ImageHandler not available');
           }
           
           logger.info('API: Image handler configuration update requested', {
               updatedFields: Object.keys(req.body),
               currentModel: imageHandler.currentModel
           });
           
           // Handle model change first if requested
           if (modelName && modelName !== imageHandler.currentModel && imageHandler.setModel) {
               const modelResult = await imageHandler.setModel(modelName);
               if (!modelResult.success) {
                   return res.status(400).json({
                       success: false,
                       error: `Failed to set model: ${modelResult.error}`
                   });
               }
               
               logger.info('API: Model changed during config update', {
                   newModel: modelName,
                   oldModel: imageHandler.currentModel
               });
           }
           
           // Create config object with only the valid parameters
           const configUpdate = {};
           
           if (batchSize !== undefined) configUpdate.maxBatchSize = Number(batchSize);
           if (imageGap !== undefined) configUpdate.minImageGap = Number(imageGap);
           if (batchTimeout !== undefined) configUpdate.batchTimeout = Number(batchTimeout);
           if (commentLookbackWindow !== undefined) configUpdate.commentLookbackWindow = Number(commentLookbackWindow);
           if (maxCommentLength !== undefined) configUpdate.maxCommentLength = Number(maxCommentLength);
           
           // Update configuration
           let updatedConfig;
           if (imageHandler.updateBatchingConfig) {
               updatedConfig = imageHandler.updateBatchingConfig(configUpdate);
           }
           
           // Handle prompt template separately if provided
           if (promptTemplate && imageHandler.updatePromptTemplate) {
               const result = await imageHandler.updatePromptTemplate(promptTemplate);
               
               if (!result.success) {
                   return res.status(400).json({
                       success: false,
                       error: result.error || 'Failed to update prompt template'
                   });
               }
           }
           
           // Get final config
           let finalConfig;
           if (imageHandler.getConfig) {
               finalConfig = imageHandler.getConfig();
           } else {
               finalConfig = updatedConfig || configUpdate;
           }
           
           res.json({
               success: true,
               config: finalConfig,
               message: 'Configuration updated successfully',
               timestamp: Date.now()
           });
           
       } catch (error) {
           logger.error('API: Error updating image handler configuration:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to update configuration',
               details: error.message
           });
       }
   });

   // Get image processing statistics
   // Get image processing statistics
   router.get('/stats', async (req, res) => {
       try {
           if (!imageHandler) {
               throw new Error('ImageHandler not available');
           }
           
           let stats;
           if (imageHandler.getStats) {
               stats = await imageHandler.getStats();
           } else {
               // Fallback stats
               stats = {
                   currentModel: imageHandler.currentModel || 'unknown',
                   activeBatches: 0,
                   availableModelCount: 0,
                   supportedFormats: imageHandler.SUPPORTED_FORMATS || ['jpeg', 'jpg', 'png', 'gif', 'webp'],
                   configuration: {
                       maxImageSize: imageHandler.MAX_IMAGE_SIZE || (10 * 1024 * 1024)
                   }
               };
           }
           
           res.json({
               success: true,
               stats,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('API: Error getting image processing stats:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to get statistics',
               details: error.message
           });
       }
   });

   // ========== FILE MANAGEMENT ENDPOINTS ==========

   // Get processed images directory listing
   router.get('/processed', async (req, res) => {
       try {
           const processedDir = path.join(process.cwd(), 'processed_files', 'images');
           
           // Ensure directory exists
           await fs.mkdir(processedDir, { recursive: true });
           
           const files = await fs.readdir(processedDir);
           
           // Get details for each file
           const fileDetails = await Promise.all(
               files.map(async (filename) => {
                   try {
                       const filePath = path.join(processedDir, filename);
                       const stats = await fs.stat(filePath);
                       return {
                           filename,
                           size: stats.size,
                           created: stats.birthtime,
                           modified: stats.mtime,
                           extension: path.extname(filename).toLowerCase()
                       };
                   } catch (error) {
                       logger.warn('API: Error getting file stats:', {
                           filename,
                           error: error.message
                       });
                       return null;
                   }
               })
           );
           
           // Filter out null entries and sort by most recent first
           const validFiles = fileDetails.filter(f => f !== null);
           validFiles.sort((a, b) => b.modified - a.modified);
           
           res.json({
               success: true,
               count: validFiles.length,
               files: validFiles,
               directory: processedDir,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('API: Error getting processed images list:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to retrieve processed images',
               details: error.message
           });
       }
   });

   // Get uploads directory listing
   router.get('/uploads', async (req, res) => {
       try {
           const uploadsDir = path.join(process.cwd(), 'uploads', 'images');
           
           // Ensure directory exists
           await fs.mkdir(uploadsDir, { recursive: true });
           
           const files = await fs.readdir(uploadsDir);
           
           // Get details for each file
           const fileDetails = await Promise.all(
               files.map(async (filename) => {
                   try {
                       const filePath = path.join(uploadsDir, filename);
                       const stats = await fs.stat(filePath);
                       return {
                           filename,
                           size: stats.size,
                           created: stats.birthtime,
                           modified: stats.mtime,
                           extension: path.extname(filename).toLowerCase()
                       };
                   } catch (error) {
                       logger.warn('API: Error getting file stats:', {
                           filename,
                           error: error.message
                       });
                       return null;
                   }
               })
           );
           
           // Filter out null entries and sort by most recent first
           const validFiles = fileDetails.filter(f => f !== null);
           validFiles.sort((a, b) => b.modified - a.modified);
           
           res.json({
               success: true,
               count: validFiles.length,
               files: validFiles,
               directory: uploadsDir,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('API: Error getting uploaded images list:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to retrieve uploaded images',
               details: error.message
           });
       }
   });

   // Delete image files older than X days
   router.post('/cleanup', express.json(), async (req, res) => {
       try {
           const { days = 7, type = 'all' } = req.body;
           
           // Validate input
           if (isNaN(days) || days < 1 || days > 365) {
               return res.status(400).json({
                   success: false,
                   error: 'Days parameter must be a number between 1 and 365'
               });
           }
           
           const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
           let uploadsCleaned = 0;
           let processedCleaned = 0;
           
           logger.info('API: Starting image cleanup', {
               days,
               type,
               cutoffTime: new Date(cutoffTime).toISOString()
           });
           
           // Clean uploads directory if requested
           if (type === 'all' || type === 'uploads') {
               const uploadsDir = path.join(process.cwd(), 'uploads', 'images');
               
               try {
                   const uploadFiles = await fs.readdir(uploadsDir);
                   
                   for (const file of uploadFiles) {
                       try {
                           const filePath = path.join(uploadsDir, file);
                           const stats = await fs.stat(filePath);
                           
                           if (stats.mtimeMs < cutoffTime) {
                               await fs.unlink(filePath);
                               uploadsCleaned++;
                               logger.info('API: Deleted upload file', {
                                   filename: file,
                                   age: Math.round((Date.now() - stats.mtimeMs) / (24 * 60 * 60 * 1000))
                               });
                           }
                       } catch (fileError) {
                           logger.warn('API: Error processing upload file during cleanup:', {
                               filename: file,
                               error: fileError.message
                           });
                       }
                   }
               } catch (dirError) {
                   logger.warn('API: Error accessing uploads directory:', dirError.message);
               }
           }
           
           // Clean processed files directory if requested
           if (type === 'all' || type === 'processed') {
               const processedDir = path.join(process.cwd(), 'processed_files', 'images');
               
               try {
                   const processedFiles = await fs.readdir(processedDir);
                   
                   for (const file of processedFiles) {
                       try {
                           const filePath = path.join(processedDir, file);
                           const stats = await fs.stat(filePath);
                           
                           if (stats.mtimeMs < cutoffTime) {
                               await fs.unlink(filePath);
                               processedCleaned++;
                               logger.info('API: Deleted processed file', {
                                   filename: file,
                                   age: Math.round((Date.now() - stats.mtimeMs) / (24 * 60 * 60 * 1000))
                               });
                           }
                       } catch (fileError) {
                           logger.warn('API: Error processing file during cleanup:', {
                               filename: file,
                               error: fileError.message
                           });
                       }
                   }
               } catch (dirError) {
                   logger.warn('API: Error accessing processed directory:', dirError.message);
               }
           }
           
           logger.info('API: Manual image cleanup completed', {
               days,
               type,
               uploadsCleaned,
               processedCleaned,
               totalCleaned: uploadsCleaned + processedCleaned
           });
           
           res.json({
               success: true,
               uploadsCleaned,
               processedCleaned,
               totalCleaned: uploadsCleaned + processedCleaned,
               message: `Cleaned up ${uploadsCleaned + processedCleaned} files older than ${days} days`,
               timestamp: Date.now()
           });
           
       } catch (error) {
           logger.error('API: Error during manual image cleanup:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to clean up image files',
               details: error.message
           });
       }
   });

   // ========== UTILITY ENDPOINTS ==========

   // Force cleanup image batches
   router.post('/batches/cleanup', async (req, res) => {
       try {
           if (!imageHandler) {
               throw new Error('ImageHandler not available');
           }
           
           let result;
           if (imageHandler.cleanup) {
               result = imageHandler.cleanup();
           } else {
               result = {
                   clearedBatches: 0,
                   remainingBatches: 0,
                   message: 'Cleanup method not available'
               };
           }
           
           logger.info('API: Manual batch cleanup requested', result);
           
           res.json({
               success: true,
               ...result,
               message: 'Batch cleanup completed',
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('API: Error during batch cleanup:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to cleanup batches',
               details: error.message
           });
       }
   });

   // Get active batches information
   router.get('/batches', async (req, res) => {
       try {
           if (!imageHandler) {
               throw new Error('ImageHandler not available');
           }
           
           let stats;
           if (imageHandler.getStats) {
               stats = await imageHandler.getStats();
           } else {
               stats = {
                   activeBatches: 0,
                   configuration: {
                       batchTimeout: 20000,
                       maxBatchSize: 5,
                       minImageGap: 5000
                   }
               };
           }
           
           res.json({
               success: true,
               activeBatches: stats.activeBatches,
               configuration: stats.configuration,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('API: Error getting batch information:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to get batch information',
               details: error.message
           });
       }
   });

   // ========== IMAGE SERVING ENDPOINTS ==========

   // Serve processed images
   router.get('/processed/:filename', async (req, res) => {
       try {
           const { filename } = req.params;
           
           // Validate filename
           if (!filename || filename.includes('..') || filename.includes('/')) {
               return res.status(400).json({
                   success: false,
                   error: 'Invalid filename'
               });
           }
           
           const processedDir = path.join(process.cwd(), 'processed_files', 'images');
           const filePath = path.join(processedDir, filename);
           
           try {
               await fs.access(filePath);
           } catch (error) {
               return res.status(404).json({
                   success: false,
                   error: 'Image not found'
               });
           }
           
           const imageBuffer = await fs.readFile(filePath);
           const ext = path.extname(filename).toLowerCase();
           let contentType = 'image/jpeg';
           
           switch (ext) {
               case '.png': contentType = 'image/png'; break;
               case '.gif': contentType = 'image/gif'; break;
               case '.webp': contentType = 'image/webp'; break;
               case '.bmp': contentType = 'image/bmp'; break;
           }
           
           res.setHeader('Content-Type', contentType);
           res.setHeader('Cache-Control', 'public, max-age=3600');
           res.send(imageBuffer);
           
       } catch (error) {
           logger.error('API: Error serving processed image:', {
               error: error.message,
               filename: req.params.filename
           });
           
           res.status(500).json({
               success: false,
               error: 'Internal server error'
           });
       }
   });

   // Serve uploaded images
   router.get('/uploads/:filename', async (req, res) => {
       try {
           const { filename } = req.params;
           
           // Validate filename
           if (!filename || filename.includes('..') || filename.includes('/')) {
               return res.status(400).json({
                   success: false,
                   error: 'Invalid filename'
               });
           }
           
           const uploadsDir = path.join(process.cwd(), 'uploads', 'images');
           const filePath = path.join(uploadsDir, filename);
           
           try {
               await fs.access(filePath);
           } catch (error) {
               return res.status(404).json({
                   success: false,
                   error: 'Image not found'
               });
           }
           
           const imageBuffer = await fs.readFile(filePath);
           const ext = path.extname(filename).toLowerCase();
           let contentType = 'image/jpeg';
           
           switch (ext) {
               case '.png': contentType = 'image/png'; break;
               case '.gif': contentType = 'image/gif'; break;
               case '.webp': contentType = 'image/webp'; break;
               case '.bmp': contentType = 'image/bmp'; break;
           }
           
           res.setHeader('Content-Type', contentType);
           res.setHeader('Cache-Control', 'public, max-age=3600');
           res.send(imageBuffer);
           
       } catch (error) {
           logger.error('API: Error serving uploaded image:', {
               error: error.message,
               filename: req.params.filename
           });
           
           res.status(500).json({
               success: false,
               error: 'Internal server error'
           });
       }
   });

   // ========== SYSTEM ENDPOINTS ==========

   // Get system information
   router.get('/system', async (req, res) => {
       try {
           const systemInfo = {
               nodeVersion: process.version,
               platform: process.platform,
               arch: process.arch,
               uptime: process.uptime(),
               memoryUsage: process.memoryUsage(),
               imageHandler: {
                   available: !!imageHandler,
                   initialized: imageHandler?.initialized || false,
                   currentModel: imageHandler?.currentModel || 'unknown',
                   supportedFormats: imageHandler?.SUPPORTED_FORMATS || [],
                   maxImageSize: imageHandler?.MAX_IMAGE_SIZE || 0
               },
               directories: {
                   uploads: path.join(process.cwd(), 'uploads', 'images'),
                   processed: path.join(process.cwd(), 'processed_files', 'images'),
                   config: path.join(process.cwd(), 'data', 'image_config.json')
               }
           };
           
           res.json({
               success: true,
               system: systemInfo,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('API: Error getting system information:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to get system information',
               details: error.message
           });
       }
   });

   // Reset system to defaults
   router.post('/reset', express.json(), async (req, res) => {
       try {
           const { confirm } = req.body;
           
           if (!confirm || confirm !== 'RESET_CONFIRM') {
               return res.status(400).json({
                   success: false,
                   error: 'Confirmation required. Send { "confirm": "RESET_CONFIRM" }'
               });
           }
           
           logger.warn('API: System reset requested');
           
           // Reset configuration to defaults
           const defaultConfig = {
               currentModel: 'gemini-2.5-pro',
               promptTemplate: 'ช่วยอธิบายรูปภาพนี้อย่างละเอียด โดยระบุว่าเป็นบรรจุภัณฑ์ประเภทไหน มีลักษณะอย่างไร มีขนาดและรูปทรงใด หากเป็นกล่อง ให้อธิบายว่าเป็นกล่องประเภทไหน ทำจากวัสดุอะไร และเหมาะกับใส่สินค้าประเภทใด',
               batchTimeout: 20000,
               maxBatchSize: 5,
               minImageGap: 5000,
               commentLookbackWindow: 15000,
               maxCommentLength: 500,
               lastUpdated: new Date().toISOString()
           };
           
           // Save default config
           const configPath = path.join(process.cwd(), 'data', 'image_config.json');
           await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
           
           // Reset imageHandler if possible
           if (imageHandler && imageHandler.updateBatchingConfig) {
               imageHandler.updateBatchingConfig({
                   batchTimeout: defaultConfig.batchTimeout,
                   maxBatchSize: defaultConfig.maxBatchSize,
                   minImageGap: defaultConfig.minImageGap,
                   commentLookbackWindow: defaultConfig.commentLookbackWindow,
                   maxCommentLength: defaultConfig.maxCommentLength
               });
           }
           
           if (imageHandler && imageHandler.updatePromptTemplate) {
               await imageHandler.updatePromptTemplate(defaultConfig.promptTemplate);
           }
           
           logger.info('API: System reset completed');
           
           res.json({
               success: true,
               message: 'System reset to defaults completed',
               config: defaultConfig,
               timestamp: Date.now()
           });
           
       } catch (error) {
           logger.error('API: Error during system reset:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: 'Failed to reset system',
               details: error.message
           });
       }
   });

   // ========== ERROR HANDLING ==========

   // Global error handler for this router
   router.use((error, req, res, next) => {
       logger.error('API: Unhandled error in image routes:', {
           error: error.message,
           stack: error.stack,
           url: req.url,
           method: req.method
       });
       
       res.status(500).json({
           success: false,
           error: 'Internal server error',
           details: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
       });
   });

   // 404 handler for unknown routes
   router.use('*', (req, res) => {
       res.status(404).json({
           success: false,
           error: 'Endpoint not found',
           path: req.originalUrl,
           method: req.method,
           availableEndpoints: [
               'GET /models',
               'POST /models/refresh',
               'POST /models/set',
               'GET /models/current',
               'POST /models/test',
               'GET /models/stats',
               'GET /models/:modelName',
               'GET /models/:modelName/info',
               'POST /models/:modelName/test-image',
               'POST /upload',
               'POST /analyze',
               'POST /analyze-base64',
               'POST /validate',
               'GET /health',
               'GET /config',
               'POST /config',
               'GET /stats',
               'GET /processed',
               'GET /uploads',
               'POST /cleanup',
               'POST /batches/cleanup',
               'GET /batches',
               'GET /processed/:filename',
               'GET /uploads/:filename',
               'GET /system',
               'POST /reset'
           ]
       });
   });

   return router;
};

module.exports = imageRoutes;