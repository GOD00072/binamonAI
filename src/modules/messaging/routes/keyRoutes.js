const express = require('express');
const fs = require('fs').promises;
const path = require('path');

/**
 * Create keyword-related routes
 * @param {Object} keywordDetector - KeywordDetector instance
 * @param {Object} logger - Logger instance
 * @returns {Object} Express router
 */
function createKeywordRoutes(keywordDetector, logger) {
    const router = express.Router();

    // *** KEYWORDS MANAGEMENT ROUTES ***

    // Get current keywords
    router.get('/keywords', (req, res) => {
        try {
            const keywords = keywordDetector.getKeywords();
            const settings = keywordDetector.getSettings();
            
            logger.info('📋 Keywords API: Get keywords request', {
                keywordCount: keywords.length,
                debugMode: settings.debugMode
            });
            
            res.json({
                success: true,
                keywords: keywords,
                settings: {
                    debugMode: settings.debugMode,
                    sendTimeout: settings.sendTimeout,
                    sendTimeoutHours: settings.sendTimeout / (60 * 60 * 1000),
                    stats: settings.stats
                }
            });
        } catch (error) {
            logger.error('❌ Keywords API: Error getting keywords', {
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Update keywords
    router.post('/keywords', async (req, res) => {
        try {
            const { keywords, debugMode } = req.body;
            
            logger.info('📝 Keywords API: Update keywords request', {
                newKeywords: keywords,
                newDebugMode: debugMode,
                keywordCount: Array.isArray(keywords) ? keywords.length : 0
            });
            
            let updateResults = { keywords: false, debugMode: false };
            
            // Update keywords if provided
            if (keywords !== undefined) {
                if (Array.isArray(keywords)) {
                    updateResults.keywords = keywordDetector.setKeywords(keywords);
                    logger.info('✅ Keywords updated', {
                        success: updateResults.keywords,
                        keywordCount: keywords.length
                    });
                } else {
                    logger.error('❌ Invalid keywords format - must be array', {
                        providedType: typeof keywords
                    });
                    return res.status(400).json({
                        success: false,
                        error: 'Keywords must be an array'
                    });
                }
            }
            
            // Update debug mode if provided
            if (debugMode !== undefined) {
                updateResults.debugMode = keywordDetector.setDebugMode(debugMode);
                logger.info('🐛 Debug mode updated', {
                    newDebugMode: updateResults.debugMode
                });
            }
            
            const updatedSettings = keywordDetector.getSettings();
            
            res.json({
                success: true,
                message: 'Settings updated successfully',
                updateResults: updateResults,
                settings: {
                    keywords: updatedSettings.keywords,
                    debugMode: updatedSettings.debugMode,
                    sendTimeout: updatedSettings.sendTimeout,
                    stats: updatedSettings.stats
                }
            });
            
        } catch (error) {
            logger.error('❌ Keywords API: Error updating keywords', {
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Test keyword detection
    router.post('/keywords/test', async (req, res) => {
        try {
            const { userId, message } = req.body;
            
            if (!userId || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'userId and message are required'
                });
            }
            
            logger.info('🧪 Keywords API: Test keyword detection', {
                userId: userId.substring(0, 10) + '...',
                messageLength: message.length,
                messagePreview: message.substring(0, 50) + '...'
            });
            
            // Test keyword detection without actually sending flex message
            const keywords = keywordDetector.getKeywords();
            const containsKeyword = keywords.some(keyword => 
                message.toLowerCase().includes(keyword.toLowerCase())
            );
            
            const matchedKeywords = keywords.filter(keyword => 
                message.toLowerCase().includes(keyword.toLowerCase())
            );
            
            const hasRecentlySent = keywordDetector.hasRecentlySentFlex(userId);
            
            res.json({
                success: true,
                test: {
                    containsKeyword: containsKeyword,
                    matchedKeywords: matchedKeywords,
                    hasRecentlySent: hasRecentlySent,
                    wouldSendFlex: containsKeyword && (!hasRecentlySent || keywordDetector.debugMode)
                },
                message: {
                    original: message,
                    length: message.length,
                    lowercase: message.toLowerCase()
                },
                keywords: keywords,
                settings: keywordDetector.getSettings()
            });
            
        } catch (error) {
            logger.error('❌ Keywords API: Error testing keyword detection', {
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Send test flex message
    router.post('/keywords/test-flex', async (req, res) => {
        try {
            const { userId } = req.body;
            
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'userId is required'
                });
            }
            
            logger.info('🧪 Keywords API: Test flex message send', {
                userId: userId.substring(0, 10) + '...'
            });
            
            const result = await keywordDetector.testSendFlexMessage(userId);
            
            res.json({
                success: true,
                flexSent: result,
                message: result ? 'Flex message sent successfully' : 'Failed to send flex message',
                timestamp: Date.now()
            });
            
        } catch (error) {
            logger.error('❌ Keywords API: Error testing flex message', {
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // *** KEYWORD SETTINGS ROUTES ***

    // Get keyword detector settings
    router.get('/keyword-settings', (req, res) => {
        try {
            const settings = keywordDetector.getSettings();
            
            logger.info('⚙️ Keyword Settings API: Get settings request', {
                keywordCount: settings.keywords.length,
                debugMode: settings.debugMode,
                hasCustomFlex: settings.hasCustomFlexMessage
            });
            
            res.json({
                success: true,
                settings: {
                    keywords: settings.keywords,
                    debugMode: settings.debugMode,
                    sendTimeout: settings.sendTimeout,
                    sendTimeoutHours: settings.sendTimeout / (60 * 60 * 1000),
                    flex: settings.flex,
                    hasCustomFlexMessage: settings.hasCustomFlexMessage,
                    stats: settings.stats,
                    hasLineToken: !!keywordDetector.lineToken,
                    hasLineHandler: !!keywordDetector.lineHandler
                },
                timestamp: Date.now()
            });
            
        } catch (error) {
            logger.error('❌ Keyword Settings API: Error getting settings', {
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Update keyword detector settings
    router.post('/keyword-settings', async (req, res) => {
        try {
            const { 
                keywords, 
                debugMode, 
                sendTimeout, 
                flexConfig 
            } = req.body;
            
            logger.info('⚙️ Keyword Settings API: Update settings request', {
                hasKeywords: !!keywords,
                hasDebugMode: debugMode !== undefined,
                hasSendTimeout: !!sendTimeout,
                hasFlexConfig: !!flexConfig,
                keywordCount: Array.isArray(keywords) ? keywords.length : 0
            });
            
            const updateResults = {
                keywords: null,
                debugMode: null,
                sendTimeout: null,
                flexConfig: null
            };
            
            // Update keywords if provided
            if (keywords !== undefined) {
                if (Array.isArray(keywords)) {
                    updateResults.keywords = keywordDetector.setKeywords(keywords);
                    logger.info('✅ Keywords updated via settings', {
                        success: updateResults.keywords,
                        keywordCount: keywords.length,
                        keywords: keywords
                    });
                } else {
                    logger.error('❌ Invalid keywords format in settings - must be array', {
                        providedType: typeof keywords,
                        providedValue: keywords
                    });
                    return res.status(400).json({
                        success: false,
                        error: 'Keywords must be an array',
                        field: 'keywords'
                    });
                }
            }
            
            // Update debug mode if provided
            if (debugMode !== undefined) {
                updateResults.debugMode = keywordDetector.setDebugMode(debugMode);
                logger.info('🐛 Debug mode updated via settings', {
                    newDebugMode: updateResults.debugMode,
                    providedValue: debugMode
                });
            }
            
            // Update send timeout if provided
            if (sendTimeout !== undefined) {
                if (typeof sendTimeout === 'number' && sendTimeout > 0) {
                    keywordDetector.config.sendTimeout = sendTimeout;
                    updateResults.sendTimeout = true;
                    await keywordDetector.saveConfiguration();
                    
                    logger.info('⏰ Send timeout updated via settings', {
                        newTimeout: sendTimeout,
                        newTimeoutHours: sendTimeout / (60 * 60 * 1000)
                    });
                } else {
                    logger.error('❌ Invalid sendTimeout value in settings', {
                        providedType: typeof sendTimeout,
                        providedValue: sendTimeout
                    });
                    return res.status(400).json({
                        success: false,
                        error: 'sendTimeout must be a positive number (milliseconds)',
                        field: 'sendTimeout'
                    });
                }
            }
            
            // Update flex configuration if provided
            if (flexConfig !== undefined) {
                if (typeof flexConfig === 'object' && flexConfig !== null) {
                    keywordDetector.updateFlexMessageFromConfig(flexConfig);
                    updateResults.flexConfig = true;
                    await keywordDetector.saveConfiguration();
                    
                    logger.info('💬 Flex config updated via settings', {
                        altText: flexConfig.altText,
                        headerText: flexConfig.header?.text,
                        bodyText: flexConfig.body?.text
                    });
                } else {
                    logger.error('❌ Invalid flexConfig format in settings', {
                        providedType: typeof flexConfig,
                        providedValue: flexConfig
                    });
                    return res.status(400).json({
                        success: false,
                        error: 'flexConfig must be an object',
                        field: 'flexConfig'
                    });
                }
            }
            
            // Get updated settings
            const updatedSettings = keywordDetector.getSettings();
            
            res.json({
                success: true,
                message: 'Settings updated successfully',
                updateResults: updateResults,
                settings: {
                    keywords: updatedSettings.keywords,
                    debugMode: updatedSettings.debugMode,
                    sendTimeout: updatedSettings.sendTimeout,
                    sendTimeoutHours: updatedSettings.sendTimeout / (60 * 60 * 1000),
                    flex: updatedSettings.flex,
                    hasCustomFlexMessage: updatedSettings.hasCustomFlexMessage,
                    stats: updatedSettings.stats
                },
                timestamp: Date.now()
            });
            
        } catch (error) {
            logger.error('❌ Keyword Settings API: Error updating settings', {
                error: error.message,
                stack: error.stack,
                requestBody: req.body
            });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Reset keyword detector settings to default
    router.post('/keyword-settings/reset', async (req, res) => {
        try {
            logger.info('🔄 Keyword Settings API: Reset to default settings');
            
            // Reset to default values
            const defaultKeywords = [
                'คลิกที่ปุ่มด้านล่าง',
                'กดปุ่มด้านล่าง', 
                'คุยกับแอดมิน',
                'ปุ่ม'
            ];
            
            const defaultSendTimeout = 12 * 60 * 60 * 1000; // 12 hours
            const defaultDebugMode = false;
            
            // Apply default settings
            keywordDetector.setKeywords(defaultKeywords);
            keywordDetector.setDebugMode(defaultDebugMode);
            keywordDetector.config.sendTimeout = defaultSendTimeout;
            
            // Reset flex message to default
            keywordDetector.config.flex = {
                altText: "ข้อมูลการติดต่อและตัวเลือก",
                header: {
                    text: "ตัวเลือกการติดต่อ",
                    color: "#27ACB2"
                },
                body: {
                    text: "เลือกตัวเลือกด้านล่างเพื่อดำเนินการต่อ"
                },
                buttons: {
                    disableAi: {
                        text: "ปิดใช้งาน AI",
                        color: "#E03C31",
                        displayText: "ต้องการปิดใช้งาน AI"
                    },
                    email: {
                        text: "อีเมลติดต่อ",
                        address: "contact@example.com"
                    },
                    contact: {
                        text: "ติดต่อเจ้าหน้าที่",
                        url: "https://lin.ee/"
                    }
                }
            };
            
            // Save configuration
            await keywordDetector.saveConfiguration();
            
            // Reset tracking
            keywordDetector.resetFlexMessageTracking();
            
            const resetSettings = keywordDetector.getSettings();
            
            logger.info('✅ Keyword settings reset to default', {
                keywordCount: resetSettings.keywords.length,
                debugMode: resetSettings.debugMode,
                sendTimeoutHours: resetSettings.sendTimeout / (60 * 60 * 1000)
            });
            
            res.json({
                success: true,
                message: 'Settings reset to default values successfully',
                settings: {
                    keywords: resetSettings.keywords,
                    debugMode: resetSettings.debugMode,
                    sendTimeout: resetSettings.sendTimeout,
                    sendTimeoutHours: resetSettings.sendTimeout / (60 * 60 * 1000),
                    flex: resetSettings.flex,
                    hasCustomFlexMessage: resetSettings.hasCustomFlexMessage,
                    stats: resetSettings.stats
                },
                timestamp: Date.now()
            });
            
        } catch (error) {
            logger.error('❌ Keyword Settings API: Error resetting settings', {
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Export keyword detector configuration
    router.get('/keyword-settings/export', (req, res) => {
        try {
            const settings = keywordDetector.getSettings();
            const customFlexMessage = keywordDetector.getCustomFlexMessage();
            
            const exportData = {
                version: '1.0',
                timestamp: Date.now(),
                settings: {
                    keywords: settings.keywords,
                    debugMode: settings.debugMode,
                    sendTimeout: settings.sendTimeout,
                    flex: settings.flex
                },
                customFlexMessage: settings.hasCustomFlexMessage ? customFlexMessage : null,
                stats: settings.stats
            };
            
            logger.info('📤 Keyword Settings API: Export configuration', {
                keywordCount: settings.keywords.length,
                hasCustomFlex: settings.hasCustomFlexMessage,
                exportSize: JSON.stringify(exportData).length
            });
            
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename="keyword-settings-export.json"');
            res.json(exportData);
            
        } catch (error) {
            logger.error('❌ Keyword Settings API: Error exporting settings', {
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Import keyword detector configuration
    router.post('/keyword-settings/import', async (req, res) => {
        try {
            const importData = req.body;
            
            logger.info('📥 Keyword Settings API: Import configuration', {
                hasImportData: !!importData,
                importVersion: importData?.version,
                hasSettings: !!importData?.settings,
                hasCustomFlex: !!importData?.customFlexMessage
            });
            
            if (!importData || typeof importData !== 'object') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid import data format'
                });
            }
            
            if (!importData.settings) {
                return res.status(400).json({
                    success: false,
                    error: 'Import data must contain settings'
                });
            }
            
            const { settings, customFlexMessage } = importData;
            const importResults = {
                keywords: false,
                debugMode: false,
                sendTimeout: false,
                flexConfig: false,
                customFlexMessage: false
            };
            
            // Import keywords
            if (settings.keywords && Array.isArray(settings.keywords)) {
                importResults.keywords = keywordDetector.setKeywords(settings.keywords);
                logger.info('📋 Imported keywords', {
                    success: importResults.keywords,
                    keywordCount: settings.keywords.length
                });
            }
            
            // Import debug mode
            if (settings.debugMode !== undefined) {
                importResults.debugMode = keywordDetector.setDebugMode(settings.debugMode);
                logger.info('🐛 Imported debug mode', {
                    debugMode: importResults.debugMode
                });
            }
            
            // Import send timeout
            if (settings.sendTimeout && typeof settings.sendTimeout === 'number') {
                keywordDetector.config.sendTimeout = settings.sendTimeout;
                importResults.sendTimeout = true;
                logger.info('⏰ Imported send timeout', {
                    sendTimeout: settings.sendTimeout,
                    sendTimeoutHours: settings.sendTimeout / (60 * 60 * 1000)
                });
            }
            
            // Import flex config
            if (settings.flex && typeof settings.flex === 'object') {
                keywordDetector.updateFlexMessageFromConfig(settings.flex);
                importResults.flexConfig = true;
                logger.info('💬 Imported flex config', {
                    altText: settings.flex.altText
                });
            }
            
            // Import custom flex message
            if (customFlexMessage && typeof customFlexMessage === 'object') {
                await keywordDetector.saveCustomFlexMessage(customFlexMessage);
                importResults.customFlexMessage = true;
                logger.info('📱 Imported custom flex message', {
                    messageType: customFlexMessage.type
                });
            }
            
            // Save configuration
            await keywordDetector.saveConfiguration();
            
            const updatedSettings = keywordDetector.getSettings();
            
            res.json({
                success: true,
                message: 'Configuration imported successfully',
                importResults: importResults,
                settings: {
                    keywords: updatedSettings.keywords,
                    debugMode: updatedSettings.debugMode,
                    sendTimeout: updatedSettings.sendTimeout,
                    sendTimeoutHours: updatedSettings.sendTimeout / (60 * 60 * 1000),
                    flex: updatedSettings.flex,
                    hasCustomFlexMessage: updatedSettings.hasCustomFlexMessage
                },
                timestamp: Date.now()
            });
            
        } catch (error) {
            logger.error('❌ Keyword Settings API: Error importing settings', {
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Get keyword detector statistics
    router.get('/keyword-settings/stats', async (req, res) => {
        try {
            const settings = keywordDetector.getSettings();
            
            // Try to load saved stats
            let savedStats = null;
            try {
                const statsPath = path.join(__dirname, 'data', 'keyword_stats.json');
                const statsData = await fs.readFile(statsPath, 'utf8');
                savedStats = JSON.parse(statsData);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    logger.error('Error loading saved stats', { error: error.message });
                }
            }
            
            const stats = {
                current: settings.stats,
                saved: savedStats,
                combined: {
                    totalFlexSent: (savedStats?.flexSentCount || 0) + settings.stats.flexSentCount,
                    totalKeywordsFound: (savedStats?.keywordsFoundCount || 0) + settings.stats.keywordsFoundCount,
                    currentUsersTracked: settings.stats.usersTrackedCount,
                    lastUpdated: Math.max(savedStats?.lastUpdated || 0, settings.stats.lastUpdated)
                }
            };
            
            logger.info('📊 Keyword Settings API: Get statistics', {
                currentFlexSent: settings.stats.flexSentCount,
                currentKeywordsFound: settings.stats.keywordsFoundCount,
                currentUsersTracked: settings.stats.usersTrackedCount,
                totalFlexSent: stats.combined.totalFlexSent,
                totalKeywordsFound: stats.combined.totalKeywordsFound
            });
            
            res.json({
                success: true,
                stats: stats,
                timestamp: Date.now()
            });
            
        } catch (error) {
            logger.error('❌ Keyword Settings API: Error getting statistics', {
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // *** CUSTOM FLEX MESSAGE ROUTES ***

    // Get current custom flex message
    router.get('/custom-flex', (req, res) => {
        try {
            const customFlexMessage = keywordDetector.getCustomFlexMessage();
            const settings = keywordDetector.getSettings();
            
            logger.info('📱 Custom Flex API: Get custom flex message', {
                hasCustomMessage: settings.hasCustomFlexMessage,
                messageType: customFlexMessage?.type,
                messageSize: customFlexMessage ? JSON.stringify(customFlexMessage).length : 0
            });
            
            res.json({
                success: true,
                flexMessage: customFlexMessage,
                isCustom: settings.hasCustomFlexMessage,
                altText: keywordDetector.config.flex.altText,
                settings: {
                    hasCustomFlexMessage: settings.hasCustomFlexMessage,
                    debugMode: settings.debugMode
                }
            });
            
        } catch (error) {
            logger.error('❌ Custom Flex API: Error getting custom flex message', {
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Update custom flex message
    router.post('/custom-flex', async (req, res) => {
        try {
            const { flexMessage } = req.body;
            
            logger.info('📱 Custom Flex API: Update custom flex message', {
                hasFlexMessage: !!flexMessage,
                messageType: flexMessage?.type,
                messageSize: flexMessage ? JSON.stringify(flexMessage).length : 0,
                messageKeys: flexMessage ? Object.keys(flexMessage) : []
            });
            
            if (!flexMessage) {
                return res.status(400).json({
                    success: false,
                    error: 'flexMessage is required'
                });
            }
            
            // Validate basic structure
            if (typeof flexMessage !== 'object') {
                return res.status(400).json({
                    success: false,
                    error: 'flexMessage must be an object'
                });
            }
            
            await keywordDetector.saveCustomFlexMessage(flexMessage);
            
            logger.info('✅ Custom flex message saved successfully', {
                messageType: flexMessage.type,
                messageSize: JSON.stringify(flexMessage).length
            });
            
            res.json({
                success: true,
                message: 'Custom flex message saved successfully',
                flexMessage: flexMessage,
                timestamp: Date.now()
            });
            
        } catch (error) {
            logger.error('❌ Custom Flex API: Error saving custom flex message', {
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Delete custom flex message (revert to default)
    router.delete('/custom-flex', async (req, res) => {
        try {
            logger.info('🗑️ Custom Flex API: Delete custom flex message');
            
            // Reset to null and remove file
            keywordDetector.customFlexMessage = null;
            
            const flexPath = path.join(__dirname, 'data', 'custom_flex_message.json');
            
            try {
                await fs.unlink(flexPath);
                logger.info('✅ Custom flex message file deleted', { flexPath });
            } catch (unlinkError) {
                if (unlinkError.code !== 'ENOENT') {
                    logger.error('❌ Error deleting custom flex message file', {
                        error: unlinkError.message,
                        flexPath
                    });
                } else {
                    logger.info('ℹ️ Custom flex message file already not exists', { flexPath });
                }
            }
            
            // Get the default generated flex message
            const defaultFlexMessage = keywordDetector.createFlexMessageContent();
            
            res.json({
                success: true,
                message: 'Custom flex message deleted, reverted to default',
                flexMessage: defaultFlexMessage,
                isCustom: false,
                timestamp: Date.now()
            });
            
        } catch (error) {
            logger.error('❌ Custom Flex API: Error deleting custom flex message', {
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Test custom flex message
    router.post('/custom-flex/test', async (req, res) => {
        try {
            const { userId, flexMessage } = req.body;
            
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    error: 'userId is required'
                });
            }
            
            logger.info('🧪 Custom Flex API: Test custom flex message', {
                userId: userId.substring(0, 10) + '...',
                hasFlexMessage: !!flexMessage,
                useCurrentCustom: !flexMessage
            });
            
            let testFlexMessage;
            if (flexMessage) {
                // Test with provided flex message
                testFlexMessage = flexMessage;
            } else {
                // Test with current custom flex message
                testFlexMessage = keywordDetector.getCustomFlexMessage();
            }
            
            // Temporarily save the current custom message
            const originalCustomMessage = keywordDetector.customFlexMessage;
            
            try {
                // Temporarily set the test message
                if (flexMessage) {
                    keywordDetector.customFlexMessage = testFlexMessage;
                }
                
                const result = await keywordDetector.testSendFlexMessage(userId);
                
                res.json({
                    success: true,
                    flexSent: result,
                    message: result ? 'Test flex message sent successfully' : 'Failed to send test flex message',
                    testFlexMessage: testFlexMessage,
                    timestamp: Date.now()
                });
                
            } finally {
                // Restore original custom message
                keywordDetector.customFlexMessage = originalCustomMessage;
            }
            
        } catch (error) {
            logger.error('❌ Custom Flex API: Error testing custom flex message', {
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // *** KEYWORD DEBUG ROUTES ***

    // Get current debug mode status
    router.get('/keyword-debug', (req, res) => {
        try {
            const settings = keywordDetector.getSettings();
            
            logger.info('🔍 Keyword Debug API: Get debug status', {
                debugMode: settings.debugMode,
                keywordCount: settings.keywords.length,
                flexSentCount: settings.stats.flexSentCount
            });
            
            res.json({
                success: true,
                debugMode: settings.debugMode,
                settings: {
                    keywords: settings.keywords,
                    keywordCount: settings.keywords.length,
                    sendTimeout: settings.sendTimeout,
                    sendTimeoutHours: settings.sendTimeout / (60 * 60 * 1000),
                    hasCustomFlexMessage: settings.hasCustomFlexMessage
                },
                stats: settings.stats,
                connections: {
                    hasLineToken: !!keywordDetector.lineToken,
                    hasLineHandler: !!keywordDetector.lineHandler,
                    lineHandlerConnected: !!keywordDetector.lineHandler
                },
                timestamp: Date.now()
            });
            
        } catch (error) {
            logger.error('❌ Keyword Debug API: Error getting debug status', {
                error: error.message,
                stack: error.stack
            });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

   // Toggle keyword debug mode
   router.post('/keyword-debug/:mode', (req, res) => {
       try {
           const { mode } = req.params;
           
           logger.info('🐛 Keyword Debug API: Toggle debug mode request', {
               requestedMode: mode,
               currentDebugMode: keywordDetector.debugMode
           });
           
           let debugMode;
           if (mode === 'true' || mode === '1' || mode === 'on' || mode === 'enable') {
               debugMode = true;
           } else if (mode === 'false' || mode === '0' || mode === 'off' || mode === 'disable') {
               debugMode = false;
           } else {
               return res.status(400).json({
                   success: false,
                   error: 'Invalid debug mode. Use: true/false, 1/0, on/off, enable/disable',
                   provided: mode,
                   validOptions: ['true', 'false', '1', '0', 'on', 'off', 'enable', 'disable']
               });
           }
           
           const previousMode = keywordDetector.debugMode;
           const newMode = keywordDetector.setDebugMode(debugMode);
           
           logger.info('🔄 Debug mode changed', {
               previousMode: previousMode,
               requestedMode: debugMode,
               newMode: newMode,
               changed: previousMode !== newMode
           });
           
           res.json({
               success: true,
               message: `Debug mode ${newMode ? 'enabled' : 'disabled'}`,
               debugMode: {
                   previous: previousMode,
                   current: newMode,
                   changed: previousMode !== newMode
               },
               timestamp: Date.now()
           });
           
       } catch (error) {
           logger.error('❌ Keyword Debug API: Error toggling debug mode', {
               error: error.message,
               stack: error.stack,
               requestedMode: req.params.mode
           });
           res.status(500).json({
               success: false,
               error: error.message
           });
       }
   });

   // Debug test - simulate keyword detection
   router.post('/keyword-debug/simulate', async (req, res) => {
       try {
           const { userId, message, forceKeywordMatch } = req.body;
           
           if (!userId || !message) {
               return res.status(400).json({
                   success: false,
                   error: 'userId and message are required'
               });
           }
           
           logger.info('🧪 Keyword Debug API: Simulate keyword detection', {
               userId: userId.substring(0, 10) + '...',
               messageLength: message.length,
               messagePreview: message.substring(0, 50) + '...',
               forceKeywordMatch: !!forceKeywordMatch,
               currentDebugMode: keywordDetector.debugMode
           });
           
           const keywords = keywordDetector.getKeywords();
           let containsKeyword = keywords.some(keyword => 
               message.toLowerCase().includes(keyword.toLowerCase())
           );
           
           // Force keyword match if requested (for testing)
           if (forceKeywordMatch && !containsKeyword) {
               containsKeyword = true;
               logger.info('🔧 Forcing keyword match for simulation', {
                   userId: userId.substring(0, 10) + '...',
                   originalMatch: false,
                   forcedMatch: true
               });
           }
           
           const matchedKeywords = keywords.filter(keyword => 
               message.toLowerCase().includes(keyword.toLowerCase())
           );
           
           if (forceKeywordMatch && matchedKeywords.length === 0) {
               matchedKeywords.push('SIMULATED_MATCH');
           }
           
           const hasRecentlySent = keywordDetector.hasRecentlySentFlex(userId);
           const wouldSendFlex = containsKeyword && (!hasRecentlySent || keywordDetector.debugMode);
           
           // Actually process the message if it would send flex
           let actualResult = null;
           if (wouldSendFlex) {
               try {
                   // Call the actual processOutgoingMessage method
                   await keywordDetector.processOutgoingMessage(userId, message);
                   actualResult = {
                       processed: true,
                       message: 'processOutgoingMessage called successfully'
                   };
               } catch (processError) {
                   actualResult = {
                       processed: false,
                       error: processError.message
                   };
               }
           }
           
           const simulation = {
               input: {
                   userId: userId.substring(0, 10) + '...',
                   message: message,
                   messageLength: message.length,
                   forceKeywordMatch: !!forceKeywordMatch
               },
               detection: {
                   containsKeyword: containsKeyword,
                   matchedKeywords: matchedKeywords,
                   keywordsChecked: keywords,
                   caseSensitive: false
               },
               timing: {
                   hasRecentlySent: hasRecentlySent,
                   lastSentTime: keywordDetector.flexMessageSent.get(userId) || null,
                   sendTimeout: keywordDetector.config.sendTimeout,
                   debugMode: keywordDetector.debugMode
               },
               decision: {
                   wouldSendFlex: wouldSendFlex,
                   reason: !containsKeyword ? 'no_keyword_match' :
                           hasRecentlySent && !keywordDetector.debugMode ? 'recently_sent' :
                           'will_send'
               },
               actualExecution: actualResult
           };
           
           res.json({
               success: true,
               simulation: simulation,
               timestamp: Date.now()
           });
           
       } catch (error) {
           logger.error('❌ Keyword Debug API: Error simulating keyword detection', {
               error: error.message,
               stack: error.stack
           });
           res.status(500).json({
               success: false,
               error: error.message
           });
       }
   });

   // Debug test - clear user tracking
   router.post('/keyword-debug/clear-tracking/:userId', (req, res) => {
       try {
           const { userId } = req.params;
           
           if (!userId) {
               return res.status(400).json({
                   success: false,
                   error: 'userId is required'
               });
           }
           
           logger.info('🧹 Keyword Debug API: Clear user tracking', {
               userId: userId.substring(0, 10) + '...',
               hadTracking: keywordDetector.flexMessageSent.has(userId),
               lastSent: keywordDetector.flexMessageSent.get(userId)
           });
           
           const hadTracking = keywordDetector.flexMessageSent.has(userId);
           const lastSent = keywordDetector.flexMessageSent.get(userId);
           
           keywordDetector.flexMessageSent.delete(userId);
           
           res.json({
               success: true,
               message: `Tracking cleared for user`,
               cleared: {
                   userId: userId.substring(0, 10) + '...',
                   hadTracking: hadTracking,
                   lastSent: lastSent ? new Date(lastSent).toISOString() : null
               },
               currentTrackingCount: keywordDetector.flexMessageSent.size,
               timestamp: Date.now()
           });
           
       } catch (error) {
           logger.error('❌ Keyword Debug API: Error clearing user tracking', {
               error: error.message,
               stack: error.stack,
               userId: req.params.userId
           });
           res.status(500).json({
               success: false,
               error: error.message
           });
       }
   });

   // Debug test - clear all tracking
   router.post('/keyword-debug/clear-all-tracking', (req, res) => {
       try {
           const previousSize = keywordDetector.flexMessageSent.size;
           
           logger.info('🧹 Keyword Debug API: Clear all tracking', {
               previousTrackedUsers: previousSize
           });
           
           keywordDetector.resetFlexMessageTracking();
           
           res.json({
               success: true,
               message: 'All user tracking cleared',
               cleared: {
                   previousTrackedUsers: previousSize,
                   currentTrackedUsers: keywordDetector.flexMessageSent.size
               },
               timestamp: Date.now()
           });
           
       } catch (error) {
           logger.error('❌ Keyword Debug API: Error clearing all tracking', {
               error: error.message,
               stack: error.stack
           });
           res.status(500).json({
               success: false,
               error: error.message
           });
       }
   });

   // Debug test - force flex message send
   router.post('/keyword-debug/force-flex', async (req, res) => {
       try {
           const { userId } = req.body;
           
           if (!userId) {
               return res.status(400).json({
                   success: false,
                   error: 'userId is required'
               });
           }
           
           logger.info('🚀 Keyword Debug API: Force flex message send', {
               userId: userId.substring(0, 10) + '...',
               debugMode: keywordDetector.debugMode,
               hasRecentlySent: keywordDetector.hasRecentlySentFlex(userId)
           });
           
           const beforeStats = { ...keywordDetector.stats };
           const result = await keywordDetector.testSendFlexMessage(userId);
           const afterStats = { ...keywordDetector.stats };
           
           if (result) {
               keywordDetector.trackFlexMessageSent(userId);
           }
           
           res.json({
               success: true,
               result: {
                   flexSent: result,
                   message: result ? 'Flex message sent successfully' : 'Failed to send flex message'
               },
               stats: {
                   before: beforeStats,
                   after: afterStats,
                   changed: beforeStats.flexSentCount !== afterStats.flexSentCount
               },
               tracking: {
                   userNowTracked: keywordDetector.flexMessageSent.has(userId),
                   lastSentTime: keywordDetector.flexMessageSent.get(userId),
                   totalTrackedUsers: keywordDetector.flexMessageSent.size
               },
               timestamp: Date.now()
           });
           
       } catch (error) {
           logger.error('❌ Keyword Debug API: Error forcing flex send', {
               error: error.message,
               stack: error.stack
           });
           res.status(500).json({
               success: false,
               error: error.message
           });
       }
   });

   // Debug info - get all tracked users (admin only, anonymized)
   router.get('/keyword-debug/tracked-users', (req, res) => {
       try {
           const trackedUsers = [];
           const now = Date.now();
           
           for (const [userId, timestamp] of keywordDetector.flexMessageSent.entries()) {
               trackedUsers.push({
                   userIdHash: userId.substring(0, 8) + '***', // Anonymize
                   lastSent: new Date(timestamp).toISOString(),
                   timeAgo: now - timestamp,
                   timeAgoHours: (now - timestamp) / (60 * 60 * 1000),
                   isExpired: (now - timestamp) > keywordDetector.config.sendTimeout
               });
           }
           
           // Sort by most recent
           trackedUsers.sort((a, b) => b.lastSent.localeCompare(a.lastSent));
           
           logger.info('👥 Keyword Debug API: Get tracked users', {
               totalTrackedUsers: trackedUsers.length,
               sendTimeout: keywordDetector.config.sendTimeout,
               sendTimeoutHours: keywordDetector.config.sendTimeout / (60 * 60 * 1000)
           });
           
           res.json({
               success: true,
               trackedUsers: trackedUsers,
               summary: {
                   totalTrackedUsers: trackedUsers.length,
                   expiredUsers: trackedUsers.filter(u => u.isExpired).length,
                   activeUsers: trackedUsers.filter(u => !u.isExpired).length,
                   sendTimeout: keywordDetector.config.sendTimeout,
                   sendTimeoutHours: keywordDetector.config.sendTimeout / (60 * 60 * 1000)
               },
               timestamp: Date.now()
           });
           
       } catch (error) {
           logger.error('❌ Keyword Debug API: Error getting tracked users', {
               error: error.message,
               stack: error.stack
           });
           res.status(500).json({
               success: false,
               error: error.message
           });
       }
   });

   // *** HEALTH CHECK AND INFO ROUTES ***

   // Get keyword detector health and status
   router.get('/health', (req, res) => {
       try {
           const settings = keywordDetector.getSettings();
           const health = {
               status: 'healthy',
               keywordDetector: {
                   initialized: !!keywordDetector,
                   hasLineToken: !!keywordDetector.lineToken,
                   hasLineHandler: !!keywordDetector.lineHandler,
                   debugMode: settings.debugMode,
                   keywordCount: settings.keywords.length,
                   hasCustomFlexMessage: settings.hasCustomFlexMessage
               },
               stats: settings.stats,
               tracking: {
                   trackedUsers: keywordDetector.flexMessageSent.size,
                   sendTimeout: keywordDetector.config.sendTimeout,
                   sendTimeoutHours: keywordDetector.config.sendTimeout / (60 * 60 * 1000)
               },
               timestamp: Date.now()
           };
           
           logger.info('🏥 Keyword Health Check', {
               status: health.status,
               keywordCount: health.keywordDetector.keywordCount,
               debugMode: health.keywordDetector.debugMode,
               trackedUsers: health.tracking.trackedUsers
           });
           
           res.json(health);
           
       } catch (error) {
           logger.error('❌ Keyword Health Check Error', {
               error: error.message,
               stack: error.stack
           });
           res.status(500).json({
               status: 'unhealthy',
               error: error.message,
               timestamp: Date.now()
           });
       }
   });

   // Get keyword detector info and capabilities
   router.get('/info', (req, res) => {
       try {
           const settings = keywordDetector.getSettings();
           
           const info = {
               name: 'Keyword Detector Service',
               version: '1.0.0',
               description: 'Automatic keyword detection and flex message sending service',
               capabilities: {
                   keywordDetection: true,
                   flexMessageSending: !!keywordDetector.lineToken,
                   customFlexMessages: true,
                   userTracking: true,
                   debugMode: true,
                   configurationImportExport: true,
                   statisticsTracking: true
               },
               configuration: {
                   keywordCount: settings.keywords.length,
                   debugMode: settings.debugMode,
                   sendTimeoutHours: settings.sendTimeout / (60 * 60 * 1000),
                   hasCustomFlexMessage: settings.hasCustomFlexMessage
               },
               endpoints: {
                   keywords: [
                       'GET /keywords',
                       'POST /keywords',
                       'POST /keywords/test',
                       'POST /keywords/test-flex'
                   ],
                   settings: [
                       'GET /keyword-settings',
                       'POST /keyword-settings',
                       'POST /keyword-settings/reset',
                       'GET /keyword-settings/export',
                       'POST /keyword-settings/import',
                       'GET /keyword-settings/stats'
                   ],
                   customFlex: [
                       'GET /custom-flex',
                       'POST /custom-flex',
                       'DELETE /custom-flex',
                       'POST /custom-flex/test'
                   ],
                   debug: [
                       'GET /keyword-debug',
                       'POST /keyword-debug/{mode}',
                       'POST /keyword-debug/simulate',
                       'POST /keyword-debug/clear-tracking/{userId}',
                       'POST /keyword-debug/clear-all-tracking',
                       'POST /keyword-debug/force-flex',
                       'GET /keyword-debug/tracked-users'
                   ],
                   utility: [
                       'GET /health',
                       'GET /info'
                   ]
               },
               stats: settings.stats,
               connections: {
                   hasLineToken: !!keywordDetector.lineToken,
                   hasLineHandler: !!keywordDetector.lineHandler,
                   lineHandlerConnected: !!keywordDetector.lineHandler
               },
               timestamp: Date.now()
           };
           
           logger.info('ℹ️ Keyword Info Request', {
               keywordCount: info.configuration.keywordCount,
               debugMode: info.configuration.debugMode,
               hasLineToken: info.connections.hasLineToken,
               hasLineHandler: info.connections.hasLineHandler
           });
           
           res.json(info);
           
       } catch (error) {
           logger.error('❌ Keyword Info Error', {
               error: error.message,
               stack: error.stack
           });
           res.status(500).json({
               success: false,
               error: error.message
           });
       }
   });

   return router;
}

module.exports = createKeywordRoutes;