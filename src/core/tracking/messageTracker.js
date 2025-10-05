const fs = require('fs');
const path = require('path');
const { resolveDataPath } = require('../../app/paths');

class MessageTracker {
    constructor() {
        this.trackingDir = resolveDataPath('message_tracking');
        this.summaryDir = resolveDataPath('summary_history');
        this.chatHistoryDir = resolveDataPath('chat_histories_api');
        this.ensureDirectoriesExist();
        this.trackingIntervals = new Map();
    }

    ensureDirectoriesExist() {
        [this.trackingDir, this.summaryDir, this.chatHistoryDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    getTrackingPath(userId) {
        return path.join(this.trackingDir, `${userId}_tracking.json`);
    }

    getSummaryPath(userId) {
        return path.join(this.trackingDir, `${userId}_summary_tracking.json`);
    }

    getChatHistoryPath(userId) {
        return path.join(this.chatHistoryDir, `${userId}.json`);
    }

    loadTracking(userId) {
        const trackingPath = this.getTrackingPath(userId);
        try {
            if (fs.existsSync(trackingPath)) {
                return JSON.parse(fs.readFileSync(trackingPath, 'utf8'));
            }
        } catch (error) {
            console.error(`Error loading tracking for user ${userId}:`, error);
        }
        return {
            lastProcessedMessage: null,
            lastUpdateCheck: new Date().toISOString(),
            processedMessages: {},
            summarizedMessages: {}
        };
    }

    loadSummaryTracking(userId) {
        const summaryPath = this.getSummaryPath(userId);
        try {
            if (fs.existsSync(summaryPath)) {
                return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
            }
        } catch (error) {
            console.error(`Error loading summary tracking for user ${userId}:`, error);
        }
        return {
            summarizedMessageIds: {},
            lastSummaryTimestamp: null
        };
    }

    saveTracking(userId, tracking) {
        try {
            fs.writeFileSync(this.getTrackingPath(userId), JSON.stringify(tracking, null, 2));
            return true;
        } catch (error) {
            console.error(`Error saving tracking for user ${userId}:`, error);
            return false;
        }
    }

    saveSummaryTracking(userId, summaryTracking) {
        try {
            fs.writeFileSync(this.getSummaryPath(userId), JSON.stringify(summaryTracking, null, 2));
            return true;
        } catch (error) {
            console.error(`Error saving summary tracking for user ${userId}:`, error);
            return false;
        }
    }

    generateMessageId(message) {
        return `${message.timestamp}_${message.content.slice(0, 50).replace(/\W+/g, '_')}`;
    }

    markMessageAsSummarized(userId, messageId) {
        const summaryTracking = this.loadSummaryTracking(userId);
        
        // Prevent duplicate summarization
        if (summaryTracking.summarizedMessageIds[messageId]) {
            return false;
        }

        // Add the message ID to summarized messages
        summaryTracking.summarizedMessageIds[messageId] = {
            timestamp: new Date().toISOString()
        };

        // Optional: Limit the number of tracked summarized messages
        const maxTrackedMessages = 1000;
        const messageIds = Object.keys(summaryTracking.summarizedMessageIds);
        if (messageIds.length > maxTrackedMessages) {
            // Remove oldest tracked messages
            const oldestMessageIds = messageIds
                .sort((a, b) => 
                    new Date(summaryTracking.summarizedMessageIds[a].timestamp) - 
                    new Date(summaryTracking.summarizedMessageIds[b].timestamp)
                )
                .slice(0, messageIds.length - maxTrackedMessages);
            
            oldestMessageIds.forEach(oldMessageId => {
                delete summaryTracking.summarizedMessageIds[oldMessageId];
            });
        }

        // Update last summary timestamp
        summaryTracking.lastSummaryTimestamp = new Date().toISOString();

        // Save the updated summary tracking
        this.saveSummaryTracking(userId, summaryTracking);
        return true;
    }

    isMessageAlreadySummarized(userId, messageId) {
        const summaryTracking = this.loadSummaryTracking(userId);
        return !!summaryTracking.summarizedMessageIds[messageId];
    }

    getUnprocessedMessages(userId, messages) {
        return messages.filter(msg => {
            const messageId = this.generateMessageId(msg);
            return !this.isMessageAlreadySummarized(userId, messageId);
        });
    }

    getUserSummaryStatus(userId) {
        const chatHistory = this.loadChatHistory(userId);
        const summaryTracking = this.loadSummaryTracking(userId);
        
        if (!chatHistory || !chatHistory.messages) {
            return {
                totalMessages: 0,
                summarizedMessages: 0,
                unprocessedMessages: 0,
                lastSummaryTimestamp: summaryTracking.lastSummaryTimestamp
            };
        }

        const unprocessedMessages = this.getUnprocessedMessages(userId, chatHistory.messages);
        
        return {
            totalMessages: chatHistory.messages.length,
            summarizedMessages: Object.keys(summaryTracking.summarizedMessageIds).length,
            unprocessedMessages: unprocessedMessages.length,
            lastSummaryTimestamp: summaryTracking.lastSummaryTimestamp
        };
    }

    loadChatHistory(userId) {
        const chatHistoryPath = this.getChatHistoryPath(userId);
        try {
            if (fs.existsSync(chatHistoryPath)) {
                const data = fs.readFileSync(chatHistoryPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error(`Error loading chat history for user ${userId}:`, error);
        }
        return null;
    }

    markMessagesAsSummarized(userId, messages) {
        const processedCount = messages.reduce((count, msg) => {
            const messageId = this.generateMessageId(msg);
            return this.markMessageAsSummarized(userId, messageId) ? count + 1 : count;
        }, 0);
        
        return processedCount;
    }

    getAllUsers() {
        try {
            return fs.readdirSync(this.chatHistoryDir)
                .filter(file => file.endsWith('.json'))
                .map(file => file.replace('.json', ''));
        } catch (error) {
            console.error('Error getting users:', error);
            return [];
        }
    }
}

module.exports = MessageTracker;
