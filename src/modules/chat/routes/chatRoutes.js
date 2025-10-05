
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;

function deduplicateMessages(messages, timeThreshold = 1000) {
    if (!messages || !Array.isArray(messages)) {
        return [];
    }

    let sortedMessages = [...messages].sort((a, b) => a.timestamp - b.timestamp);
    let result = [];
    
    for (let i = 0; i < sortedMessages.length; i++) {
        const currentMsg = sortedMessages[i];
        const prevMsg = result[result.length - 1];
        
        if (!prevMsg || 
            currentMsg.content !== prevMsg.content || 
            currentMsg.role !== prevMsg.role ||
            Math.abs(currentMsg.timestamp - prevMsg.timestamp) > timeThreshold) {
            result.push(currentMsg);
        }
    }
    
    return result;
}

function calculateChatStats(messages) {
    if (!Array.isArray(messages)) {
        return {
            totalMessages: 0,
            messagesByRole: {},
            averageResponseTime: 0,
            messagesByHour: {}
        };
    }

    const stats = {
        totalMessages: messages.length,
        messagesByRole: {},
        messagesByHour: {},
        averageResponseTime: 0
    };

    let totalResponseTime = 0;
    let responseCount = 0;
    let lastUserMessage = null;

    messages.forEach(message => {
        stats.messagesByRole[message.role] = (stats.messagesByRole[message.role] || 0) + 1;

        const hour = new Date(message.timestamp).getHours();
        stats.messagesByHour[hour] = (stats.messagesByHour[hour] || 0) + 1;

        if (message.role === 'user') {
            lastUserMessage = message;
        } else if (lastUserMessage) {
            const responseTime = message.timestamp - lastUserMessage.timestamp;
            if (responseTime > 0) {
                totalResponseTime += responseTime;
                responseCount++;
            }
        }
    });

    stats.averageResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 0;
    return stats;
}

// Helper function to generate mock stock data (would be replaced with real stock API)
function generateMockStockData() {
    return {
        stockLevel: Math.floor(Math.random() * 100) + 1,
        reorderLevel: Math.floor(Math.random() * 20) + 5,
        price: Math.floor(Math.random() * 1000) + 100,
        salesVelocity: Math.random() * 10, // items sold per day
        lastRestocked: Date.now() - (Math.random() * 30 * 24 * 60 * 60 * 1000), // last 30 days
        supplier: ['Supplier A', 'Supplier B', 'Supplier C'][Math.floor(Math.random() * 3)],
        leadTime: Math.floor(Math.random() * 14) + 1, // days
        unitCost: Math.floor(Math.random() * 500) + 50
    };
}

// Helper function to load product data with stock information
async function loadProductsWithStock(productManager) {
    try {
        const files = await fs.readdir(productManager.productsDir);
        const productFiles = files.filter(file => file.endsWith('.json'));
        
        const products = [];
        
        for (const file of productFiles) {
            try {
                const content = await fs.readFile(
                    path.join(productManager.productsDir, file),
                    'utf8'
                );
                const product = JSON.parse(content);
                
                // Add mock stock data (in real system, this would come from inventory database)
                const stockData = generateMockStockData();
                
                products.push({
                    id: file.replace('.json', ''),
                    product_name: product.product_name,
                    category: product.category,
                    sku: product.sku,
                    price: product.price,
                    url: product.url,
                    stock_quantity: product.stock_quantity || stockData.stockLevel,
                    last_updated: product.last_updated,
                    // Enhanced stock information
                    stockInfo: {
                        ...stockData,
                        stockStatus: stockData.stockLevel <= stockData.reorderLevel ? 'low' : 
                                   stockData.stockLevel <= stockData.reorderLevel * 2 ? 'medium' : 'good',
                        daysUntilStockout: stockData.salesVelocity > 0 ? 
                                         Math.floor(stockData.stockLevel / stockData.salesVelocity) : null,
                        profitMargin: stockData.price > stockData.unitCost ? 
                                    ((stockData.price - stockData.unitCost) / stockData.price * 100) : 0
                    }
                });
            } catch (error) {
                // Skip invalid files
            }
        }
        
        return products;
    } catch (error) {
        return [];
    }
}

module.exports = (dependencies) => {
    const { chatHistory, logger } = dependencies;

    // GET /api/chat/history/:userId - Get user chat history
    router.get('/history/:userId', async (req, res) => {
        try {
            const userId = req.params.userId;
            const type = req.query.type || 'api';
            
            let history;
            if (type === 'ai') {
                history = await chatHistory.loadAIChatHistory(userId);
            } else {
                history = await chatHistory.loadAPIChatHistory(userId);
            }

            if (!history) {
                history = {
                    userId,
                    messages: [],
                    lastUpdated: Date.now(),
                    totalTokens: { input: 0, output: 0 }
                };

                if (type === 'ai') {
                    await chatHistory.saveHistory(userId, history, 'ai');
                } else {
                    await chatHistory.saveHistory(userId, history, 'api');
                }
            }

            history.messages = deduplicateMessages(history.messages);
            const stats = calculateChatStats(history.messages);

            res.json({
                success: true,
                history: {
                    ...history,
                    stats
                }
            });
        } catch (error) {
            logger.error('Error getting chat history:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Error getting chat history',
                details: error.message
            });
        }
    });

    // GET /api/chat/users - Get users from chat history  
    router.get('/users', async (req, res) => {
        try {
            const userList = await chatHistory.getUserListFast();
            const users = [];

            for (const userId of userList) {
                try {
                    const profile = await chatHistory.getUserProfile(userId);
                    const apiMetadata = await chatHistory.loadHistoryMetadata(userId, 'api');
                    const aiMetadata = await chatHistory.loadHistoryMetadata(userId, 'ai');
                    
                    const messageCount = (apiMetadata?.messageCount || 0) + (aiMetadata?.messageCount || 0);
                    
                    if (messageCount > 0) {
                        users.push({
                            userId: userId,
                            displayName: profile?.displayName || `User ${userId.substring(1, 9)}`,
                            pictureUrl: profile?.pictureUrl || null,
                            lastActive: Math.max(
                                apiMetadata?.lastUpdated || 0, 
                                aiMetadata?.lastUpdated || 0
                            ),
                            messageCount: messageCount,
                            aiEnabled: true,
                            hasApiHistory: !!(apiMetadata?.messageCount),
                            hasAiHistory: !!(aiMetadata?.messageCount),
                            stats: {
                                apiMessages: apiMetadata?.messageCount || 0,
                                aiMessages: aiMetadata?.messageCount || 0,
                                totalMessages: messageCount
                            }
                        });
                    }
                } catch (error) {
                    logger.error(`Error loading chat data for user ${userId}:`, error);
                    continue;
                }
            }

            users.sort((a, b) => b.lastActive - a.lastActive);

            res.json({
                success: true,
                count: users.length,
                users: users
            });
        } catch (error) {
            logger.error('Error getting chat users:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Error getting chat users',
                details: error.message 
            });
        }
    });

    // GET /api/chat/analytics/popular-products - Get popular products analytics with stock data
    router.get('/analytics/popular-products', async (req, res) => {
        try {
            const userList = await chatHistory.getUserListFast();
            let allProducts = [];
            let categoryStats = {};
            let recentActivity = [];

            logger.info(`Processing popular products analytics for ${userList.length} users`);
            
            for (const userId of userList) {
                try {
                    const productHistory = await chatHistory.loadProductHistory(userId);
                    if (productHistory?.products) {
                        Object.values(productHistory.products).forEach(product => {
                            // Add mock stock data for each product
                            const stockData = generateMockStockData();
                            
                            allProducts.push({
                                ...product,
                                userId: userId,
                                stockInfo: {
                                    ...stockData,
                                    stockStatus: stockData.stockLevel <= stockData.reorderLevel ? 'low' : 
                                               stockData.stockLevel <= stockData.reorderLevel * 2 ? 'medium' : 'good',
                                    daysUntilStockout: stockData.salesVelocity > 0 ? 
                                                     Math.floor(stockData.stockLevel / stockData.salesVelocity) : null,
                                    profitMargin: stockData.price > stockData.unitCost ? 
                                                ((stockData.price - stockData.unitCost) / stockData.price * 100) : 0
                                }
                            });

                            // Category statistics
                            if (product.category) {
                                if (!categoryStats[product.category]) {
                                    categoryStats[product.category] = {
                                        count: 0,
                                        products: 0,
                                        lastInteraction: 0,
                                        lowStockProducts: 0,
                                        totalValue: 0
                                    };
                                }
                                categoryStats[product.category].count += product.total_interactions || 1;
                                categoryStats[product.category].products++;
                                categoryStats[product.category].lastInteraction = Math.max(
                                    categoryStats[product.category].lastInteraction,
                                    product.last_seen || 0
                                );
                                
                                // Add stock-related stats
                                if (stockData.stockLevel <= stockData.reorderLevel) {
                                    categoryStats[product.category].lowStockProducts++;
                                }
                                categoryStats[product.category].totalValue += stockData.price * stockData.stockLevel;
                            }

                            // Recent activity
                            if (product.interactions && product.interactions.length > 0) {
                                product.interactions.slice(-2).forEach(interaction => {
                                    recentActivity.push({
                                        timestamp: interaction.timestamp,
                                        type: 'product_interaction',
                                        description: `ผู้ใช้สนใจสินค้า: ${product.product_name}`,
                                        userId: userId,
                                        productId: product.id,
                                        stockStatus: stockData.stockLevel <= stockData.reorderLevel ? 'low' : 'good'
                                    });
                                });
                            }
                        });
                    }
                } catch (error) {
                    logger.warn(`Error loading product history for user ${userId}:`, error.message);
                }
            }

            // Process and consolidate products
            const productMap = new Map();
            allProducts.forEach(product => {
                const key = product.id;
                if (productMap.has(key)) {
                    const existing = productMap.get(key);
                    existing.interactions += (product.total_interactions || 1);
                    existing.lastInteraction = Math.max(existing.lastInteraction, product.last_seen || 0);
                    existing.userCount = (existing.userCount || 1) + 1;
                    
                    // Update average relevance
                    const totalRelevance = (existing.averageRelevance * existing.relevanceCount) + 
                                          (product.average_relevance || 0);
                    existing.relevanceCount++;
                    existing.averageRelevance = totalRelevance / existing.relevanceCount;
                } else {
                    productMap.set(key, {
                        id: product.id,
                        name: product.product_name || 'ไม่ระบุชื่อ',
                        category: product.category || 'ไม่ระบุหมวดหมู่',
                        interactions: product.total_interactions || 1,
                        averageRelevance: product.average_relevance || 0,
                        lastInteraction: product.last_seen || Date.now(),
                        userCount: 1,
                        relevanceCount: 1,
                        url: product.url || null,
                        stockInfo: product.stockInfo
                    });
                }
            });

            // Sort products by popularity with stock consideration
            const topProducts = Array.from(productMap.values())
                .sort((a, b) => {
                    // Calculate priority score considering stock levels
                    const scoreA = (a.interactions * 0.4) + 
                                  (a.userCount * 0.3) + 
                                  (a.averageRelevance * 0.2) +
                                  ((Date.now() - a.lastInteraction < 86400000) ? 0.1 : 0) +
                                  // Bonus for low stock high demand items
                                  (a.stockInfo?.stockStatus === 'low' && a.interactions > 5 ? 0.2 : 0);
                    const scoreB = (b.interactions * 0.4) + 
                                  (b.userCount * 0.3) + 
                                  (b.averageRelevance * 0.2) +
                                  ((Date.now() - b.lastInteraction < 86400000) ? 0.1 : 0) +
                                  (b.stockInfo?.stockStatus === 'low' && b.interactions > 5 ? 0.2 : 0);
                    return scoreB - scoreA;
                })
                .slice(0, 50);

            // Sort recent activity by timestamp
            recentActivity = recentActivity
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 20);

            res.json({
                success: true,
                data: {
                    topProducts,
                    categoryStats,
                    recentActivity,
                    summary: {
                        totalUniqueProducts: productMap.size,
                        totalInteractions: allProducts.reduce((sum, p) => sum + (p.total_interactions || 1), 0),
                        totalCategories: Object.keys(categoryStats).length,
                        lowStockHighDemandProducts: topProducts.filter(p => 
                            p.stockInfo?.stockStatus === 'low' && p.interactions > 5
                        ).length,
                        totalStockValue: Array.from(productMap.values()).reduce((sum, p) => 
                            sum + ((p.stockInfo?.price || 0) * (p.stockInfo?.stockLevel || 0)), 0
                        ),
                        mostPopularCategory: Object.entries(categoryStats)
                            .sort(([,a], [,b]) => b.count - a.count)[0]?.[0] || null,
                        processedUsers: userList.length,
                        totalUsers: userList.length
                    }
                },
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error('Error getting popular products analytics:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get analytics data',
                details: error.message
            });
        }
    });

    // GET /api/chat/analytics/sales-insights - Get comprehensive sales analytics with stock data
    router.get('/analytics/sales-insights', async (req, res) => {
        try {
            const userList = await chatHistory.getUserListFast();
            let allProducts = [];
            let stockAlerts = [];
            let categoryPerformance = {};
            let userEngagement = {};

            logger.info(`Processing sales insights for ${userList.length} users`);
            
            for (const userId of userList) {
                try {
                    const productHistory = await chatHistory.loadProductHistory(userId);
                    const apiHistory = await chatHistory.loadAPIChatHistory(userId);
                    const profile = await chatHistory.getUserProfile(userId);
                    
                    // Analyze User Engagement
                    const userMessages = apiHistory?.messages || [];
                    const userQuestions = userMessages.filter(m => 
                        m.role === 'user' && 
                        (m.content.includes('?') || m.content.includes('ราคา') || 
                         m.content.includes('สั่ง') || m.content.includes('ซื้อ') ||
                         m.content.includes('มีไหม') || m.content.includes('สต็อก') ||
                         m.content.includes('เหลือ') || m.content.includes('ส่งได้เมื่อไหร่'))
                    ).length;
                    
                    if (userMessages.length > 0) {
                        userEngagement[userId] = {
                            displayName: profile?.displayName || `User ${userId.substring(1, 9)}`,
                            totalMessages: userMessages.length,
                            questionCount: userQuestions,
                            engagementScore: (userQuestions / userMessages.length) * 100,
                            lastActivity: Math.max(...userMessages.map(m => m.timestamp)),
                            avgSessionLength: userMessages.length > 1 ? 
                                (Math.max(...userMessages.map(m => m.timestamp)) - 
                                 Math.min(...userMessages.map(m => m.timestamp))) / (1000 * 60) : 0,
                            buyingIntent: userQuestions > 3 ? 'high' : userQuestions > 1 ? 'medium' : 'low'
                        };
                    }

                    if (productHistory?.products) {
                        Object.values(productHistory.products).forEach(product => {
                            const userInteractionCount = product.interactions?.length || 0;
                            const hasFollowUpQuestions = userMessages.some(m => 
                                m.content.includes(product.product_name) && 
                                (m.content.includes('ราคา') || m.content.includes('สั่ง') || 
                                 m.content.includes('มีไหม') || m.content.includes('ซื้อ') ||
                                 m.content.includes('สต็อก'))
                            );

                            const hasUrgentInquiry = userMessages.some(m =>
                                m.content.includes(product.product_name) &&
                                (m.content.includes('ด่วน') || m.content.includes('เร่งด่วน') ||
                                 m.content.includes('ต้องการเลย') || m.content.includes('เมื่อไหร่') ||
                                 m.content.includes('วันนี้') || m.content.includes('พรุ่งนี้'))
                            );

                            // Generate stock data for this product
                            const stockData = generateMockStockData();
                            
                            const productAnalysis = {
                                ...product,
                                userId: userId,
                                userInteractionCount: userInteractionCount,
                                hasFollowUpQuestions: hasFollowUpQuestions,
                                hasUrgentInquiry: hasUrgentInquiry,
                                conversionPotential: hasUrgentInquiry ? 'urgent' :
                                                    hasFollowUpQuestions ? 'high' : 
                                                    userInteractionCount > 2 ? 'medium' : 'low',
                                recency: Date.now() - (product.last_seen || 0),
                                engagementScore: userInteractionCount * 
                                               (hasUrgentInquiry ? 3 : hasFollowUpQuestions ? 2 : 1),
                                stockInfo: {
                                    ...stockData,
                                    stockStatus: stockData.stockLevel <= stockData.reorderLevel ? 'low' : 
                                               stockData.stockLevel <= stockData.reorderLevel * 2 ? 'medium' : 'good',
                                    daysUntilStockout: stockData.salesVelocity > 0 ? 
                                                     Math.floor(stockData.stockLevel / stockData.salesVelocity) : null,
                                    profitMargin: stockData.price > stockData.unitCost ? 
                                                ((stockData.price - stockData.unitCost) / stockData.price * 100) : 0,
                                    reorderSuggestion: stockData.stockLevel <= stockData.reorderLevel ? 
                                                     'immediate' : 
                                                     stockData.stockLevel <= stockData.reorderLevel * 2 ? 'soon' : 'normal'
                                }
                            };

                            allProducts.push(productAnalysis);

                            // Check for stock alerts
                            if (stockData.stockLevel <= stockData.reorderLevel && userInteractionCount > 0) {
                                stockAlerts.push({
                                    productId: product.id,
                                    productName: product.product_name,
                                    category: product.category,
                                    currentStock: stockData.stockLevel,
                                    reorderLevel: stockData.reorderLevel,
                                    interactionCount: userInteractionCount,
                                    lastInteraction: product.last_seen,
                                    urgency: hasUrgentInquiry ? 'critical' : 
                                           hasFollowUpQuestions ? 'high' : 'medium',
                                    daysUntilStockout: stockData.salesVelocity > 0 ? 
                                                     Math.floor(stockData.stockLevel / stockData.salesVelocity) : null,
                                    suggestedAction: hasUrgentInquiry ? 'Order immediately - urgent customer demand' :
                                                   hasFollowUpQuestions ? 'Order soon - customer interest detected' :
                                                   'Monitor and consider reordering'
                                });
                            }

                            // Category performance analysis
                            if (product.category) {
                                if (!categoryPerformance[product.category]) {
                                    categoryPerformance[product.category] = {
                                        totalInteractions: 0,
                                        uniqueUsers: new Set(),
                                        productsCount: 0,
                                        highConversionCount: 0,
                                        urgentInquiries: 0,
                                        averageEngagement: 0,
                                        recentInteractions: 0,
                                        salesVelocity: 0,
                                        totalStockValue: 0,
                                        lowStockProducts: 0,
                                        averageProfit: 0
                                    };
                                }
                                
                                const categoryData = categoryPerformance[product.category];
                                categoryData.totalInteractions += userInteractionCount;
                                categoryData.uniqueUsers.add(userId);
                                categoryData.productsCount++;
                                categoryData.averageEngagement += userInteractionCount;
                                categoryData.salesVelocity += stockData.salesVelocity;
                                categoryData.totalStockValue += stockData.price * stockData.stockLevel;
                                categoryData.averageProfit += stockData.price > stockData.unitCost ? 
                                    ((stockData.price - stockData.unitCost) / stockData.price * 100) : 0;
                                
                                if (hasFollowUpQuestions) {
                                    categoryData.highConversionCount++;
                                }
                                
                                if (hasUrgentInquiry) {
                                    categoryData.urgentInquiries++;
                                }
                                
                                if (stockData.stockLevel <= stockData.reorderLevel) {
                                    categoryData.lowStockProducts++;
                                }
                                
                                if (product.last_seen && product.last_seen > Date.now() - (7 * 24 * 60 * 60 * 1000)) {
                                    categoryData.recentInteractions++;
                                }
                            }
                        });
                    }
                } catch (error) {
                    logger.warn(`Error processing user ${userId} for sales insights:`, error.message);
                }
            }

            // Process Category Performance
            Object.keys(categoryPerformance).forEach(category => {
                const data = categoryPerformance[category];
                data.uniqueUsers = data.uniqueUsers.size;
                data.averageEngagement = data.productsCount > 0 ? data.averageEngagement / data.productsCount : 0;
                data.averageProfit = data.productsCount > 0 ? data.averageProfit / data.productsCount : 0;
                data.conversionRate = data.productsCount > 0 ? (data.highConversionCount / data.productsCount) * 100 : 0;
                data.urgencyRate = data.totalInteractions > 0 ? (data.urgentInquiries / data.totalInteractions) * 100 : 0;
                data.stockRisk = data.productsCount > 0 ? (data.lowStockProducts / data.productsCount) * 100 : 0;
                
                // Calculate comprehensive score
                data.score = (data.totalInteractions * 0.25) + 
                            (data.uniqueUsers * 0.2) + 
                            (data.conversionRate * 0.15) + 
                            (data.recentInteractions * 0.15) +
                            (data.urgencyRate * 0.1) +
                            (data.averageProfit * 0.15);
            });

            // Process product consolidation and analysis
            const productMap = new Map();
            allProducts.forEach(product => {
                const key = product.id;
                if (productMap.has(key)) {
                    const existing = productMap.get(key);
                    existing.totalInteractions += product.userInteractionCount;
                    existing.uniqueUsers.add(product.userId);
                    existing.lastInteraction = Math.max(existing.lastInteraction, product.last_seen || 0);
                    existing.totalEngagementScore += product.engagementScore;
                    existing.highConversionUsers += product.hasFollowUpQuestions ? 1 : 0;
                    existing.urgentUsers += product.hasUrgentInquiry ? 1 : 0;
                    
                    const totalRelevance = (existing.averageRelevance * existing.relevanceCount) + 
                                          (product.average_relevance || 0);
                    existing.relevanceCount++;
                    existing.averageRelevance = totalRelevance / existing.relevanceCount;
                } else {
                    productMap.set(key, {
                        id: product.id,
                        name: product.product_name || 'ไม่ระบุชื่อ',
                        category: product.category || 'ไม่ระบุหมวดหมู่',
                        totalInteractions: product.userInteractionCount,
                        uniqueUsers: new Set([product.userId]),
                        averageRelevance: product.average_relevance || 0,
                        lastInteraction: product.last_seen || Date.now(),
                        url: product.url || null,
                        totalEngagementScore: product.engagementScore,
                        highConversionUsers: product.hasFollowUpQuestions ? 1 : 0,
                        urgentUsers: product.hasUrgentInquiry ? 1 : 0,
                        relevanceCount: 1,
                        recency: product.recency,
                        stockInfo: product.stockInfo
                    });
                }
            });

            // Calculate final product insights
            const salesInsights = Array.from(productMap.values()).map(product => {
                product.uniqueUsers = product.uniqueUsers.size;
                product.averageEngagementPerUser = product.uniqueUsers > 0 ? 
                    product.totalEngagementScore / product.uniqueUsers : 0;
                product.conversionRate = product.uniqueUsers > 0 ? 
                    (product.highConversionUsers / product.uniqueUsers) * 100 : 0;
                product.urgencyRate = product.uniqueUsers > 0 ?
                    (product.urgentUsers / product.uniqueUsers) * 100 : 0;
                
                // Calculate comprehensive sales score
                product.salesScore = 
                    (product.totalInteractions * 0.2) +
                    (product.uniqueUsers * 0.15) +
                    (product.conversionRate * 0.15) +
                    (product.averageRelevance * 100 * 0.1) +
                    ((Date.now() - product.lastInteraction < 86400000) ? 15 : 0) + // recency bonus
                    (product.averageEngagementPerUser * 0.15) +
                    (product.urgencyRate * 0.1) +
                    // Stock-based scoring
                    (product.stockInfo.stockStatus === 'low' && product.totalInteractions > 3 ? 10 : 0) + // urgent restock
                    (product.stockInfo.profitMargin * 0.1); // profit consideration

                // Sales recommendation
                if (product.stockInfo.stockStatus === 'low' && product.urgentUsers > 0) {
                    product.recommendation = 'URGENT: Restock immediately - high demand with low stock';
                    product.priority = 'critical';
                } else if (product.stockInfo.stockStatus === 'low' && product.conversionRate > 50) {
                    product.recommendation = 'HIGH: Restock soon - good conversion rate';
                    product.priority = 'high';
                } else if (product.urgencyRate > 20) {
                    product.recommendation = 'MEDIUM: Monitor closely - urgent customer inquiries';
                    product.priority = 'medium';
                } else {
                    product.recommendation = 'NORMAL: Regular monitoring';
                    product.priority = 'normal';
                }

                return product;
            });

            // Sort by sales score
            salesInsights.sort((a, b) => b.salesScore - a.salesScore);

            // Sort stock alerts by urgency
            // Sort stock alerts by urgency
           stockAlerts.sort((a, b) => {
               const urgencyOrder = { 'critical': 3, 'high': 2, 'medium': 1 };
               const urgencyDiff = (urgencyOrder[b.urgency] || 0) - (urgencyOrder[a.urgency] || 0);
               if (urgencyDiff !== 0) return urgencyDiff;
               
               // If same urgency, sort by interaction count
               return b.interactionCount - a.interactionCount;
           });

           // Generate user engagement insights
           const topUsers = Object.values(userEngagement)
               .sort((a, b) => b.engagementScore - a.engagementScore)
               .slice(0, 20);

           // Generate category insights
           const topCategories = Object.entries(categoryPerformance)
               .map(([category, data]) => ({
                   category,
                   ...data,
                   riskLevel: data.stockRisk > 60 ? 'high' : data.stockRisk > 30 ? 'medium' : 'low'
               }))
               .sort((a, b) => b.score - a.score);

           res.json({
               success: true,
               data: {
                   salesInsights: salesInsights.slice(0, 30),
                   stockAlerts: stockAlerts.slice(0, 15),
                   categoryPerformance: topCategories,
                   userEngagement: topUsers,
                   summary: {
                       totalProducts: salesInsights.length,
                       criticalStockAlerts: stockAlerts.filter(a => a.urgency === 'critical').length,
                       highDemandLowStock: salesInsights.filter(p => 
                           p.stockInfo.stockStatus === 'low' && p.totalInteractions > 5
                       ).length,
                       totalStockValue: salesInsights.reduce((sum, p) => 
                           sum + ((p.stockInfo.price || 0) * (p.stockInfo.stockLevel || 0)), 0
                       ),
                       averageProfitMargin: salesInsights.length > 0 ? 
                           salesInsights.reduce((sum, p) => sum + (p.stockInfo.profitMargin || 0), 0) / salesInsights.length : 0,
                       topSellingCategory: topCategories[0]?.category || null,
                       highEngagementUsers: topUsers.filter(u => u.engagementScore > 20).length,
                       urgentCustomers: topUsers.filter(u => u.buyingIntent === 'high').length
                   }
               },
               timestamp: Date.now()
           });

       } catch (error) {
           logger.error('Error getting sales insights:', error);
           res.status(500).json({
               success: false,
               error: 'Failed to get sales insights',
               details: error.message
           });
       }
   });

   // GET /api/chat/analytics/dashboard - Get comprehensive dashboard analytics
   router.get('/analytics/dashboard', async (req, res) => {
       try {
           const userList = await chatHistory.getUserListFast();
           let totalMessages = 0;
           let activeUsers = 0;
           let userStats = [];
           let recentActivity = [];
           let timeBasedStats = {
               hourly: new Array(24).fill(0),
               daily: new Array(7).fill(0),
               messagesByHour: new Array(24).fill(0)
           };
           
           const now = Date.now();
           const oneDayAgo = now - (24 * 60 * 60 * 1000);
           const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

           logger.info(`Processing dashboard analytics for ${userList.length} users`);

           for (const userId of userList) {
               try {
                   const profile = await chatHistory.getUserProfile(userId);
                   const apiMetadata = await chatHistory.loadHistoryMetadata(userId, 'api');
                   const aiMetadata = await chatHistory.loadHistoryMetadata(userId, 'ai');
                   
                   const userMessageCount = (apiMetadata?.messageCount || 0) + (aiMetadata?.messageCount || 0);
                   const lastActivity = Math.max(apiMetadata?.lastUpdated || 0, aiMetadata?.lastUpdated || 0);
                   
                   totalMessages += userMessageCount;
                   
                   if (lastActivity > oneDayAgo) {
                       activeUsers++;
                   }

                   if (userMessageCount > 0) {
                       userStats.push({
                           userId,
                           displayName: profile?.displayName || `User ${userId.substring(1, 9)}`,
                           messageCount: userMessageCount,
                           lastActivity: lastActivity,
                           isActive: lastActivity > oneDayAgo,
                           isRecentlyActive: lastActivity > oneWeekAgo
                       });

                       // Add time-based statistics
                       const activityDate = new Date(lastActivity);
                       timeBasedStats.hourly[activityDate.getHours()]++;
                       timeBasedStats.daily[activityDate.getDay()]++;

                       // Add recent activity
                       if (lastActivity > now - (6 * 60 * 60 * 1000)) { // last 6 hours
                           recentActivity.push({
                               timestamp: lastActivity,
                               type: 'user_activity',
                               description: `${profile?.displayName || 'ผู้ใช้'} ใช้งานระบบ`,
                               userId: userId
                           });
                       }
                   }
               } catch (error) {
                   logger.warn(`Error processing user ${userId} for dashboard:`, error.message);
               }
           }

           // Sort users by message count
           userStats.sort((a, b) => b.messageCount - a.messageCount);

           // Sort recent activity
           recentActivity = recentActivity
               .sort((a, b) => b.timestamp - a.timestamp)
               .slice(0, 15);

           // Add system activities
           const systemActivities = [
               {
                   timestamp: now - (30 * 60 * 1000),
                   type: 'system_update',
                   description: `ระบบอัปเดตข้อมูล ${userList.length} ผู้ใช้`
               },
               {
                   timestamp: now - (60 * 60 * 1000),
                   type: 'ai_status',
                   description: 'ระบบ AI ทำงานปกติ'
               }
           ];

           recentActivity = [...recentActivity, ...systemActivities]
               .sort((a, b) => b.timestamp - a.timestamp)
               .slice(0, 20);

           res.json({
               success: true,
               data: {
                   totalUsers: userList.length,
                   activeUsers: activeUsers,
                   totalMessages: totalMessages,
                   topUsers: userStats.slice(0, 15),
                   recentActivity: recentActivity,
                   timeBasedStats: timeBasedStats,
                   stats: {
                       averageMessagesPerUser: userStats.length > 0 ? totalMessages / userStats.length : 0,
                       activeUserPercentage: userList.length > 0 ? (activeUsers / userList.length) * 100 : 0,
                       recentlyActiveUsers: userStats.filter(u => u.isRecentlyActive).length,
                       processedUsers: userList.length,
                       peakHour: timeBasedStats.hourly.indexOf(Math.max(...timeBasedStats.hourly)),
                       peakDay: timeBasedStats.daily.indexOf(Math.max(...timeBasedStats.daily))
                   }
               },
               timestamp: Date.now()
           });

       } catch (error) {
           logger.error('Error getting dashboard analytics:', error);
           res.status(500).json({
               success: false,
               error: 'Failed to get dashboard analytics',
               details: error.message
           });
       }
   });

   // GET /api/chat/analytics/stock-alerts - Get stock alerts based on user interactions
   router.get('/analytics/stock-alerts', async (req, res) => {
       try {
           const userList = await chatHistory.getUserListFast();
           let stockAlerts = [];
           let criticalProducts = [];
           
           for (const userId of userList) {
               try {
                   const productHistory = await chatHistory.loadProductHistory(userId);
                   const apiHistory = await chatHistory.loadAPIChatHistory(userId);
                   
                   if (productHistory?.products) {
                       const userMessages = apiHistory?.messages || [];
                       
                       Object.values(productHistory.products).forEach(product => {
                           const stockData = generateMockStockData();
                           const userInteractionCount = product.interactions?.length || 0;
                           
                           // Check for urgent inquiries
                           const hasUrgentInquiry = userMessages.some(m =>
                               m.content.includes(product.product_name) &&
                               (m.content.includes('ด่วน') || m.content.includes('เร่งด่วน') ||
                                m.content.includes('ต้องการเลย') || m.content.includes('เมื่อไหร่') ||
                                m.content.includes('สต็อก') || m.content.includes('มีไหม'))
                           );
                           
                           // Generate alert if low stock with interactions
                           if (stockData.stockLevel <= stockData.reorderLevel && userInteractionCount > 0) {
                               const alert = {
                                   productId: product.id,
                                   productName: product.product_name,
                                   category: product.category,
                                   currentStock: stockData.stockLevel,
                                   reorderLevel: stockData.reorderLevel,
                                   salesVelocity: stockData.salesVelocity,
                                   daysUntilStockout: stockData.salesVelocity > 0 ? 
                                       Math.floor(stockData.stockLevel / stockData.salesVelocity) : null,
                                   userInteractions: userInteractionCount,
                                   lastInteraction: product.last_seen,
                                   hasUrgentDemand: hasUrgentInquiry,
                                   price: stockData.price,
                                   unitCost: stockData.unitCost,
                                   profitMargin: stockData.price > stockData.unitCost ? 
                                       ((stockData.price - stockData.unitCost) / stockData.price * 100) : 0,
                                   supplier: stockData.supplier,
                                   leadTime: stockData.leadTime,
                                   alertLevel: hasUrgentInquiry ? 'critical' : 
                                             userInteractionCount > 5 ? 'high' : 'medium',
                                   recommendedAction: hasUrgentInquiry ? 
                                       'Order immediately - urgent customer demand detected' :
                                       userInteractionCount > 5 ? 
                                       'Order soon - high customer interest' :
                                       'Monitor and consider reordering',
                                   estimatedRevenueLoss: stockData.salesVelocity * stockData.price * 
                                       (stockData.leadTime + Math.max(0, -Math.floor(stockData.stockLevel / stockData.salesVelocity)))
                               };
                               
                               stockAlerts.push(alert);
                               
                               if (alert.alertLevel === 'critical') {
                                   criticalProducts.push(alert);
                               }
                           }
                       });
                   }
               } catch (error) {
                   logger.warn(`Error processing stock alerts for user ${userId}:`, error.message);
               }
           }
           
           // Sort alerts by priority
           stockAlerts.sort((a, b) => {
               const priorityOrder = { 'critical': 3, 'high': 2, 'medium': 1 };
               const priorityDiff = (priorityOrder[b.alertLevel] || 0) - (priorityOrder[a.alertLevel] || 0);
               if (priorityDiff !== 0) return priorityDiff;
               
               // Then by potential revenue loss
               return (b.estimatedRevenueLoss || 0) - (a.estimatedRevenueLoss || 0);
           });
           
           // Calculate summary statistics
           const totalEstimatedLoss = stockAlerts.reduce((sum, alert) => 
               sum + (alert.estimatedRevenueLoss || 0), 0
           );
           
           const categoryBreakdown = stockAlerts.reduce((acc, alert) => {
               const category = alert.category || 'Uncategorized';
               if (!acc[category]) {
                   acc[category] = {
                       count: 0,
                       totalValue: 0,
                       criticalCount: 0
                   };
               }
               acc[category].count++;
               acc[category].totalValue += alert.price * alert.currentStock;
               if (alert.alertLevel === 'critical') {
                   acc[category].criticalCount++;
               }
               return acc;
           }, {});

           res.json({
               success: true,
               data: {
                   alerts: stockAlerts.slice(0, 50),
                   criticalAlerts: criticalProducts,
                   summary: {
                       totalAlerts: stockAlerts.length,
                       criticalAlerts: criticalProducts.length,
                       highPriorityAlerts: stockAlerts.filter(a => a.alertLevel === 'high').length,
                       mediumPriorityAlerts: stockAlerts.filter(a => a.alertLevel === 'medium').length,
                       totalEstimatedRevenueLoss: totalEstimatedLoss,
                       averageLeadTime: stockAlerts.length > 0 ? 
                           stockAlerts.reduce((sum, a) => sum + a.leadTime, 0) / stockAlerts.length : 0,
                       categoryBreakdown: categoryBreakdown,
                       immediateActionRequired: criticalProducts.length,
                       potentialStockouts: stockAlerts.filter(a => 
                           a.daysUntilStockout !== null && a.daysUntilStockout <= 7
                       ).length
                   }
               },
               timestamp: Date.now()
           });

       } catch (error) {
           logger.error('Error getting stock alerts:', error);
           res.status(500).json({
               success: false,
               error: 'Failed to get stock alerts',
               details: error.message
           });
       }
   });

   // GET /api/chat/analytics/profit-analysis - Get profit analysis based on interactions and stock
   router.get('/analytics/profit-analysis', async (req, res) => {
       try {
           const userList = await chatHistory.getUserListFast();
           let productProfitability = [];
           let categoryProfits = {};
           
           for (const userId of userList) {
               try {
                   const productHistory = await chatHistory.loadProductHistory(userId);
                   
                   if (productHistory?.products) {
                       Object.values(productHistory.products).forEach(product => {
                           const stockData = generateMockStockData();
                           const userInteractionCount = product.interactions?.length || 0;
                           
                           const profitPerUnit = stockData.price - stockData.unitCost;
                           const profitMargin = stockData.price > stockData.unitCost ? 
                               ((stockData.price - stockData.unitCost) / stockData.price * 100) : 0;
                           
                           const potentialDailySales = stockData.salesVelocity * 
                               (userInteractionCount > 5 ? 1.5 : userInteractionCount > 2 ? 1.2 : 1.0);
                           
                           const monthlyProfitPotential = potentialDailySales * profitPerUnit * 30;
                           
                           productProfitability.push({
                               productId: product.id,
                               productName: product.product_name,
                               category: product.category,
                               currentStock: stockData.stockLevel,
                               price: stockData.price,
                               unitCost: stockData.unitCost,
                               profitPerUnit: profitPerUnit,
                               profitMargin: profitMargin,
                               salesVelocity: stockData.salesVelocity,
                               potentialDailySales: potentialDailySales,
                               monthlyProfitPotential: monthlyProfitPotential,
                               userInteractions: userInteractionCount,
                               stockValue: stockData.stockLevel * stockData.price,
                               potentialProfit: stockData.stockLevel * profitPerUnit,
                               demandMultiplier: userInteractionCount > 5 ? 1.5 : 
                                               userInteractionCount > 2 ? 1.2 : 1.0,
                               roi: stockData.unitCost > 0 ? (profitPerUnit / stockData.unitCost * 100) : 0,
                               profitability: profitMargin > 50 ? 'high' : 
                                            profitMargin > 25 ? 'medium' : 'low'
                           });
                           
                           // Category profit aggregation
                           const category = product.category || 'Uncategorized';
                           if (!categoryProfits[category]) {
                               categoryProfits[category] = {
                                   totalProducts: 0,
                                   totalStockValue: 0,
                                   totalPotentialProfit: 0,
                                   averageProfitMargin: 0,
                                   totalMonthlyPotential: 0,
                                   totalInteractions: 0,
                                   profitMargins: []
                               };
                           }
                           
                           categoryProfits[category].totalProducts++;
                           categoryProfits[category].totalStockValue += stockData.stockLevel * stockData.price;
                           categoryProfits[category].totalPotentialProfit += stockData.stockLevel * profitPerUnit;
                           categoryProfits[category].totalMonthlyPotential += monthlyProfitPotential;
                           categoryProfits[category].totalInteractions += userInteractionCount;
                           categoryProfits[category].profitMargins.push(profitMargin);
                       });
                   }
               } catch (error) {
                   logger.warn(`Error processing profit analysis for user ${userId}:`, error.message);
               }
           }
           
           // Calculate category averages
           Object.keys(categoryProfits).forEach(category => {
               const data = categoryProfits[category];
               data.averageProfitMargin = data.profitMargins.length > 0 ? 
                   data.profitMargins.reduce((sum, margin) => sum + margin, 0) / data.profitMargins.length : 0;
               data.averageInteractionsPerProduct = data.totalProducts > 0 ? 
                   data.totalInteractions / data.totalProducts : 0;
               delete data.profitMargins; // Remove temporary array
           });
           
           // Sort products by monthly profit potential
           productProfitability.sort((a, b) => b.monthlyProfitPotential - a.monthlyProfitPotential);
           
           // Sort categories by total potential profit
           const sortedCategories = Object.entries(categoryProfits)
               .map(([category, data]) => ({ category, ...data }))
               .sort((a, b) => b.totalPotentialProfit - a.totalPotentialProfit);

           res.json({
               success: true,
               data: {
                   topProfitableProducts: productProfitability.slice(0, 30),
                   categoryProfitability: sortedCategories,
                   highProfitMarginProducts: productProfitability.filter(p => p.profitMargin > 50),
                   lowProfitMarginProducts: productProfitability.filter(p => p.profitMargin < 25),
                   summary: {
                       totalProducts: productProfitability.length,
                       totalStockValue: productProfitability.reduce((sum, p) => sum + p.stockValue, 0),
                       totalPotentialProfit: productProfitability.reduce((sum, p) => sum + p.potentialProfit, 0),
                       totalMonthlyPotential: productProfitability.reduce((sum, p) => sum + p.monthlyProfitPotential, 0),
                       averageProfitMargin: productProfitability.length > 0 ? 
                           productProfitability.reduce((sum, p) => sum + p.profitMargin, 0) / productProfitability.length : 0,
                       highProfitProducts: productProfitability.filter(p => p.profitability === 'high').length,
                       mediumProfitProducts: productProfitability.filter(p => p.profitability === 'medium').length,
                       lowProfitProducts: productProfitability.filter(p => p.profitability === 'low').length,
                       topCategory: sortedCategories[0]?.category || null,
                       bestROIProduct: productProfitability.reduce((best, current) => 
                           current.roi > (best?.roi || 0) ? current : best, null
                       )
                   }
               },
               timestamp: Date.now()
           });

       } catch (error) {
           logger.error('Error getting profit analysis:', error);
           res.status(500).json({
               success: false,
               error: 'Failed to get profit analysis',
               details: error.message
           });
       }
   });

   // GET /api/chat/stats/:userId - Get chat statistics
   router.get('/stats/:userId', async (req, res) => {
       try {
           const userId = req.params.userId;
           const timeRange = req.query.timeRange || '24h';

           const [aiHistory, apiHistory] = await Promise.all([
               chatHistory.loadAIChatHistory(userId),
               chatHistory.loadAPIChatHistory(userId)
           ]);

           const now = Date.now();
           const timeRanges = {
               '24h': 24 * 60 * 60 * 1000,
               '7d': 7 * 24 * 60 * 60 * 1000,
               '30d': 30 * 24 * 60 * 60 * 1000
           };

           const timeLimit = now - (timeRanges[timeRange] || timeRanges['24h']);

           const aiMessages = (aiHistory?.messages || []).filter(msg => msg.timestamp >= timeLimit);
           const apiMessages = (apiHistory?.messages || []).filter(msg => msg.timestamp >= timeLimit);

           const aiStats = calculateChatStats(aiMessages);
           const apiStats = calculateChatStats(apiMessages);

           res.json({
               success: true,
               userId,
               timeRange,
               stats: {
                   ai: aiStats,
                   api: apiStats,
                   total: {
                       totalMessages: aiStats.totalMessages + apiStats.totalMessages,
                       messagesByRole: {
                           ...aiStats.messagesByRole,
                           ...apiStats.messagesByRole
                       }
                   }
               }
           });
       } catch (error) {
           logger.error('Error getting chat statistics:', error);
           res.status(500).json({ 
               success: false, 
               error: 'Error getting chat statistics',
               details: error.message
           });
       }
   });

   // POST /api/chat/clear/:userId - Clear chat history
   router.post('/clear/:userId', async (req, res) => {
       try {
           const userId = req.params.userId;
           const type = req.query.type || 'all';

        await chatHistory.clearHistory(userId, type);

        res.json({
            success: true,
            message: `Chat history cleared for user ${userId}`,
            type
           });
       } catch (error) {
           logger.error('Error clearing chat history:', error);
           res.status(500).json({ 
               success: false, 
               error: 'Error clearing chat history',
               details: error.message
           });
       }
   });

   // GET /api/chat/search - Search in chat histories
   router.get('/search', async (req, res) => {
       try {
           const { query, userId, limit = 100, type = 'all' } = req.query;

           if (!query || query.length < 2) {
               return res.status(400).json({
                   success: false,
                   error: 'Search query must be at least 2 characters'
               });
           }

           const searchResults = [];
           const userList = userId ? [userId] : (await chatHistory.getUserListFast()).slice(0, parseInt(limit));

           for (const searchUserId of userList) {
               try {
                   let histories = [];
                   
                   if (type === 'all' || type === 'api') {
                       const apiHistory = await chatHistory.loadAPIChatHistory(searchUserId);
                       if (apiHistory?.messages) {
                           histories.push(...apiHistory.messages.map(msg => ({ ...msg, source: 'api' })));
                       }
                   }
                   
                   if (type === 'all' || type === 'ai') {
                       const aiHistory = await chatHistory.loadAIChatHistory(searchUserId);
                       if (aiHistory?.messages) {
                           histories.push(...aiHistory.messages.map(msg => ({ ...msg, source: 'ai' })));
                       }
                   }

                   const matchingMessages = histories.filter(msg => 
                       msg.content && msg.content.toLowerCase().includes(query.toLowerCase())
                   );

                   if (matchingMessages.length > 0) {
                       const profile = await chatHistory.getUserProfile(searchUserId);
                       searchResults.push({
                           userId: searchUserId,
                           displayName: profile?.displayName || `User ${searchUserId.substring(1, 9)}`,
                           matches: matchingMessages.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10)
                       });
                   }
               } catch (error) {
                   logger.warn(`Error searching user ${searchUserId}:`, error.message);
               }
           }

           res.json({
               success: true,
               query: query,
               results: searchResults,
               totalMatches: searchResults.reduce((sum, user) => sum + user.matches.length, 0),
               searchedUsers: userList.length,
               timestamp: Date.now()
           });

       } catch (error) {
           logger.error('Error searching chat histories:', error);
           res.status(500).json({
               success: false,
               error: 'Error searching chat histories',
               details: error.message
           });
       }
   });

   // GET /api/chat/performance - Get ChatHistoryManager performance stats
   router.get('/performance', async (req, res) => {
       try {
           const performanceStats = chatHistory.getPerformanceStats();
           const cacheHitRates = chatHistory.getCacheHitRates();
           
           res.json({
               success: true,
               performance: performanceStats,
               cacheHitRates: cacheHitRates,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('Error getting performance stats:', error);
           res.status(500).json({
               success: false,
               error: 'Error getting performance statistics',
               details: error.message
           });
       }
   });

   // POST /api/chat/cache/refresh - Refresh all caches
   router.post('/cache/refresh', async (req, res) => {
       try {
           const result = await chatHistory.refreshAllCaches();
           
           res.json({
               success: true,
               result: result,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('Error refreshing caches:', error);
           res.status(500).json({
               success: false,
               error: 'Error refreshing caches',
               details: error.message
           });
       }
   });

   // POST /api/chat/cache/warmup - Warmup caches
   router.post('/cache/warmup', async (req, res) => {
       try {
           const result = await chatHistory.warmupCaches();
           
           res.json({
               success: true,
               result: result,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('Error warming up caches:', error);
           res.status(500).json({
               success: false,
               error: 'Error warming up caches',
               details: error.message
           });
       }
   });

   router.get('/health', async (req, res) => {
       try {
           const healthCheck = await chatHistory.healthCheck();
           
           const statusCode = healthCheck.status === 'healthy' ? 200 : 503;
           
           res.status(statusCode).json({
               success: healthCheck.status === 'healthy',
               health: healthCheck,
               timestamp: Date.now()
           });
       } catch (error) {
           logger.error('Error in chat health check:', error);
           res.status(503).json({
               success: false,
               health: {
                   status: 'unhealthy',
                   error: error.message
               },
               timestamp: Date.now()
           });
       }
   });

   return router;
};
