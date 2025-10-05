// keywordImageSender.js
'use strict';

const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { resolveDataPath, resolveTempPath } = require('../../../app/paths');

class KeywordImageSender {
    constructor(logger, lineHandler) {
        this.logger = logger;
        this.lineHandler = lineHandler;

        // Configuration
        this.config = {
            enabled: true,
            autoSendOnKeywordDetection: true,
            sendDelay: 1000,
            maxImageSize: 10 * 1024 * 1024, // 10MB
            caseSensitive: false,
            exactMatch: false,
            preventDuplicateSends: true,
            introMessageEnabled: true,
            introMessageTemplate: "📷 รูปภาพสำหรับ: {keyword}"
        };

        // Data directories
        this.dataDir = resolveDataPath('keyword_image_sender');
        this.configPath = path.join(this.dataDir, 'config.json');
        this.keywordMappingsPath = path.join(this.dataDir, 'keyword_mappings.json');
        this.userSendHistoryDir = path.join(this.dataDir, 'user_send_history');

        // In-memory data
        this.keywordMappings = new Map(); // keyword -> { imageUrls: [], imageType, description, enabled }
        this.userSendHistory = new Map(); // userId -> {keyword -> sendHistory}
        this.recentlySentImages = new Map(); // userId+keyword -> timestamp

        this.initialize();
    }

    async initialize() {
        try {
            // Create directories
            await fs.mkdir(this.dataDir, { recursive: true });
            await fs.mkdir(this.userSendHistoryDir, { recursive: true });
            await fs.mkdir(resolveTempPath(), { recursive: true });

            // Load configuration and data
            await this.loadConfig();
            await this.loadKeywordMappings();
            await this.loadUserSendHistories();

            this.logger.info('KeywordImageSender initialized successfully', {
                configLoaded: true,
                keywordMappingsCount: this.keywordMappings.size,
                userHistoryCount: this.userSendHistory.size,
                enabled: this.config.enabled
            });

            return true;
        } catch (error) {
            this.logger.error('Failed to initialize KeywordImageSender:', error);
            return false;
        }
    }

    // *** Configuration Management ***
    async loadConfig() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            const loadedConfig = JSON.parse(configData);
            this.config = { ...this.config, ...loadedConfig };
        } catch (error) {
            if (error.code !== 'ENOENT') {
                this.logger.error('Error loading config:', error);
            }
            await this.saveConfig();
        }
    }

    async saveConfig() {
        try {
            await fs.writeFile(
                this.configPath,
                JSON.stringify(this.config, null, 2),
                'utf8'
            );
        } catch (error) {
            this.logger.error('Error saving config:', error);
        }
    }

    // *** Keyword Mappings Management ***
    async loadKeywordMappings() {
        try {
            const mappingsData = await fs.readFile(this.keywordMappingsPath, 'utf8');
            const mappings = JSON.parse(mappingsData);

            this.keywordMappings.clear();
            Object.entries(mappings).forEach(([keyword, config]) => {
                this.keywordMappings.set(keyword, config);
            });
        } catch (error) {
            if (error.code !== 'ENOENT') {
                this.logger.error('Error loading keyword mappings:', error);
            }
        }
    }

    async saveKeywordMappings() {
        try {
            const mappings = Object.fromEntries(this.keywordMappings);
            await fs.writeFile(
                this.keywordMappingsPath,
                JSON.stringify(mappings, null, 2),
                'utf8'
            );
        } catch (error) {
            this.logger.error('Error saving keyword mappings:', error);
        }
    }

    // *** Keyword Management ***
    async addKeywordMapping(keyword, imageUrls, options = {}) {
        try {
            // Support single imageUrl for backward compatibility
            const imageUrlsArray = Array.isArray(imageUrls) ? imageUrls : [imageUrls];

            const keywordConfig = {
                keyword: keyword,
                imageUrls: imageUrlsArray, // Changed to array
                imageType: options.imageType || 'url', // 'url' or 'file'
                description: options.description || '',
                enabled: options.enabled !== false,
                caseSensitive: options.caseSensitive || false,
                exactMatch: options.exactMatch || false,
                introMessage: options.introMessage || null, // Custom intro message for this keyword
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };

            this.keywordMappings.set(keyword, keywordConfig);
            await this.saveKeywordMappings();

            this.logger.info('Keyword mapping added', {
                keyword: keyword,
                imageCount: imageUrlsArray.length,
                imageUrls: imageUrlsArray,
                imageType: keywordConfig.imageType,
                enabled: keywordConfig.enabled
            });

            return keywordConfig;
        } catch (error) {
            this.logger.error('Error adding keyword mapping:', error);
            throw error;
        }
    }

    async updateKeywordMapping(keyword, updates) {
        try {
            const existing = this.keywordMappings.get(keyword);
            if (!existing) {
                throw new Error('Keyword mapping not found');
            }

            const updated = {
                ...existing,
                ...updates,
                keyword: keyword, // Keep original keyword
                lastUpdated: new Date().toISOString()
            };

            this.keywordMappings.set(keyword, updated);
            await this.saveKeywordMappings();

            this.logger.info('Keyword mapping updated', {
                keyword: keyword,
                updates: Object.keys(updates)
            });

            return updated;
        } catch (error) {
            this.logger.error('Error updating keyword mapping:', error);
            throw error;
        }
    }

    async removeKeywordMapping(keyword) {
        try {
            const existed = this.keywordMappings.has(keyword);
            this.keywordMappings.delete(keyword);

            if (existed) {
                await this.saveKeywordMappings();
                this.logger.info('Keyword mapping removed', { keyword: keyword });
            }

            return existed;
        } catch (error) {
            this.logger.error('Error removing keyword mapping:', error);
            throw error;
        }
    }

    getKeywordMapping(keyword) {
        return this.keywordMappings.get(keyword) || null;
    }

    getAllKeywordMappings() {
        return Array.from(this.keywordMappings.entries()).map(([keyword, config]) => ({
            keyword,
            ...config
        }));
    }

    // *** Keyword Detection ***
    detectKeywordsInMessage(message) {
        if (!message || typeof message !== 'string') {
            return [];
        }

        this.logger.info('🔍 Detecting keywords in message', {
            messageLength: message.length,
            messagePreview: message.substring(0, 100) + '...',
            totalKeywords: this.keywordMappings.size
        });

        const detectedKeywords = [];

        // Debug: แสดงรายการ keywords ทั้งหมด
        this.logger.info('📋 Available keywords for detection:', {
            keywords: Array.from(this.keywordMappings.entries()).map(([keyword, config]) => ({
                keyword,
                enabled: config.enabled,
                caseSensitive: config.caseSensitive,
                exactMatch: config.exactMatch
            }))
        });

        for (const [keyword, config] of this.keywordMappings.entries()) {
            this.logger.info(`🔍 Checking keyword: "${keyword}"`, {
                enabled: config.enabled,
                caseSensitive: config.caseSensitive,
                exactMatch: config.exactMatch
            });

            if (!config.enabled) {
                this.logger.info(`⚠️ Keyword "${keyword}" is disabled, skipping`);
                continue;
            }

            let found = false;
            const searchMessage = config.caseSensitive ? message : message.toLowerCase();
            const searchKeyword = config.caseSensitive ? keyword : keyword.toLowerCase();

            this.logger.info(`🔍 Searching for "${searchKeyword}" in "${searchMessage.substring(0, 100)}..."`, {
                exactMatch: config.exactMatch,
                caseSensitive: config.caseSensitive
            });

            if (config.exactMatch) {
                // Exact word match
                const wordRegex = new RegExp(`\\b${this.escapeRegex(searchKeyword)}\\b`, 'g');
                found = wordRegex.test(searchMessage);
                this.logger.info(`🔍 Exact match test: regex="${wordRegex}" found=${found}`);
            } else {
                // Partial match
                found = searchMessage.includes(searchKeyword);
                this.logger.info(`🔍 Partial match test: found=${found}`);
            }

            if (found) {
                detectedKeywords.push({
                    keyword: keyword,
                    config: config,
                    matches: this.findKeywordMatches(searchMessage, searchKeyword, config.exactMatch)
                });

                this.logger.info(`✅ Keyword detected: ${keyword}`, {
                    exactMatch: config.exactMatch,
                    caseSensitive: config.caseSensitive
                });
            }
        }

        this.logger.info('Keyword detection completed', {
            detectedCount: detectedKeywords.length,
            keywords: detectedKeywords.map(k => k.keyword)
        });

        return detectedKeywords;
    }

    findKeywordMatches(message, keyword, exactMatch) {
        const matches = [];

        if (exactMatch) {
            const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'gi');
            let match;
            while ((match = regex.exec(message)) !== null) {
                matches.push({
                    text: match[0],
                    index: match.index
                });
            }
        } else {
            let index = 0;
            while ((index = message.indexOf(keyword, index)) !== -1) {
                matches.push({
                    text: keyword,
                    index: index
                });
                index += keyword.length;
            }
        }

        return matches;
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // *** Message Processing ***
    async processOutgoingMessage(userId, message) {
        try {
            this.logger.info('🔄 Processing outgoing message for keywords', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                messageLength: message ? message.length : 0,
                enabled: this.config.enabled,
                autoSend: this.config.autoSendOnKeywordDetection
            });

            if (!this.config.enabled || !this.config.autoSendOnKeywordDetection) {
                this.logger.info('❌ Auto-send disabled', {
                    enabled: this.config.enabled,
                    autoSend: this.config.autoSendOnKeywordDetection
                });
                return { processed: false, reason: 'Auto-send disabled' };
            }

            // *** โหลด keywords ใหม่ทุกครั้งเพื่อให้แน่ใจว่าได้ข้อมูลล่าสุด ***
            await this.loadKeywordMappings();

            const detectedKeywords = this.detectKeywordsInMessage(message);

            if (detectedKeywords.length === 0) {
                this.logger.info('❌ No keywords detected in message');
                return { processed: false, reason: 'No keywords detected' };
            }

            this.logger.info('✅ Keywords detected, processing for images', {
                keywordCount: detectedKeywords.length,
                keywords: detectedKeywords.map(k => k.keyword)
            });

            const results = [];

            for (const detectedKeyword of detectedKeywords) {
                try {
                    this.logger.info(`🔄 Processing keyword: ${detectedKeyword.keyword}`);
                    const result = await this.processKeywordForImage(userId, detectedKeyword);
                    results.push(result);

                    if (result.sent && detectedKeywords.indexOf(detectedKeyword) < detectedKeywords.length - 1) {
                        this.logger.info('⏱️ Waiting between image sends');
                        await new Promise(resolve =>
                            setTimeout(resolve, this.config.sendDelay)
                        );
                    }
                } catch (error) {
                    this.logger.error(`❌ Error processing keyword ${detectedKeyword.keyword}:`, error);
                    results.push({
                        keyword: detectedKeyword.keyword,
                        processed: false,
                        error: error.message
                    });
                }
            }

            const successfulSends = results.filter(r => r.sent);

            const finalResult = {
                processed: true,
                keywordsProcessed: detectedKeywords.length,
                imagesSent: successfulSends.length,
                results: results
            };

            this.logger.info('✅ Processing completed', finalResult);

            return finalResult;

        } catch (error) {
            this.logger.error('❌ Error processing outgoing message for keywords:', error);
            return { processed: false, error: error.message };
        }
    }

    async processKeywordForImage(userId, detectedKeyword) {
        try {
            const { keyword, config } = detectedKeyword;

            const shouldSend = this.shouldSendImage(userId, keyword);

            if (!shouldSend.should) {
                return {
                    keyword: keyword,
                    processed: true,
                    sent: false,
                    reason: shouldSend.reason
                };
            }

            const sendResult = await this.sendKeywordImage(userId, keyword, config);

            if (sendResult.success) {
                this.updateUserSendHistory(userId, keyword);

                return {
                    keyword: keyword,
                    processed: true,
                    sent: true,
                    imageUrls: config.imageUrls,
                    imageCount: config.imageUrls.length,
                    description: config.description
                };
            } else {
                return {
                    keyword: keyword,
                    processed: true,
                    sent: false,
                    reason: sendResult.error
                };
            }

        } catch (error) {
            this.logger.error(`Error processing keyword for image: ${detectedKeyword.keyword}`, error);
            return {
                keyword: detectedKeyword.keyword,
                processed: false,
                error: error.message
            };
        }
    }

    // *** Send History Management ***
    async loadUserSendHistories() {
        try {
            const files = await fs.readdir(this.userSendHistoryDir);

            for (const file of files) {
                if (file.endsWith('.json')) {
                    const userId = file.replace('.json', '');
                    const filePath = path.join(this.userSendHistoryDir, file);

                    try {
                        const historyData = await fs.readFile(filePath, 'utf8');
                        const history = JSON.parse(historyData);
                        this.userSendHistory.set(userId, history);
                    } catch (error) {
                        this.logger.warn(`Error loading history for user ${userId}:`, error);
                    }
                }
            }
        } catch (error) {
            this.logger.error('Error loading user send histories:', error);
        }
    }

    async saveUserSendHistory(userId) {
        try {
            const history = this.userSendHistory.get(userId) || {};
            const filePath = path.join(this.userSendHistoryDir, `${userId}.json`);

            await fs.writeFile(
                filePath,
                JSON.stringify(history, null, 2),
                'utf8'
            );
        } catch (error) {
            this.logger.error(`Error saving history for user ${userId}:`, error);
        }
    }

    getUserSendHistory(userId, keyword) {
        const userHistory = this.userSendHistory.get(userId) || {};
        return userHistory[keyword] || {
            totalSent: 0,
            lastSentAt: null,
            sendCount: 0
        };
    }

    updateUserSendHistory(userId, keyword) {
        let userHistory = this.userSendHistory.get(userId) || {};

        if (!userHistory[keyword]) {
            userHistory[keyword] = {
                totalSent: 0,
                lastSentAt: null,
                sendCount: 0
            };
        }

        const keywordHistory = userHistory[keyword];
        keywordHistory.totalSent += 1;
        keywordHistory.lastSentAt = new Date().toISOString();
        keywordHistory.sendCount += 1;

        this.userSendHistory.set(userId, userHistory);
        this.saveUserSendHistory(userId);
    }

    shouldSendImage(userId, keyword) {
        if (!this.config.enabled) {
            return { should: false, reason: 'Service disabled' };
        }

        if (!this.config.preventDuplicateSends) {
            return { should: true, reason: 'Duplicate prevention disabled' };
        }

        const history = this.getUserSendHistory(userId, keyword);

        if (history.totalSent === 0) {
            return { should: true, reason: 'First time sending for this keyword' };
        }

        // สำหรับระบบใหม่: ป้องกันการส่งซ้ำต่อ keyword ต่อผู้ใช้
        // ถ้าเคยส่งแล้วจะไม่ส่งอีก (ยกเว้นกรณีที่ผ่านไป 24 ชั่วโมง)
        const lastSent = new Date(history.lastSentAt);
        const now = new Date();
        const hoursSinceLastSend = (now - lastSent) / (1000 * 60 * 60);

        if (hoursSinceLastSend >= 24) { // 24 hours
            return { should: true, reason: 'More than 24 hours since last send' };
        }

        return {
            should: false,
            reason: `Already sent ${Math.round(hoursSinceLastSend * 60)} minutes ago for this keyword`
        };
    }

    // *** Image Sending Methods ***
    async sendKeywordImage(userId, keyword, config) {
        try {
            this.logger.info('Preparing to send keyword images', {
                userId: userId.substring(0, 10) + '...',
                keyword: keyword,
                imageCount: config.imageUrls.length,
                imageUrls: config.imageUrls,
                imageType: config.imageType
            });

            let sendResult;

            // ถ้ามีรูปเดียว ส่งแบบปกติ
            if (config.imageUrls.length === 1) {
                if (config.imageType === 'file') {
                    sendResult = await this.sendSingleImageFromFile(userId, keyword, config.imageUrls[0]);
                } else {
                    sendResult = await this.sendSingleImageFromUrl(userId, keyword, config.imageUrls[0]);
                }
            } else {
                // ถ้ามีหลายรูป ส่งแบบอัลบั้ม
                sendResult = await this.sendMultipleImagesAsAlbum(userId, keyword, config);
            }

            // Send intro message after image if enabled
            if (sendResult.success && this.config.introMessageEnabled) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    const introMessage = this.generateIntroMessage(keyword, config);
                    await this.lineHandler.pushMessage(userId, introMessage, null, false);

                    this.logger.info('✅ Intro message sent AFTER images', {
                        userId: userId.substring(0, 10) + '...',
                        keyword: keyword,
                        imageCount: config.imageUrls.length,
                        introMessageLength: introMessage.length
                    });
                } catch (introError) {
                    this.logger.error('❌ Error sending intro message after images:', introError);
                }
            }

            return sendResult;

        } catch (error) {
            this.logger.error('❌ Error sending keyword images:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    generateIntroMessage(keyword, config) {
        // Use custom intro message if provided, otherwise use template
        if (config.introMessage) {
            return config.introMessage.replace('{keyword}', keyword);
        }

        return this.config.introMessageTemplate.replace('{keyword}', keyword);
    }

    async sendSingleImageFromUrl(userId, keyword, imageUrl) {
        try {
            // Send image directly from URL
            const response = await axios.post(
                'https://api.line.me/v2/bot/message/push',
                {
                    to: userId,
                    messages: [{
                        type: 'image',
                        originalContentUrl: imageUrl,
                        previewImageUrl: imageUrl
                    }]
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
                    },
                    timeout: 30000
                }
            );

            if (response.status === 200) {
                this.logger.info('Image sent successfully from URL', {
                    userId: userId.substring(0, 10) + '...',
                    keyword: keyword,
                    imageUrl: imageUrl
                });

                return {
                    success: true,
                    method: 'url'
                };
            } else {
                throw new Error(`LINE API error: ${response.status} - ${response.statusText}`);
            }

        } catch (error) {
            this.logger.error('Error sending image from URL:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // *** ส่งหลายรูปแบบอัลบั้ม (Flex Message Carousel) ***
    async sendMultipleImagesAsAlbum(userId, keyword, config) {
        try {
            this.logger.info('Preparing to send multiple images as album', {
                userId: userId.substring(0, 10) + '...',
                keyword: keyword,
                imageCount: config.imageUrls.length,
                imageType: config.imageType
            });

            const imageMessages = [];

            // สร้าง flex message carousel สำหรับหลายรูป
            for (let i = 0; i < config.imageUrls.length && i < 10; i++) { // จำกัดไม่เกิน 10 รูป
                const imageUrl = config.imageUrls[i];
                let finalImageUrl = imageUrl;

                // ถ้าเป็น file type ต้อง upload ก่อน
                if (config.imageType === 'file') {
                    try {
                        if (!await this.fileExists(imageUrl)) {
                            this.logger.warn(`Image file not found: ${imageUrl}, skipping`);
                            continue;
                        }

                        const imageBuffer = await fs.readFile(imageUrl);
                        finalImageUrl = await this.uploadToTempStorage(imageBuffer, `${keyword}_${i}_${Date.now()}.jpg`);
                    } catch (fileError) {
                        this.logger.error(`Error processing file ${imageUrl}:`, fileError);
                        continue;
                    }
                }

                imageMessages.push({
                    type: 'image',
                    originalContentUrl: finalImageUrl,
                    previewImageUrl: finalImageUrl
                });
            }

            if (imageMessages.length === 0) {
                throw new Error('No valid images to send');
            }

            // ส่งข้อความทั้งหมดใน batch เดียว
            const response = await axios.post(
                'https://api.line.me/v2/bot/message/push',
                {
                    to: userId,
                    messages: imageMessages
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
                    },
                    timeout: 30000
                }
            );

            if (response.status === 200) {
                this.logger.info('✅ Multiple images sent successfully as album', {
                    userId: userId.substring(0, 10) + '...',
                    keyword: keyword,
                    imageCount: imageMessages.length,
                    totalRequested: config.imageUrls.length
                });

                return {
                    success: true,
                    method: 'album',
                    imageCount: imageMessages.length
                };
            } else {
                throw new Error(`LINE API error: ${response.status} - ${response.statusText}`);
            }

        } catch (error) {
            this.logger.error('❌ Error sending multiple images as album:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async sendSingleImageFromFile(userId, keyword, filePath) {
        try {
            // Check if file exists

            if (!await this.fileExists(filePath)) {
                throw new Error(`Image file not found: ${filePath}`);
            }

            // Read image file
            const imageBuffer = await fs.readFile(filePath);

            // Check file size
            if (imageBuffer.length < 100) {
                throw new Error('Image file too small (possibly corrupted)');
            }

            if (imageBuffer.length > this.config.maxImageSize) {
                throw new Error(`Image too large: ${Math.round(imageBuffer.length / 1024 / 1024)}MB (max 10MB)`);
            }

            // Upload to temp storage
            const imageUrl = await this.uploadToTempStorage(imageBuffer, `${keyword}_${Date.now()}.jpg`);

            // Send image via LINE API
            const response = await axios.post(
                'https://api.line.me/v2/bot/message/push',
                {
                    to: userId,
                    messages: [{
                        type: 'image',
                        originalContentUrl: imageUrl,
                        previewImageUrl: imageUrl
                    }]
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
                    },
                    timeout: 30000
                }
            );

            if (response.status === 200) {
                this.logger.info('Image sent successfully from file', {
                    userId: userId.substring(0, 10) + '...',
                    keyword: keyword,
                    filePath: filePath,
                    size: imageBuffer.length
                });

                return {
                    success: true,
                    method: 'file',
                    finalSize: imageBuffer.length
                };
            } else {
                throw new Error(`LINE API error: ${response.status} - ${response.statusText}`);
            }

        } catch (error) {
            this.logger.error('Error sending image from file:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async uploadToTempStorage(imageBuffer, originalFilename) {
        try {
            const tempDir = resolveTempPath();
            await fs.mkdir(tempDir, { recursive: true, mode: 0o755 });

            // Generate unique filename
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substring(2, 8);
            const ext = path.extname(originalFilename) || '.jpg';
            const nameWithoutExt = path.basename(originalFilename, ext);
            const cleanName = nameWithoutExt.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 20);
            const tempFilename = `kw_${timestamp}_${randomStr}_${cleanName}${ext}`;
            const tempPath = path.join(tempDir, tempFilename);

            // Write file
            await fs.writeFile(tempPath, imageBuffer, { mode: 0o644 });

            // Verify file was written correctly
            const stats = await fs.stat(tempPath);
            if (stats.size !== imageBuffer.length) {
                throw new Error(`File write verification failed`);
            }

            // Generate URL
            const baseUrl = process.env.NGROK_URL || process.env.BASE_URL || process.env.PUBLIC_URL;

            if (!baseUrl) {
                throw new Error('No base URL configured. Set NGROK_URL, BASE_URL, or PUBLIC_URL');
            }

            if (!baseUrl.startsWith('https://')) {
                throw new Error('Base URL must use HTTPS for LINE API compatibility');
            }

            const imageUrl = `${baseUrl}/api/keyword-images/images/${tempFilename}?ngrok-skip-browser-warning=true&v=${timestamp}`;

            this.logger.info('✅ Image uploaded to temp storage successfully:', {
                originalFilename: originalFilename,
                tempFilename: tempFilename,
                imageUrl: imageUrl,
                size: imageBuffer.length
            });

            // Auto-delete after 24 hours
            setTimeout(async () => {
                try {
                    const stillExists = await fs.access(tempPath).then(() => true).catch(() => false);
                    if (stillExists) {
                        await fs.unlink(tempPath);
                        this.logger.debug('🗑️ Auto-deleted temp file:', { tempFilename });
                    }
                } catch (error) {
                    this.logger.debug('⚠️ Error auto-deleting temp file:', {
                        tempFilename,
                        error: error.message
                    });
                }
            }, 24 * 60 * 60 * 1000); // 24 hours

            return imageUrl;

        } catch (error) {
            this.logger.error('❌ Error uploading image to temp storage:', error);
            throw error;
        }
    }

    // *** Utility Methods ***
    async fileExists(filepath) {
        try {
            await fs.access(filepath);
            return true;
        } catch {
            return false;
        }
    }

    // *** Configuration Methods ***
    async updateConfig(newConfig) {
        try {
            const validKeys = [
                'enabled', 'autoSendOnKeywordDetection', 'sendDelay', 'maxImageSize',
                'caseSensitive', 'exactMatch', 'preventDuplicateSends',
                'introMessageEnabled', 'introMessageTemplate'
            ];

            const updates = {};

            Object.keys(newConfig).forEach(key => {
                if (validKeys.includes(key)) {
                    updates[key] = newConfig[key];
                }
            });

            this.config = { ...this.config, ...updates };
            await this.saveConfig();

            this.logger.info('KeywordImageSender config updated', {
                updatedKeys: Object.keys(updates),
                newConfig: updates
            });

            return {
                success: true,
                updatedConfig: this.config,
                updatedKeys: Object.keys(updates)
            };

        } catch (error) {
            this.logger.error('Error updating config:', error);
            throw error;
        }
    }

    getConfig() {
        return {
            ...this.config,
            statistics: {
                keywordMappingsCount: this.keywordMappings.size,
                userHistoryCount: this.userSendHistory.size,
                recentlySentCount: this.recentlySentImages.size
            }
        };
    }

    // *** Statistics ***
    getStatistics() {
        const stats = {
            totalKeywords: this.keywordMappings.size,
            enabledKeywords: 0,
            totalUsers: this.userSendHistory.size,
            totalImagesSent: 0,
            totalSendEvents: 0,
            keywordBreakdown: {}
        };

        // Count enabled keywords
        for (const [keyword, config] of this.keywordMappings.entries()) {
            if (config.enabled) {
                stats.enabledKeywords++;
            }
        }

        // Collect send statistics
        this.userSendHistory.forEach((userHistory, userId) => {
            Object.entries(userHistory).forEach(([keyword, history]) => {
                stats.totalImagesSent += history.totalSent;
                stats.totalSendEvents += history.sendCount;

                if (!stats.keywordBreakdown[keyword]) {
                    stats.keywordBreakdown[keyword] = {
                        totalSent: 0,
                        sendCount: 0,
                        uniqueUsers: new Set()
                    };
                }

                stats.keywordBreakdown[keyword].totalSent += history.totalSent;
                stats.keywordBreakdown[keyword].sendCount += history.sendCount;
                stats.keywordBreakdown[keyword].uniqueUsers.add(userId);
            });
        });

        // Convert Sets to counts
        Object.keys(stats.keywordBreakdown).forEach(keyword => {
            stats.keywordBreakdown[keyword].uniqueUsers = stats.keywordBreakdown[keyword].uniqueUsers.size;
        });

        return stats;
    }

    // *** Testing Methods ***
    async testKeywordDetection(message) {
        try {
            const detectedKeywords = this.detectKeywordsInMessage(message);

            return {
                message: message,
                detectedCount: detectedKeywords.length,
                detectedKeywords: detectedKeywords,
                config: {
                    enabled: this.config.enabled,
                    autoSend: this.config.autoSendOnKeywordDetection,
                    caseSensitive: this.config.caseSensitive,
                    exactMatch: this.config.exactMatch
                }
            };
        } catch (error) {
            this.logger.error('Error in keyword detection test:', error);
            return {
                error: error.message,
                detectedKeywords: []
            };
        }
    }

    async testKeywordSend(userId, keyword) {
        try {
            const config = this.getKeywordMapping(keyword);
            if (!config) {
                throw new Error('Keyword mapping not found');
            }

            const result = await this.processKeywordForImage(userId, { keyword, config });

            return {
                success: true,
                testResult: result,
                message: result.sent ?
                    `Successfully sent image for keyword: ${keyword}` :
                    `Image not sent: ${result.reason}`
            };

        } catch (error) {
            this.logger.error('Error testing keyword send:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // *** Health Check ***
    async healthCheck() {
        try {
            const health = {
                status: 'healthy',
                config: {
                    enabled: this.config.enabled,
                    autoSendOnKeywordDetection: this.config.autoSendOnKeywordDetection,
                    caseSensitive: this.config.caseSensitive,
                    exactMatch: this.config.exactMatch,
                    preventDuplicateSends: this.config.preventDuplicateSends,
                    introMessageEnabled: this.config.introMessageEnabled
                },
                data: {
                    keywordMappings: this.keywordMappings.size,
                    userHistories: this.userSendHistory.size,
                    recentlySent: this.recentlySentImages.size
                },
                directories: {
                    dataDir: await this.fileExists(this.dataDir),
                    userHistoryDir: await this.fileExists(this.userSendHistoryDir),
                    tempImagesDir: await this.fileExists(resolveTempPath())
                },
                files: {
                    config: await this.fileExists(this.configPath),
                    keywordMappings: await this.fileExists(this.keywordMappingsPath)
                }
            };

            health.lineToken = !!process.env.LINE_CHANNEL_ACCESS_TOKEN;
            health.lineHandlerConnected = !!this.lineHandler;

            return health;
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // *** Cleanup ***
    async cleanup() {
        try {
            this.logger.info('Starting KeywordImageSender cleanup');

            // Clean temp images older than 24 hours
            const tempDir = resolveTempPath();
            try {
                const tempFiles = await fs.readdir(tempDir);
                const now = Date.now();
                let deletedCount = 0;

                for (const file of tempFiles) {
                    if (file.startsWith('kw_')) {
                        const filePath = path.join(tempDir, file);
                        const stats = await fs.stat(filePath);

                        if (now - stats.mtime.getTime() > 24 * 60 * 60 * 1000) {
                            await fs.unlink(filePath);
                            deletedCount++;
                            this.logger.debug(`Deleted temp file: ${file}`);
                        }
                    }
                }

                if (deletedCount > 0) {
                    this.logger.info(`Cleaned up ${deletedCount} temp image files`);
                }
            } catch (error) {
                this.logger.debug('No temp directory to clean or error accessing it:', error.message);
            }

            // Clear cache
            this.recentlySentImages.clear();

            this.logger.info('KeywordImageSender cleanup completed');

            return { success: true };
        } catch (error) {
            this.logger.error('Error during cleanup:', error);
            throw error;
        }
    }
}

module.exports = KeywordImageSender;
