// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');


const lineProfileCache = new Map();
const LINE_PROFILE_CACHE_TTL = 1800000; // 30 นาที


async function getUserIdsFromDatabase(chatHistory) {
    try {
        return await chatHistory.getUserListFast();
    } catch (error) {
        throw new Error(`Error reading user list from cache: ${error.message}`);
    }
}


async function getLineUserProfile(userId, lineHandler) {
    try {
        const cacheKey = `line_profile_${userId}`;
        const cached = lineProfileCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < LINE_PROFILE_CACHE_TTL) {
            return cached.profile;
        }

        const response = await axios.get(`https://api.line.me/v2/bot/profile/${userId}`, {
            headers: {
                'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
            },
            timeout: 5000 
        });
        

        lineProfileCache.set(cacheKey, {
            profile: response.data,
            timestamp: Date.now()
        });
        
        return response.data;
    } catch (error) {
        const fallbackProfile = {
            userId: userId,
            displayName: `User ${userId.substring(1, 9)}`,
            pictureUrl: '',
            statusMessage: ''
        };
        
        // Cache fallback เป็นเวลาสั้น
        lineProfileCache.set(`line_profile_${userId}`, {
            profile: fallbackProfile,
            timestamp: Date.now(),
            ttl: 60000 // 1 นาที
        });
        
        return fallbackProfile;
    }
}

function calculateUserCosts(history) {
    if (!history || !history.totalTokens) {
        return { 
            total: 0,
            input: 0,
            output: 0,
            caching: 0
        };
    }

    const inputTokens = history.totalTokens.input || 0;
    const outputTokens = history.totalTokens.output || 0;
    
    // ราคาประมาณ (USD per 1000 tokens)
    const inputRate = 0.0015; 
    const outputRate = 0.002; 
    
    const inputCost = (inputTokens / 1000) * inputRate;
    const outputCost = (outputTokens / 1000) * outputRate;
    const cachingCost = 0;

    return {
        input: inputCost,
        output: outputCost,
        caching: cachingCost,
        total: inputCost + outputCost + cachingCost
    };
}


async function getUserDataFast(userId, chatHistory, lineHandler, logger) {
    try {

        const [apiMetadata, aiMetadata, profileFromHistory] = await Promise.all([
            chatHistory.loadHistoryMetadata(userId, 'api'),
            chatHistory.loadHistoryMetadata(userId, 'ai'),
            chatHistory.getUserProfile(userId) 
        ]);

        let displayName = profileFromHistory?.displayName;
        let pictureUrl = profileFromHistory?.pictureUrl;

        if (!displayName || displayName.startsWith('User ')) {
            try {
                const lineProfile = await getLineUserProfile(userId, lineHandler);
                displayName = lineProfile.displayName;
                pictureUrl = lineProfile.pictureUrl;
            } catch (error) {
                displayName = displayName || `User ${userId.substring(1, 9)}`;
            }
        }

        return {
            userId: userId,
            displayName: displayName,
            pictureUrl: pictureUrl,
            lastActive: Math.max(
                apiMetadata?.lastUpdated || 0,
                aiMetadata?.lastUpdated || 0
            ),
            aiEnabled: lineHandler.isAiEnabledForUser ? lineHandler.isAiEnabledForUser(userId) : false,
            stats: {
                totalMessages: (apiMetadata?.messageCount || 0),
                aiMessages: (aiMetadata?.messageCount || 0),
                totalTokens: {
                    api: { input: 0, output: 0 }, 
                    ai: { input: 0, output: 0 }
                },
                costs: { total: 0, input: 0, output: 0, caching: 0 } 
            }
        };
    } catch (error) {
        logger.error(`Error processing fast user data for ${userId}:`, error);
        return {
            userId: userId,
            displayName: `User ${userId.substring(1, 9)}`,
            pictureUrl: '',
            lastActive: 0,
            aiEnabled: false,
            stats: {
                totalMessages: 0,
                aiMessages: 0,
                totalTokens: {
                    api: { input: 0, output: 0 },
                    ai: { input: 0, output: 0 }
                },
                costs: { total: 0, input: 0, output: 0, caching: 0 }
            }
        };
    }
}

function cleanupLineProfileCache() {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [key, data] of lineProfileCache.entries()) {
        const ttl = data.ttl || LINE_PROFILE_CACHE_TTL;
        if (now - data.timestamp > ttl) {
            lineProfileCache.delete(key);
            removedCount++;
        }
    }
    
    if (removedCount > 0) {
        console.log(`Cleaned up ${removedCount} LINE profile cache entries`);
    }
}


setInterval(cleanupLineProfileCache, 60 * 60 * 1000); 

module.exports = (dependencies) => {
    const { chatHistory, lineHandler, aiAssistant, logger } = dependencies;

    router.get('/', async (req, res) => {
        try {
            const startTime = Date.now();
            

            const userIds = await getUserIdsFromDatabase(chatHistory);
            logger.info(`Found ${userIds.length} users`);
            
            const users = await Promise.all(
                userIds.map(userId => getUserDataFast(userId, chatHistory, lineHandler, logger))
            );
            
            users.sort((a, b) => b.lastActive - a.lastActive);

            const duration = Date.now() - startTime;
            
            res.json({
                success: true,
                count: users.length,
                users: users,
                performance: {
                    loadTime: duration,
                    cached: true
                }
            });
            
            logger.info(`Users API completed in ${duration}ms with ${users.length} users`);
            
        } catch (error) {
            logger.error('Error getting users:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Error getting users',
                message: error.message 
            });
        }
    });

    router.get('/fast', async (req, res) => {
        try {
            const startTime = Date.now();
            
            const userIds = await chatHistory.getUserListFast();

            const users = await Promise.all(
                userIds.map(async (userId) => {
                    const profile = await chatHistory.getUserProfile(userId);
                    return {
                        userId: userId,
                        displayName: profile.displayName,
                        pictureUrl: profile.pictureUrl
                    };
                })
            );

            const duration = Date.now() - startTime;
            
            res.json({
                success: true,
                count: users.length,
                users: users,
                performance: {
                    loadTime: duration,
                    mode: 'fast'
                }
            });
            
            logger.info(`Fast users API completed in ${duration}ms`);
            
        } catch (error) {
            logger.error('Error getting fast users:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Error getting fast users',
                message: error.message 
            });
        }
    });

    router.get('/:userId', async (req, res) => {
        try {
            const { userId } = req.params;
            const startTime = Date.now();
            

            const [apiHistory, aiHistory, profileFromHistory] = await Promise.all([
                chatHistory.loadAPIChatHistory(userId),
                chatHistory.loadAIChatHistory(userId),
                chatHistory.getUserProfile(userId)
            ]);
            
            let lineProfile = null;
            if (!profileFromHistory?.displayName || profileFromHistory.displayName.startsWith('User ')) {
                lineProfile = await getLineUserProfile(userId, lineHandler);
            }
            
            const user = {
                userId: userId,
                displayName: lineProfile?.displayName || profileFromHistory?.displayName || 'Unknown User',
                pictureUrl: lineProfile?.pictureUrl || profileFromHistory?.pictureUrl,
                statusMessage: lineProfile?.statusMessage,
                lastActive: Math.max(
                    apiHistory?.lastUpdated || 0, 
                    aiHistory?.lastUpdated || 0
                ),
                aiEnabled: lineHandler.isAiEnabledForUser ? lineHandler.isAiEnabledForUser(userId) : false,
                stats: {
                    totalMessages: (apiHistory?.messages || []).length,
                    aiMessages: (aiHistory?.messages || []).length,
                    totalTokens: {
                        api: apiHistory?.totalTokens || { input: 0, output: 0 },
                        ai: aiHistory?.totalTokens || { input: 0, output: 0 }
                    },
                    costs: calculateUserCosts(aiHistory)
                },
                history: {
                    api: apiHistory?.messages || [],
                    ai: aiHistory?.messages || []
                }
            };

            const duration = Date.now() - startTime;
            
            res.json({
                success: true,
                user: user,
                performance: {
                    loadTime: duration
                }
            });
            
        } catch (error) {
            logger.error(`Error getting user ${req.params.userId}:`, error);
            res.status(500).json({ 
                success: false, 
                error: 'Error getting user details',
                message: error.message 
            });
        }
    });


    router.post('/:userId/ai-toggle', async (req, res) => {
        try {
            const { userId } = req.params;
            const { enabled } = req.body;

            if (typeof enabled !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    error: 'enabled parameter must be boolean'
                });
            }

            const status = lineHandler.setUserAiStatus ? lineHandler.setUserAiStatus(userId, enabled) : enabled;
            
            res.json({
                success: true,
                userId: userId,
                aiEnabled: status,
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error(`Error toggling AI for user ${req.params.userId}:`, error);
            res.status(500).json({
                success: false,
                error: 'Error toggling user AI status'
            });
        }
    });


    router.get('/:userId/messages', async (req, res) => {
        try {
            const { userId } = req.params;
            const { page = 1, limit = 50, type = 'all' } = req.query;
            
            let messages = [];
            
            if (type === 'all' || type === 'api') {
                const apiHistory = await chatHistory.loadAPIChatHistory(userId);
                if (apiHistory?.messages) {
                    messages.push(...apiHistory.messages.map(m => ({ ...m, source: 'api' })));
                }
            }
            
            if (type === 'all' || type === 'ai') {
                const aiHistory = await chatHistory.loadAIChatHistory(userId);
                if (aiHistory?.messages) {
                    messages.push(...aiHistory.messages.map(m => ({ ...m, source: 'ai' })));
                }
            }


            messages.sort((a, b) => b.timestamp - a.timestamp);


            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            const startIndex = (pageNum - 1) * limitNum;
            const endIndex = startIndex + limitNum;
            const paginatedMessages = messages.slice(startIndex, endIndex);

            res.json({
                success: true,
                userId: userId,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: messages.length,
                    pages: Math.ceil(messages.length / limitNum)
                },
                messages: paginatedMessages
            });

        } catch (error) {
            logger.error(`Error getting messages for user ${req.params.userId}:`, error);
            res.status(500).json({
                success: false,
                error: 'Error getting user messages'
            });
        }
    });

    router.post('/cache/refresh', async (req, res) => {
        try {

            lineProfileCache.clear();
            

            await chatHistory.refreshAllCaches();
            
            res.json({
                success: true,
                message: 'All user caches refreshed',
                timestamp: Date.now()
            });
            
        } catch (error) {
            logger.error('Error refreshing user caches:', error);
            res.status(500).json({
                success: false,
                error: 'Error refreshing caches'
            });
        }
    });

    router.get('/cache/stats', (req, res) => {
        try {
            const stats = {
                lineProfileCache: {
                    size: lineProfileCache.size,
                    ttl: LINE_PROFILE_CACHE_TTL
                },
                chatHistoryCache: chatHistory.getPerformanceStats()
            };
            
            res.json({
                success: true,
                stats: stats,
                timestamp: Date.now()
            });
            
        } catch (error) {
            logger.error('Error getting cache stats:', error);
            res.status(500).json({
                success: false,
                error: 'Error getting cache statistics'
            });
        }
    });

    return router;
};