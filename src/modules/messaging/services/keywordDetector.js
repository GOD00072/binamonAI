'use strict';

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const prisma = require('../../../../lib/prisma');
const PrismaService = require('../../../infrastructure/database/prismaService');
const { DATA_DIR } = require('../../../app/paths');

class KeywordDetector {
    constructor(logger) {
        this.logger = logger;
        this.lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        this.prismaService = new PrismaService(logger);
        
        if (!this.lineToken) {
            this.logger.error('❌ LINE_CHANNEL_ACCESS_TOKEN not found in environment variables');
        } else {
            this.logger.info('✅ LINE_CHANNEL_ACCESS_TOKEN loaded successfully', {
                tokenPreview: this.lineToken.substring(0, 10) + '...',
                tokenLength: this.lineToken.length
            });
        }
        
        this.keywordsToDetect = [
            'คลิกที่ปุ่มด้านล่าง',
            'กดปุ่มด้านล่าง',
            'คุยกับแอดมิน',
            'ปุ่ม'
        ];
        
        this.sentToUsers = new Set();
        this.flexMessageSent = new Map();
        
        setInterval(() => this.cleanupOldRecords(), 7 * 24 * 60 * 60 * 1000);
        
        // Debug flag - ปิดเป็นค่าเริ่มต้น
        this.debugMode = false;
        
        // Stats tracking
        this.stats = {
            flexSentCount: 0,
            keywordsFoundCount: 0,
            duplicateAttempts: 0,
            lastUpdated: Date.now()
        };
        
        // Configuration
        this.config = {
            sendTimeout: 24 * 60 * 60 * 1000,
            preventDuplicates: true,
            maxFlexPerUser: 1,
            flex: {
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
            }
        };

        // Store the custom flex message JSON
        this.customFlexMessage = null;
        
        // Load configuration and custom flex message from file if available
        this.loadConfiguration();
        this.loadCustomFlexMessage();
        
        this.logger.info('🚀 KeywordDetector initialized successfully', {
            keywordCount: this.keywordsToDetect.length,
            debugMode: this.debugMode,
            preventDuplicates: this.config.preventDuplicates,
            maxFlexPerUser: this.config.maxFlexPerUser,
            hasLineToken: !!this.lineToken,
            sentToUsersCount: this.sentToUsers.size
        });
    }
    
    async loadConfiguration() {
        try {
            this.logger.info('📋 Loading keyword detector configuration from database...');

            try {
                // Load from database using Settings model
                const config = await this.prismaService.getSetting('keyword_detector_config');

                if (!config) {
                    this.logger.info('ℹ️ No configuration found in database, using defaults');
                    return;
                }

                this.logger.info('📄 Configuration loaded from database', {
                    hasKeywordSection: !!config.keyword,
                    hasFlexSection: !!config.flex
                });

                if (config.keyword) {
                    if (config.keyword.keywords) {
                        this.keywordsToDetect = config.keyword.keywords;
                        this.logger.info('🔑 Keywords updated from config', {
                            keywordCount: this.keywordsToDetect.length,
                            keywords: this.keywordsToDetect
                        });
                    }
                    
                    if (config.keyword.debugMode !== undefined) {
                        this.debugMode = config.keyword.debugMode;
                        this.logger.info('🐛 Debug mode updated from config', {
                            debugMode: this.debugMode
                        });
                    }
                    
                    if (config.keyword.preventDuplicates !== undefined) {
                        this.config.preventDuplicates = config.keyword.preventDuplicates;
                    }
                    
                    if (config.keyword.maxFlexPerUser !== undefined) {
                        this.config.maxFlexPerUser = config.keyword.maxFlexPerUser;
                    }
                    
                    // Load sent users list
                    if (config.keyword.sentToUsers && Array.isArray(config.keyword.sentToUsers)) {
                        this.sentToUsers = new Set(config.keyword.sentToUsers);
                        this.logger.info('📥 Loaded sent users list', {
                            sentToUsersCount: this.sentToUsers.size
                        });
                    }
                }
                
                if (config.flex) {
                    this.config.flex = config.flex;
                    this.logger.info('💬 Flex message config updated from file', {
                        altText: config.flex.altText,
                        headerText: config.flex.header?.text,
                        bodyText: config.flex.body?.text
                    });
                }
                
                this.logger.info('✅ Keyword detector configuration loaded successfully', {
                    keywordCount: this.keywordsToDetect.length,
                    debugMode: this.debugMode,
                    preventDuplicates: this.config.preventDuplicates,
                    maxFlexPerUser: this.config.maxFlexPerUser,
                    sentToUsersCount: this.sentToUsers.size
                });
            } catch (error) {
                this.logger.error('❌ Error loading keyword configuration from database', {
                    error: error.message,
                    stack: error.stack
                });
                // If database read fails, we'll use default values
            }
        } catch (error) {
            this.logger.error('💥 Error in loadConfiguration', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    async loadCustomFlexMessage() {
        try {
            this.logger.info('📱 Loading custom flex message from database...');

            try {
                this.customFlexMessage = await this.prismaService.getSetting('custom_flex_message');

                if (this.customFlexMessage) {
                    this.logger.info('✅ Custom flex message loaded from database successfully', {
                        type: this.customFlexMessage.type,
                        hasCustomFlex: !!this.customFlexMessage,
                        flexMessageKeys: Object.keys(this.customFlexMessage || {}),
                        flexMessageSize: JSON.stringify(this.customFlexMessage).length
                    });
                } else {
                    this.logger.info('ℹ️ No custom flex message in database, will use default generated flex message');
                }
            } catch (error) {
                this.logger.error('❌ Error loading custom flex message from database', {
                    error: error.message,
                    stack: error.stack
                });
            }
        } catch (error) {
            this.logger.error('💥 Error in loadCustomFlexMessage', {
                error: error.message,
                stack: error.stack
            });
        }
    }
    
    async saveConfiguration() {
        try {
            this.logger.info('💾 Saving keyword detector configuration to database...');

            const config = {
                keyword: {
                    keywords: this.keywordsToDetect,
                    debugMode: this.debugMode,
                    preventDuplicates: this.config.preventDuplicates,
                    maxFlexPerUser: this.config.maxFlexPerUser,
                    sentToUsers: Array.from(this.sentToUsers)
                },
                flex: this.config.flex
            };

            await this.prismaService.setSetting(
                'keyword_detector_config',
                config,
                'Keyword detector configuration including keywords, debug mode, and flex message settings'
            );

            this.logger.info('✅ Keyword detector configuration saved to database successfully', {
                keywordCount: this.keywordsToDetect.length,
                debugMode: this.debugMode,
                sentToUsersCount: this.sentToUsers.size
            });
        } catch (error) {
            this.logger.error('❌ Error saving keyword configuration to database', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    async saveCustomFlexMessage(flexMessage) {
        try {
            this.logger.info('💾 Saving custom flex message to database...', {
                messageType: flexMessage?.type,
                messageKeys: Object.keys(flexMessage || {}),
                messageSize: flexMessage ? JSON.stringify(flexMessage).length : 0,
                hasNestedFlexMessage: !!(flexMessage?.flexMessage)
            });

            if (!flexMessage) {
                this.logger.error('❌ No flex message provided');
                throw new Error('No flex message provided');
            }

            // *** ตรวจสอบและแยก nested flexMessage ***
            let processedFlexMessage = flexMessage;

            if (flexMessage && flexMessage.flexMessage && typeof flexMessage.flexMessage === 'object') {
                this.logger.info('🔧 Detected nested flexMessage structure, extracting...', {
                    wrapperKeys: Object.keys(flexMessage),
                    nestedKeys: Object.keys(flexMessage.flexMessage)
                });

                processedFlexMessage = flexMessage.flexMessage;
            }

            // Validate that the message is properly formatted
            if (!processedFlexMessage || typeof processedFlexMessage !== 'object') {
                throw new Error('Invalid flex message format: not an object');
            }

            if (!processedFlexMessage.type) {
                throw new Error('Invalid flex message format: missing type property');
            }

            if (processedFlexMessage.type !== 'bubble' && processedFlexMessage.type !== 'carousel') {
                throw new Error(`Invalid flex message type: ${processedFlexMessage.type}. Must be 'bubble' or 'carousel'`);
            }

            // *** ลบ properties ที่ไม่รองรับ ***
            const unsupportedProps = ['height', 'offsetStart'];
            const cleanFlexMessage = (obj) => {
                if (typeof obj !== 'object' || obj === null) return obj;

                const cleaned = {};
                for (const [key, value] of Object.entries(obj)) {
                    if (!unsupportedProps.includes(key)) {
                        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                            cleaned[key] = cleanFlexMessage(value);
                        } else if (Array.isArray(value)) {
                            cleaned[key] = value.map(item => cleanFlexMessage(item));
                        } else {
                            cleaned[key] = value;
                        }
                    } else {
                        this.logger.info(`🧹 Removing unsupported property: ${key}`);
                    }
                }
                return cleaned;
            };

            processedFlexMessage = cleanFlexMessage(processedFlexMessage);

            // Store in memory
            this.customFlexMessage = processedFlexMessage;

            // Save to database
            await this.prismaService.setSetting(
                'custom_flex_message',
                processedFlexMessage,
                'Custom flex message for keyword detector'
            );

            this.logger.info('✅ Custom flex message saved to database successfully', {
                messageType: processedFlexMessage.type,
                messageSize: JSON.stringify(processedFlexMessage).length
            });

            return true;
        } catch (error) {
            this.logger.error('💥 Error saving custom flex message to database', {
                error: error.message,
                stack: error.stack,
                flexMessageProvided: !!flexMessage
            });
            throw error;
        }
    }
    
    updateFlexMessageFromConfig(flexConfig) {
        if (flexConfig) {
            this.config.flex = flexConfig;
            this.logger.info('🔄 Updated flex message configuration', {
                altText: flexConfig.altText,
                headerText: flexConfig.header?.text,
                bodyText: flexConfig.body?.text
            });
        }
    }

    async processOutgoingMessage(userId, message) {
        try {
            this.logger.info('🔍 Processing outgoing message for keyword detection', {
                userId: userId ? userId.substring(0, 10) + '...' : 'missing',
                messageLength: message ? message.length : 0,
                messagePreview: message ? message.substring(0, 50) + '...' : 'undefined/null',
                debugMode: this.debugMode,
                preventDuplicates: this.config.preventDuplicates
            });
            
            if (!userId) {
                this.logger.warn('⚠️ Missing userId, cannot process message for keywords', { 
                    message: message ? message.substring(0, 100) + '...' : 'undefined'
                });
                return;
            }
    
            // Check if message is undefined or null
            if (!message) {
                this.logger.warn('⚠️ Undefined or null message content, skipping keyword detection', {
                    userId: userId.substring(0, 10) + '...'
                });
                return;
            }
    
            // *** ตรวจสอบว่าเคยส่งให้ผู้ใช้คนนี้แล้วหรือไม่ ***
            if (this.config.preventDuplicates && this.hasAlreadySentToUser(userId)) {
                this.stats.duplicateAttempts++;
                this.logger.info('🚫 Skipping - User has already received flex message', {
                    userId: userId.substring(0, 10) + '...',
                    debugMode: this.debugMode,
                    totalSentUsers: this.sentToUsers.size,
                    duplicateAttempts: this.stats.duplicateAttempts
                });
                return;
            }
    
            // Check if any tracked keywords are in the message
            const containsKeyword = this.keywordsToDetect.some(keyword => 
                message.toLowerCase().includes(keyword.toLowerCase())
            );
            
            this.logger.info('🔎 Keyword detection results', {
                userId: userId.substring(0, 10) + '...',
                containsKeyword,
                keywordsChecked: this.keywordsToDetect,
                messageToCheck: message.toLowerCase().substring(0, 100) + '...'
            });
            
            if (containsKeyword) {
                const matchedKeyword = this.keywordsToDetect.find(k => 
                    message.toLowerCase().includes(k.toLowerCase())
                ) || 'Unknown';
                
                this.logger.info('✅ Keyword detected in outgoing message', {
                    userId: userId.substring(0, 10) + '...',
                    keyword: matchedKeyword,
                    debugMode: this.debugMode,
                    isFirstTimeUser: !this.hasAlreadySentToUser(userId)
                });
                
                // Track keyword found stat
                this.stats.keywordsFoundCount++;
                
                // *** ส่ง flex message เฉพาะผู้ใช้ใหม่ ***
                this.logger.info('🚀 Sending flex message to new user', {
                    userId: userId.substring(0, 10) + '...',
                    reason: 'First time user with keyword detected',
                    matchedKeyword: matchedKeyword
                });
                
                const result = await this.sendFlexMessage(userId);
                
                if (result) {
                    this.markUserAsSent(userId);
                    this.stats.flexSentCount++;
                    
                    this.logger.info('✅ Flex message sent successfully via keyword detection', {
                        userId: userId.substring(0, 10) + '...',
                        matchedKeyword,
                        totalFlexSent: this.stats.flexSentCount,
                        totalSentUsers: this.sentToUsers.size
                    });
                    
                    // บันทึก configuration ทันทีหลังส่งสำเร็จ
                    await this.saveConfiguration();
                } else {
                    this.logger.error('❌ Failed to send flex message via keyword detection', {
                        userId: userId.substring(0, 10) + '...',
                        matchedKeyword
                    });
                }
            } else {
                this.logger.info('ℹ️ No keywords detected in message', {
                    userId: userId.substring(0, 10) + '...',
                    keywordsChecked: this.keywordsToDetect.length
                });
            }
        } catch (error) {
            this.logger.error('💥 Error processing outgoing message for keywords', {
                error: error.message,
                stack: error.stack,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                messageLength: message ? message.length : 0
            });
        }
    }

    // *** ฟังก์ชันสำหรับจัดการการป้องกันการส่งซ้ำ ***
    hasAlreadySentToUser(userId) {
        return this.sentToUsers.has(userId);
    }

    markUserAsSent(userId) {
        this.sentToUsers.add(userId);
        this.flexMessageSent.set(userId, Date.now()); // เก็บเวลาสำหรับ debug
        
        this.logger.info('📝 Marked user as sent', {
            userId: userId.substring(0, 10) + '...',
            totalSentUsers: this.sentToUsers.size,
            timestamp: new Date().toISOString()
        });
    }

    // *** ฟังก์ชันสำหรับ admin ลบผู้ใช้ออกจากรายการที่เคยส่งแล้ว ***
    removeUserFromSentList(userId) {
        const wasInList = this.sentToUsers.has(userId);
        this.sentToUsers.delete(userId);
        this.flexMessageSent.delete(userId);
        
        this.logger.info('🗑️ Removed user from sent list', {
            userId: userId.substring(0, 10) + '...',
            wasInList: wasInList,
            totalSentUsers: this.sentToUsers.size
        });
        
        // บันทึก configuration ทันที
        this.saveConfiguration();
        
        return {
            success: true,
            wasInList: wasInList,
            totalSentUsers: this.sentToUsers.size
        };
    }

    // *** ฟังก์ชันล้างรายการทั้งหมด (สำหรับ admin) ***
    clearAllSentUsers() {
        const previousCount = this.sentToUsers.size;
        this.sentToUsers.clear();
        this.flexMessageSent.clear();
        
        this.logger.info('🗑️ Cleared all sent users', {
            previousCount: previousCount,
            currentCount: this.sentToUsers.size
        });
        
        // บันทึก configuration ทันที
        this.saveConfiguration();
        
        return {
            success: true,
            previousCount: previousCount,
            currentCount: this.sentToUsers.size
        };
    }

    // *** ล้างข้อมูลเก่า (เรียกทุก 7 วัน) ***
    cleanupOldRecords() {
        // ล้างเฉพาะ flexMessageSent (เก็บเวลา) แต่ไม่ลบ sentToUsers
        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        let cleanedCount = 0;
        
        for (const [userId, timestamp] of this.flexMessageSent.entries()) {
            if (timestamp < oneWeekAgo) {
                this.flexMessageSent.delete(userId);
                cleanedCount++;
            }
        }
        
        this.logger.info('🧹 Cleaned up old timestamp records', {
            cleanedCount: cleanedCount,
            remainingTimestamps: this.flexMessageSent.size,
            sentUsersStillProtected: this.sentToUsers.size
        });
    }
    
    async sendFlexMessage(userId) {
        try {
            this.logger.info('📱 Starting flex message send process', {
                userId: userId ? userId.substring(0, 10) + '...' : 'missing',
                hasLineToken: !!this.lineToken,
                tokenPreview: this.lineToken ? this.lineToken.substring(0, 10) + '...' : 'missing'
            });
            
            if (!userId) {
                this.logger.error('❌ Cannot send flex message: missing userId');
                return false;
            }

            if (!this.lineToken) {
                this.logger.error('❌ Cannot send flex message: LINE token not available', {
                    envVariableName: 'LINE_CHANNEL_ACCESS_TOKEN'
                });
                return false;
            }

            // Determine which flex message to use
            let flexContent;
            if (this.customFlexMessage) {
                // Use the custom flex message
                this.logger.info('📋 Using custom flex message', {
                    userId: userId.substring(0, 10) + '...',
                    flexType: this.customFlexMessage.type,
                    flexSize: JSON.stringify(this.customFlexMessage).length
                });
                flexContent = this.customFlexMessage;
            } else {
                // Generate flex message from config
                this.logger.info('🔧 Using generated flex message from config', {
                    userId: userId.substring(0, 10) + '...',
                    headerText: this.config.flex.header.text,
                    bodyText: this.config.flex.body.text
                });
                flexContent = this.createFlexMessageContent();
            }
            
            const requestBody = {
                to: userId,
                messages: [{
                    type: 'flex',
                    altText: this.config.flex.altText || "ข้อมูลการติดต่อและตัวเลือก",
                    contents: flexContent
                }]
            };
            
            const requestHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.lineToken}`
            };
            
            this.logger.info('🌐 Sending request to LINE API', {
                url: 'https://api.line.me/v2/bot/message/push',
                userId: userId.substring(0, 10) + '...',
                messageType: 'flex',
                altText: requestBody.messages[0].altText,
                contentType: flexContent.type,
                contentSize: JSON.stringify(flexContent).length,
                headerAuthPreview: requestHeaders.Authorization.substring(0, 20) + '...'
            });
            
            const response = await axios.post(
                'https://api.line.me/v2/bot/message/push',
                requestBody,
                {
                    headers: requestHeaders,
                    timeout: 15000, // 15 second timeout
                    validateStatus: function (status) {
                        return status >= 200 && status < 500; // Don't throw on 4xx errors, we want to handle them
                    }
                }
            );
            
            this.logger.info('📡 LINE API response received', { 
                userId: userId.substring(0, 10) + '...',
                status: response.status,
                statusText: response.statusText,
                data: response.data,
                headers: response.headers,
                requestDuration: Date.now() - Date.now() // This won't be accurate, but placeholder for timing
            });
            
            if (response.status >= 200 && response.status < 300) {
                this.logger.info('✅ Flex message sent successfully', {
                    userId: userId.substring(0, 10) + '...',
                    status: response.status,
                    responseData: response.data
                });
                return true;
            } else {
                this.logger.error('❌ LINE API returned error status', {
                    userId: userId.substring(0, 10) + '...',
                    status: response.status,
                    statusText: response.statusText,
                    data: response.data,
                    requestBody: JSON.stringify(requestBody, null, 2)
                });
                return false;
            }
            
        } catch (error) {
            this.logger.error('💥 Error sending flex message', {
                error: error.message,
                userId: userId ? userId.substring(0, 10) + '...' : 'missing',
                responseStatus: error.response?.status,
                responseStatusText: error.response?.statusText,
                responseData: error.response?.data,
                responseHeaders: error.response?.headers,
                requestConfig: {
                    url: error.config?.url,
                    method: error.config?.method,
                    timeout: error.config?.timeout
                },
                stack: error.stack
            });
            
            // Try sending a text message instead as a fallback
            this.logger.info('🔄 Attempting to send fallback text message', {
                userId: userId ? userId.substring(0, 10) + '...' : 'missing'
            });
            
            await this.sendTextMessage(userId, "สามารถติดต่อเจ้าหน้าที่ได้ที่: " + this.config.flex.buttons.contact.url + " หรือปิดใช้งาน AI ได้โดยพิมพ์ 'ปิด AI'");
            return false;
        }
    }

    async sendTextMessage(userId, text) {
        try {
            this.logger.info('📝 Sending fallback text message', {
                userId: userId ? userId.substring(0, 10) + '...' : 'missing',
                textLength: text ? text.length : 0,
                textPreview: text ? text.substring(0, 50) + '...' : 'empty'
            });
            
            const response = await axios.post(
                'https://api.line.me/v2/bot/message/push',
                {
                    to: userId,
                    messages: [{
                        type: 'text',
                        text: text
                    }]
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.lineToken}`
                    },
                    timeout: 10000
                }
            );
            
            this.logger.info('✅ Fallback text message sent successfully', {
                userId: userId ? userId.substring(0, 10) + '...' : 'missing',
                status: response.status,
                data: response.data
            });
            
            return true;
        } catch (error) {
            this.logger.error('❌ Error sending fallback text message', {
                error: error.message,
                userId: userId ? userId.substring(0, 10) + '...' : 'missing',
                responseStatus: error.response?.status,
                responseData: error.response?.data,
                stack: error.stack
            });
            return false;
        }
    }

    createFlexMessageContent() {
        this.logger.info('🔨 Creating flex message content from config', {
            headerText: this.config.flex.header.text,
            headerColor: this.config.flex.header.color,
            bodyText: this.config.flex.body.text,
            disableAiText: this.config.flex.buttons.disableAi.text,
            emailAddress: this.config.flex.buttons.email.address,
            contactUrl: this.config.flex.buttons.contact.url
        });
        
        const flexContent = {
            type: "bubble",
            header: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: this.config.flex.header.text,
                        weight: "bold",
                        size: "xl",
                        color: "#ffffff"
                    }
                ],
                backgroundColor: this.config.flex.header.color,
                paddingTop: "lg",
                paddingBottom: "lg",
                paddingStart: "lg",
                paddingEnd: "lg"
            },
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: this.config.flex.body.text,
                        wrap: true,
                        color: "#8C8C8C",
                        size: "md",
                        margin: "md"
                    }
                ],
                paddingBottom: "lg"
            },
            footer: {
                type: "box",
                layout: "vertical",
                spacing: "sm",
                contents: [
                    {
                        type: "button",
                        style: "primary",
                        action: {
                            type: "postback",
                            label: this.config.flex.buttons.disableAi.text,
                            data: "action=disable_ai",
                            displayText: this.config.flex.buttons.disableAi.displayText
                        },
                        color: this.config.flex.buttons.disableAi.color
                    },
                    {
                        type: "button",
                        style: "secondary",
                        action: {
                            type: "uri",
                            label: this.config.flex.buttons.email.text,
                            uri: `mailto:${this.config.flex.buttons.email.address}`
                        }
                    },
                    {
                        type: "button",
                        action: {
                            type: "uri",
                            label: this.config.flex.buttons.contact.text,
                            uri: this.config.flex.buttons.contact.url
                        },
                        style: "link"
                    }
                ],
                paddingTop: "md"
            },
            styles: {
                footer: {
                    separator: true
                }
            }
        };
        
        this.logger.info('✅ Flex message content created', {
            type: flexContent.type,
            hasHeader: !!flexContent.header,
            hasBody: !!flexContent.body,
            hasFooter: !!flexContent.footer,
            footerButtonsCount: flexContent.footer.contents.length,
            contentSize: JSON.stringify(flexContent).length
        });
        
        return flexContent;
    }

    // Handle postback actions from flex message buttons
    async handlePostback(event) {
        try {
            this.logger.info('📲 Handling postback event', {
                event: event,
                hasData: !!event.data,
                hasUserId: !!event.userId,
                data: event.data,
                userId: event.userId ? event.userId.substring(0, 10) + '...' : 'missing'
            });
            
            const { data, userId } = event;
            
            if (!data || !userId) {
                this.logger.warn('⚠️ Incomplete postback data', {
                    hasData: !!data,
                    hasUserId: !!userId,
                    event: event
                });
                return;
            }
            
            if (data === 'action=disable_ai') {
                // Handle AI disable request
                this.logger.info('🔴 User requested to disable AI', {
                    userId: userId.substring(0, 10) + '...',
                    hasLineHandler: !!this.lineHandler
                });
                
                // This would typically call a method on the LineMessageHandler
                // to disable AI for this specific user
                if (this.lineHandler) {
                    this.logger.info('🔧 Attempting to disable AI for user', {
                        userId: userId.substring(0, 10) + '...'
                    });
                    
                    const result = this.lineHandler.setUserAiStatus(userId, false);
                    
                    this.logger.info('🔄 AI disable operation result', {
                        userId: userId.substring(0, 10) + '...',
                        result: result,
                        resultType: typeof result
                    });
                    
                    // Confirm to the user
                    if (result !== undefined) {
                        await this.sendTextMessage(userId, 'ปิดใช้งาน AI เรียบร้อยแล้ว');
                        this.logger.info('✅ AI disabled successfully and confirmation sent', {
                            userId: userId.substring(0, 10) + '...'
                        });
                    } else {
                        this.logger.error('❌ Failed to disable AI for user', {
                            userId: userId.substring(0, 10) + '...',
                            result: result
                        });
                        await this.sendTextMessage(userId, 'เกิดข้อผิดพลาดในการปิดใช้งาน AI กรุณาลองอีกครั้งในภายหลัง');
                    }
                } else {
                    this.logger.error('❌ Line handler not connected to keyword detector', {
                        userId: userId.substring(0, 10) + '...',
                        lineHandlerStatus: 'not connected'
                    });
                    await this.sendTextMessage(userId, 'เกิดข้อผิดพลาดในการปิดใช้งาน AI กรุณาลองอีกครั้งในภายหลัง');
                }
            } else if (data === 'action=enable_ai') {
                // Handle AI enable request
                this.logger.info('🟢 User requested to enable AI', {
                    userId: userId.substring(0, 10) + '...',
                    hasLineHandler: !!this.lineHandler
                });
                
                if (this.lineHandler) {
                    this.logger.info('🔧 Attempting to enable AI for user', {
                        userId: userId.substring(0, 10) + '...'
                    });
                    
                    const result = this.lineHandler.setUserAiStatus(userId, true);
                    
                    this.logger.info('🔄 AI enable operation result', {
                        userId: userId.substring(0, 10) + '...',
                        result: result,
                        resultType: typeof result
                    });
                    
                    // Confirm to the user
                    if (result !== undefined) {
                        await this.sendTextMessage(userId, 'เปิดใช้งาน AI เรียบร้อยแล้ว');
                        this.logger.info('✅ AI enabled successfully and confirmation sent', {
                            userId: userId.substring(0, 10) + '...'
                        });
                    } else {
                        this.logger.error('❌ Failed to enable AI for user', {
                            userId: userId.substring(0, 10) + '...',
                            result: result
                        });
                        await this.sendTextMessage(userId, 'เกิดข้อผิดพลาดในการเปิดใช้งาน AI กรุณาลองอีกครั้งในภายหลัง');
                    }
                } else {
                    this.logger.error('❌ Line handler not connected to keyword detector', {
                        userId: userId.substring(0, 10) + '...',
                        lineHandlerStatus: 'not connected'
                    });
                    await this.sendTextMessage(userId, 'เกิดข้อผิดพลาดในการเปิดใช้งาน AI กรุณาลองอีกครั้งในภายหลัง');
                }
            } else {
                // Handle other custom postback actions if needed
                this.logger.info('🔶 Received custom postback action', {
                    userId: userId.substring(0, 10) + '...',
                    data: data,
                    actionType: 'custom'
                });
            }
        } catch (error) {
            this.logger.error('💥 Error handling postback', {
                error: error.message,
                stack: error.stack,
                event: event,
                userId: event?.userId ? event.userId.substring(0, 10) + '...' : 'unknown'
            });
        }
    }
    
    // *** ฟังก์ชันทดสอบสำหรับ admin เท่านั้น ***
    async adminTestSendFlexMessage(userId, adminOverride = false) {
        this.logger.info('🧪 Admin testing flex message send', {
            userId: userId ? userId.substring(0, 10) + '...' : 'missing',
            adminOverride: adminOverride,
            hasCustomFlex: !!this.customFlexMessage,
            hasLineToken: !!this.lineToken,
            userAlreadySent: this.hasAlreadySentToUser(userId)
        });
        
        if (!adminOverride && this.hasAlreadySentToUser(userId)) {
            return {
                success: false,
                reason: 'User has already received flex message. Use adminOverride=true to bypass.',
                userAlreadySent: true
            };
        }
        
        const result = await this.sendFlexMessage(userId);
        
        if (result && !adminOverride) {
            // บันทึกการส่งเฉพาะเมื่อไม่ใช่ admin override
            this.markUserAsSent(userId);
            await this.saveConfiguration();
        }
        
        this.logger.info('🧪 Admin test result', {
            userId: userId ? userId.substring(0, 10) + '...' : 'missing',
            success: result,
            adminOverride: adminOverride,
            testTimestamp: new Date().toISOString()
        });
        
        return {
            success: result,
            adminOverride: adminOverride,
            userMarkedAsSent: result && !adminOverride,
            testTimestamp: new Date().toISOString()
        };
    }
    
    // Toggle debug mode
    setDebugMode(enabled) {
        const previousMode = this.debugMode;
        this.debugMode = !!enabled;
        
        this.logger.info('🐛 Debug mode changed', {
            previousMode: previousMode,
            newMode: this.debugMode,
            enabled: enabled,
            note: 'Debug mode still respects duplicate prevention',
            timestamp: new Date().toISOString()
        });
        
        // Save the updated configuration
        this.saveConfiguration();
        return this.debugMode;
    }
    
    // Set LINE handler - to be called from index.js after initialization
    setLineHandler(lineHandler) {
        this.lineHandler = lineHandler;
        
        this.logger.info('🔗 Line handler connected to keyword detector', {
            lineHandlerConnected: !!this.lineHandler,
            lineHandlerType: typeof this.lineHandler,
            timestamp: new Date().toISOString()
        });
    }
    
    // Get current keywords
    getKeywords() {
        this.logger.info('📋 Getting current keywords list', {
            keywordCount: this.keywordsToDetect.length,
            keywords: this.keywordsToDetect
        });
        
        return this.keywordsToDetect;
    }
    
    // Set keywords
    setKeywords(keywords) {
        this.logger.info('📝 Setting new keywords list', {
            newKeywords: keywords,
            isArray: Array.isArray(keywords),
            newKeywordCount: Array.isArray(keywords) ? keywords.length : 0,
            previousKeywordCount: this.keywordsToDetect.length
        });
        
        if (Array.isArray(keywords)) {
            const previousKeywords = [...this.keywordsToDetect];
            this.keywordsToDetect = keywords;
            
            this.logger.info('✅ Keywords list updated successfully', {
                previousKeywords: previousKeywords,
                newKeywords: this.keywordsToDetect,
                count: keywords.length
            });
            
            // Save the updated configuration
            this.saveConfiguration();
            return true;
        } else {
            this.logger.error('❌ Invalid keywords format - must be array', {
                providedType: typeof keywords,
                providedValue: keywords
            });
            return false;
        }
    }
    
    // Get current custom flex message
    getCustomFlexMessage() {
        const flexMessage = this.customFlexMessage || this.createFlexMessageContent();
        
        this.logger.info('📱 Getting custom flex message', {
            hasCustomMessage: !!this.customFlexMessage,
            messageType: flexMessage.type,
            messageSize: JSON.stringify(flexMessage).length,
            isGenerated: !this.customFlexMessage
        });
        
        return flexMessage;
    }
    
    // Get current settings
    getSettings() {
        const settings = {
            keywords: this.keywordsToDetect,
            debugMode: this.debugMode,
            preventDuplicates: this.config.preventDuplicates,
            maxFlexPerUser: this.config.maxFlexPerUser,
            sendTimeout: this.config.sendTimeout, // เก็บไว้สำหรับ backward compatibility
            flex: this.config.flex,
            hasCustomFlexMessage: !!this.customFlexMessage,
            stats: {
                flexSentCount: this.stats.flexSentCount,
                keywordsFoundCount: this.stats.keywordsFoundCount,
                duplicateAttempts: this.stats.duplicateAttempts,
                totalSentUsers: this.sentToUsers.size,
                lastUpdated: Date.now()
            }
        };
        
        this.logger.info('⚙️ Getting current settings', {
            keywordCount: settings.keywords.length,
            debugMode: settings.debugMode,
            preventDuplicates: settings.preventDuplicates,
            hasCustomFlex: settings.hasCustomFlexMessage,
            flexSentThisSession: settings.stats.flexSentCount,
            keywordsFoundThisSession: settings.stats.keywordsFoundCount,
            duplicateAttempts: settings.stats.duplicateAttempts,
            totalSentUsers: settings.stats.totalSentUsers,
            hasLineToken: !!this.lineToken,
            hasLineHandler: !!this.lineHandler
        });
        
        return settings;
    }

    // *** ฟังก์ชันสำหรับ admin จัดการรายชื่อผู้ใช้ ***
    getSentUsersList() {
        return {
            users: Array.from(this.sentToUsers),
            count: this.sentToUsers.size,
            lastUpdated: Date.now()
        };
    }

    getUserSentStatus(userId) {
        const hasSent = this.hasAlreadySentToUser(userId);
        const lastSentTime = this.flexMessageSent.get(userId);
        
        return {
            userId: userId,
            hasSent: hasSent,
            lastSentTime: lastSentTime,
            lastSentDate: lastSentTime ? new Date(lastSentTime).toISOString() : null
        };
    }

    // *** สถิติขั้นสูง ***
    async saveStats() {
        try {
            this.logger.info('📊 Saving keyword detector statistics...');
            
            // Ensure directory exists
            const dataDir = DATA_DIR;
            await fs.mkdir(dataDir, { recursive: true });
            
            const statsPath = path.join(dataDir, 'keyword_stats.json');
            
            // Try to read existing stats first
            let existingStats = {
                flexSentCount: 0,
                keywordsFoundCount: 0,
                duplicateAttempts: 0,
                totalUniqueUsers: 0,
                lastUpdated: Date.now()
            };
            
            try {
                const statsData = await fs.readFile(statsPath, 'utf8');
                existingStats = JSON.parse(statsData);
                
                this.logger.info('📈 Existing stats loaded', {
                    existingFlexSent: existingStats.flexSentCount,
                    existingKeywordsFound: existingStats.keywordsFoundCount,
                    existingDuplicateAttempts: existingStats.duplicateAttempts,
                    lastUpdated: new Date(existingStats.lastUpdated).toISOString()
                });
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    this.logger.error('❌ Error reading existing stats', {
                        error: error.message,
                        statsPath
                    });
                } else {
                    this.logger.info('ℹ️ No existing stats file found, creating new one', {
                        statsPath
                    });
                }
                // If file doesn't exist, we'll use default stats
            }
            
            // Update with new stats
            const updatedStats = {
                flexSentCount: existingStats.flexSentCount + this.stats.flexSentCount,
                keywordsFoundCount: existingStats.keywordsFoundCount + this.stats.keywordsFoundCount,
                duplicateAttempts: existingStats.duplicateAttempts + this.stats.duplicateAttempts,
                totalUniqueUsers: this.sentToUsers.size,
                lastUpdated: Date.now()
            };
            
            // Save updated stats
            await fs.writeFile(statsPath, JSON.stringify(updatedStats, null, 2), 'utf8');
            
            this.logger.info('✅ Statistics saved successfully', {
                statsPath,
                totalFlexSent: updatedStats.flexSentCount,
                totalKeywordsFound: updatedStats.keywordsFoundCount,
                totalDuplicateAttempts: updatedStats.duplicateAttempts,
                totalUniqueUsers: updatedStats.totalUniqueUsers,
                newFlexSentThisSession: this.stats.flexSentCount,
                newKeywordsFoundThisSession: this.stats.keywordsFoundCount,
                newDuplicateAttemptsThisSession: this.stats.duplicateAttempts
            });
            
            // Reset current counts
            this.stats.flexSentCount = 0;
            this.stats.keywordsFoundCount = 0;
            this.stats.duplicateAttempts = 0;
        } catch (error) {
            this.logger.error('💥 Error saving keyword stats', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    // *** Export/Import สำหรับ backup ***
    async exportSettings() {
        try {
            const exportData = {
                keywords: this.keywordsToDetect,
                debugMode: this.debugMode,
                config: this.config,
                sentToUsers: Array.from(this.sentToUsers),
                customFlexMessage: this.customFlexMessage,
                stats: this.stats,
                exportedAt: new Date().toISOString(),
                version: '1.0'
            };

            this.logger.info('📤 Exporting keyword detector settings', {
                keywordCount: exportData.keywords.length,
                sentUsersCount: exportData.sentToUsers.length,
                hasCustomFlex: !!exportData.customFlexMessage
            });

            return exportData;
        } catch (error) {
            this.logger.error('❌ Error exporting settings:', error);
            throw error;
        }
    }

    async importSettings(importData) {
        try {
            this.logger.info('📥 Importing keyword detector settings', {
                hasKeywords: !!importData.keywords,
                hasSentUsers: !!importData.sentToUsers,
                hasCustomFlex: !!importData.customFlexMessage,
                version: importData.version
            });

            if (importData.keywords && Array.isArray(importData.keywords)) {
                this.keywordsToDetect = importData.keywords;
            }

            if (importData.debugMode !== undefined) {
                this.debugMode = importData.debugMode;
            }

            if (importData.config) {
                this.config = { ...this.config, ...importData.config };
            }

            if (importData.sentToUsers && Array.isArray(importData.sentToUsers)) {
                this.sentToUsers = new Set(importData.sentToUsers);
            }

            if (importData.customFlexMessage) {
                this.customFlexMessage = importData.customFlexMessage;
            }

            if (importData.stats) {
                this.stats = { ...this.stats, ...importData.stats };
            }

            // Save all configurations
            await this.saveConfiguration();
            if (this.customFlexMessage) {
                await this.saveCustomFlexMessage(this.customFlexMessage);
            }

            this.logger.info('✅ Settings imported successfully', {
                keywordCount: this.keywordsToDetect.length,
                sentUsersCount: this.sentToUsers.size,
                debugMode: this.debugMode
            });

            return {
                success: true,
                keywordCount: this.keywordsToDetect.length,
                sentUsersCount: this.sentToUsers.size,
                hasCustomFlex: !!this.customFlexMessage
            };
        } catch (error) {
            this.logger.error('❌ Error importing settings:', error);
            throw error;
        }
    }

    // *** Health Check และ Monitoring ***
    healthCheck() {
        return {
            status: 'healthy',
            config: {
                keywordCount: this.keywordsToDetect.length,
                debugMode: this.debugMode,
                preventDuplicates: this.config.preventDuplicates,
                maxFlexPerUser: this.config.maxFlexPerUser
            },
            stats: {
                totalSentUsers: this.sentToUsers.size,
                flexSentThisSession: this.stats.flexSentCount,
                keywordsFoundThisSession: this.stats.keywordsFoundCount,
                duplicateAttemptsThisSession: this.stats.duplicateAttempts
            },
            connections: {
                hasLineToken: !!this.lineToken,
                hasLineHandler: !!this.lineHandler,
                hasCustomFlexMessage: !!this.customFlexMessage
            },
            memory: {
                sentToUsersSize: this.sentToUsers.size,
                flexMessageSentSize: this.flexMessageSent.size
            },
            timestamp: Date.now()
        };
    }

    // *** Cleanup และ Memory Management ***
    cleanup() {
        this.logger.info('🧹 Starting KeywordDetector cleanup...');
        
        try {
            // บันทึกสถิติก่อนล้าง
            this.saveStats();
            
            // ล้าง timestamp map แต่เก็บ sent users
            this.flexMessageSent.clear();
            
            this.logger.info('✅ KeywordDetector cleanup completed', {
                sentUsersPreserved: this.sentToUsers.size,
                flexMessageSentCleared: true
            });
            
        } catch (error) {
            this.logger.error('❌ Error during KeywordDetector cleanup:', error);
        }
    }
    }

    module.exports = KeywordDetector;
