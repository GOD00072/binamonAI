// configRoutes.js
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');


module.exports = ({ aiAssistant, messageHandler, productManager, logger }) => {
  // Settings file path configuration
  const settingsPath = path.join(__dirname, 'data', 'settings.json');


  const getConfigManager = () => {
    if (aiAssistant && aiAssistant.configManager) {
      return aiAssistant.configManager;
    }
    
    // Fallback: สร้าง ConfigManager instance ใหม่
    try {
      const ConfigManager = require('../aiservices/ConfigManager');
      return new ConfigManager(logger);
    } catch (error) {
      logger.error('Error creating ConfigManager fallback:', error);
      return null;
    }
  };

  /**
   * Utility function to read settings file
   * @returns {Promise<Object>} The parsed settings object
   */
  async function readSettings() {
      try {
          const data = await fs.readFile(settingsPath, 'utf8');
          return JSON.parse(data);
      } catch (error) {
          logger.error('Error reading settings file:', error);
          throw error;
      }
  }

  /**
   * Utility function to write settings file
   * @param {Object} settings - The settings object to write
   * @returns {Promise<void>}
   */
  async function writeSettings(settings) {
      try {
          const dirPath = path.dirname(settingsPath);
          await fs.mkdir(dirPath, { recursive: true });
          await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
          logger.info('Settings file updated successfully');
      } catch (error) {
          logger.error('Error writing settings file:', error);
          throw error;
      }
  }

  /**
   * Initialize default settings
   * @returns {Object} Default settings object
   */
  function getDefaultSettings() {
      return {
          modelName: 'gemini-2.5-pro',
          apiVersion: 'v1',
          modelUrl: 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro',
          useDirectUrl: true,
          generationConfig: {
              temperature: 0.7,
              topP: 0.9,
              maxOutputTokens: 1999,
              topK: 40
          },
          templateConfig: {
              conversation: {
                  personality: 'คุณคือเจ๊หงส์ ผู้เชี่ยวชาญด้านบรรจุภัณฑ์กระดาษที่มีประสบการณ์มากกว่า 30 ปี จากบริษัท หงส์ไทยฟู้ดแพคเกจจิ้ง จำกัด',
                  greeting: 'สวัสดีค่ะ เจ๊หงส์ยินดีให้คำปรึกษาเกี่ยวกับบรรจุภัณฑ์นะคะ 🙂',
                  closing: 'หากมีข้อสงสัยเพิ่มเติม สามารถสอบถามได้เลยนะคะ 😊',
                  guidelines: [
                      'ตอบคำถามตรงประเด็น เข้าใจง่าย',
                      'ให้ข้อมูลที่เป็นประโยชน์และครบถ้วน',
                      'แนะนำสินค้าที่เหมาะสมตามความต้องการของลูกค้า',
                      'แจ้งราคาเป็นช่วงตามปริมาณการสั่งซื้อ และช่วงราคาสินค้าสั่งผลิตทุกครั้ง',
                      'ส่ง url ของสินค้าให้ทุกครั้ง'
                  ]
              }
          },
          messageConfig: {
              maxLength: 5000,
              delayTime: 8000,
              retryAttempts: 3,
              retryDelay: 1000
          },
          imageConfig: {
              maxSize: 10485760,
              maxDimension: 4096,
              supportedFormats: ["jpeg", "png", "webp"],
              resizeConfig: {
                  width: 800,
                  height: 800,
                  quality: 85,
                  progressive: true
              }
          },
          cacheConfig: {
              messageCacheTTL: 10000,
              messageLockTTL: 5000
          },
          lastUpdated: new Date().toISOString()
      };
  }

  /**
   * GET /api/config/languages
   * Get supported languages and current language
   */
  router.get('/languages', async (req, res) => {
      try {
          const configManager = getConfigManager();
          
          if (!configManager || typeof configManager.getSupportedLanguages !== 'function') {
              // Fallback response
              const fallbackResponse = {
                  languages: ['TH', 'EN', 'JP', 'CN', 'KR'],
                  current: 'TH',
                  available: ['TH'],
                  timestamp: Date.now()
              };
              
              logger.warn('ConfigManager not available, using fallback response');
              return res.json({
                  success: true,
                  ...fallbackResponse
              });
          }
          
          const languageInfo = configManager.getSupportedLanguages();
          res.json({
              success: true,
              ...languageInfo,
              timestamp: Date.now()
          });
      } catch (error) {
          logger.error('Error getting language information:', error);
          res.status(500).json({
              success: false,
              error: 'Error getting language information',
              details: error.message
          });
      }
  });

  /**
   * POST /api/config/language
   * Set current language
   */
  router.post('/language', async (req, res) => {
      try {
          const { language, userText } = req.body;
          const configManager = getConfigManager();
          
          if (!configManager || typeof configManager.setLanguage !== 'function') {
              return res.status(500).json({
                  success: false,
                  error: 'ConfigManager not available'
              });
          }
          
          const success = configManager.setLanguage(language, userText);
          if (success) {
              await configManager.reloadSettings();
              
              res.json({
                  success: true,
                  language: configManager.currentLanguage,
                  templateConfig: configManager.getTemplateConfig(),
                  timestamp: Date.now()
              });
          } else {
              res.status(400).json({
                  success: false,
                  error: 'Failed to set language'
              });
          }
      } catch (error) {
          logger.error('Error setting language:', error);
          res.status(500).json({
              success: false,
              error: 'Error setting language',
              details: error.message
          });
      }
  });

  /**
   * POST /api/config/language/detect
   * Detect language from text
   */
  router.post('/language/detect', (req, res) => {
      try {
          const { text } = req.body;
          
          if (!text) {
              return res.status(400).json({
                  success: false,
                  error: 'Text is required for language detection'
              });
          }
          
          const configManager = getConfigManager();
          
          if (!configManager || typeof configManager.detectLanguage !== 'function') {
              // Simple fallback detection
              let detectedLanguage = 'TH';
              if (/[\u0E00-\u0E7F]/.test(text)) {
                  detectedLanguage = 'TH';
              } else if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) {
                  detectedLanguage = 'JP';
              } else if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(text)) {
                  detectedLanguage = 'KR';
              } else if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text)) {
                  detectedLanguage = 'CN';
              } else if (/^[a-zA-Z\s.,!?]+$/.test(text.trim())) {
                  detectedLanguage = 'EN';
              }
              
              return res.json({
                  success: true,
                  detectedLanguage: detectedLanguage,
                  currentLanguage: 'TH',
                  confidence: 'medium',
                  timestamp: Date.now()
              });
          }
          
          const detectedLanguage = configManager.detectLanguage(text);
          
          res.json({
              success: true,
              detectedLanguage: detectedLanguage,
              currentLanguage: configManager.currentLanguage,
              confidence: detectedLanguage === configManager.currentLanguage ? 'high' : 'medium',
              timestamp: Date.now()
          });
      } catch (error) {
          logger.error('Error detecting language:', error);
          res.status(500).json({
              success: false,
              error: 'Error detecting language',
              details: error.message
          });
      }
  });

  /**
   * GET /api/config/language/:lang
   * Get configuration for specific language
   */
  router.get('/language/:lang', async (req, res) => {
      try {
          const { lang } = req.params;
          const configManager = getConfigManager();
          
          const supportedLanguages = ['TH', 'EN', 'JP', 'CN', 'KR'];
          if (!supportedLanguages.includes(lang.toUpperCase())) {
              return res.status(400).json({
                  success: false,
                  error: 'Unsupported language',
                  supportedLanguages: supportedLanguages
              });
          }
          
          if (!configManager || typeof configManager.loadLanguageSettings !== 'function') {
              // Return default settings for the language
              const defaultSettings = getDefaultSettings();
              defaultSettings.language = lang.toUpperCase();
              
              return res.json({
                  success: true,
                  language: lang.toUpperCase(),
                  settings: defaultSettings,
                  timestamp: Date.now()
              });
          }
          
          const settings = await configManager.loadLanguageSettings(lang.toUpperCase());
          
          res.json({
              success: true,
              language: lang.toUpperCase(),
              settings: settings,
              timestamp: Date.now()
          });
      } catch (error) {
          logger.error(`Error getting settings for language ${req.params.lang}:`, error);
          res.status(500).json({
              success: false,
              error: 'Error getting language settings',
              details: error.message
          });
      }
  });

  /**
   * POST /api/config/language/:lang
   * Update configuration for specific language
   */
  router.post('/language/:lang', async (req, res) => {
      try {
          const { lang } = req.params;
          const settings = req.body;
          const configManager = getConfigManager();
          
          const supportedLanguages = ['TH', 'EN', 'JP', 'CN', 'KR'];
          if (!supportedLanguages.includes(lang.toUpperCase())) {
              return res.status(400).json({
                  success: false,
                  error: 'Unsupported language',
                  supportedLanguages: supportedLanguages
              });
          }
          
          if (!configManager || typeof configManager.saveLanguageSettings !== 'function') {
              // Fallback: save to regular settings file
              try {
                  const languageSettingsPath = path.join(__dirname, 'data', `settings-${lang.toUpperCase()}.json`);
                  await fs.mkdir(path.dirname(languageSettingsPath), { recursive: true });
                  await fs.writeFile(languageSettingsPath, JSON.stringify(settings, null, 2), 'utf8');
                  
                  return res.json({
                      success: true,
                      language: lang.toUpperCase(),
                      message: 'Language settings updated successfully (fallback mode)',
                      timestamp: Date.now()
                  });
              } catch (fallbackError) {
                  return res.status(500).json({
                      success: false,
                      error: 'Failed to save language settings',
                      details: fallbackError.message
                  });
              }
          }
          
          const success = await configManager.saveLanguageSettings(settings, lang.toUpperCase());
          
          if (success) {
              // If updating current language, reload settings
              if (lang.toUpperCase() === configManager.currentLanguage) {
                  await configManager.reloadSettings();
              }
              
              res.json({
                  success: true,
                  language: lang.toUpperCase(),
                  message: 'Language settings updated successfully',
                  timestamp: Date.now()
              });
          } else {
              res.status(500).json({
                  success: false,
                  error: 'Failed to save language settings'
              });
          }
      } catch (error) {
          logger.error(`Error updating settings for language ${req.params.lang}:`, error);
          res.status(500).json({
              success: false,
              error: 'Error updating language settings',
              details: error.message
          });
      }
  });

  /**
   * POST /api/config/languages/initialize
   * Initialize all language settings files
   */
  router.post('/languages/initialize', async (req, res) => {
      try {
          const configManager = getConfigManager();
          
          if (!configManager || typeof configManager.initializeAllLanguageSettings !== 'function') {
              // Fallback initialization
              const supportedLanguages = ['TH', 'EN', 'JP', 'CN', 'KR'];
              const results = {};
              
              for (const lang of supportedLanguages) {
                  try {
                      const languageSettingsPath = path.join(__dirname, 'data', `settings-${lang}.json`);
                      
                      // Check if file exists
                      try {
                          await fs.access(languageSettingsPath);
                          results[lang] = 'exists';
                      } catch {
                          // Create default settings
                          const defaultSettings = getDefaultSettings();
                          defaultSettings.language = lang;
                          
                          await fs.mkdir(path.dirname(languageSettingsPath), { recursive: true });
                          await fs.writeFile(languageSettingsPath, JSON.stringify(defaultSettings, null, 2), 'utf8');
                          results[lang] = 'created';
                      }
                  } catch (error) {
                      logger.error(`Error initializing settings for ${lang}:`, error);
                      results[lang] = 'error';
                  }
              }
              
              return res.json({
                  success: true,
                  message: 'Language settings initialization completed (fallback mode)',
                  results: results,
                  timestamp: Date.now()
              });
          }
          
          const results = await configManager.initializeAllLanguageSettings();
          
          res.json({
              success: true,
              message: 'Language settings initialization completed',
              results: results,
              timestamp: Date.now()
          });
      } catch (error) {
          logger.error('Error initializing language settings:', error);
          res.status(500).json({
              success: false,
              error: 'Error initializing language settings',
              details: error.message
          });
      }
  });

  /**
   * GET /api/config/ai
   * Retrieve current AI configuration
   */
  router.get('/ai', async (req, res) => {
      try {
          let settings;
          try {
              settings = await readSettings();
          } catch (error) {
              // Create default settings if file doesn't exist
              settings = getDefaultSettings();
              await writeSettings(settings);
          }

          res.json({ 
              success: true, 
              config: settings,
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

  /**
   * POST /api/config/ai
   * Update all AI configuration settings
   */
  router.post('/ai', async (req, res) => {
      try {
          const newConfig = req.body;
          
          if (!newConfig) {
              return res.status(400).json({
                  success: false,
                  error: 'Config object is required'
              });
          }
          
          // Update settings file
          newConfig.lastUpdated = new Date().toISOString();
          await writeSettings(newConfig);
          
          // Update AI assistant template config if needed
          if (newConfig.templateConfig && aiAssistant) {
              if (aiAssistant.configManager && typeof aiAssistant.configManager.updateTemplateConfig === 'function') {
                  await aiAssistant.configManager.updateTemplateConfig(newConfig.templateConfig);
              } else if (aiAssistant.templateConfig) {
                  aiAssistant.templateConfig = newConfig.templateConfig;
              }
          }

          // Update AI assistant generation config if needed
          if (newConfig.generationConfig && aiAssistant) {
              if (aiAssistant.configManager) {
                  aiAssistant.configManager.generationConfig = { ...aiAssistant.configManager.generationConfig, ...newConfig.generationConfig };
              } else {
                  // Initialize generationConfig if it doesn't exist
                  if (!aiAssistant.generationConfig) {
                      aiAssistant.generationConfig = {};
                  }
                  Object.assign(aiAssistant.generationConfig, newConfig.generationConfig);
              }
          }

          // Update AI assistant model config if needed
          if (newConfig.modelName && aiAssistant) {
              if (aiAssistant.configManager) {
                  aiAssistant.configManager.MODEL_NAME = newConfig.modelName;
              } else {
                  aiAssistant.MODEL_NAME = newConfig.modelName;
              }
          }
          if (newConfig.apiVersion && aiAssistant) {
              if (aiAssistant.configManager) {
                  aiAssistant.configManager.API_VERSION = newConfig.apiVersion;
              } else {
                  aiAssistant.API_VERSION = newConfig.apiVersion;
              }
          }
          
          // Update other components if needed
          if (messageHandler && newConfig.messageConfig) {
              try {
                  if (typeof messageHandler.updateConfiguration === 'function') {
                      messageHandler.updateConfiguration({
                          maxLength: newConfig.messageConfig.maxLength,
                          delayTime: newConfig.messageConfig.delayTime,
                          retryAttempts: newConfig.messageConfig.retryAttempts,
                          retryDelay: newConfig.messageConfig.retryDelay
                      });
                  }
              } catch (error) {
                  logger.warn('Error updating message handler:', error.message);
              }
          }
          
          res.json({
              success: true,
              config: newConfig,
              timestamp: Date.now()
          });
          
      } catch (error) {
          logger.error('Error updating configuration:', error);
          res.status(500).json({
              success: false,
              error: 'Error updating configuration',
              details: error.message
          });
      }
  });

  /**
   * GET /api/config/ai/templates
   * Retrieve current template configuration
   */
  router.get('/ai/templates', async (req, res) => {
      try {
          const settings = await readSettings();
          const templateConfig = settings.templateConfig || getDefaultSettings().templateConfig;

          res.json({
              success: true,
              config: templateConfig,
              timestamp: Date.now()
          });
      } catch (error) {
          logger.error('Error getting template configuration:', error);
          res.status(500).json({
              success: false,
              error: 'Error getting template configuration',
              details: error.message
          });
      }
  });

  /**
   * POST /api/config/ai/templates
   * Update template configuration
   */
  router.post('/ai/templates', async (req, res) => {
      try {
          const { conversation } = req.body;

          // Validate required fields
          if (!conversation) {
              return res.status(400).json({
                  success: false,
                  error: 'Conversation configuration is required'
              });
          }

          // Validate required conversation fields
          const requiredFields = ['personality', 'greeting', 'closing', 'guidelines'];
          const missingFields = requiredFields.filter(field => !conversation[field]);
          
          if (missingFields.length > 0) {
              return res.status(400).json({
                  success: false,
                  error: `Missing required fields: ${missingFields.join(', ')}`
              });
          }

          // Validate guidelines array
          if (!Array.isArray(conversation.guidelines)) {
              return res.status(400).json({
                  success: false,
                  error: 'Guidelines must be an array'
              });
          }

          const updatedTemplateConfig = {
              conversation: {
                  personality: conversation.personality.trim(),
                  greeting: conversation.greeting.trim(),
                  closing: conversation.closing.trim(),
                  guidelines: conversation.guidelines
                      .map(guideline => guideline.trim())
                      .filter(guideline => guideline.length > 0)
              }
          };

          // Update AI assistant template config
          if (aiAssistant) {
              if (aiAssistant.configManager && typeof aiAssistant.configManager.updateTemplateConfig === 'function') {
                  await aiAssistant.configManager.updateTemplateConfig(updatedTemplateConfig);
              } else if (aiAssistant.templateConfig) {
                  aiAssistant.templateConfig = updatedTemplateConfig;
              }
          }

          // Update settings file
          const settings = await readSettings();
          settings.templateConfig = updatedTemplateConfig;
          settings.lastUpdated = new Date().toISOString();
          await writeSettings(settings);

          res.json({
              success: true,
              config: updatedTemplateConfig,
              timestamp: Date.now()
          });

      } catch (error) {
          logger.error('Error updating template configuration:', error);
          res.status(500).json({
              success: false,
              error: 'Error updating template configuration',
              details: error.message
          });
      }
  });



  /**
 * GET /api/config/ai/models
 * Get available Google AI models
 */
router.get('/ai/models', async (req, res) => {
    try {
        const configManager = getConfigManager();
        
        if (!configManager) {
            logger.warn('ConfigManager not available for getting models');
            return res.status(500).json({
                success: false,
                error: 'ConfigManager not available'
            });
        }
        
        let models = [];
        let currentModel = 'unknown';
        
        // Try to get models
        if (typeof configManager.getAvailableModels === 'function') {
            try {
                models = await configManager.getAvailableModels();
                logger.info(`Retrieved ${models.length} available models`);
            } catch (modelsError) {
                logger.error('Error getting available models:', modelsError);
            }
        }
        
        // Get current model
        if (configManager.MODEL_NAME) {
            currentModel = configManager.MODEL_NAME;
        } else if (aiAssistant && aiAssistant.configManager && aiAssistant.configManager.MODEL_NAME) {
            currentModel = aiAssistant.configManager.MODEL_NAME;
        }
        
        // If no models retrieved, try fallback
        if (models.length === 0) {
            logger.warn('No models retrieved, using fallback');
            try {
                if (aiAssistant && aiAssistant.googleAIModelsService) {
                    models = await aiAssistant.googleAIModelsService.getAvailableModels(process.env.GEMINI_API_KEY);
                } else {
                    // Hard-coded fallback
                    models = [
                        {
                            name: 'gemini-2.5-pro',
                            displayName: 'Gemini 1.5 Pro',
                            description: 'Most capable model for complex reasoning tasks',
                            version: '1.5',
                            inputTokenLimit: 2097152,
                            outputTokenLimit: 8192,
                            supportedMethods: ['generateContent'],
                            apiVersion: 'v1',
                            useDirectUrl: true,
                            category: 'Professional',
                            recommended: true
                        },
                        {
                            name: 'gemini-pro',
                            displayName: 'Gemini Pro',
                            description: 'High-performance model for diverse tasks',
                            version: '1.0',
                            inputTokenLimit: 32768,
                            outputTokenLimit: 8192,
                            supportedMethods: ['generateContent'],
                            apiVersion: 'v1',
                            useDirectUrl: false,
                            category: 'Professional',
                            recommended: true
                        }
                    ];
                }
            } catch (fallbackError) {
                logger.error('Fallback models retrieval failed:', fallbackError);
            }
        }
        
        res.json({
            success: true,
            models: models,
            current: currentModel,
            count: models.length,
            timestamp: Date.now()
        });
        
    } catch (error) {
        logger.error('Error getting available models:', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({
            success: false,
            error: 'Error getting available models',
            details: error.message
        });
    }
});

/**
 * POST /api/config/ai/models/refresh
 * Refresh models cache
 */
router.post('/ai/models/refresh', async (req, res) => {
    try {
        const configManager = getConfigManager();
        
        if (!configManager) {
            logger.warn('ConfigManager not available for models refresh');
            return res.status(500).json({
                success: false,
                error: 'ConfigManager not available'
            });
        }
        
        // Clear models cache if method exists
        if (typeof configManager.clearModelsCache === 'function') {
            configManager.clearModelsCache();
            logger.info('Models cache cleared successfully');
        }
        
        // Get fresh models list
        let models = [];
        if (typeof configManager.getAvailableModels === 'function') {
            try {
                models = await configManager.getAvailableModels();
                logger.info(`Successfully refreshed ${models.length} models`);
            } catch (modelsError) {
                logger.error('Error getting available models after cache clear:', modelsError);
                // Don't throw here, continue with empty array or fallback
            }
        }
        
        // If no models or error, try to get fallback models
        if (models.length === 0) {
            logger.warn('No models retrieved, attempting fallback');
            try {
                // Try to get GoogleAIModelsService directly from aiAssistant
                if (aiAssistant && aiAssistant.googleAIModelsService) {
                    aiAssistant.googleAIModelsService.clearCache();
                    models = await aiAssistant.googleAIModelsService.getAvailableModels(process.env.GEMINI_API_KEY);
                } else if (aiAssistant && aiAssistant.configManager && aiAssistant.configManager.googleAIModelsService) {
                    aiAssistant.configManager.googleAIModelsService.clearCache();
                    models = await aiAssistant.configManager.googleAIModelsService.getAvailableModels(process.env.GEMINI_API_KEY);
                }
            } catch (fallbackError) {
                logger.error('Fallback models retrieval failed:', fallbackError);
            }
        }
        
        res.json({
            success: true,
            message: 'Models cache refreshed successfully',
            models: models,
            count: models.length,
            timestamp: Date.now()
        });
        
    } catch (error) {
        logger.error('Error refreshing models cache:', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({
            success: false,
            error: 'Error refreshing models cache',
            details: error.message
        });
    }
});


  /**
   * POST /api/config/ai/model
   * Update AI model configuration
   */
  router.post('/ai/model', async (req, res) => {
    try {
        const { modelName } = req.body;
        const configManager = getConfigManager();
        
        if (!modelName) {
            return res.status(400).json({ 
                success: false, 
                error: 'Model name is required' 
            });
        }

        if (!configManager || typeof configManager.updateModelDetails !== 'function') {
            return res.status(500).json({
                success: false,
                error: 'ConfigManager not available'
            });
        }

        // Use the improved updateModelDetails method
        const updateResult = await configManager.updateModelDetails(modelName);
        
        if (!updateResult.success) {
            return res.status(400).json({
                success: false,
                error: updateResult.error
            });
        }

        // Update AI assistant if available
        if (aiAssistant) {
            if (aiAssistant.configManager) {
                aiAssistant.configManager.MODEL_NAME = modelName;
                aiAssistant.configManager.API_VERSION = updateResult.config.apiVersion;
                aiAssistant.configManager.USE_DIRECT_URL = updateResult.config.useDirectUrl;
                aiAssistant.configManager.MODEL_URL = updateResult.config.modelUrl;
            } else {
                aiAssistant.MODEL_NAME = modelName;
                aiAssistant.API_VERSION = updateResult.config.apiVersion;
                aiAssistant.USE_DIRECT_URL = updateResult.config.useDirectUrl;
                aiAssistant.MODEL_URL = updateResult.config.modelUrl;
            }
            
            // Reinitialize if method exists
            if (typeof aiAssistant.initialize === 'function') {
                await aiAssistant.initialize();
            }
        }

        // Update settings file
        const settings = await readSettings();
        settings.modelName = modelName;
        settings.apiVersion = updateResult.config.apiVersion;
        settings.modelUrl = updateResult.config.modelUrl;
        settings.useDirectUrl = updateResult.config.useDirectUrl;
        settings.lastUpdated = new Date().toISOString();
        await writeSettings(settings);

        res.json({ 
            success: true,
            modelName: modelName,
            config: updateResult.config,
            modelInfo: updateResult.modelInfo,
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Error updating model:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});
router.get('/ai/model/:modelName/info', async (req, res) => {
    try {
        const { modelName } = req.params;
        const configManager = getConfigManager();
        
        if (!configManager || typeof configManager.validateModelName !== 'function') {
            return res.status(500).json({
                success: false,
                error: 'ConfigManager not available'
            });
        }
        
        const modelInfo = await configManager.validateModelName(modelName);
        
        if (!modelInfo) {
            return res.status(404).json({
                success: false,
                error: `Model ${modelName} not found or not available`
            });
        }
        
        res.json({
            success: true,
            modelInfo: modelInfo,
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error(`Error getting model info for ${req.params.modelName}:`, error);
        res.status(500).json({
            success: false,
            error: 'Error getting model information',
            details: error.message
        });
    }
});

router.post('/ai/model/validate', async (req, res) => {
    try {
        const { modelName } = req.body;
        const configManager = getConfigManager();
        
        if (!modelName) {
            return res.status(400).json({
                success: false,
                error: 'Model name is required'
            });
        }
        
        if (!configManager || typeof configManager.validateModelName !== 'function') {
            return res.status(500).json({
                success: false,
                error: 'ConfigManager not available'
            });
        }
        
        const modelInfo = await configManager.validateModelName(modelName);
        
        res.json({
            success: true,
            valid: !!modelInfo,
            modelInfo: modelInfo || null,
            message: modelInfo ? 'Model is available and compatible' : 'Model not found or incompatible',
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Error validating model:', error);
        res.status(500).json({
            success: false,
            error: 'Error validating model',
            details: error.message
        });
    }
});
  /**
   * POST /api/config/ai/generation
   * Update AI generation parameters
   */
  router.post('/ai/generation', async (req, res) => {
      try {
          const { temperature, topK, topP, maxOutputTokens } = req.body;
          
          const settings = await readSettings();
          
          // Initialize generationConfig in settings if it doesn't exist
          if (!settings.generationConfig) {
              settings.generationConfig = {};
          }
          
          // Validate and update temperature
          if (temperature !== undefined) {
              if (temperature < 0 || temperature > 1) {
                  return res.status(400).json({
                      success: false,
                      error: 'Temperature must be between 0 and 1'
                  });
              }
              settings.generationConfig.temperature = temperature;
              
              if (aiAssistant && aiAssistant.configManager) {
                  aiAssistant.configManager.generationConfig.temperature = temperature;
              } else if (aiAssistant) {
                  if (!aiAssistant.generationConfig) aiAssistant.generationConfig = {};
                  aiAssistant.generationConfig.temperature = temperature;
              }
          }

          // Validate and update topK
          if (topK !== undefined) {
              if (topK < 1) {
                  return res.status(400).json({
                      success: false,
                      error: 'TopK must be greater than 0'
                  });
              }
              settings.generationConfig.topK = topK;
              
              if (aiAssistant && aiAssistant.configManager) {
                  aiAssistant.configManager.generationConfig.topK = topK;
              } else if (aiAssistant) {
                  if (!aiAssistant.generationConfig) aiAssistant.generationConfig = {};
                  aiAssistant.generationConfig.topK = topK;
              }
          }

          // Validate and update topP
          if (topP !== undefined) {
              if (topP < 0 || topP > 1) {
                  return res.status(400).json({
                      success: false,
                      error: 'TopP must be between 0 and 1'
                  });
              }
              settings.generationConfig.topP = topP;
              
              if (aiAssistant && aiAssistant.configManager) {
                  aiAssistant.configManager.generationConfig.topP = topP;
              } else if (aiAssistant) {
                  if (!aiAssistant.generationConfig) aiAssistant.generationConfig = {};
                  aiAssistant.generationConfig.topP = topP;
              }
          }

          // Validate and update maxOutputTokens
          if (maxOutputTokens !== undefined) {
              if (maxOutputTokens < 1) {
                  return res.status(400).json({
                      success: false,
                      error: 'MaxOutputTokens must be greater than 0'
                  });
              }
              settings.generationConfig.maxOutputTokens = maxOutputTokens;
              
              if (aiAssistant && aiAssistant.configManager) {
                  aiAssistant.configManager.generationConfig.maxOutputTokens = maxOutputTokens;
              } else if (aiAssistant) {
                  if (!aiAssistant.generationConfig) aiAssistant.generationConfig = {};
                  aiAssistant.generationConfig.maxOutputTokens = maxOutputTokens;
              }
          }

          settings.lastUpdated = new Date().toISOString();
          await writeSettings(settings);

          res.json({ 
              success: true, 
              config: settings.generationConfig,
              timestamp: Date.now()
          });

      } catch (error) {
          logger.error('Error updating generation config:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

  /**
   * GET /api/config/validate
   * Validate current configuration
   */
  router.get('/validate', async (req, res) => {
      try {
          const { language } = req.query;
          const configManager = getConfigManager();
          
          if (configManager && typeof configManager.validateConfiguration === 'function') {
              const validation = await configManager.validateConfiguration(language);
              return res.json({
                  success: true,
                  ...validation
              });
          }
          
          // Fallback validation
          const settings = await readSettings();
          const errors = [];
          const warnings = [];

          // Validate generation config
          if (settings.generationConfig) {
              if (settings.generationConfig.temperature < 0 || settings.generationConfig.temperature > 1) {
                  errors.push('Temperature must be between 0 and 1');
              }
              if (settings.generationConfig.topP < 0 || settings.generationConfig.topP > 1) {
                  errors.push('TopP must be between 0 and 1');
              }
              if (settings.generationConfig.topK < 1) {
                  errors.push('TopK must be greater than 0');
              }
              if (settings.generationConfig.maxOutputTokens < 1) {
                 errors.push('MaxOutputTokens must be greater than 0');
             }
             if (settings.generationConfig.maxOutputTokens > 8192) {
                 warnings.push('MaxOutputTokens is very high, may impact performance');
             }
         }

         // Validate template config
         if (settings.templateConfig && settings.templateConfig.conversation) {
             const conv = settings.templateConfig.conversation;
             if (!conv.personality || conv.personality.trim().length === 0) {
                 errors.push('Personality description is required');
             }
             if (!conv.greeting || conv.greeting.trim().length === 0) {
                 warnings.push('Greeting message is empty');
             }
             if (!conv.closing || conv.closing.trim().length === 0) {
                 warnings.push('Closing message is empty');
             }
             if (!Array.isArray(conv.guidelines) || conv.guidelines.length === 0) {
                 warnings.push('No guidelines configured');
             }
         }

         // Validate model config
         const allowedModels = [
             "gemini-2.5-pro",
             "gemini-2.0-flash",
             "gemini-2.5-pro", 
             "gemini-pro", 
             "gemini-1.0-pro"
         ];
         
         if (settings.modelName && !allowedModels.includes(settings.modelName)) {
             errors.push(`Invalid model name: ${settings.modelName}`);
         }

         // Validate message config
         if (settings.messageConfig) {
             if (settings.messageConfig.maxLength > 10000) {
                 warnings.push('Message max length is very high');
             }
             if (settings.messageConfig.retryAttempts > 5) {
                 warnings.push('High retry attempts may impact performance');
             }
         }

         const isValid = errors.length === 0;

         res.json({
             success: true,
             valid: isValid,
             errors: errors,
             warnings: warnings,
             summary: {
                 totalErrors: errors.length,
                 totalWarnings: warnings.length,
                 status: isValid ? 'valid' : 'invalid'
             },
             timestamp: Date.now()
         });
     } catch (error) {
         logger.error('Error validating configuration:', error);
         res.status(500).json({
             success: false,
             error: 'Error validating configuration',
             details: error.message
         });
     }
 });

 /**
  * POST /api/config/reset
  * Reset all configuration to defaults
  */
 router.post('/reset', async (req, res) => {
     try {
         const defaultSettings = getDefaultSettings();
         await writeSettings(defaultSettings);

         // Update AI assistant with default values
         if (aiAssistant) {
             if (aiAssistant.configManager && typeof aiAssistant.configManager.resetConfiguration === 'function') {
                 await aiAssistant.configManager.resetConfiguration();
             } else {
                 if (defaultSettings.templateConfig) {
                     aiAssistant.templateConfig = defaultSettings.templateConfig;
                 }

                 if (defaultSettings.generationConfig) {
                     if (!aiAssistant.generationConfig) {
                         aiAssistant.generationConfig = {};
                     }
                     Object.assign(aiAssistant.generationConfig, defaultSettings.generationConfig);
                 }

                 if (defaultSettings.modelName) {
                     aiAssistant.MODEL_NAME = defaultSettings.modelName;
                 }
                 
                 if (defaultSettings.apiVersion) {
                     aiAssistant.API_VERSION = defaultSettings.apiVersion;
                 }
             }
         }

         res.json({
             success: true,
             message: 'Configuration reset to defaults successfully',
             config: defaultSettings,
             timestamp: Date.now()
         });
     } catch (error) {
         logger.error('Error resetting configuration:', error);
         res.status(500).json({
             success: false,
             error: 'Error resetting configuration',
             details: error.message
         });
     }
 });

 /**
  * GET /api/config/backup
  * Create a backup of current configuration
  */
 router.get('/backup', async (req, res) => {
     try {
         const settings = await readSettings();
         const backupFilename = `settings_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
         
         res.setHeader('Content-Disposition', `attachment; filename="${backupFilename}"`);
         res.setHeader('Content-Type', 'application/json');
         res.json({
             success: true,
             backup: settings,
             created: new Date().toISOString(),
             version: '1.0'
         });
     } catch (error) {
         logger.error('Error creating configuration backup:', error);
         res.status(500).json({
             success: false,
             error: 'Error creating configuration backup',
             details: error.message
         });
     }
 });

 /**
  * POST /api/config/restore
  * Restore configuration from backup
  */
 router.post('/restore', async (req, res) => {
     try {
         const { backup } = req.body;
         
         if (!backup) {
             return res.status(400).json({
                 success: false,
                 error: 'Backup data is required'
             });
         }

         // Validate backup structure
         const requiredFields = ['templateConfig', 'generationConfig'];
         const missingFields = requiredFields.filter(field => !backup[field]);
         
         if (missingFields.length > 0) {
             return res.status(400).json({
                 success: false,
                 error: `Invalid backup: missing ${missingFields.join(', ')}`
             });
         }

         // Update timestamp
         backup.lastUpdated = new Date().toISOString();
         
         // Write restored settings
         await writeSettings(backup);

         // Update AI assistant with restored values
         if (aiAssistant) {
             if (backup.templateConfig) {
                 if (aiAssistant.configManager && typeof aiAssistant.configManager.updateTemplateConfig === 'function') {
                     await aiAssistant.configManager.updateTemplateConfig(backup.templateConfig);
                 } else {
                     aiAssistant.templateConfig = backup.templateConfig;
                 }
             }

             if (backup.generationConfig) {
                 if (aiAssistant.configManager) {
                     aiAssistant.configManager.generationConfig = { ...aiAssistant.configManager.generationConfig, ...backup.generationConfig };
                 } else {
                     if (!aiAssistant.generationConfig) {
                         aiAssistant.generationConfig = {};
                     }
                     Object.assign(aiAssistant.generationConfig, backup.generationConfig);
                 }
             }

             if (backup.modelName) {
                 if (aiAssistant.configManager) {
                     aiAssistant.configManager.MODEL_NAME = backup.modelName;
                 } else {
                     aiAssistant.MODEL_NAME = backup.modelName;
                 }
             }
             
             if (backup.apiVersion) {
                 if (aiAssistant.configManager) {
                     aiAssistant.configManager.API_VERSION = backup.apiVersion;
                 } else {
                     aiAssistant.API_VERSION = backup.apiVersion;
                 }
             }

             // Reinitialize AI assistant if method exists
             if (typeof aiAssistant.initialize === 'function') {
                 await aiAssistant.initialize();
             }
         }

         res.json({
             success: true,
             message: 'Configuration restored successfully',
             config: backup,
             timestamp: Date.now()
         });
     } catch (error) {
         logger.error('Error restoring configuration:', error);
         res.status(500).json({
             success: false,
             error: 'Error restoring configuration',
             details: error.message
         });
     }
 });

 /**
  * GET /api/config/export
  * Export configuration in various formats
  */
 router.get('/export', async (req, res) => {
     try {
         const { format = 'json' } = req.query;
         const settings = await readSettings();
         
         const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
         
         switch (format.toLowerCase()) {
             case 'json':
                 res.setHeader('Content-Disposition', `attachment; filename="ai_config_${timestamp}.json"`);
                 res.setHeader('Content-Type', 'application/json');
                 res.json({
                     exportedAt: new Date().toISOString(),
                     version: '1.0',
                     settings: settings
                 });
                 break;
                 
             case 'yaml':
                 const yaml = require('js-yaml');
                 const yamlContent = yaml.dump({
                     exportedAt: new Date().toISOString(),
                     version: '1.0',
                     settings: settings
                 });
                 res.setHeader('Content-Disposition', `attachment; filename="ai_config_${timestamp}.yaml"`);
                 res.setHeader('Content-Type', 'application/x-yaml');
                 res.send(yamlContent);
                 break;
                 
             default:
                 res.status(400).json({
                     success: false,
                     error: 'Unsupported format. Use json or yaml.'
                 });
         }
     } catch (error) {
         logger.error('Error exporting configuration:', error);
         res.status(500).json({
             success: false,
             error: 'Error exporting configuration',
             details: error.message
         });
     }
 });

 return router;
};