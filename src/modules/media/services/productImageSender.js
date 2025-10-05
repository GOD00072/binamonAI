    // productImageSender.js
    'use strict';

    const fs = require('fs').promises;
    const path = require('path');
    const axios = require('axios');

    class ProductImageSender {
        constructor(logger, lineHandler) {
            this.logger = logger;
            this.lineHandler = lineHandler;
            
            // Configuration
            this.config = {
                enabled: true,
                maxImagesPerProduct: 10,
                preventDuplicateSends: true,
                autoSendOnUrlDetection: true,
                imageSelectionMode: 'manual', // 'manual', 'all', 'primary_first'
                sendDelay: 1000,
                maxImageSize: 10 * 1024 * 1024, // 10MB
                useOriginalImages: true,
                imageDisplayMode: 'carousel' // 'individual', 'carousel', 'flex'
            };
            
            // Data directories
            this.dataDir = path.join(__dirname, 'data', 'product_image_sender');
            this.configPath = path.join(this.dataDir, 'config.json');
            this.userSendHistoryDir = path.join(this.dataDir, 'user_send_history');
            this.imageSelectionsPath = path.join(this.dataDir, 'image_selections.json');
            
            // In-memory data
            this.userSendHistory = new Map(); // userId -> {productUrl -> sendHistory}
            this.imageSelections = new Map(); // productUrl -> selectedImages config
            this.recentlySentImages = new Map(); // userId+productUrl -> timestamp
            
            // Product and image directories
            this.productsDir = path.join(__dirname, 'products');
            this.imagesDir = path.join(__dirname, 'products', 'images');
            
            this.initialize();
        }

        async initialize() {
            try {
                // Create directories
                await fs.mkdir(this.dataDir, { recursive: true });
                await fs.mkdir(this.userSendHistoryDir, { recursive: true });
                await fs.mkdir(path.join(__dirname, 'temp_images'), { recursive: true });
                
                // Load configuration and data
                await this.loadConfig();
                await this.loadImageSelections();
                await this.loadUserSendHistories();
                
                this.logger.info('ProductImageSender initialized successfully', {
                    configLoaded: true,
                    imageSelectionsCount: this.imageSelections.size,
                    userHistoryCount: this.userSendHistory.size,
                    useOriginalImages: this.config.useOriginalImages
                });
                
                return true;
            } catch (error) {
                this.logger.error('Failed to initialize ProductImageSender:', error);
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

        // *** Image Selection Management ***
        async loadImageSelections() {
            try {
                const selectionsData = await fs.readFile(this.imageSelectionsPath, 'utf8');
                const selections = JSON.parse(selectionsData);
                
                this.imageSelections.clear();
                Object.entries(selections).forEach(([url, config]) => {
                    this.imageSelections.set(url, config);
                });
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    this.logger.error('Error loading image selections:', error);
                }
            }
        }

        async saveImageSelections() {
            try {
                const selections = Object.fromEntries(this.imageSelections);
                await fs.writeFile(
                    this.imageSelectionsPath,
                    JSON.stringify(selections, null, 2),
                    'utf8'
                );
            } catch (error) {
                this.logger.error('Error saving image selections:', error);
            }
        }

        getImageSelection(productUrl) {
            return this.imageSelections.get(productUrl) || null;
        }

        async setImageSelection(productUrl, selectedImages, productData) {
            try {
                const selectionConfig = {
                    productUrl: productUrl,
                    productName: productData.productName || productData.product_name || 'Unknown Product',
                    sku: productData.sku || '',
                    totalImages: selectedImages.length,
                    selectedImages: selectedImages,
                    lastUpdated: new Date().toISOString(),
                    selectionMode: 'manual'
                };

                this.imageSelections.set(productUrl, selectionConfig);
                await this.saveImageSelections();

                this.logger.info('Image selection updated', {
                    productUrl: productUrl,
                    selectedCount: selectedImages.filter(img => img.selected).length,
                    totalCount: selectedImages.length
                });

                return selectionConfig;
            } catch (error) {
                this.logger.error('Error setting image selection:', error);
                throw error;
            }
        }
        
        async updateProductImageSelections(productUrl, selections) {
            try {
                let selection = this.getImageSelection(productUrl);
                
                // ถ้ายังไม่มี selection ให้สร้างขึ้นมาใหม่ก่อน
                if (!selection) {
                    const productData = await this.findProductByUrl(productUrl);
                    if (!productData) {
                        throw new Error('Product data not found to create new selection.');
                    }
                    selection = this.createDefaultImageSelection(productData);
                }

                const { selectedImages, imageOrder } = selections;

                // Update the 'selected' and 'selectionOrder' properties of each image
                selection.selectedImages.forEach(img => {
                    const isSelected = selectedImages.includes(img.filename);
                    img.selected = isSelected;
                    img.selectionOrder = isSelected ? (imageOrder[img.filename] || null) : null;
                });

                selection.lastUpdated = new Date().toISOString();
                selection.selectionMode = 'manual'; // Mark as manually selected

                this.imageSelections.set(productUrl, selection);
                await this.saveImageSelections();

                const newSelectedCount = selection.selectedImages.filter(img => img.selected).length;

                this.logger.info('Updated product image selections', {
                    productUrl,
                    selectedCount: newSelectedCount,
                });

                return {
                    success: true,
                    message: 'Image selections updated successfully.',
                    productUrl,
                    selectedCount: newSelectedCount,
                    selection,
                };
            } catch (error) {
                this.logger.error('Error updating product image selections:', error);
                throw error;
            }
        }

        createDefaultImageSelection(productData) {
            const images = productData.images || [];
            const selectedImages = images.map((img, index) => ({
                ...img,
                selected: index < 3, // เลือก 3 รูปแรกเป็นค่าเริ่มต้น
                order: index,
                selectionOrder: index < 3 ? index + 1 : null
            }));

            return {
                productUrl: productData.url || '',
                productName: productData.productName || productData.product_name || 'Unknown Product',
                sku: productData.sku || '',
                totalImages: images.length,
                selectedImages: selectedImages,
                lastUpdated: new Date().toISOString(),
                selectionMode: 'default'
            };
        }

        getSelectedImagesForSending(productUrl) {
            const selection = this.getImageSelection(productUrl);
            if (!selection) {
                return [];
            }

            return selection.selectedImages
                .filter(img => img.selected)
                .sort((a, b) => (a.selectionOrder || 999) - (b.selectionOrder || 999));
        }

        async updateImageSelection(productUrl, imageFilename, selected, selectionOrder = null) {
            try {
                const selection = this.getImageSelection(productUrl);
                if (!selection) {
                    throw new Error('Product selection not found');
                }

                // ค้นหารูปภาพด้วยวิธีการหลากหลาย
                const findResult = this.findImageInSelection(selection, imageFilename);
                
                if (!findResult.found) {
                    throw new Error(`Image not found: ${findResult.reason}`);
                }

                const imageIndex = findResult.index;
                selection.selectedImages[imageIndex].selected = selected;
                selection.selectedImages[imageIndex].selectionOrder = selected ? selectionOrder : null;
                selection.lastUpdated = new Date().toISOString();

                this.imageSelections.set(productUrl, selection);
                await this.saveImageSelections();

                this.logger.info('Image selection updated', {
                    productUrl: productUrl,
                    imageFilename: imageFilename,
                    selected: selected
                });

                return selection;
            } catch (error) {
                this.logger.error('Error updating image selection:', error);
                throw error;
            }
        }

        // *** Product Data Management ***
        async findProductByUrl(url) {
            try {
                const files = await fs.readdir(this.productsDir);
                const productFiles = files.filter(file => file.endsWith('.json') && file.startsWith('product_'));
                
                for (const file of productFiles) {
                    try {
                        const filePath = path.join(this.productsDir, file);
                        const content = await fs.readFile(filePath, 'utf8');
                        const product = JSON.parse(content);
                        
                        if (product.url === url) {
                            return {
                                url: product.url,
                                productName: product.product_name,
                                sku: product.sku,
                                images: this.processProductImages(product.images || []),
                                lastUpdated: product.last_updated
                            };
                        }
                    } catch (error) {
                        this.logger.warn(`Error reading product file ${file}:`, error);
                    }
                }
                
                return null;
            } catch (error) {
                this.logger.error('Error finding product by URL:', error);
                return null;
            }
        }

        processProductImages(images) {
            return images
                .filter(img => img.status === 'downloaded' && !img.skipped && img.localPath)
                .map(img => ({
                    filename: img.filename || path.basename(img.localPath),
                    originalName: img.originalName || img.filename,
                    localPath: img.localPath,
                    url: img.url,
                    isPrimary: img.isPrimary || false,
                    order: img.order || 0,
                    size: img.size || 0,
                    alt: img.alt || '',
                    title: img.title || '',
                    status: img.status,
                    uploadedManually: img.uploadedManually || false,
                    uploadedAt: img.uploadedAt,
                    downloadedAt: img.downloadedAt
                }))
                .sort((a, b) => {
                    if (a.isPrimary && !b.isPrimary) return -1;
                    if (!a.isPrimary && b.isPrimary) return 1;
                    return (a.order || 0) - (b.order || 0);
                });
        }

        // *** Enhanced Image Finding ***
        findImageInSelection(selection, searchFilename) {
            const images = selection.selectedImages;
            
            // ลองค้นหาด้วยวิธีต่างๆ
            const searchMethods = [
                // 1. ตรงกับ filename
                { method: 'filename_exact', finder: () => images.findIndex(img => img.filename === searchFilename) },
                
                // 2. ตรงกับ originalName
                { method: 'originalName_exact', finder: () => images.findIndex(img => img.originalName === searchFilename) },
                
                // 3. ค้นหาจาก localPath
                { method: 'localPath_basename', finder: () => images.findIndex(img => 
                    img.localPath && path.basename(img.localPath) === searchFilename) },
                
                // 4. Partial match filename
                { method: 'filename_includes', finder: () => images.findIndex(img => 
                    img.filename && img.filename.includes(searchFilename)) },
                
                // 5. Partial match originalName
                { method: 'originalName_includes', finder: () => images.findIndex(img => 
                    img.originalName && img.originalName.includes(searchFilename)) },
                
                // 6. Reverse partial match
                { method: 'reverse_includes', finder: () => images.findIndex(img => 
                    searchFilename.includes(img.filename) || searchFilename.includes(img.originalName || '')) }
            ];

            for (const searchMethod of searchMethods) {
                const index = searchMethod.finder();
                if (index >= 0) {
                    return {
                        found: true,
                        index: index,
                        image: images[index],
                        method: searchMethod.method
                    };
                }
            }

            return {
                found: false,
                reason: `Image not found with any search method`,
                availableImages: images.map(img => ({
                    filename: img.filename,
                    originalName: img.originalName,
                    localPath: img.localPath ? path.basename(img.localPath) : null
                }))
            };
        }

        findImageInProduct(productUrl, searchFilename) {
            const selection = this.getImageSelection(productUrl);
            if (!selection) {
                return {
                    found: false,
                    reason: 'Product selection not found',
                    availableImages: []
                };
            }

            return this.findImageInSelection(selection, searchFilename);
        }

        // *** URL Detection and Processing ***
        extractUrlsFromMessage(message) {
            if (!message || typeof message !== 'string') {
                return [];
            }
            
            this.logger.info('🔍 Extracting URLs from message', {
                messageLength: message.length,
                messagePreview: message.substring(0, 100) + '...'
            });
            
            const urlPatterns = [
                // รองรับ URL ที่มี subdomain
                /https:\/\/(?:www\.)?hongthaipackaging\.com\/product\/[^\s\n\r\t)}\]"'<>]+/gi,
                // รองรับ URL ทั่วไป
                /https:\/\/[^\s\n\r\t)}\]"'<>]+hongthaipackaging\.com[^\s\n\r\t)}\]"'<>]*/gi,
                // URL pattern อื่นๆ
                /https:\/\/[^\s\n\r\t)}\]"'<>]+/gi
            ];
            
            const urls = [];
            urlPatterns.forEach((pattern, index) => {
                const matches = message.match(pattern);
                if (matches) {
                    this.logger.info(`Pattern ${index + 1} found ${matches.length} URLs`);
                    urls.push(...matches);
                }
            });
            
            // Clean and validate URLs
            const cleanedUrls = urls.map(url => {
                let cleanUrl = url.trim();
                // ลบอักขระท้ายที่ไม่ต้องการ
                cleanUrl = cleanUrl.replace(/[)}\]\.,;!?'"]+$/, '');
                return cleanUrl;
            }).filter(url => {
                try {
                    new URL(url);
                    const isValid = url.length > 10 && 
                                (url.includes('hongthaipackaging.com') || 
                                    url.includes('product/'));
                    
                    if (isValid) {
                        this.logger.info(`✅ Valid URL found: ${url}`);
                    } else {
                        this.logger.info(`❌ Invalid URL filtered: ${url}`);
                    }
                    
                    return isValid;
                } catch {
                    this.logger.info(`❌ Invalid URL format: ${url}`);
                    return false;
                }
            });
            
            const uniqueUrls = [...new Set(cleanedUrls)];
            
            this.logger.info('URL extraction completed', {
                totalFound: urls.length,
                afterCleaning: cleanedUrls.length,
                unique: uniqueUrls.length,
                urls: uniqueUrls
            });
            
            return uniqueUrls;
        }

        async processOutgoingMessage(userId, message) {
            try {
                this.logger.info('🔄 Processing outgoing message for images', {
                    userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                    messageLength: message ? message.length : 0,
                    enabled: this.config.enabled,
                    autoSend: this.config.autoSendOnUrlDetection
                });
                
                if (!this.config.enabled || !this.config.autoSendOnUrlDetection) {
                    this.logger.info('❌ Auto-send disabled', {
                        enabled: this.config.enabled,
                        autoSend: this.config.autoSendOnUrlDetection
                    });
                    return { processed: false, reason: 'Auto-send disabled' };
                }
                
                const urls = this.extractUrlsFromMessage(message);
                
                if (urls.length === 0) {
                    this.logger.info('❌ No URLs detected in message', {
                        messagePreview: message ? message.substring(0, 200) + '...' : 'undefined'
                    });
                    return { processed: false, reason: 'No URLs detected' };
                }
                
                this.logger.info('✅ URLs detected, processing for images', {
                    urlCount: urls.length,
                    urls: urls
                });
                
                const results = [];
                
                for (const url of urls) {
                    try {
                        this.logger.info(`🔄 Processing URL: ${url}`);
                        const result = await this.processUrlForImages(userId, url);
                        results.push(result);
                        
                        if (result.sent && urls.indexOf(url) < urls.length - 1) {
                            this.logger.info('⏱️ Waiting between image sends');
                            await new Promise(resolve => 
                                setTimeout(resolve, this.config.sendDelay * 2)
                            );
                        }
                    } catch (error) {
                        this.logger.error(`❌ Error processing URL ${url}:`, error);
                        results.push({
                            url: url,
                            processed: false,
                            error: error.message
                        });
                    }
                }
                
                const successfulSends = results.filter(r => r.sent);
                
                const finalResult = {
                    processed: true,
                    urlsProcessed: urls.length,
                    imagesSent: successfulSends.reduce((sum, r) => sum + (r.imagesSent || 0), 0),
                    results: results
                };
                
                this.logger.info('✅ Processing completed', finalResult);
                
                return finalResult;
                
            } catch (error) {
                this.logger.error('❌ Error processing outgoing message for images:', error);
                return { processed: false, error: error.message };
            }
        }

        async processUrlForImages(userId, url) {
            try {
                const productData = await this.findProductByUrl(url);
                
                if (!productData) {
                    return {
                        url: url,
                        processed: true,
                        sent: false,
                        reason: 'No product data found'
                    };
                }
                
                const shouldSend = this.shouldSendImages(userId, url);
                
                if (!shouldSend.should) {
                    return {
                        url: url,
                        processed: true,
                        sent: false,
                        reason: shouldSend.reason,
                        productName: productData.productName
                    };
                }
                
                const imagesToSend = this.selectImagesToSend(productData.images, url);
                
                if (imagesToSend.length === 0) {
                    return {
                        url: url,
                        processed: true,
                        sent: false,
                        reason: 'No images selected for sending',
                        productName: productData.productName
                    };
                }
                
                const sendResult = await this.sendProductImages(userId, imagesToSend, productData);
                
                if (sendResult.success) {
                    this.updateUserSendHistory(userId, url, imagesToSend);
                    
                    return {
                        url: url,
                        processed: true,
                        sent: true,
                        imagesSent: sendResult.imagesSent,
                        productName: productData.productName,
                        sentImages: imagesToSend.map(img => img.filename)
                    };
                } else {
                    return {
                        url: url,
                        processed: true,
                        sent: false,
                        reason: sendResult.error,
                        productName: productData.productName
                    };
                }
                
            } catch (error) {
                this.logger.error(`Error processing URL for images: ${url}`, error);
                return {
                    url: url,
                    processed: false,
                    error: error.message
                };
            }
        }

        selectImagesToSend(images, productUrl) {
            // ตรวจสอบการเลือกแบบ manual ก่อน
            if (this.config.imageSelectionMode === 'manual') {
                const selectedImages = this.getSelectedImagesForSending(productUrl);
                
                if (selectedImages && selectedImages.length > 0) {
                    return selectedImages;
                }
                
                // ถ้าไม่มีการเลือก ให้สร้างการเลือกเริ่มต้น
                const defaultSelection = this.createDefaultImageSelection({
                    url: productUrl,
                    images: images
                });
                
                this.setImageSelection(productUrl, defaultSelection.selectedImages, {
                    productName: defaultSelection.productName,
                    sku: defaultSelection.sku,
                    images: images
                });
                
                return defaultSelection.selectedImages.filter(img => img.selected);
            }
            
            // โหมดอื่นๆ
            const maxImages = this.config.maxImagesPerProduct;
            
            switch (this.config.imageSelectionMode) {
                case 'primary_first':
                    const primaryImage = images.find(img => img.isPrimary);
                    let selectedImages = primaryImage ? [primaryImage] : [];
                    const otherImages = images.filter(img => !img.isPrimary);
                    selectedImages.push(...otherImages.slice(0, maxImages - selectedImages.length));
                    return selectedImages;
                    
                case 'all':
                    return images.slice(0, maxImages);
                    
                default:
                    return images.slice(0, maxImages);
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

        getUserSendHistory(userId, productUrl) {
            const userHistory = this.userSendHistory.get(userId) || {};
            return userHistory[productUrl] || {
                totalSent: 0,
                lastSentAt: null,
                sentImages: [],
                sendCount: 0
            };
        }

        updateUserSendHistory(userId, productUrl, sentImages) {
            let userHistory = this.userSendHistory.get(userId) || {};
            
            if (!userHistory[productUrl]) {
                userHistory[productUrl] = {
                    totalSent: 0,
                    lastSentAt: null,
                    sentImages: [],
                    sendCount: 0
                };
            }
            
            const productHistory = userHistory[productUrl];
            productHistory.totalSent += sentImages.length;
            productHistory.lastSentAt = new Date().toISOString();
            productHistory.sendCount += 1;
            
            sentImages.forEach(img => {
                if (!productHistory.sentImages.some(sent => sent.filename === img.filename)) {
                    productHistory.sentImages.push({
                        filename: img.filename,
                        sentAt: new Date().toISOString(),
                        size: img.size
                    });
                }
            });
            
            this.userSendHistory.set(userId, userHistory);
            this.saveUserSendHistory(userId);
        }

        shouldSendImages(userId, productUrl) {
            if (!this.config.enabled) {
                return { should: false, reason: 'Service disabled' };
            }
            
            if (!this.config.preventDuplicateSends) {
                return { should: true, reason: 'Duplicate prevention disabled' };
            }
            
            const history = this.getUserSendHistory(userId, productUrl);
            
            if (history.totalSent === 0) {
                return { should: true, reason: 'First time sending for this product' };
            }
            
            const lastSent = new Date(history.lastSentAt);
            const now = new Date();
            const hoursSinceLastSend = (now - lastSent) / (1000 * 60 * 60);
            
            if (hoursSinceLastSend >= 24) {
                return { should: true, reason: 'More than 24 hours since last send' };
            }
            
            return { 
                should: false, 
                reason: `Already sent ${history.totalSent} images ${Math.round(hoursSinceLastSend)} hours ago` 
            };
        }

        // *** Image Sending Methods ***
        async sendProductImages(userId, images, productData) {
            try {
                this.logger.info('Preparing to send product images', {
                    userId: userId.substring(0, 10) + '...',
                    productName: productData.productName,
                    imageCount: images.length,
                    displayMode: this.config.imageDisplayMode
                });

                let sendResult;

                // ส่งรูปภาพก่อน โดยไม่ส่งข้อความแนะนำ
                switch (this.config.imageDisplayMode) {
                    case 'carousel':
                        sendResult = await this.sendImageCarousel(userId, images, productData);
                        break;
                    case 'flex':
                        sendResult = await this.sendImageTemplate(userId, images, productData);
                        break;
                    case 'individual':
                    default:
                        sendResult = await this.sendIndividualImages(userId, images, productData);
                        break;
                }

                // ส่งข้อความแนะนำหลังจากส่งรูปแล้ว
                if (sendResult.success && sendResult.imagesSent > 0) {
                    try {
                        // รอให้รูปส่งเสร็จสมบูรณ์ก่อน
                        await new Promise(resolve => setTimeout(resolve, 2000)); 
                        
                        const skuText = productData.sku ? ` รหัสสินค้า : ${productData.sku}` : '';
                        const introMessage = `📷 รูปภาพสินค้า: ${productData.productName} (${sendResult.imagesSent} รูป)${skuText}`;
                        
                        await this.lineHandler.pushMessage(userId, introMessage, null, false);
                        
                        this.logger.info('✅ Intro message sent AFTER images', {
                            userId: userId.substring(0, 10) + '...',
                            imagesSent: sendResult.imagesSent,
                            productName: productData.productName,
                            introMessageLength: introMessage.length
                        });
                    } catch (introError) {
                        this.logger.error('❌ Error sending intro message after images:', introError);
                        // ไม่ให้ error นี้ส่งผลต่อ result หลัก เพราะรูปส่งสำเร็จแล้ว
                    }
                } else {
                    this.logger.warn('⚠️ Skipping intro message - images not sent successfully', {
                        success: sendResult.success,
                        imagesSent: sendResult.imagesSent || 0
                    });
                }

                return sendResult;
                
            } catch (error) {
                this.logger.error('❌ Error sending product images:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        }

        async sendIndividualImages(userId, images, productData) {
            try {
                let successCount = 0;
                let errors = [];
                
                for (let i = 0; i < images.length; i++) {
                    const image = images[i];
                    
                    try {
                        const sendResult = await this.sendSingleImage(userId, image, i + 1, images.length);
                        
                        if (sendResult.success) {
                            successCount++;
                            
                            if (i < images.length - 1) {
                                await new Promise(resolve => 
                                    setTimeout(resolve, this.config.sendDelay)
                                );
                            }
                        } else {
                            errors.push({
                                image: image.filename,
                                error: sendResult.error
                            });
                        }
                    } catch (error) {
                        errors.push({
                            image: image.filename,
                            error: error.message
                        });
                    }
                }
                
                return {
                    success: successCount > 0,
                    imagesSent: successCount,
                    totalImages: images.length,
                    errors: errors,
                    method: 'individual'
                };
                
            } catch (error) {
                this.logger.error('Error sending individual images:', error);
                return {
                    success: false,
                    error: error.message
            };
        }
    }

    async sendSingleImage(userId, imageData, imageIndex, totalImages) {
        try {
            // ตรวจสอบว่าไฟล์รูปภาพมีอยู่จริง
            if (!imageData.localPath || !await this.fileExists(imageData.localPath)) {
                throw new Error(`Image file not found: ${imageData.localPath || 'undefined'}`);
            }
            
            // อ่านไฟล์รูปภาพ
            const imageBuffer = await fs.readFile(imageData.localPath);
            
            // ตรวจสอบขนาดไฟล์
            if (imageBuffer.length < 100) {
                throw new Error('Image file too small (possibly corrupted)');
            }
            
            if (imageBuffer.length > this.config.maxImageSize) {
                throw new Error(`Image too large: ${Math.round(imageBuffer.length / 1024 / 1024)}MB (max 10MB)`);
            }
            
            // สร้าง URL โดยไม่แปลงไฟล์
            const imageUrl = await this.uploadOriginalToTempStorage(imageBuffer, imageData.filename);
            
            // ส่งรูปผ่าน LINE API
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
                this.logger.info('Image sent successfully to LINE', {
                    userId: userId.substring(0, 10) + '...',
                    filename: imageData.filename,
                    size: imageBuffer.length,
                    imageIndex: imageIndex,
                    totalImages: totalImages
                });
                
                return { 
                    success: true, 
                    finalSize: imageBuffer.length,
                    method: 'original'
                };
            } else {
                throw new Error(`LINE API error: ${response.status} - ${response.statusText}`);
            }
            
        } catch (error) {
            this.logger.error('Error sending image:', {
                error: error.message,
                userId: userId.substring(0, 10) + '...',
                filename: imageData.filename,
                localPath: imageData.localPath
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    // แทนที่ method uploadOriginalToTempStorage ใน productImageSender.js
    async uploadOriginalToTempStorage(imageBuffer, originalFilename) {
        try {
            const tempDir = path.join(__dirname, 'temp_images');
            
            // *** แก้ไข: Enhanced directory creation ***
            await fs.mkdir(tempDir, { recursive: true, mode: 0o755 });
            
            // ตรวจสอบว่า directory สร้างสำเร็จ
            const dirStats = await fs.stat(tempDir);
            if (!dirStats.isDirectory()) {
                throw new Error('Temp directory is not a directory');
            }
            
            // Generate secure unique filename
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substring(2, 8);
            const ext = path.extname(originalFilename) || '.jpg';
            const nameWithoutExt = path.basename(originalFilename, ext);
            const cleanName = nameWithoutExt.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 20);
            const tempFilename = `orig_${timestamp}_${randomStr}_${cleanName}${ext}`;
            const tempPath = path.join(tempDir, tempFilename);
            
            this.logger.info('🔄 Creating temp file:', {
                originalFilename: originalFilename,
                tempFilename: tempFilename,
                tempPath: tempPath,
                tempDir: tempDir,
                bufferSize: imageBuffer.length,
                directoryExists: true
            });
            
            // *** แก้ไข: Enhanced file writing with verification ***
            await fs.writeFile(tempPath, imageBuffer, { mode: 0o644 });
            
            // *** CRITICAL: Enhanced verification loop ***
            let verificationAttempts = 0;
            const maxAttempts = 3;
            let fileVerified = false;
            
            while (verificationAttempts < maxAttempts && !fileVerified) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 50 * (verificationAttempts + 1)));
                    
                    // Multiple verification steps
                    await fs.access(tempPath, fs.constants.F_OK | fs.constants.R_OK);
                    
                    const stats = await fs.stat(tempPath);
                    if (stats.size !== imageBuffer.length) {
                        throw new Error(`Size mismatch: expected ${imageBuffer.length}, got ${stats.size}`);
                    }
                    
                    if (!stats.isFile()) {
                        throw new Error('Created item is not a file');
                    }
                    
                    // Test read small portion
                    const testBuffer = await fs.readFile(tempPath, { start: 0, end: Math.min(99, imageBuffer.length - 1) });
                    if (testBuffer.length === 0) {
                        throw new Error('File appears empty on read test');
                    }
                    
                    fileVerified = true;
                    this.logger.info('✅ File verification successful:', {
                        tempFilename: tempFilename,
                        size: stats.size,
                        attempt: verificationAttempts + 1,
                        isFile: stats.isFile(),
                        readable: true
                    });
                    
                } catch (verifyError) {
                    verificationAttempts++;
                    this.logger.warn(`⚠️ File verification attempt ${verificationAttempts} failed:`, {
                        tempFilename: tempFilename,
                        error: verifyError.message,
                        attempt: verificationAttempts,
                        maxAttempts: maxAttempts
                    });
                    
                    if (verificationAttempts >= maxAttempts) {
                        // *** แก้ไข: List directory contents for debugging ***
                        try {
                            const files = await fs.readdir(tempDir);
                            this.logger.error('❌ Directory contents after failed verification:', {
                                tempDir: tempDir,
                                files: files,
                                lookingFor: tempFilename,
                                hasFile: files.includes(tempFilename)
                            });
                        } catch (listError) {
                            this.logger.error('❌ Cannot list directory after verification failure:', listError);
                        }
                        break;
                    }
                }
            }
            
            if (!fileVerified) {
                throw new Error(`File verification failed after ${maxAttempts} attempts`);
            }
            
            // Generate and test URL
            const baseUrl = process.env.NGROK_URL || process.env.BASE_URL || process.env.PUBLIC_URL;
            
            if (!baseUrl) {
                throw new Error('No base URL configured. Set NGROK_URL, BASE_URL, or PUBLIC_URL');
            }
            
            if (!baseUrl.startsWith('https://')) {
                throw new Error('Base URL must use HTTPS for LINE API compatibility');
            }
            
            const imageUrl = `${baseUrl}/api/product-images/images/${tempFilename}?ngrok-skip-browser-warning=true&v=${timestamp}`;
            
            // *** แก้ไข: Enhanced URL validation ***
            try {
                // Test URL format
                const urlObj = new URL(imageUrl);
                if (!urlObj.pathname.includes(tempFilename)) {
                    throw new Error('URL does not contain expected filename');
                }
                
                this.logger.info('✅ URL validation successful:', {
                    url: imageUrl,
                    pathname: urlObj.pathname,
                    hostname: urlObj.hostname
                });
            } catch (urlError) {
                this.logger.warn('⚠️ URL validation failed:', {
                    url: imageUrl,
                    error: urlError.message
                });
            }
            
            this.logger.info('✅ Image uploaded to temp storage successfully:', {
                originalFilename: originalFilename,
                tempFilename: tempFilename,
                tempPath: tempPath,
                imageUrl: imageUrl,
                size: imageBuffer.length,
                baseUrl: baseUrl,
                verified: fileVerified,
                verificationAttempts: verificationAttempts
            });
            
            // *** แก้ไข: Enhanced cleanup timer - 1 ปี ***
            // *** แก้ไข: Enhanced cleanup timer - 30 วัน ***
setTimeout(async () => {
    try {
        const stillExists = await fs.access(tempPath).then(() => true).catch(() => false);
        if (stillExists) {
            await fs.unlink(tempPath);
            this.logger.debug('🗑️ Auto-deleted temp file:', { 
                tempFilename, 
                ageDays: 30 
            });
        }
    } catch (error) {
        this.logger.debug('⚠️ Error auto-deleting temp file:', { 
            tempFilename, 
            error: error.message 
        });
    }
}, Math.min(2147483647, 365 * 24 * 60 * 60 * 1000)); // *** ป้องกัน overflow ***
            
            return imageUrl;
            
        } catch (error) {
            this.logger.error('❌ Error uploading image to temp storage:', {
                error: error.message,
                originalFilename: originalFilename,
                stack: error.stack
            });
            throw error;
        }
    }

    // *** Image Management Methods ***
    async addImageToProduct(productUrl, imageFile, selected = false) {
        try {
            // ตรวจสอบและสร้าง product selection ถ้าจำเป็น
            await this.initializeProductForImageUpload(productUrl);
            
            let selection = this.getImageSelection(productUrl);
            
            if (!selection) {
                throw new Error('Failed to create or retrieve product selection');
            }
            // ใช้ชื่อไฟล์ที่ถูกต้อง
            const actualFilename = imageFile.safeFilename || imageFile.filename;
            const actualLocalPath = imageFile.targetPath || imageFile.localPath || imageFile.path;

            this.logger.info('Adding image with corrected filename', {
                originalFilename: imageFile.filename,
                actualFilename: actualFilename,
                originalPath: imageFile.localPath,
                actualPath: actualLocalPath
            });

            const newImage = {
                filename: actualFilename,
                originalName: imageFile.originalName || imageFile.filename,
                localPath: actualLocalPath,
                url: imageFile.url || null,
                isPrimary: false,
                order: selection.selectedImages.length,
                size: imageFile.size,
                alt: imageFile.alt || '',
                title: imageFile.title || '',
                addedManually: true,
                uploadedManually: imageFile.uploadedManually || true,
                addedAt: new Date().toISOString(),
                uploadedAt: imageFile.uploadedAt || new Date().toISOString(),
                status: imageFile.status || 'downloaded',
                selected: selected,
                selectionOrder: selected ? this.getNextSelectionOrder(selection) : null
            };

            selection.selectedImages.push(newImage);
            selection.totalImages = selection.selectedImages.length;
            selection.lastUpdated = new Date().toISOString();

            this.imageSelections.set(productUrl, selection);
            await this.saveImageSelections();

            // อัปเดต product file ด้วย
            await this.updateProductFile(productUrl, newImage);

            this.logger.info('Image added to product successfully', {
                productUrl: productUrl,
                filename: actualFilename,
                originalName: imageFile.originalName || imageFile.filename,
                selected: selected,
                totalImages: selection.totalImages
            });

            return selection;
        } catch (error) {
            this.logger.error('Error adding image to product:', error);
            throw error;
        }
    }

    async removeImageFromProduct(productUrl, filename) {
        try {
            this.logger.info('Attempting to remove image from product', {
                productUrl: productUrl,
                filename: filename
            });

            const selection = this.getImageSelection(productUrl);
            if (!selection) {
                throw new Error('Product selection not found');
            }

            // ใช้วิธีค้นหาที่ปรับปรุงแล้ว
            const findResult = this.findImageInSelection(selection, filename);
            
            if (!findResult.found) {
                this.logger.warn('Image not found for removal', {
                    productUrl: productUrl,
                    filename: filename,
                    reason: findResult.reason,
                    availableImages: findResult.availableImages
                });
                
                throw new Error(`Image not found: ${findResult.reason}. Available images: ${findResult.availableImages.map(img => img.filename).join(', ')}`);
            }

            const imageIndex = findResult.index;
            const imageToRemove = findResult.image;

            this.logger.info('Found image for removal', {
                searchFilename: filename,
                foundFilename: imageToRemove.filename,
                method: findResult.method,
                index: imageIndex
            });

            // ลบรูปภาพ
            const removedImage = selection.selectedImages.splice(imageIndex, 1)[0];
            selection.totalImages = selection.selectedImages.length;
            selection.lastUpdated = new Date().toISOString();

            // อัปเดต order
            selection.selectedImages.forEach((img, index) => {
                img.order = index;
            });

            this.imageSelections.set(productUrl, selection);
            await this.saveImageSelections();

            // อัปเดต product file
            await this.removeImageFromProductFile(productUrl, imageToRemove);

            this.logger.info('Image removal completed successfully', {
                productUrl: productUrl,
                removedFilename: removedImage.filename,
                originalSearchFilename: filename
            });

            return { selection, removedImage };

        } catch (error) {
            this.logger.error('Error removing image from product:', error);
            throw error;
        }
    }

    async initializeProductForImageUpload(productUrl, productName = null) {
        try {
            // ตรวจสอบและสร้าง product ถ้าจำเป็น
            const productData = await this.ensureProductExists(productUrl, productName);
            
            // ตรวจสอบและสร้าง image selection ถ้าจำเป็น
            let selection = this.getImageSelection(productUrl);
            
            if (!selection) {
                const defaultSelection = this.createDefaultImageSelection(productData);
                await this.setImageSelection(productUrl, defaultSelection.selectedImages, productData);
                selection = this.getImageSelection(productUrl);
            }
            
            return {
                productData: productData,
                selection: selection
            };
        } catch (error) {
            this.logger.error('Error initializing product for image upload:', error);
            throw error;
        }
    }

    async ensureProductExists(productUrl, productName = null) {
        try {
            let productData = await this.findProductByUrl(productUrl);
            
            if (!productData) {
                this.logger.info('Product not found, creating new product entry', {
                    productUrl: productUrl,
                    productName: productName
                });
                
                // สร้าง product data ใหม่
                productData = {
                    url: productUrl,
                    product_name: productName || this.extractProductNameFromUrl(productUrl),
                    sku: '',
                    images: [],
                    category: '',
                    price: null,
                    stock_quantity: null,
                    last_updated: new Date().toISOString(),
                    created_by: 'image_upload',
                    created_at: new Date().toISOString()
                };
                
                // บันทึกเป็นไฟล์ใหม่
                await this.saveNewProductFile(productData);
                
                this.logger.info('New product created', {
                    productUrl: productUrl,
                    productName: productData.product_name
                });
            }
            
            return {
                url: productData.url,
                productName: productData.product_name,
                sku: productData.sku,
                images: productData.images || []
            };
        } catch (error) {
            this.logger.error('Error ensuring product exists:', error);
            throw error;
        }
    }

    extractProductNameFromUrl(url) {
        try {
            const urlParts = url.split('/');
            const productSlug = urlParts[urlParts.length - 2] || urlParts[urlParts.length - 1];
            
            if (productSlug) {
                return productSlug
                    .replace(/-/g, ' ')
                    .replace(/\b\w/g, l => l.toUpperCase());
            }
            
            return 'Unknown Product';
        } catch (error) {
            return 'Unknown Product';
        }
    }

    getNextSelectionOrder(selection) {
        const selectedImages = selection.selectedImages.filter(img => img.selected);
        const maxOrder = Math.max(...selectedImages.map(img => img.selectionOrder || 0), 0);
        return maxOrder + 1;
    }

    async clearProductSelection(productUrl) {
        try {
            const selection = this.getImageSelection(productUrl);
            if (!selection) {
                throw new Error('Product selection not found');
            }

            selection.selectedImages.forEach(img => {
                img.selected = false;
                img.selectionOrder = null;
            });
            selection.lastUpdated = new Date().toISOString();

            this.imageSelections.set(productUrl, selection);
            await this.saveImageSelections();

            return selection;
        } catch (error) {
            this.logger.error('Error clearing product selection:', error);
            throw error;
        }
    }

    async resetToDefaultSelection(productUrl) {
        try {
            const selection = this.getImageSelection(productUrl);
            if (!selection) {
                throw new Error('Product selection not found');
            }

            selection.selectedImages.forEach((img, index) => {
                img.selected = index < 3;
                img.selectionOrder = index < 3 ? index + 1 : null;
            });
            selection.lastUpdated = new Date().toISOString();

            this.imageSelections.set(productUrl, selection);
            await this.saveImageSelections();

            return selection;
        } catch (error) {
            this.logger.error('Error resetting to default selection:', error);
            throw error;
        }
    }

    // *** Product File Management ***
    async saveNewProductFile(productData) {
        try {
            const timestamp = Date.now();
            const safeName = this.slugify(productData.product_name || 'unknown');
            const filename = `product_${timestamp}_${safeName}.json`;
            const filepath = path.join(this.productsDir, filename);

            await fs.mkdir(this.productsDir, { recursive: true });
            await fs.writeFile(filepath, JSON.stringify(productData, null, 2), 'utf8');

            this.logger.info(`Saved new product file: ${filename}`);
            return filepath;
        } catch (error) {
            this.logger.error('Error saving new product file:', error);
            throw error;
        }
    }

    async updateProductFile(productUrl, newImage) {
        try {
            const files = await fs.readdir(this.productsDir);
            const productFiles = files.filter(file => file.endsWith('.json') && file.startsWith('product_'));
            
            for (const file of productFiles) {
                try {
                    const filePath = path.join(this.productsDir, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    const product = JSON.parse(content);
                    
                    if (product.url === productUrl) {
                        if (!product.images) {
                            product.images = [];
                        }
                        product.images.push(newImage);
                        product.last_updated = new Date().toISOString();
                        
                        await fs.writeFile(filePath, JSON.stringify(product, null, 2), 'utf8');
                        this.logger.info(`Updated product file: ${file}`);
                        return;
                    }
                } catch (error) {
                    this.logger.warn(`Error updating product file ${file}:`, error);
                }
            }
        } catch (error) {
            this.logger.error('Error updating product file:', error);
        }
    }

    async removeImageFromProductFile(productUrl, imageToRemove) {
        try {
            const files = await fs.readdir(this.productsDir);
            const productFiles = files.filter(file => file.endsWith('.json') && file.startsWith('product_'));
            
            for (const file of productFiles) {
                try {
                    const filePath = path.join(this.productsDir, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    const product = JSON.parse(content);
                    
                    if (product.url === productUrl && product.images) {
                        const imageIndex = product.images.findIndex(img => 
                            img.filename === imageToRemove.filename ||
                            img.originalName === imageToRemove.filename
                        );
                        
                        if (imageIndex >= 0) {
                            product.images.splice(imageIndex, 1);
                            product.last_updated = new Date().toISOString();
                            
                            await fs.writeFile(filePath, JSON.stringify(product, null, 2), 'utf8');
                            this.logger.info(`Removed image from product file: ${file}`);
                            return;
                        }
                    }
                } catch (error) {
                    this.logger.warn(`Error removing image from product file ${file}:`, error);
                }
            }
        } catch (error) {
            this.logger.error('Error removing image from product file:', error);
        }
    }

    // *** File Management ***
    async moveImageFile(sourcePath, targetFilename) {
        try {
            await fs.mkdir(this.imagesDir, { recursive: true });
            
            const targetPath = path.join(this.imagesDir, targetFilename);
            
            // ตรวจสอบว่าไฟล์ต้นทางมีอยู่
            const sourceExists = await this.fileExists(sourcePath);
            if (!sourceExists) {
                throw new Error(`Source file not found: ${sourcePath}`);
            }

            // คัดลอกไฟล์
            await fs.copyFile(sourcePath, targetPath);
            
            // ลบไฟล์ต้นทาง
            await fs.unlink(sourcePath);
            
            this.logger.info('Image file moved successfully', {
                from: sourcePath,
                to: targetPath,
                filename: targetFilename
            });

            return targetPath;

        } catch (error) {
            this.logger.error('Error moving image file:', error);
            throw error;
        }
    }

    async deleteImageFile(filename) {
        try {
            const filePath = path.join(this.imagesDir, filename);
            
            const exists = await this.fileExists(filePath);
            if (!exists) {
                this.logger.warn(`Image file not found for deletion: ${filePath}`);
                return { deleted: false, reason: 'File not found' };
            }

            await fs.unlink(filePath);
            
            this.logger.info('Image file deleted successfully', {
                filename,
                path: filePath
            });

            return { deleted: true, path: filePath };

        } catch (error) {
            this.logger.error('Error deleting image file:', error);
            throw error;
        }
    }

    async fileExists(filepath) {
        try {
            await fs.access(filepath);
            return true;
        } catch {
            return false;
        }
    }

    // *** Statistics and Analytics ***
    getUserStatistics(userId) {
        const userHistory = this.userSendHistory.get(userId) || {};
        
        const stats = {
            totalProductsWithImages: Object.keys(userHistory).length,
            totalImagesSent: 0,
            totalSendEvents: 0,
            productBreakdown: {},
            lastActivity: null
        };
        
        Object.entries(userHistory).forEach(([productUrl, history]) => {
            stats.totalImagesSent += history.totalSent;
            stats.totalSendEvents += history.sendCount;
            
            stats.productBreakdown[productUrl] = {
                totalSent: history.totalSent,
                sendCount: history.sendCount,
                lastSentAt: history.lastSentAt,
                sentImages: history.sentImages.length
            };
            
            if (!stats.lastActivity || new Date(history.lastSentAt) > new Date(stats.lastActivity)) {
                stats.lastActivity = history.lastSentAt;
            }
        });
        
        return stats;
    }

    getGlobalStatistics() {
        const stats = {
            totalUsers: this.userSendHistory.size,
            totalProductsWithSelections: this.imageSelections.size,
            totalImagesSent: 0,
            totalSendEvents: 0,
            topProducts: [],
            recentActivity: [],
            selectionStats: {
                totalManualSelections: 0,
                averageSelectedPerProduct: 0
            }
        };
        
        const productStats = {};
        
        // รวบรวมสถิติจากทุกผู้ใช้
        this.userSendHistory.forEach((userHistory, userId) => {
            Object.entries(userHistory).forEach(([productUrl, history]) => {
                stats.totalImagesSent += history.totalSent;
                stats.totalSendEvents += history.sendCount;
                
                if (!productStats[productUrl]) {
                    productStats[productUrl] = {
                        productUrl: productUrl,
                        totalSent: 0,
                        sendCount: 0,
                        uniqueUsers: new Set(),
                        lastSentAt: null
                    };
                }
                
                productStats[productUrl].totalSent += history.totalSent;
                productStats[productUrl].sendCount += history.sendCount;
                productStats[productUrl].uniqueUsers.add(userId);
                
                if (!productStats[productUrl].lastSentAt || 
                    new Date(history.lastSentAt) > new Date(productStats[productUrl].lastSentAt)) {
                    productStats[productUrl].lastSentAt = history.lastSentAt;
                }
                
                if (history.lastSentAt) {
                    stats.recentActivity.push({
                        userId: userId,
                        productUrl: productUrl,
                        timestamp: history.lastSentAt,
                        imagesSent: history.totalSent
                    });
                }
            });
        });
        
        // รวบรวมสถิติการเลือกรูป
        let totalSelectedImages = 0;
        this.imageSelections.forEach((selection, productUrl) => {
            const selectedCount = selection.selectedImages.filter(img => img.selected).length;
            if (selectedCount > 0) {
                stats.selectionStats.totalManualSelections++;
                totalSelectedImages += selectedCount;
            }
        });
        
        if (stats.selectionStats.totalManualSelections > 0) {
            stats.selectionStats.averageSelectedPerProduct = Math.round(
                totalSelectedImages / stats.selectionStats.totalManualSelections * 10
            ) / 10;
        }
        
        // สร้าง top products
        stats.topProducts = Object.values(productStats)
            .map(product => ({
                ...product,
                uniqueUsers: product.uniqueUsers.size
            }))
            .sort((a, b) => b.totalSent - a.totalSent)
            .slice(0, 10);
        
        // เรียง recent activity
        stats.recentActivity = stats.recentActivity
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 20);
        
        return stats;
    }

    getSelectionStatistics() {
        const stats = {
            totalProducts: this.imageSelections.size,
            productsWithSelections: 0,
            totalSelectedImages: 0,
            averageSelectedPerProduct: 0
        };

        for (const [url, selection] of this.imageSelections.entries()) {
            const selectedCount = selection.selectedImages.filter(img => img.selected).length;
            if (selectedCount > 0) {
                stats.productsWithSelections++;
                stats.totalSelectedImages += selectedCount;
            }
        }

        if (stats.productsWithSelections > 0) {
            stats.averageSelectedPerProduct = Math.round(
                stats.totalSelectedImages / stats.productsWithSelections * 10
            ) / 10;
        }

        return stats;
    }

    // *** Product Image Details ***
    async getProductImageDetails(productUrl) {
        try {
            const productData = await this.findProductByUrl(productUrl);

            if (!productData) {
                throw new Error('Product not found');
            }

            // ดึงการตั้งค่าการเลือกรูป
            let selection = this.getImageSelection(productUrl);
            
            if (!selection) {
                // สร้างการตั้งค่าเริ่มต้น
                selection = this.createDefaultImageSelection(productData);
                await this.setImageSelection(productUrl, selection.selectedImages, productData);
            }

            return {
                productUrl: productUrl,
                productName: productData.productName,
                sku: productData.sku,
                totalImages: selection.totalImages,
                selectedCount: selection.selectedImages.filter(img => img.selected).length,
                images: selection.selectedImages.map(img => ({
                    filename: img.filename,
                    originalName: img.originalName,
                    localPath: img.localPath,
                    url: img.url,
                    isPrimary: img.isPrimary,
                    order: img.order,
                    size: img.size,
                    alt: img.alt,
                    title: img.title,
                    selected: img.selected,
                    selectionOrder: img.selectionOrder,
                    addedManually: img.addedManually || false,
                    uploadedManually: img.uploadedManually || false,
                    addedAt: img.addedAt,
                    uploadedAt: img.uploadedAt,
                    status: img.status
                })),
                lastUpdated: selection.lastUpdated
            };
        } catch (error) {
            this.logger.error('Error getting product image details:', error);
            throw error;
        }
    }

    async getProductImageStatistics(productUrl) {
        try {
            const productData = await this.findProductByUrl(productUrl);
            
            if (!productData) {
                return {
                    found: false,
                    productUrl: productUrl
                };
            }

            const images = productData.images || [];
            const selection = this.getImageSelection(productUrl);
            
            const stats = {
                found: true,
                productUrl: productUrl,
                productName: productData.productName,
                total: images.length,
                downloaded: images.filter(img => img.status === 'downloaded').length,
                failed: images.filter(img => img.status === 'failed').length,
                skipped: images.filter(img => img.skipped || img.status === 'skipped').length,
                uploaded: images.filter(img => img.uploadedManually).length,
                scraped: images.filter(img => !img.uploadedManually).length,
                selected: selection ? selection.selectedImages.filter(img => img.selected).length : 0,
                primary: images.filter(img => img.isPrimary).length,
                totalSize: images.reduce((sum, img) => sum + (img.size || 0), 0),
                averageSize: 0,
                lastUpdated: productData.lastUpdated
            };

            if (stats.total > 0) {
                stats.averageSize = Math.round(stats.totalSize / stats.total);
            }

            return stats;

        } catch (error) {
            this.logger.error('Error getting product image statistics:', error);
            throw error;
        }
    }

    // *** Bulk Operations ***
    async addImagesToProduct(productUrl, imageFiles) {
        try {
            if (!Array.isArray(imageFiles)) {
                throw new Error('imageFiles must be an array');
            }

            // Initialize product และ selection ถ้าจำเป็น
            await this.initializeProductForImageUpload(productUrl);

            const results = {
                successful: [],
                failed: [],
                total: imageFiles.length
            };

            for (const imageFile of imageFiles) {
                try {
                    const result = await this.addImageToProduct(
                        productUrl, 
                        imageFile, 
                        false // not selected by default
                    );
                    
                    results.successful.push({
                        filename: imageFile.filename,
                        result: result
                    });
                    
                } catch (error) {
                    results.failed.push({
                        filename: imageFile.filename || 'unknown',
                        error: error.message
                    });
                }
            }

            return {
                success: results.successful.length > 0,
                results: results,
                message: `Added ${results.successful.length}/${results.total} images successfully`
            };

        } catch (error) {
            this.logger.error('Error adding multiple images to product:', error);
            throw error;
        }
    }

    async removeImagesFromProduct(productUrl, filenames) {
        try {
            if (!Array.isArray(filenames)) {
                throw new Error('filenames must be an array');
            }

            const results = {
                successful: [],
                failed: [],
                total: filenames.length
            };

            for (const filename of filenames) {
                try {
                    const result = await this.removeImageFromProduct(productUrl, filename);
                    
                    results.successful.push({
                        filename: filename,
                        result: result
                    });
                    
                } catch (error) {
                    results.failed.push({
                        filename: filename,
                        error: error.message
                    });
                }
            }

            return {
                success: results.successful.length > 0,
                results: results,
                message: `Removed ${results.successful.length}/${results.total} images successfully`
            };

        } catch (error) {
            this.logger.error('Error removing multiple images from product:', error);
            throw error;
        }
    }

    // *** Configuration and System Methods ***
    async updateConfig(newConfig) {
        try {
            const validKeys = [
                'enabled', 'maxImagesPerProduct', 'preventDuplicateSends',
                'autoSendOnUrlDetection', 'imageSelectionMode', 'sendDelay',
                'maxImageSize', 'useOriginalImages', 'imageDisplayMode'
            ];
            
            const updates = {};
            
            Object.keys(newConfig).forEach(key => {
                if (validKeys.includes(key)) {
                    updates[key] = newConfig[key];
                }
            });
            
            // Apply updates
            this.config = { ...this.config, ...updates };
            
            // Save to file
            await this.saveConfig();
            
            this.logger.info('ProductImageSender config updated', {
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
                imageSelectionsCount: this.imageSelections.size,
                userHistoryCount: this.userSendHistory.size,
                recentlySentCount: this.recentlySentImages.size
            }
        };
    }

    // *** Data Management ***
    async clearUserHistory(userId) {
        try {
            this.userSendHistory.delete(userId);
            
            const filePath = path.join(this.userSendHistoryDir, `${userId}.json`);
            try {
                await fs.unlink(filePath);
            } catch (error) {
                // ไฟล์อาจไม่มีอยู่
            }
            
            this.logger.info(`Cleared send history for user ${userId}`);
            
            return { success: true };
        } catch (error) {
            this.logger.error(`Error clearing history for user ${userId}:`, error);
            throw error;
        }
    }

    async clearProductHistory(productUrl) {
        try {
            // ลบการเลือกรูป
            this.imageSelections.delete(productUrl);
            await this.saveImageSelections();
            
            // ลบจาก user histories
            this.userSendHistory.forEach((userHistory, userId) => {
                if (userHistory[productUrl]) {
                    delete userHistory[productUrl];
                    this.saveUserSendHistory(userId);
                }
            });
            
            this.logger.info(`Cleared product history for ${productUrl}`);
            
            return { success: true };
        } catch (error) {
            this.logger.error(`Error clearing product history for ${productUrl}:`, error);
            throw error;
        }
    }

    // *** Testing Methods ***
    async testImageSend(userId, productUrl) {
        try {
            this.logger.info('Testing image send', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                productUrl: productUrl
            });
            
            const result = await this.processUrlForImages(userId, productUrl);
            
            return {
                success: true,
                testResult: result,
                message: result.sent ? 
                    `Successfully sent ${result.imagesSent} images` : 
                    `Images not sent: ${result.reason}`
            };
            
        } catch (error) {
            this.logger.error('Error testing image send:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // *** Testing Methods ***
    async testUrlDetection(message) {
        try {
            this.logger.info('🧪 Testing URL detection', {
                messageLength: message ? message.length : 0,
                messagePreview: message ? message.substring(0, 100) + '...' : 'undefined'
            });

            const urls = this.extractUrlsFromMessage(message);
            const results = [];

            for (const url of urls) {
                const productData = await this.findProductByUrl(url);
                
                if (productData) {
                    const selection = this.getImageSelection(url);
                    const selectedImages = this.getSelectedImagesForSending(url);
                    
                    results.push({
                        url: url,
                        found: true,
                        productName: productData.productName,
                        sku: productData.sku,
                        totalImages: productData.images.length,
                        hasSelection: !!selection,
                        selectedCount: selectedImages.length,
                        wouldSend: selectedImages.length > 0
                    });
                } else {
                    results.push({
                        url: url,
                        found: false,
                        reason: 'Product not found'
                    });
                }
            }

            return {
                detectedUrls: urls,
                urlCount: urls.length,
                results: results,
                wouldProcessAny: results.some(r => r.wouldSend),
                config: {
                    enabled: this.config.enabled,
                    autoSend: this.config.autoSendOnUrlDetection,
                    selectionMode: this.config.imageSelectionMode
                }
            };

        } catch (error) {
            this.logger.error('Error in URL detection test:', error);
            return {
                error: error.message,
                detectedUrls: [],
                urlCount: 0,
                results: []
            };
        }
    }

    // *** Utility Methods ***
    slugify(text) {
        return text
            .toString()
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '_')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    }

    // *** System Status and Health Check ***
    async healthCheck() {
        try {
            const health = {
                status: 'healthy',
                config: {
                    enabled: this.config.enabled,
                    maxImagesPerProduct: this.config.maxImagesPerProduct,
                    preventDuplicateSends: this.config.preventDuplicateSends,
                    useOriginalImages: this.config.useOriginalImages,
                    imageSelectionMode: this.config.imageSelectionMode,
                    imageDisplayMode: this.config.imageDisplayMode
                },
                data: {
                    imageSelections: this.imageSelections.size,
                    userHistories: this.userSendHistory.size,
                    recentlySent: this.recentlySentImages.size
                },
                directories: {
                    dataDir: await this.fileExists(this.dataDir),
                    userHistoryDir: await this.fileExists(this.userSendHistoryDir),
                    productsDir: await this.fileExists(this.productsDir),
                    imagesDir: await this.fileExists(this.imagesDir),
                    tempImagesDir: await this.fileExists(path.join(__dirname, 'temp_images'))
                },
                files: {
                    config: await this.fileExists(this.configPath),
                    imageSelections: await this.fileExists(this.imageSelectionsPath)
                }
            };
            
            // ตรวจสอบ LINE token
            health.lineToken = !!process.env.LINE_CHANNEL_ACCESS_TOKEN;
            
            // ตรวจสอบ connections
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

    async cleanup() {
        try {
            this.logger.info('Starting ProductImageSender cleanup');
            
            // ล้าง temp images (เปลี่ยนจาก 30 นาทีเป็น 1 ปี)
            const tempDir = path.join(__dirname, 'temp_images');
            try {
                const tempFiles = await fs.readdir(tempDir);
                const now = Date.now();
                let deletedCount = 0;
                
                for (const file of tempFiles) {
                    const filePath = path.join(tempDir, file);
                    const stats = await fs.stat(filePath);
                    
                    // ลบไฟล์ที่เก่ากว่า 1 ปี
                        if (now - stats.mtime.getTime() > 365 * 24 * 60 * 60 * 1000) {
                        await fs.unlink(filePath);
                        deletedCount++;
                        this.logger.debug(`Deleted temp file: ${file}`);
                    }
                }
                
                if (deletedCount > 0) {
                    this.logger.info(`Cleaned up ${deletedCount} temp image files (older than 1 year)`);
                }
            } catch (error) {
                this.logger.debug('No temp directory to clean or error accessing it:', error.message);
            }
            
            // ล้าง cache เก่า
            this.recentlySentImages.clear();
            
            this.logger.info('ProductImageSender cleanup completed');
            
            return { success: true };
        } catch (error) {
            this.logger.error('Error during cleanup:', error);
            throw error;
        }
    }

    // *** Bulk Product Statistics ***
    async getBulkProductImageStatistics(urls) {
        try {
            if (!Array.isArray(urls)) {
                throw new Error('URLs must be an array');
            }

            const results = {};
            const stats = {
                total: urls.length,
                found: 0,
                notFound: 0,
                withImages: 0,
                withoutImages: 0,
                totalImages: 0
            };

            for (const url of urls) {
                try {
                    const productData = await this.findProductByUrl(url);
                    
                    if (productData) {
                        const images = productData.images || [];
                        const downloadedImages = images.filter(img => 
                            img.status === 'downloaded' && !img.skipped
                        );
                        
                        const selection = this.getImageSelection(url);
                        const selectedCount = selection ? 
                            selection.selectedImages.filter(img => img.selected).length : 
                            Math.min(3, downloadedImages.length);

                        results[url] = {
                            found: true,
                            productName: productData.productName,
                            total: images.length,
                            downloaded: downloadedImages.length,
                            selected: selectedCount,
                            hasCustomSelection: !!selection,
                            lastUpdated: selection ? selection.lastUpdated : null
                        };
                        
                        stats.found++;
                        stats.totalImages += downloadedImages.length;
                        
                        if (downloadedImages.length > 0) {
                            stats.withImages++;
                        } else {
                            stats.withoutImages++;
                        }
                    } else {
                        results[url] = {
                            found: false,
                            error: 'Product not found'
                        };
                        stats.notFound++;
                    }
                } catch (error) {
                    this.logger.error(`Error getting stats for ${url}:`, error);
                    results[url] = {
                        found: false,
                        error: error.message
                    };
                    stats.notFound++;
                }
            }

            return {
                success: true,
                stats: results,
                summary: stats
            };
        } catch (error) {
            this.logger.error('Error in getBulkProductImageStatistics:', error);
            throw error;
        }
    }

    // *** Export/Import ***
    async exportData() {
        try {
            const exportData = {
                config: this.config,
                imageSelections: Object.fromEntries(this.imageSelections),
                userSendHistory: Object.fromEntries(this.userSendHistory),
                statistics: this.getGlobalStatistics(),
                exportedAt: new Date().toISOString()
            };
            
            const exportPath = path.join(this.dataDir, `export_${Date.now()}.json`);
            await fs.writeFile(
                exportPath,
                JSON.stringify(exportData, null, 2),
                'utf8'
            );
            
            this.logger.info(`Data exported to ${exportPath}`);
            
            return {
                success: true,
                exportPath: exportPath,
                dataSize: JSON.stringify(exportData).length
            };
        } catch (error) {
            this.logger.error('Error exporting data:', error);
            throw error;
        }
    }

    async importData(importPath) {
        try {
            const importData = JSON.parse(await fs.readFile(importPath, 'utf8'));
            
            // Import configuration
            if (importData.config) {
                this.config = { ...this.config, ...importData.config };
                await this.saveConfig();
            }
            
            // Import image selections
            if (importData.imageSelections) {
                this.imageSelections.clear();
                Object.entries(importData.imageSelections).forEach(([url, selection]) => {
                    this.imageSelections.set(url, selection);
                });
                await this.saveImageSelections();
            }
            
            // Import user history
            if (importData.userSendHistory) {
                this.userSendHistory.clear();
                Object.entries(importData.userSendHistory).forEach(([userId, history]) => {
                    this.userSendHistory.set(userId, history);
                    this.saveUserSendHistory(userId);
                });
            }
            
            this.logger.info(`Data imported from ${importPath}`);
            
            return {
                success: true,
                importedConfig: !!importData.config,
                importedSelections: Object.keys(importData.imageSelections || {}).length,
                importedUsers: Object.keys(importData.userSendHistory || {}).length
            };
        } catch (error) {
            this.logger.error('Error importing data:', error);
            throw error;
        }
    }

    // *** Advanced Image Sending Methods ***
    async sendImageCarousel(userId, images, productData) {
        try {
            this.logger.info('Preparing image carousel', {
                userId: userId.substring(0, 10) + '...',
                productName: productData.productName,
                imageCount: images.length
            });

            // เตรียมรูปภาพสำหรับ carousel (สูงสุด 10 รูป)
            const carouselImages = images.slice(0, 10);
            const columns = [];

            for (let i = 0; i < carouselImages.length; i++) {
                const image = carouselImages[i];
                
                try {
                    // อัปโหลดไฟล์ต้นฉบับ
                    const imageBuffer = await fs.readFile(image.localPath);
                    const imageUrl = await this.uploadOriginalToTempStorage(imageBuffer, image.filename);
                    
                    if (imageUrl) {
                        columns.push({
                            imageUrl: imageUrl,
                            action: {
                                type: "uri",
                                uri: imageUrl  // เปิดรูปภาพเต็มหน้าจอในเบราว์เซอร์
                            }
                        });
                    }
                } catch (imageError) {
                    // แก้ไขการ log error เพื่อหลีกเลี่ยง circular reference
                    this.logger.error(`Error preparing image ${i + 1} for carousel:`, {
                        message: imageError.message,
                        code: imageError.code,
                        filename: image.filename,
                        localPath: image.localPath
                    });
                }
            }

            if (columns.length === 0) {
                throw new Error('No valid images to send in carousel');
            }

            // ส่ง Image Carousel
            const response = await axios.post(
                'https://api.line.me/v2/bot/message/push',
                {
                    to: userId,
                    messages: [{
                        type: "template",
                        altText: `📷 รูปภาพสินค้า: ${productData.productName} (${columns.length} รูป)`,
                        template: {
                            type: "image_carousel",
                            columns: columns
                        }
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
                this.logger.info('Image carousel sent successfully', {
                    userId: userId.substring(0, 10) + '...',
                    productName: productData.productName,
                    imageCount: columns.length
                });

                return {
                    success: true,
                    imagesSent: columns.length,
                    totalImages: images.length,
                    method: 'carousel'
                };
            } else {
                throw new Error(`LINE API error: ${response.status} - ${response.statusText}`);
            }

        } catch (error) {
            // แก้ไขการ log error หลักเพื่อหลีกเลี่ยง circular reference
            const errorDetails = {
                message: error.message,
                code: error.code,
                status: error.response?.status,
                statusText: error.response?.statusText,
                method: 'carousel'
            };

            this.logger.error('Error sending image carousel:', errorDetails);
            
            return {
                success: false,
                error: error.message,
                method: 'carousel'
            };
        }
    }

    async sendImageTemplate(userId, images, productData) {
        try {
            this.logger.info('Sending images as Flex Message template', {
                imageCount: images.length,
                productName: productData.productName
            });

            // เตรียมรูปภาพ (สูงสุด 4 รูปสำหรับ Flex)
            const flexImages = images.slice(0, 4);
            const imageUrls = [];

            for (const image of flexImages) {
                try {
                    const imageBuffer = await fs.readFile(image.localPath);
                    const imageUrl = await this.uploadOriginalToTempStorage(imageBuffer, image.filename);
                    if (imageUrl) {
                        imageUrls.push(imageUrl);
                    }
                } catch (error) {
                    this.logger.warn(`Error preparing image for flex: ${image.filename}`, error);
                }
            }

            if (imageUrls.length === 0) {
                throw new Error('No valid images to send');
            }

            // สร้าง Flex Message
            const flexMessage = this.createImageFlexMessage(imageUrls, productData, images.length);

            const response = await axios.post(
                'https://api.line.me/v2/bot/message/push',
                {
                    to: userId,
                    messages: [{
                        type: 'flex',
                        altText: `รูปภาพสินค้า: ${productData.productName}`,
                        contents: flexMessage
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
                return {
                    success: true,
                    imagesSent: imageUrls.length,
                    totalImages: images.length,
                    method: 'flex_message'
                };
            } else {
                throw new Error(`LINE API error: ${response.status} - ${response.statusText}`);
            }

        } catch (error) {
            this.logger.error('Error sending image template:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    createImageFlexMessage(imageUrls, productData, totalImages = null) {
        const flexMessage = {
            type: "bubble",
            header: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: "รูปภาพสินค้า",
                        weight: "bold",
                        size: "lg",
                        color: "#1DB446"
                    },
                    {
                        type: "text",
                        text: productData.productName,
                        size: "md",
                        wrap: true,
                        color: "#666666"
                    }
                ]
            },
            body: {
                type: "box",
                layout: "vertical",
                contents: []
            }
        };

        // เพิ่มรูปภาพลงใน body
        if (imageUrls.length === 1) {
            flexMessage.body.contents.push({
                type: "image",
                url: imageUrls[0],
                size: "full",
                aspectMode: "cover",
                aspectRatio: "1:1"
            });
        } else if (imageUrls.length === 2) {
            flexMessage.body.contents.push({
                type: "box",
                layout: "horizontal",
                contents: imageUrls.map(url => ({
                    type: "image",
                    url: url,
                    size: "full",
                    aspectMode: "cover",
                    aspectRatio: "1:1",
                    flex: 1
                })),
                spacing: "sm"
            });
        } else if (imageUrls.length >= 3) {
            const firstRow = imageUrls.slice(0, 2);
            const secondRow = imageUrls.slice(2, 4);

            flexMessage.body.contents.push({
                type: "box",
                layout: "horizontal",
                contents: firstRow.map(url => ({
                    type: "image",
                    url: url,
                    size: "full",
                    aspectMode: "cover",
                    aspectRatio: "1:1",
                    flex: 1
                })),
                spacing: "sm"
            });

            if (secondRow.length > 0) {
                flexMessage.body.contents.push({
                    type: "box",
                    layout: "horizontal",
                    contents: secondRow.map(url => ({
                        type: "image",
                        url: url,
                        size: "full",
                        aspectMode: "cover",
                        aspectRatio: "1:1",
                        flex: 1
                    })),
                    spacing: "sm",
                    margin: "sm"
                });
            }
        }

        // เพิ่ม footer ถ้ามีรูปเหลือ
        if (totalImages && imageUrls.length < totalImages) {
            flexMessage.footer = {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: `และอีก ${totalImages - imageUrls.length} รูป`,
                        size: "sm",
                        color: "#999999",
                        align: "center"
                    }
                ]
            };
        }

        return flexMessage;
    }

    // *** Read all products for management interface ***
    async readAllProductFiles() {
        try {
            const files = await fs.readdir(this.productsDir);
            const products = [];
            
            for (const file of files) {
                if (file.endsWith('.json') && file.startsWith('product_')) {
                    try {
                        const filePath = path.join(this.productsDir, file);
                        const content = await fs.readFile(filePath, 'utf8');
                        const product = JSON.parse(content);
                        products.push(product);
                    } catch (error) {
                        this.logger.warn(`Error reading product file ${file}:`, error);
                    }
                }
            }
            
            return products;
        } catch (error) {
            this.logger.error('Error reading product files:', error);
            return [];
        }
    }

    // *** Additional utility methods for routes ***
    async getAllProductsWithImages() {
        try {
            const products = await this.readAllProductFiles();
            const productsWithImages = products
                .filter(product => product.images && product.images.length > 0)
                .map(product => {
                    const selection = this.getImageSelection(product.url);
                    const selectedCount = selection ? 
                        selection.selectedImages.filter(img => img.selected).length : 
                        Math.min(3, product.images.length);

                    return {
                        url: product.url,
                        productName: product.product_name,
                        sku: product.sku,
                        category: product.category,
                        totalImages: product.images.length,
                        selectedImages: selectedCount,
                        hasCustomSelection: !!selection,
                        lastUpdated: selection ? selection.lastUpdated : null
                    };
                });

            return productsWithImages;
        } catch (error) {
            this.logger.error('Error getting products with images:', error);
            throw error;
        }
    }
    }

    module.exports = ProductImageSender;