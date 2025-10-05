'use strict';

class ChatHistoryHandler {
    constructor(logger, chatHistoryInstance, cache) {
        this.logger = logger;
        this.chatHistoryInstance = chatHistoryInstance; // The main chatHistory object (e.g., from a DB wrapper)
        this.cache = cache; // NodeCache instance for user profiles
    }

    async formatChatHistoryForGemini(history, personality) {
        if (!history?.messages) {
            return [{ role: 'model', parts: [{ text: personality }] }];
        }
        try {
            const allMessages = history.messages.filter(msg => msg && (msg.role === 'user' || msg.role === 'model' || msg.role === 'admin'));
            const formattedMessages = [];
            for (const msg of allMessages) {
                if (!msg.content) continue;
                let role = 'user'; // Default
                if (msg.role === 'model') role = 'model';
                // Admin messages are treated as user messages for the AI
                formattedMessages.push({ role: role, parts: [{ text: msg.content }] });
            }
            this.logger.info('Formatted chat history for Gemini by ChatHistoryHandler', { messageCount: formattedMessages.length });
            return formattedMessages;
        } catch (error) {
            this.logger.error('Error formatting chat history in ChatHistoryHandler:', error);
            return [{ role: 'model', parts: [{ text: personality }] }]; // Fallback
        }
    }

    async getUserProfile(userId) {
        try {
            const cacheKey = `user_profile_${userId}`;
            const cachedProfile = this.cache.get(cacheKey);
            if (cachedProfile) {
                this.logger.debug(`User profile for ${userId} found in cache.`);
                return cachedProfile;
            }

            if (!this.chatHistoryInstance) {
                this.logger.warn('ChatHistory instance not available in ChatHistoryHandler for getUserProfile.');
                return null;
            }

            const history = await this.chatHistoryInstance.loadAIChatHistory(userId); // Assuming this method exists on the instance
            if (!history || !history.messages || history.messages.length === 0) {
                this.logger.info(`No chat history found for user ${userId} to create profile.`);
                return null;
            }

            const profile = {
                userId: userId,
                messageCount: history.messages.filter(m => m.role === 'user').length,
                firstInteraction: history.messages[0].timestamp,
                lastInteraction: history.messages[history.messages.length - 1].timestamp
            };
            this.cache.set(cacheKey, profile);
            this.logger.info(`User profile for ${userId} created and cached.`);
            return profile;
        } catch (error) {
            this.logger.error(`Error getting user profile for ${userId} in ChatHistoryHandler: ${error.message}`, { stack: error.stack });
            return null;
        }
    }

    async saveToAIChatHistory(userId, conversationUpdate) {
        if (!this.chatHistoryInstance) {
            this.logger.error('ChatHistory instance not available in ChatHistoryHandler for saving.');
            throw new Error('ChatHistory instance is not configured for saving.');
        }
        try {
            await this.chatHistoryInstance.saveHistory(userId, conversationUpdate, 'ai');
            this.logger.info(`Saved conversation to AI history for user ${userId} via ChatHistoryHandler.`);
        } catch (historyError) {
            this.logger.error('Failed to save conversation to AI history via ChatHistoryHandler:', historyError);
            throw historyError; // Re-throw for the caller to handle
        }
    }
    
    async loadAIChatHistory(userId) {
        if (!this.chatHistoryInstance) {
            this.logger.error('ChatHistory instance not available in ChatHistoryHandler for loading.');
            throw new Error('ChatHistory instance is not configured for loading.');
        }
        try {
            const history = await this.chatHistoryInstance.loadAIChatHistory(userId);
            this.logger.info(`Loaded AI chat history for user ${userId} via ChatHistoryHandler.`);
            return history;
        } catch (historyError) {
            this.logger.error(`Failed to load AI chat history for user ${userId} via ChatHistoryHandler:`, historyError);
            return { messages: [] }; // Return empty history on error
        }
    }
}

module.exports = ChatHistoryHandler;
