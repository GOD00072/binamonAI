'use strict';

class ContextAnalyzer {
    constructor(logger) {
        this.logger = logger;
        this.RELEVANCE_THRESHOLD = 0.03; // Default, can be made configurable
    }

    analyzeHistoricalContext(chatHistory) {
        if (!chatHistory?.messages) {
            return { recentQueries: [], productInteractions: {}, categoryInterests: {}, conversationFlow: [] };
        }
        try {
            const context = {
                recentQueries: [],
                productInteractions: {}, // Store product details for later use
                categoryInterests: {},
                conversationFlow: [],
                timeBasedPatterns: { hourly: new Array(24).fill(0), daily: new Array(7).fill(0) },
                relevantProducts: [] // Store full product objects if seen in model responses
            };
            const recentMessages = chatHistory.messages.slice(-20); // Analyze more messages for better context

            recentMessages.forEach((message, index) => {
                if (message.role === 'user' && message.content) {
                    context.recentQueries.push({ content: message.content, timestamp: message.timestamp });
                    if (index > 0 && recentMessages[index - 1].role === 'model' && recentMessages[index - 1].content) {
                        context.conversationFlow.push({
                            query: message.content,
                            response: recentMessages[index - 1].content,
                            timeDiff: message.timestamp - recentMessages[index - 1].timestamp
                        });
                    }
                }

                // If products are attached to a model's message, they are likely relevant
                if (message.role === 'model' && message.products && Array.isArray(message.products)) {
                    message.products.forEach(product => {
                        if (product && product.id) { // Ensure product and product.id exist
                             if (!context.productInteractions[product.id]) {
                                context.productInteractions[product.id] = {
                                    count: 0,
                                    lastSeen: null,
                                    relevanceScores: [],
                                    name: product.product_name, // Store name
                                    category: product.category, // Store category
                                    // Store the full product object for potential reuse
                                    productData: product
                                };
                            }
                            const productStats = context.productInteractions[product.id];
                            productStats.count++;
                            productStats.lastSeen = message.timestamp;
                            if (product.relevance_score) productStats.relevanceScores.push(product.relevance_score);

                            // Add to relevantProducts list if not already there (based on ID)
                            if (!context.relevantProducts.find(p => p.id === product.id)) {
                                context.relevantProducts.push(product);
                            }

                            if (product.category) {
                                if (!context.categoryInterests[product.category]) {
                                    context.categoryInterests[product.category] = { count: 0, products: new Set(), lastSeen: null };
                                }
                                const categoryStats = context.categoryInterests[product.category];
                                categoryStats.count++;
                                categoryStats.products.add(product.id);
                                categoryStats.lastSeen = message.timestamp;
                            }
                        }
                    });
                }
                if (message.timestamp) {
                    const messageDate = new Date(message.timestamp);
                    context.timeBasedPatterns.hourly[messageDate.getHours()]++;
                    context.timeBasedPatterns.daily[messageDate.getDay()]++;
                }
            });

            Object.values(context.productInteractions).forEach(pi => {
                if (pi.relevanceScores.length > 0) {
                    pi.averageRelevance = pi.relevanceScores.reduce((a, b) => a + b, 0) / pi.relevanceScores.length;
                }
            });
            Object.values(context.categoryInterests).forEach(ci => ci.products = Array.from(ci.products));
            
            context.summary = {
                totalInteractions: Object.values(context.productInteractions).reduce((sum, p) => sum + p.count, 0),
                uniqueProducts: Object.keys(context.productInteractions).length,
                uniqueCategories: Object.keys(context.categoryInterests).length,
            };

            this.logger.info('Historical context analyzed by ContextAnalyzer.', { summary: context.summary });
            return context;
        } catch (error) {
            this.logger.error('Error analyzing historical context in ContextAnalyzer:', error);
            return { recentQueries: [], productInteractions: {}, categoryInterests: {}, conversationFlow: [], error: error.message };
        }
    }

    enrichProductsWithContext(products, historicalContext) {
        try {
            if (!Array.isArray(products)) {
                this.logger.warn('Products is not an array in enrichProductsWithContext', { type: typeof products });
                return [];
            }
            return products.map(product => {
                if (!product || (product.score || 0) < this.RELEVANCE_THRESHOLD) return null; // Use relevance threshold

                const historicalProduct = historicalContext?.productInteractions?.[product.id];
                const categoryContext = product.category && historicalContext?.categoryInterests?.[product.category];
                const contextualRelevance = this.calculateContextualRelevance(product, historicalProduct, categoryContext, historicalContext);

                return {
                    ...product,
                    contextual_relevance: contextualRelevance,
                    historical_data: {
                        interactions: historicalProduct || null,
                        category_interest: categoryContext || null
                    }
                };
            }).filter(Boolean); // Remove nulls
        } catch (error) {
            this.logger.error('Error enriching products with context in ContextAnalyzer:', error);
            return Array.isArray(products) ? products : [];
        }
    }

    calculateContextualRelevance(product, historicalProduct, categoryContext, historicalContext) {
        try {
            let relevance = product.score || 0; // Base relevance from search/retrieval
            const weights = { baseScore: 0.3, historicalInteraction: 0.2, categoryInterest: 0.15, recency: 0.1, dimensions: 0.15, usagePattern: 0.1 };
            let weightedScore = relevance * weights.baseScore;

            if (historicalProduct) {
                const interactionScore = Math.min(historicalProduct.count / 5, 1); // Normalize interaction count
                const avgRelevance = historicalProduct.averageRelevance || 0;
                weightedScore += (interactionScore * 0.7 + avgRelevance * 0.3) * weights.historicalInteraction;
            }
            if (categoryContext && product.category) {
                const categoryScore = Math.min(categoryContext.count / 10, 1); // Normalize category interaction count
                weightedScore += categoryScore * weights.categoryInterest;
            }
            if (historicalProduct?.lastSeen) {
                const hoursSinceLastSeen = (Date.now() - historicalProduct.lastSeen) / (1000 * 60 * 60);
                const recencyScore = Math.exp(-hoursSinceLastSeen / 24); // Exponential decay for recency
                weightedScore += recencyScore * weights.recency;
            }
            // Assuming calculateDimensionsScore and calculateUsagePatternScore are part of this class
            weightedScore += this.calculateDimensionsScore(product) * weights.dimensions;
            weightedScore += this.calculateUsagePatternScore(product, historicalContext) * weights.usagePattern;

            return Math.min(Math.max(weightedScore, 0), 1); // Clamp between 0 and 1
        } catch (error) {
            this.logger.error('Error calculating contextual relevance in ContextAnalyzer:', error);
            return product.score || 0; // Fallback to base score
        }
    }

    analyzeProductQueryRelationship(product, query, attributes = { dimensions: [], materials: [] }) {
        // Simplified version, can be expanded
        try {
            if (!product || !query) return 0;
            const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2 && !['และ', 'หรือ', 'ที่', 'ใน', 'เป็น', 'ของ', 'อยู่', 'ก็', 'ได้'].includes(term));
            let score = 0;
            const productText = `${product.product_name || ''} ${product.category || ''} ${product.short_description || ''} ${JSON.stringify(product.details || {})}`.toLowerCase();
            queryTerms.forEach(term => {
                if (productText.includes(term)) score += 0.1;
            });
            return Math.min(score, 1);
        } catch (error) {
            this.logger.error('Error analyzing product-query relationship:', error);
            return 0;
        }
    }

    calculateDimensionsScore(product) {
        try {
            if (!product || !product.production_dimensions) return 0;
            let score = 0;
            const { length, width, height, weight } = product.production_dimensions;
            if (length && width && height) score += 0.4; // Has full dimensions
            if (length && width) {
                const aspectRatio = length / width;
                if (aspectRatio >= 0.5 && aspectRatio <= 2.0) score += 0.3; // Common aspect ratios
            }
            if (weight && length && width && height && (length * width * height > 0)) {
                const volume = length * width * height;
                const density = weight / volume; // Basic density check
                if (density >= 0.0001 && density <= 0.01) score += 0.3; // Example range for paper products
            }
            return Math.min(score, 1);
        } catch (error) {
            this.logger.error('Error calculating dimensions score:', error);
            return 0;
        }
    }

    calculateUsagePatternScore(product, historicalContext) {
        // Simplified, can be expanded with more keywords and context
        try {
            if (!product.details || !historicalContext) return 0;
            let score = 0;
            const detailsString = (typeof product.details === 'string' ? product.details : JSON.stringify(product.details)).toLowerCase();
            const usageKeywords = ['อาหาร', 'เครื่องดื่ม', 'แช่แข็ง', 'เดลิเวอรี่', 'ซอส']; // Example keywords
            
            usageKeywords.forEach(keyword => {
                if (detailsString.includes(keyword)) score += 0.1;
            });

            if (historicalContext.recentQueries) {
                const recentQueriesText = historicalContext.recentQueries.map(q => q.content || '').join(' ').toLowerCase();
                usageKeywords.forEach(keyword => {
                    if (recentQueriesText.includes(keyword) && detailsString.includes(keyword)) score += 0.05; // Bonus if in query and details
                });
            }
            return Math.min(score, 1);
        } catch (error) {
            this.logger.error('Error calculating usage pattern score:', error);
            return 0;
        }
    }
    
    formatHistoricalContext(historicalContext) {
        if (!historicalContext || Object.keys(historicalContext).length === 0 || !historicalContext.productInteractions) {
            return 'ไม่มีประวัติการสนทนาที่เกี่ยวข้อง';
        }
        const sections = [];
        if (Object.keys(historicalContext.productInteractions).length > 0) {
            sections.push('สินค้าที่เคยสนใจ:');
            const topProducts = Object.values(historicalContext.productInteractions)
                .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)) // Sort by lastSeen
                .slice(0, 3)
                .map(p => `• ${p.name || 'ไม่ระบุชื่อ'} (ดู ${p.count} ครั้ง, ล่าสุด ${new Date(p.lastSeen).toLocaleTimeString('th-TH')})`);
            sections.push(topProducts.join('\n'));
        }
        // ... (add category interests, recent queries as in original)
        return sections.join('\n\n') || 'ไม่มีข้อมูลสรุปจากประวัติ';
    }

    formatRecentInteractions(historyArray) { // Expects an array of message objects
        if (!historyArray || historyArray.length === 0) {
            return 'ไม่มีการสนทนาล่าสุด';
        }
        try {
            return historyArray.slice(-5) // Take last 5 messages
                .map(msg => {
                    const role = msg.role === 'user' ? 'ลูกค้า' : 'เจ๊หงส์';
                    const content = msg.parts && msg.parts[0] ? msg.parts[0].text : (msg.content || '...');
                    return `${role}: ${content}`;
                })
                .join('\n');
        } catch (error) {
            this.logger.error('Error formatting recent interactions in ContextAnalyzer:', error);
            return 'ไม่สามารถแสดงการสนทนาล่าสุดได้';
        }
    }
    
    calculateResponseConfidence(response, products) {
        try {
            let confidence = 0.5; // Base
            if (products && products.length > 0) {
                const avgRelevance = products.reduce((sum, p) => sum + (p.contextual_relevance || p.score || 0), 0) / products.length;
                confidence += avgRelevance * 0.3;
            }
            if (response.includes('ราคา') && response.includes('บาท')) confidence += 0.1;
            if (response.includes('http') || response.includes('www')) confidence += 0.1; // URL presence
            if (response.length > 100) confidence += 0.1; // Reasonably long response
            return Math.min(confidence, 1.0);
        } catch (error) {
            this.logger.error('Error calculating response confidence:', error);
            return 0.5;
        }
    }

    calculateImageAnalysisConfidence(analysis) {
        try {
            let confidence = 0.3; // Base for image analysis
            if (!analysis || typeof analysis !== 'string') return confidence;
            const aspects = ['ประเภท', 'ลักษณะ', 'วัสดุ', 'ขนาด', 'มิติ', 'การใช้งาน'];
            aspects.forEach(aspect => {
                if (analysis.includes(aspect)) confidence += 0.08;
            });
            if (analysis.length > 150) confidence += 0.1;
            if (analysis.includes('มิลลิเมตร') || analysis.includes('เซนติเมตร')) confidence += 0.1;
            return Math.min(confidence, 1.0);
        } catch (error) {
            this.logger.error('Error calculating image analysis confidence:', error);
            return 0.3;
        }
    }

    formatProductRecommendations(productContextData, historicalContext) {
        // This is a complex method, simplified here.
        // It would need access to product data (productContextData) and user's historical interests.
        try {
            if (!productContextData || !historicalContext || !historicalContext.categoryInterests) {
                return 'ไม่มีสินค้าแนะนำในขณะนี้';
            }
            // Example: Recommend products from categories user showed interest in.
            const recommendations = [];
            // ... logic to find and format recommendations ...
            return recommendations.length > 0 ? recommendations.join('\n') : 'ไม่พบสินค้าแนะนำที่ตรงใจ';
        } catch (error) {
            this.logger.error('Error formatting product recommendations:', error);
            return 'เกิดข้อผิดพลาดในการสร้างคำแนะนำสินค้า';
        }
    }
    
    getActiveHours(hourlyDataArray) { // Expects array of 24 numbers
        try {
            if (!hourlyDataArray || hourlyDataArray.length !== 24) return null;
            // ... (logic similar to original to find peak hours) ...
            return "เช่น 9:00-12:00, 14:00-17:00"; // Placeholder
        } catch (error) {
            this.logger.error('Error getting active hours:', error);
            return null;
        }
    }

    isFollowupQuery(query) {
        if (!query) return false;
        const followupIndicators = [
            'เท่าไหร่', 'กี่บาท', 'มีกี่', 'เหลือ', 'ยังมี', 'ราคา', 'จัดส่ง', 'ส่ง', 'ขนาด',
            'มีสี', 'มีสินค้า', 'อันนี้', 'ชิ้นนี้', 'ตัวนี้', 'แบบนี้', 'ทำไม', 'ยังไง',
            'อย่างไร', 'สั่งยังไง', 'วิธี', 'ราคานี้', 'สินค้านี้', 'มั้ย', 'ไหม', 'กี่ชิ้น'
        ];
        const isShort = query.length < 20; // Shorter queries are often follow-ups
        const hasIndicator = followupIndicators.some(ind => query.toLowerCase().includes(ind));
        return isShort || hasIndicator;
    }
}

module.exports = ContextAnalyzer;
