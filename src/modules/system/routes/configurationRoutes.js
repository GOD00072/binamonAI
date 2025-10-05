// routes/configurationRoutes.js
'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

module.exports = function(aiAssistant, knowledgeRAG, logger) {
    // Configuration file path
    const configPath = path.join(__dirname, 'data', 'system-config.json');

    // ============= HELPER FUNCTIONS =============
    
    async function loadSystemConfig() {
        try {
            const data = await fs.readFile(configPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            // Return default config if file doesn't exist
            return getDefaultSystemConfig();
        }
    }

    async function saveSystemConfig(config) {
        try {
            await fs.mkdir(path.dirname(configPath), { recursive: true });
            await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
            return true;
        } catch (error) {
            logger.error('Error saving system config:', error);
            return false;
        }
    }

    function getDefaultSystemConfig() {
        return {
            productSearch: {
                topResults: 7,
                contextWindow: 15,
                relevanceThreshold: 0.03,
                embeddingBoostFactor: 2.0,
                scoreThresholds: {
                    minimum: 15,
                    followup: 20,
                    dimension: 15,
                    material: 12,
                    type: 15,
                    sharedNumbers: 15,
                    stockAvailable: 10,
                    stockUnavailable: -10,
                    historicalInterest: 50
                },
                searchMethods: {
                    vectorSearchEnabled: true,
                    keywordSearchEnabled: true,
                    directoryFallbackEnabled: true,
                    crossLanguageSearch: false
                },
                caching: {
                    contextCacheTTL: 1800,
                    userStateCacheTTL: 3600,
                    productCacheTTL: 3600
                },
                cleanup: {
                    expiredContextInterval: 3600000,
                    contextExpirationTime: 1800000
                }
            },
            multiLanguage: {
                supportedLanguages: ['TH', 'EN', 'JP', 'CN', 'KR'],
                defaultLanguage: 'TH',
                autoDetection: {
                    enabled: true,
                    minTextLength: 3,
                    confidenceThreshold: 0.35,
                    cacheTimeout: 3000,
                    lockAfterFirstDetection: true
                },
                languageSpecific: {
                    TH: {
                        chunkSize: 2000,
                        chunkOverlap: 200,
                        embeddingModel: 'text-embedding-3-large',
                        namespace: 'knowledge-th'
                    },
                    EN: {
                        chunkSize: 2000,
                        chunkOverlap: 200,
                        embeddingModel: 'text-embedding-3-large',
                        namespace: 'knowledge-en'
                    },
                    JP: {
                        chunkSize: 1500,
                        chunkOverlap: 150,
                        embeddingModel: 'text-embedding-3-large',
                        namespace: 'knowledge-jp'
                    },
                    CN: {
                        chunkSize: 1500,
                        chunkOverlap: 150,
                        embeddingModel: 'text-embedding-3-large',
                        namespace: 'knowledge-cn'
                    },
                    KR: {
                        chunkSize: 1800,
                        chunkOverlap: 180,
                        embeddingModel: 'text-embedding-3-large',
                        namespace: 'knowledge-kr'
                    }
                }
            },
            intentDetection: {
                enabled: true,
                keywords: {
                    price: ['ราคา', 'กี่บาท', 'แพง', 'ถูก', 'ลด', 'โปรโมชั่น', 'บาท', 'ราคาเท่าไหร่', 'เท่าไร'],
                    availability: ['มีของ', 'สต็อก', 'พร้อมส่ง', 'ของหมด', 'สั่งได้', 'เหลือ', 'มีกี่', 'คงเหลือ', 'เหลือเท่าไหร่'],
                    delivery: ['ส่ง', 'จัดส่ง', 'เวลาส่ง', 'ค่าส่ง', 'ขนส่ง', 'รับของ', 'ส่งไปที่'],
                    specification: ['สเปค', 'ขนาด', 'รายละเอียด', 'วัสดุ', 'น้ำหนัก', 'ml', 'มล', 'รูปทรง', 'มิติ'],
                    material: ['กระดาษ', 'พลาสติก', 'ลูกฟูก', 'เคลือบ', 'pe', 'แกรม']
                },
                productAttributes: {
                    dimensions: ['ml', 'oz', 'ออนซ์', 'มล', 'ลิตร', 'L', 'cm', 'ซม', 'นิ้ว', 'กิโล', 'kg', 'มม'],
                    materials: ['กระดาษ', 'พลาสติก', 'ไบโอ', 'bio', 'paper', 'plastic', 'PET', 'PP', 'PE', 'ลูกฟูก', 'คราฟท์', 'ขาว'],
                    types: ['แก้ว', 'กล่อง', 'ถ้วย', 'จาน', 'ช้อน', 'ส้อม', 'มีด', 'ฝา', 'ถุง', 'ถาด', 'ไดคัท', 'ใส่อาหาร'],
                    categories: ['ร้อน', 'เย็น', 'แช่แข็ง', 'อาหาร', 'เครื่องดื่ม', 'ของหวาน', 'ซอส', 'ทะเล', 'ไก่ทอด']
                }
            },
            knowledgeScore: {
                enabled: true,
                thresholds: {
                    high: 0.8,
                    medium: 0.5,
                    low: 0.2
                },
                weights: {
                    relevance: 0.7,
                    confidence: 0.3
                }
            },
            languageDetection: {
                enabled: true,
                minTextLength: 3,
                englishConfidenceThreshold: 0.35,
                minEnglishWordsRatio: 0.15,
                minEnglishWords: 1,
                cacheTimeout: 3000,
                lockAfterFirstDetection: true,
                supportedLanguages: ['TH', 'EN', 'JP', 'CN', 'KR'],
                defaultLanguage: 'TH'
            },
            knowledgeRAG: {
                enabled: true,
                pinecone: {
                    indexName: process.env.PINECONE_INDEX_NAME1 || 'knowledge-base'
                },
                embedding: {
                    model: 'text-embedding-3-large',
                    dimension: 3072
                },
                textSplitter: {
                    chunkSize: 2000,
                    chunkOverlap: 200,
                    separators: ['\\n\\n', '\\n', ' ', '']
                }
            },
            searchSettings: {
                topK: 5,
                scoreThreshold: 0.25,
                maxTokens: 80000,
                maxContentLength: 200000,
                includeMetadata: true,
                sortBy: 'relevance'
            },
            unifiedContextFormatter: {
                enabled: true,
                sections: {
                    knowledgeContext: {
                        enabled: true,
                        order: 1,
                        maxResults: 1,
                        scoreThreshold: 0.75,
                        includeConfidence: true,
                        summarizeContent: true,
                        maxContentLength: 500000,
                        groupByCategory: true
                    },
                    productContext: {
                        enabled: true,
                        order: 2,
                        useProductFormatter: true,
                        enhanceWithKnowledge: true
                    },
                    contextIntegration: {
                        enabled: true,
                        crossReference: true,
                        prioritizeKnowledge: false,
                        combineRelatedContent: true
                    }
                },
                formatting: {
                    separators: {
                        section: '\\n\\n---\\n\\n',
                        subsection: '\\n\\n',
                        item: '\\n'
                    },
                    indentation: {
                        level1: '',
                        level2: '  • ',
                        level3: '    ◦ '
                    },
                    confidenceDisplay: {
                        enabled: true,
                        format: '(ความเชื่อมั่น: {confidence}%)',
                        threshold: 0.5
                    }
                }
            }
        };
    }

    // ============= API ENDPOINTS =============

    // Get all configurations
    router.get('/all', async (req, res) => {
        try {
            const config = await loadSystemConfig();
            
            // Merge with current runtime settings
            const currentConfig = {
                ...config,
                runtime: {
                    knowledgeEnabled: aiAssistant?.configManager?.knowledgeConfig?.enabled,
                    unifiedFormatterEnabled: aiAssistant?.configManager?.unifiedFormatterConfig?.enabled,
                    currentLanguage: aiAssistant?.configManager?.currentLanguage,
                    languageLocked: aiAssistant?.configManager?.isLanguageLocked
                }
            };

            res.json({
                success: true,
                config: currentConfig,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting all configurations:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Update all configurations
    router.post('/all', async (req, res) => {
        try {
            const newConfig = req.body;
            
            if (!newConfig || typeof newConfig !== 'object') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid configuration object'
                });
            }

            // Save to file
            const saved = await saveSystemConfig(newConfig);
            
            if (!saved) {
                throw new Error('Failed to save configuration');
            }

            // Apply to runtime systems
            const applyResults = await applyConfigToSystems(newConfig, req);

            res.json({
                success: true,
                message: 'Configuration updated successfully',
                applyResults,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error updating all configurations:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ============= PRODUCT SEARCH CONFIGURATION =============
    
    router.get('/product-search', async (req, res) => {
        try {
            const config = await loadSystemConfig();
            res.json({
                success: true,
                config: config.productSearch || getDefaultSystemConfig().productSearch,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting product search config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    router.post('/product-search', async (req, res) => {
        try {
            const newSettings = req.body;
            const config = await loadSystemConfig();
            
            // Validate numeric values
            const numericFields = [
                'topResults', 'contextWindow', 'relevanceThreshold', 
                'embeddingBoostFactor'
            ];
            
            for (const field of numericFields) {
                if (newSettings[field] !== undefined && 
                    (typeof newSettings[field] !== 'number' || newSettings[field] < 0)) {
                    return res.status(400).json({
                        success: false,
                        error: `Invalid value for ${field}: must be a positive number`
                    });
                }
            }
            
            config.productSearch = {
                ...config.productSearch || {},
                ...newSettings
            };

            await saveSystemConfig(config);
            
            // Apply to runtime if product search service is available
            if (req.productSearchService) {
                applyProductSearchConfig(req.productSearchService, config.productSearch);
            }

            res.json({
                success: true,
                message: 'Product search settings updated',
                config: config.productSearch,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error updating product search config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ============= MULTI-LANGUAGE CONFIGURATION =============
    
    router.get('/multi-language', async (req, res) => {
        try {
            const config = await loadSystemConfig();
            res.json({
                success: true,
                config: config.multiLanguage || getDefaultSystemConfig().multiLanguage,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting multi-language config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    router.post('/multi-language', async (req, res) => {
        try {
            const newSettings = req.body;
            const config = await loadSystemConfig();
            
            config.multiLanguage = {
                ...config.multiLanguage || {},
                ...newSettings
            };

            await saveSystemConfig(config);
            
            // Apply to AI Assistant and Knowledge RAG
            if (aiAssistant?.configManager) {
                if (newSettings.autoDetection) {
                    aiAssistant.configManager.updateLanguageDetectionConfig(newSettings.autoDetection);
                }
                if (newSettings.defaultLanguage) {
                    aiAssistant.configManager.currentLanguage = newSettings.defaultLanguage;
                }
            }
            
            if (knowledgeRAG && newSettings.languageSpecific) {
                // Update language configs in Knowledge RAG
                Object.entries(newSettings.languageSpecific).forEach(([lang, langConfig]) => {
                    if (knowledgeRAG.languageConfigs[lang]) {
                        knowledgeRAG.languageConfigs[lang] = {
                            ...knowledgeRAG.languageConfigs[lang],
                            ...langConfig
                        };
                    }
                });
            }

            res.json({
                success: true,
                message: 'Multi-language settings updated',
                config: config.multiLanguage,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error updating multi-language config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ============= INTENT DETECTION CONFIGURATION =============
    
    router.get('/intent-detection', async (req, res) => {
        try {
            const config = await loadSystemConfig();
            res.json({
                success: true,
                config: config.intentDetection || getDefaultSystemConfig().intentDetection,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting intent detection config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    router.post('/intent-detection', async (req, res) => {
        try {
            const newSettings = req.body;
            const config = await loadSystemConfig();
            
            config.intentDetection = {
                ...config.intentDetection || {},
                ...newSettings
            };

            await saveSystemConfig(config);
            
            // Apply to product search service if available
            if (req.productSearchService) {
                if (newSettings.keywords) {
                    req.productSearchService.intentKeywords = newSettings.keywords;
                }
                if (newSettings.productAttributes) {
                    req.productSearchService.productAttributes = newSettings.productAttributes;
                }
            }

            res.json({
                success: true,
                message: 'Intent detection settings updated',
                config: config.intentDetection,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error updating intent detection config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ============= KNOWLEDGE SCORE CONFIGURATION =============
    
    router.get('/knowledge-score', async (req, res) => {
        try {
            const config = await loadSystemConfig();
            res.json({
                success: true,
                config: config.knowledgeScore || getDefaultSystemConfig().knowledgeScore,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting knowledge score config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    router.post('/knowledge-score', async (req, res) => {
        try {
            const newSettings = req.body;
            const config = await loadSystemConfig();
            
            config.knowledgeScore = {
                ...config.knowledgeScore,
                ...newSettings
            };

            await saveSystemConfig(config);

            // Apply to Knowledge RAG if available
            if (knowledgeRAG) {
                knowledgeRAG.config.search.scoreThreshold = newSettings.thresholds?.medium || 0.5;
            }

            res.json({
                success: true,
                message: 'Knowledge score settings updated',
                config: config.knowledgeScore,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error updating knowledge score config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ============= LANGUAGE DETECTION CONFIGURATION =============
    
    router.get('/language-detection', async (req, res) => {
        try {
            const config = await loadSystemConfig();

            // Provide default language detection config
            const defaultConfig = {
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
                config: {
                    ...defaultConfig,
                    ...config.languageDetection || {}
                },
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting language detection config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    router.post('/language-detection', async (req, res) => {
        try {
            const newSettings = req.body;
            const config = await loadSystemConfig();
            
            config.languageDetection = {
                ...config.languageDetection,
                ...newSettings
            };

            await saveSystemConfig(config);

            // Apply to AI Assistant
            if (aiAssistant?.configManager) {
                aiAssistant.configManager.updateLanguageDetectionConfig(newSettings);
            }

            res.json({
                success: true,
                message: 'Language detection settings updated',
                config: config.languageDetection,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error updating language detection config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ============= KNOWLEDGE RAG CONFIGURATION =============
    
    router.get('/knowledge-rag', async (req, res) => {
        try {
            const config = await loadSystemConfig();
            
            // Add current runtime status
            let runtimeStatus = {};
            if (knowledgeRAG) {
                const health = await knowledgeRAG.healthCheck();
                runtimeStatus = {
                    initialized: knowledgeRAG.initialized,
                    health: health.status,
                    indexReady: health.status?.index_ready
                };
            }

            res.json({
                success: true,
                config: config.knowledgeRAG || getDefaultSystemConfig().knowledgeRAG,
                runtime: runtimeStatus,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting knowledge RAG config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    router.post('/knowledge-rag', async (req, res) => {
        try {
            const newSettings = req.body;
            const config = await loadSystemConfig();
            
            config.knowledgeRAG = {
                ...config.knowledgeRAG,
                ...newSettings
            };

            await saveSystemConfig(config);

            // Apply to Knowledge RAG
            if (knowledgeRAG) {
                knowledgeRAG.config = {
                    ...knowledgeRAG.config,
                    ...newSettings
                };
                
                // Re-initialize if critical settings changed
                if (newSettings.embedding || newSettings.pinecone) {
                    await knowledgeRAG.initialize();
                }
            }

            res.json({
                success: true,
                message: 'Knowledge RAG configuration updated',
                config: config.knowledgeRAG,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error updating knowledge RAG config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ============= SEARCH SETTINGS CONFIGURATION =============
    
    router.get('/search', async (req, res) => {
        try {
            const config = await loadSystemConfig();
            
            // Merge with current runtime settings
            const currentSettings = knowledgeRAG?.config?.search || {};
            
            res.json({
                success: true,
                config: {
                    ...config.searchSettings || getDefaultSystemConfig().searchSettings,
                    runtime: currentSettings
                },
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting search config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    router.post('/search', async (req, res) => {
        try {
            const newSettings = req.body;
            const config = await loadSystemConfig();
            
            config.searchSettings = {
                ...config.searchSettings,
                ...newSettings
            };

            await saveSystemConfig(config);

            // Apply to Knowledge RAG
            if (knowledgeRAG) {
                knowledgeRAG.config.search = {
                    ...knowledgeRAG.config.search,
                    ...newSettings
                };
            }

            // Apply to AI Assistant
            if (aiAssistant?.configManager) {
                aiAssistant.configManager.knowledgeConfig.searchSettings = {
                    ...aiAssistant.configManager.knowledgeConfig.searchSettings,
                    ...newSettings
                };
            }

            res.json({
                success: true,
                message: 'Search settings updated',
                config: config.searchSettings,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error updating search config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ============= UNIFIED CONTEXT FORMATTER CONFIGURATION =============
    
    router.get('/unified-formatter', async (req, res) => {
        try {
            const config = await loadSystemConfig();
            
            // Merge with current runtime settings
            const currentSettings = aiAssistant?.configManager?.getUnifiedFormatterConfig() || {};
            
            res.json({
                success: true,
                config: {
                    ...config.unifiedContextFormatter || getDefaultSystemConfig().unifiedContextFormatter,
                    runtime: currentSettings
                },
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

    router.post('/unified-formatter', async (req, res) => {
        try {
            const newSettings = req.body;
            const config = await loadSystemConfig();
            
            config.unifiedContextFormatter = {
                ...config.unifiedContextFormatter,
                ...newSettings
            };

            await saveSystemConfig(config);

            // Apply to AI Assistant
            if (aiAssistant) {
                await aiAssistant.updateUnifiedFormatterConfig(newSettings);
            }

            res.json({
                success: true,
                message: 'Unified formatter configuration updated',
                config: config.unifiedContextFormatter,
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

    // ============= RESET ENDPOINTS =============
    
    router.post('/reset/:section', async (req, res) => {
        try {
            const { section } = req.params;
            const config = await loadSystemConfig();
            const defaultConfig = getDefaultSystemConfig();

            switch(section) {
                case 'product-search':
                    config.productSearch = defaultConfig.productSearch;
                    if (req.productSearchService) {
                        applyProductSearchConfig(req.productSearchService, defaultConfig.productSearch);
                    }
                    break;
                case 'multi-language':
                    config.multiLanguage = defaultConfig.multiLanguage;
                    break;
                case 'intent-detection':
                    config.intentDetection = defaultConfig.intentDetection;
                    if (req.productSearchService) {
                        req.productSearchService.intentKeywords = defaultConfig.intentDetection.keywords;
                        req.productSearchService.productAttributes = defaultConfig.intentDetection.productAttributes;
                    }
                    break;
                case 'knowledge-score':
                    config.knowledgeScore = defaultConfig.knowledgeScore;
                    break;
                case 'language-detection':
                    config.languageDetection = defaultConfig.languageDetection;
                    if (aiAssistant?.configManager) {
                        aiAssistant.configManager.updateLanguageDetectionConfig(defaultConfig.languageDetection);
                    }
                    break;
                case 'knowledge-rag':
                    config.knowledgeRAG = defaultConfig.knowledgeRAG;
                    break;
                case 'search':
                    config.searchSettings = defaultConfig.searchSettings;
                    break;
                case 'unified-formatter':
                    config.unifiedContextFormatter = defaultConfig.unifiedContextFormatter;
                    if (aiAssistant) {
                        await aiAssistant.updateUnifiedFormatterConfig(defaultConfig.unifiedContextFormatter);
                    }
                    break;
                case 'all':
                    Object.assign(config, defaultConfig);
                    await applyConfigToSystems(defaultConfig, req);
                    break;
                default:
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid section. Valid options: product-search, multi-language, intent-detection, knowledge-score, language-detection, knowledge-rag, search, unified-formatter, all'
                    });
            }

            await saveSystemConfig(config);

            res.json({
                success: true,
                message: `${section} configuration reset to defaults`,
                config: section === 'all' ? config : config[section.replace('-', '')],
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error resetting configuration:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ============= EXPORT/IMPORT CONFIGURATION =============
    
    router.get('/export', async (req, res) => {
        try {
            const config = await loadSystemConfig();
            
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename="system-config.json"');
            res.json(config);
        } catch (error) {
            logger.error('Error exporting configuration:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    router.post('/import', async (req, res) => {
        try {
            const importedConfig = req.body;
            
            if (!importedConfig || typeof importedConfig !== 'object') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid configuration file'
                });
            }

            // Validate required sections
            const requiredSections = [
                'productSearch', 'multiLanguage', 'intentDetection',
                'knowledgeScore', 'languageDetection', 'knowledgeRAG', 
                'searchSettings', 'unifiedContextFormatter'
            ];
            const missingSections = requiredSections.filter(section => !importedConfig[section]);
            
            if (missingSections.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: `Missing required sections: ${missingSections.join(', ')}`
                });
            }

            // Save and apply configuration
            await saveSystemConfig(importedConfig);
            const applyResults = await applyConfigToSystems(importedConfig, req);

            res.json({
                success: true,
                message: 'Configuration imported successfully',
                applyResults,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error importing configuration:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ============= COMPLETE CONFIGURATION =============
    
    router.get('/complete', async (req, res) => {
        try {
            const config = await loadSystemConfig();
            
            res.json({
                success: true,
                config: config,
                sections: Object.keys(config),
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting complete config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    router.post('/complete', async (req, res) => {
        try {
            const newConfig = req.body;
            
            if (!newConfig || typeof newConfig !== 'object') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid configuration object'
                });
            }

            // Save complete config
            await saveSystemConfig(newConfig);
            
            // Apply all configurations
            const applyResults = await applyConfigToSystems(newConfig, req);

            res.json({
                success: true,
                message: 'Complete configuration saved and applied',
                applyResults,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error saving complete config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ============= HEALTH CHECK =============
    
    router.get('/health', async (req, res) => {
        try {
            const config = await loadSystemConfig();
            const health = {
                configFileExists: !!config,
                aiAssistantConnected: !!aiAssistant,
                knowledgeRAGConnected: !!knowledgeRAG,
                productSearchServiceConnected: !!req.productSearchService,
                sectionsLoaded: Object.keys(config || {}),
                timestamp: Date.now()
            };

            res.json({
                success: true,
                health,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error in config health check:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ============= HELPER FUNCTIONS =============

    function applyProductSearchConfig(productSearchService, config) {
        try {
            if (config.topResults !== undefined) {
                productSearchService.TOP_RESULTS = config.topResults;
            }
            if (config.contextWindow !== undefined) {
                productSearchService.CONTEXT_WINDOW = config.contextWindow;
            }
            if (config.relevanceThreshold !== undefined) {
                productSearchService.RELEVANCE_THRESHOLD = config.relevanceThreshold;
            }
            if (config.embeddingBoostFactor !== undefined) {
                productSearchService.EMBEDDING_BOOST_FACTOR = config.embeddingBoostFactor;
            }
            if (config.scoreThresholds) {
                productSearchService.SCORE_THRESHOLDS = config.scoreThresholds;
            }
            if (config.searchMethods) {
                productSearchService.SEARCH_METHODS = config.searchMethods;
            }
            if (config.caching) {
                productSearchService.CACHE_CONFIG = config.caching;
            }
            if (config.cleanup) {
                productSearchService.CLEANUP_CONFIG = config.cleanup;
            }
            
            logger.info('Product search configuration applied successfully');
        } catch (error) {
            logger.error('Error applying product search config:', error);
        }
    }

    async function applyConfigToSystems(config, req) {
        const results = {
            languageDetection: false,
            knowledgeRAG: false,
            search: false,
            unifiedFormatter: false,
            knowledgeScore: false,
            productSearch: false,
            multiLanguage: false,
            intentDetection: false
        };

        try {
            // Apply Language Detection Settings
            if (aiAssistant?.configManager && config.languageDetection) {
                aiAssistant.configManager.updateLanguageDetectionConfig(config.languageDetection);
                results.languageDetection = true;
            }

            // Apply Knowledge RAG Settings
            if (knowledgeRAG && config.knowledgeRAG) {
                knowledgeRAG.config = {
                    ...knowledgeRAG.config,
                    ...config.knowledgeRAG
                };
                results.knowledgeRAG = true;
            }

            // Apply Search Settings
            if (knowledgeRAG && config.searchSettings) {
                knowledgeRAG.config.search = {
                    ...knowledgeRAG.config.search,
                    ...config.searchSettings
                };
                results.search = true;
            }

            // Apply Unified Formatter Settings
            if (aiAssistant && config.unifiedContextFormatter) {
                await aiAssistant.updateUnifiedFormatterConfig(config.unifiedContextFormatter);
                results.unifiedFormatter = true;
            }

            // Apply Knowledge Score Settings
            if (knowledgeRAG && config.knowledgeScore) {
                knowledgeRAG.config.search.scoreThreshold = config.knowledgeScore.thresholds?.medium || 0.5;
                results.knowledgeScore = true;
            }

            // Apply Product Search Settings
            if (req.productSearchService && config.productSearch) {
                applyProductSearchConfig(req.productSearchService, config.productSearch);
                results.productSearch = true;
            }

            // Apply Multi-Language Settings
            if (config.multiLanguage) {
                if (aiAssistant?.configManager && config.multiLanguage.defaultLanguage) {
                    aiAssistant.configManager.currentLanguage = config.multiLanguage.defaultLanguage;
                }
                if (aiAssistant?.configManager && config.multiLanguage.autoDetection) {
                    aiAssistant.configManager.updateLanguageDetectionConfig(config.multiLanguage.autoDetection);
                }
                results.multiLanguage = true;
            }

            // Apply Intent Detection Settings
            if (req.productSearchService && config.intentDetection) {
                if (config.intentDetection.keywords) {
                    req.productSearchService.intentKeywords = config.intentDetection.keywords;
                }
                if (config.intentDetection.productAttributes) {
                    req.productSearchService.productAttributes = config.intentDetection.productAttributes;
                }
                results.intentDetection = true;
            }

        } catch (error) {
            logger.error('Error applying config to systems:', error);
        }

        return results;
    }

    return router;
};