const EventEmitter = require('events');

class MessageHandler extends EventEmitter {
    constructor(logger) {
        super();
        this.logger = logger;
        this.messageQueue = new Map();
        this.processingMessages = new Map();
        this.messageHistory = new Map();
        this.aggregatingMessages = new Map();
        
        // Core configuration
        this.PROCESSING_TIMEOUT = 120000;  
        this.MESSAGE_HISTORY_TTL = 36000000;  
        this.BATCH_SIZE = 10;
        this.MAX_RETRIES = 3;
        this.RETRY_DELAY = 120000;

        this.AGGREGATION_DELAY = 120000;   
        this.MAX_AGGREGATION_TIME = 120000;
        this.MIN_MESSAGE_GAP = 120000;     

        // Thai language message handling
        this.JOIN_THAI_FRAGMENTS = true;  

        // Start cleanup intervals
        this.startCleanupIntervals();
    }

    startCleanupIntervals() {
        setInterval(() => this.cleanupProcessingMessages(), 60000);
        setInterval(() => this.cleanupMessageHistory(), 3600000);
        setInterval(() => this.cleanupAggregatingMessages(), 60000);
    }

    async queueMessage(message) {
        try {
            // Skip aggregation if explicitly requested
            if (message.skipAggregation === true) {
                return this.processMessageDirectly(message);
            }

            // Check if this is a single message or part of aggregation
            return this.handleMessageAggregation(message);
        } catch (error) {
            this.logger.error('Error queuing message:', error);
            throw new Error('Failed to queue message');
        }
    }

    async handleMessageAggregation(message) {
        const userId = message.userId;
        const now = Date.now();
        const existingAggregation = this.aggregatingMessages.get(userId);

        if (existingAggregation) {
            return this.addToExistingAggregation(userId, message, existingAggregation, now);
        } else {
            return this.startNewAggregation(userId, message, now);
        }
    }

    async addToExistingAggregation(userId, message, existingAggregation, now) {
        const timeSinceLastMessage = now - existingAggregation.lastMessageTime;
        const aggregationAge = now - existingAggregation.startTime;

        // Check if we can add to existing aggregation
        if (timeSinceLastMessage >= this.MIN_MESSAGE_GAP && 
            aggregationAge < this.MAX_AGGREGATION_TIME) {
            
            // Clear existing timeout
            clearTimeout(existingAggregation.timeoutId);

            // Add new message
            existingAggregation.messages.push(message);
            existingAggregation.lastMessageTime = now;

            // Set new timeout
            const timeoutId = setTimeout(() => {
                this.processAggregatedMessages(userId);
            }, this.AGGREGATION_DELAY);

            // Update aggregation
            this.aggregatingMessages.set(userId, {
                ...existingAggregation,
                timeoutId
            });

            this.logger.info('Added message to existing aggregation', {
                userId, 
                messageCount: existingAggregation.messages.length,
                timeSinceLastMessage,
                aggregationAge
            });

            return {
                aggregating: true,
                messageCount: existingAggregation.messages.length
            };
        } else {
            // Process existing messages and start new aggregation
            await this.processAggregatedMessages(userId);
            return this.startNewAggregation(userId, message, now);
        }
    }

    async startNewAggregation(userId, message, now) {
        const timeoutId = setTimeout(() => {
            this.processAggregatedMessages(userId);
        }, this.AGGREGATION_DELAY);

        this.aggregatingMessages.set(userId, {
            messages: [message],
            startTime: now,
            lastMessageTime: now,
            timeoutId
        });

        this.logger.info('Started new message aggregation', {
            userId,
            messageContent: message.content?.substring(0, 50),
            aggregationDelay: this.AGGREGATION_DELAY
        });

        return {
            aggregating: true,
            messageCount: 1
        };
    }

    // Helper to detect if text is in Thai language
    isThaiLanguage(text) {
        // Thai Unicode range: U+0E00 to U+0E7F
        const thaiPattern = /[\u0E00-\u0E7F]/;
        return thaiPattern.test(text);
    }

    // Combine messages intelligently based on content type
    combineMessages(messages) {
        if (messages.length === 0) return '';
        if (messages.length === 1) return messages[0].content;

        // Check if we should join Thai fragments without spaces
        if (this.JOIN_THAI_FRAGMENTS && 
            messages.every(msg => this.isThaiLanguage(msg.content) && msg.content.length < 20)) {
            this.logger.info('Joining Thai message fragments without separators');
            return messages.map(msg => msg.content).join('');
        }

        // Default: join with newlines
        return messages.map(msg => msg.content).join('\n');
    }

    async processAggregatedMessages(userId) {
        const aggregation = this.aggregatingMessages.get(userId);
        if (!aggregation) return;

        // Clear from aggregating messages
        this.aggregatingMessages.delete(userId);
        clearTimeout(aggregation.timeoutId);

        if (aggregation.messages.length === 0) return;

        // Combine message content intelligently
        const combinedContent = this.combineMessages(aggregation.messages);

        // Create combined message
        const combinedMessage = {
            userId: userId,
            content: combinedContent,
            timestamp: Date.now(),
            messageId: this.generateMessageId(userId, aggregation.messages[0].content, Date.now()),
            originalMessages: aggregation.messages,
            replyToken: aggregation.messages[0].replyToken, // Use first message's replyToken
            skipAggregation: true // Prevent recursive aggregation
        };

        this.logger.info('Processing aggregated messages', {
            userId,
            messageCount: aggregation.messages.length,
            combinedLength: combinedContent.length,
            originalContents: aggregation.messages.map(m => m.content).join(' | ').substring(0, 100)
        });

        // Process the combined message
        return this.processMessageDirectly(combinedMessage);
    }

    async processMessageDirectly(message) {
        const messageId = message.messageId || this.generateMessageId(
            message.userId,
            message.content,
            message.timestamp
        );

        // Check for duplicates
        if (this.isDuplicate(messageId, message)) {
            return { duplicate: true, messageId };
        }

        // Add to processing queue
        await this.addToProcessingQueue(messageId, message);

        // Emit event for message processing
        this.emit('messageReceived', {
            messageId,
            message
        });

        return { 
            success: true, 
            messageId,
            aggregated: message.originalMessages ? true : false,
            messageCount: message.originalMessages ? message.originalMessages.length : 1
        };
    }

    isDuplicate(messageId, message) {
        if (this.processingMessages.has(messageId)) {
            return true;
        }

        const recentMessage = this.messageHistory.get(messageId);
        if (recentMessage) {
            const timeDiff = message.timestamp - recentMessage.timestamp;
            return timeDiff < this.MESSAGE_HISTORY_TTL;
        }

        return false;
    }

    generateMessageId(userId, content, timestamp) {
        return `${userId}_${Buffer.from(content).toString('base64').slice(0, 30)}_${timestamp}`;
    }

    async addToProcessingQueue(messageId, message) {
        this.processingMessages.set(messageId, {
            message,
            startTime: Date.now(),
            retryCount: 0
        });

        // Set processing timeout
        setTimeout(() => {
            this.handleMessageTimeout(messageId);
        }, this.PROCESSING_TIMEOUT);
    }

    handleMessageTimeout(messageId) {
        const processingData = this.processingMessages.get(messageId);
        if (!processingData) return;

        if (processingData.retryCount < this.MAX_RETRIES) {
            processingData.retryCount++;
            this.emit('messageRetry', messageId, processingData.message);
            
            setTimeout(() => {
                this.processMessageDirectly(processingData.message)
                    .catch(error => this.logger.error('Retry processing failed:', error));
            }, this.RETRY_DELAY * processingData.retryCount);
        } else {
            this.completeMessage(messageId, false);
            this.emit('messageFailure', messageId, processingData.message);
        }
    }

    completeMessage(messageId, success = true) {
        const processingData = this.processingMessages.get(messageId);
        if (!processingData) return;

        if (success) {
            this.messageHistory.set(messageId, {
                ...processingData.message,
                completedAt: Date.now()
            });
        }

        this.processingMessages.delete(messageId);
        this.logger.info('Message processing completed:', {
            messageId,
            success
        });
    }

    cleanupProcessingMessages() {
        const now = Date.now();
        for (const [messageId, data] of this.processingMessages.entries()) {
            if (now - data.startTime > this.PROCESSING_TIMEOUT && 
                data.retryCount >= this.MAX_RETRIES) {
                this.processingMessages.delete(messageId);
            }
        }
    }

    cleanupMessageHistory() {
        const now = Date.now();
        for (const [messageId, message] of this.messageHistory.entries()) {
            if (now - message.timestamp > this.MESSAGE_HISTORY_TTL) {
                this.messageHistory.delete(messageId);
            }
        }
    }

    cleanupAggregatingMessages() {
        const now = Date.now();
        for (const [userId, aggregation] of this.aggregatingMessages.entries()) {
            if (now - aggregation.startTime >= this.MAX_AGGREGATION_TIME) {
                this.processAggregatedMessages(userId);
            }
        }
    }

    getQueueStats() {
        return {
            processingCount: this.processingMessages.size,
            historyCount: this.messageHistory.size,
            aggregatingCount: this.aggregatingMessages.size
        };
    }

    getConfiguration() {
        return {
            processingTimeout: this.PROCESSING_TIMEOUT,
            messageHistoryTTL: this.MESSAGE_HISTORY_TTL,
            maxRetries: this.MAX_RETRIES,
            retryDelay: this.RETRY_DELAY,
            batchSize: this.BATCH_SIZE,
            aggregationDelay: this.AGGREGATION_DELAY,
            maxAggregationTime: this.MAX_AGGREGATION_TIME,
            minMessageGap: this.MIN_MESSAGE_GAP,
            joinThaiFragments: this.JOIN_THAI_FRAGMENTS
        };
    }

    updateConfiguration(config) {
        if (config.aggregationDelay) this.AGGREGATION_DELAY = config.aggregationDelay;
        if (config.maxAggregationTime) this.MAX_AGGREGATION_TIME = config.maxAggregationTime;
        if (config.minMessageGap) this.MIN_MESSAGE_GAP = config.minMessageGap;
        if (config.joinThaiFragments !== undefined) this.JOIN_THAI_FRAGMENTS = config.joinThaiFragments;
        
        this.logger.info('Message handler configuration updated', {
            aggregationDelay: this.AGGREGATION_DELAY,
            maxAggregationTime: this.MAX_AGGREGATION_TIME,
            minMessageGap: this.MIN_MESSAGE_GAP,
            joinThaiFragments: this.JOIN_THAI_FRAGMENTS
        });
        
        return this.getConfiguration();
    }
}

module.exports = MessageHandler;