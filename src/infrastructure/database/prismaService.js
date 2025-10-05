// services/prismaService.js - Centralized Prisma Service Layer
const prisma = require('../../../lib/prisma');

class PrismaService {
    constructor(logger) {
        this.logger = logger;
        this.prisma = prisma;
    }

    // ==================== Product Methods ====================

    async createProduct(data) {
        return await this.prisma.product.create({ data });
    }

    async getProduct(id) {
        return await this.prisma.product.findUnique({
            where: { id },
            include: {
                images: true,
                priceTiers: { orderBy: { min_quantity: 'asc' } }
            }
        });
    }

    async getProductBySku(sku) {
        return await this.prisma.product.findUnique({
            where: { sku },
            include: {
                images: true,
                priceTiers: { orderBy: { min_quantity: 'asc' } }
            }
        });
    }

    async getAllProducts(options = {}) {
        const { skip, take, where, orderBy, include } = options;
        return await this.prisma.product.findMany({
            skip,
            take,
            where,
            orderBy,
            include: include || {
                images: { orderBy: { order: 'asc' } },
                priceTiers: { orderBy: { min_quantity: 'asc' } }
            }
        });
    }

    async updateProduct(id, data) {
        return await this.prisma.product.update({
            where: { id },
            data
        });
    }

    async deleteProduct(id) {
        return await this.prisma.product.delete({ where: { id } });
    }

    async searchProducts(query, options = {}) {
        const { skip = 0, take = 20, category } = options;
        const where = {
            OR: [
                { product_name: { contains: query } },
                { sku: { contains: query } },
                { short_description: { contains: query } }
            ]
        };

        if (category) {
            where.category = category;
        }

        return await this.prisma.product.findMany({
            where,
            skip,
            take,
            include: { images: { orderBy: { order: 'asc' }, take: 1 } }
        });
    }

    // ==================== Product Image Methods ====================

    async addProductImage(productId, imageData) {
        return await this.prisma.productImage.create({
            data: {
                product_id: productId,
                ...imageData
            }
        });
    }

    async getProductImages(productId) {
        return await this.prisma.productImage.findMany({
            where: { product_id: productId },
            orderBy: { order: 'asc' }
        });
    }

    async deleteProductImage(imageId) {
        return await this.prisma.productImage.delete({ where: { id: imageId } });
    }

    // ==================== Price Tier Methods ====================

    async addPriceTier(productId, tierData) {
        return await this.prisma.priceTier.create({
            data: {
                product_id: productId,
                min_quantity: tierData.min_quantity,
                max_quantity: tierData.max_quantity || null,
                price: tierData.price
            }
        });
    }

    async getPriceTiers(productId) {
        return await this.prisma.priceTier.findMany({
            where: { product_id: productId },
            orderBy: { min_quantity: 'asc' }
        });
    }

    async updatePriceTier(tierId, data) {
        return await this.prisma.priceTier.update({
            where: { id: tierId },
            data
        });
    }

    async deletePriceTier(tierId) {
        return await this.prisma.priceTier.delete({ where: { id: tierId } });
    }

    async deleteAllPriceTiers(productId) {
        return await this.prisma.priceTier.deleteMany({
            where: { product_id: productId }
        });
    }

    // ==================== Chat History AI Methods ====================

    async addChatAI(data) {
        return await this.prisma.chatHistoryAI.create({
            data: {
                userId: data.userId,
                role: data.role,
                content: data.content,
                messageId: data.messageId || null,
                products: data.products ? JSON.stringify(data.products) : null,
                senderProfile: data.senderProfile ? JSON.stringify(data.senderProfile) : null,
                source: data.source || null,
                inputTokens: data.inputTokens ?? null,
                outputTokens: data.outputTokens ?? null,
                totalTokens: (data.totalTokens ?? ((data.inputTokens || 0) + (data.outputTokens || 0))) || null,
                timestamp: data.timestamp || Date.now(),
                saved_at: data.saved_at || Date.now()
            }
        });
    }

    async getChatAI(userId, limit = 50) {
        return await this.prisma.chatHistoryAI.findMany({
            where: { userId },
            orderBy: { timestamp: 'desc' },
            take: limit
        });
    }

    async clearChatAI(userId) {
        return await this.prisma.chatHistoryAI.deleteMany({
            where: { userId }
        });
    }

    // ==================== Chat History API Methods ====================

    async addChatAPI(data) {
        return await this.prisma.chatHistoryAPI.create({
            data: {
                userId: data.userId,
                messageId: data.messageId || null,
                role: data.role,
                content: data.content || null,
                products: data.products ? JSON.stringify(data.products) : null,
                senderProfile: data.senderProfile ? JSON.stringify(data.senderProfile) : null,
                source: data.source || 'line',
                inputTokens: data.inputTokens ?? null,
                outputTokens: data.outputTokens ?? null,
                totalTokens: (data.totalTokens ?? ((data.inputTokens || 0) + (data.outputTokens || 0))) || null,
                timestamp: data.timestamp || Date.now(),
                saved_at: data.saved_at || Date.now()
            }
        });
    }

    async getChatAPI(userId, limit = 50) {
        return await this.prisma.chatHistoryAPI.findMany({
            where: { userId },
            orderBy: { timestamp: 'desc' },
            take: limit
        });
    }

    async clearChatAPI(userId) {
        return await this.prisma.chatHistoryAPI.deleteMany({
            where: { userId }
        });
    }

    // ==================== Chat User State Methods ====================

    async getChatUserState(userId) {
        return await this.prisma.chatUserState.findUnique({
            where: { userId }
        });
    }

    async upsertChatUserState(userId, data = {}) {
        return await this.prisma.chatUserState.upsert({
            where: { userId },
            update: data,
            create: {
                userId,
                apiInputTokens: data.apiInputTokens ?? 0,
                apiOutputTokens: data.apiOutputTokens ?? 0,
                aiInputTokens: data.aiInputTokens ?? 0,
                aiOutputTokens: data.aiOutputTokens ?? 0,
                apiLastRead: data.apiLastRead ?? null
            }
        });
    }

    async incrementChatTokens(userId, type, inputTokens = 0, outputTokens = 0) {
        const isAI = type === 'ai';

        return await this.prisma.chatUserState.upsert({
            where: { userId },
            update: isAI ? {
                aiInputTokens: { increment: inputTokens || 0 },
                aiOutputTokens: { increment: outputTokens || 0 }
            } : {
                apiInputTokens: { increment: inputTokens || 0 },
                apiOutputTokens: { increment: outputTokens || 0 }
            },
            create: {
                userId,
                aiInputTokens: isAI ? inputTokens || 0 : 0,
                aiOutputTokens: isAI ? outputTokens || 0 : 0,
                apiInputTokens: !isAI ? inputTokens || 0 : 0,
                apiOutputTokens: !isAI ? outputTokens || 0 : 0
            }
        });
    }

    async updateChatLastRead(userId, timestamp) {
        return await this.prisma.chatUserState.upsert({
            where: { userId },
            update: {
                apiLastRead: timestamp
            },
            create: {
                userId,
                apiLastRead: timestamp
            }
        });
    }

    async resetChatUserState(userId, type = 'all') {
        const resetAi = type === 'ai' || type === 'all';
        const resetApi = type === 'api' || type === 'all';

        return await this.prisma.chatUserState.upsert({
            where: { userId },
            update: {
                ...(resetAi ? { aiInputTokens: 0, aiOutputTokens: 0 } : {}),
                ...(resetApi ? { apiInputTokens: 0, apiOutputTokens: 0, apiLastRead: null } : {})
            },
            create: {
                userId,
                aiInputTokens: resetAi ? 0 : 0,
                aiOutputTokens: resetAi ? 0 : 0,
                apiInputTokens: resetApi ? 0 : 0,
                apiOutputTokens: resetApi ? 0 : 0,
                apiLastRead: resetApi ? null : null
            }
        });
    }

    // ==================== Product History Methods ====================

    async addProductHistory(data) {
        return await this.prisma.productHistory.create({
            data: {
                userId: data.userId,
                product_id: data.product_id,
                product_name: data.product_name,
                category: data.category || null,
                relevance_score: data.relevance_score,
                context: data.context ? JSON.stringify(data.context) : null,
                timestamp: data.timestamp || Date.now()
            }
        });
    }

    async getProductHistory(userId, limit = 100) {
        return await this.prisma.productHistory.findMany({
            where: { userId },
            orderBy: { timestamp: 'desc' },
            take: limit
        });
    }

    async getProductInteractions(userId, productId) {
        return await this.prisma.productHistory.findMany({
            where: {
                userId,
                product_id: productId
            },
            orderBy: { timestamp: 'desc' }
        });
    }

    // ==================== User Language Methods ====================

    async getUserLanguage(userId) {
        return await this.prisma.userLanguage.findUnique({
            where: { userId }
        });
    }

    async setUserLanguage(data) {
        return await this.prisma.userLanguage.upsert({
            where: { userId: data.userId },
            update: {
                language: data.language,
                isLocked: data.isLocked ?? false,
                firstDetected: data.firstDetected,
                conversationStarted: data.conversationStarted ?? false,
                detectionHistory: data.detectionHistory ? JSON.stringify(data.detectionHistory) : null,
                lastUpdateTime: data.lastUpdateTime || Date.now(),
                version: data.version || "2.0"
            },
            create: {
                userId: data.userId,
                language: data.language,
                isLocked: data.isLocked ?? false,
                firstDetected: data.firstDetected,
                conversationStarted: data.conversationStarted ?? false,
                detectionHistory: data.detectionHistory ? JSON.stringify(data.detectionHistory) : null,
                lastUpdateTime: data.lastUpdateTime || Date.now(),
                createdAt: data.createdAt || Date.now(),
                version: data.version || "2.0"
            }
        });
    }

    async updateUserLanguage(userId, updates) {
        return await this.prisma.userLanguage.update({
            where: { userId },
            data: {
                ...updates,
                lastUpdateTime: Date.now()
            }
        });
    }

    // ==================== User Methods ====================

    async createUser(data) {
        return await this.prisma.user.create({
            data: {
                userId: data.userId,
                displayName: data.displayName || null,
                pictureUrl: data.pictureUrl || null,
                email: data.email || null,
                phone: data.phone || null
            }
        });
    }

    async getUser(userId) {
        return await this.prisma.user.findUnique({
            where: { userId }
        });
    }

    async updateUser(userId, data) {
        return await this.prisma.user.update({
            where: { userId },
            data
        });
    }

    async getAllUsers() {
        return await this.prisma.user.findMany({
            orderBy: { created_at: 'desc' }
        });
    }

    // ==================== Keyword Methods ====================

    async createKeyword(data) {
        return await this.prisma.keyword.create({
            data: {
                keyword: data.keyword,
                description: data.description || null,
                enabled: data.enabled ?? true
            }
        });
    }

    async getKeyword(keyword) {
        return await this.prisma.keyword.findUnique({
            where: { keyword },
            include: { images: { orderBy: { order: 'asc' } } }
        });
    }

    async getAllKeywords() {
        return await this.prisma.keyword.findMany({
            where: { enabled: true },
            include: { images: true }
        });
    }

    async deleteKeyword(keyword) {
        return await this.prisma.keyword.delete({
            where: { keyword }
        });
    }

    // ==================== Keyword Image Methods ====================

    async addKeywordImage(keywordId, imageData) {
        return await this.prisma.keywordImage.create({
            data: {
                keyword_id: keywordId,
                imageUrl: imageData.imageUrl,
                altText: imageData.altText || null,
                order: imageData.order || 0
            }
        });
    }

    async getKeywordImages(keywordId) {
        return await this.prisma.keywordImage.findMany({
            where: { keyword_id: keywordId },
            orderBy: { order: 'asc' }
        });
    }

    // ==================== Settings Methods ====================

    async getSetting(key) {
        const setting = await this.prisma.setting.findUnique({
            where: { key }
        });
        if (setting && setting.value) {
            try {
                return JSON.parse(setting.value);
            } catch (e) {
                return setting.value;
            }
        }
        return null;
    }

    async setSetting(key, value, description = null) {
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        return await this.prisma.setting.upsert({
            where: { key },
            update: { value: valueStr, description },
            create: { key, value: valueStr, description }
        });
    }

    // ==================== Message Template Methods ====================

    async getMessageTemplate(name) {
        const template = await this.prisma.messageTemplate.findUnique({
            where: { name }
        });
        if (template && template.template) {
            try {
                return {
                    ...template,
                    template: JSON.parse(template.template)
                };
            } catch (e) {
                return template;
            }
        }
        return null;
    }

    async saveMessageTemplate(data) {
        const templateStr = typeof data.template === 'string'
            ? data.template
            : JSON.stringify(data.template);

        return await this.prisma.messageTemplate.upsert({
            where: { name: data.name },
            update: {
                template: templateStr,
                category: data.category || null,
                enabled: data.enabled ?? true
            },
            create: {
                name: data.name,
                template: templateStr,
                category: data.category || null,
                enabled: data.enabled ?? true
            }
        });
    }

    // ==================== Knowledge Methods ====================

    async createKnowledge(data) {
        return await this.prisma.knowledge.create({
            data: {
                title: data.title,
                content: data.content,
                category: data.category || null,
                tags: data.tags ? JSON.stringify(data.tags) : null,
                enabled: data.enabled ?? true
            }
        });
    }

    async getKnowledge(id) {
        return await this.prisma.knowledge.findUnique({
            where: { id }
        });
    }

    async searchKnowledge(query) {
        return await this.prisma.knowledge.findMany({
            where: {
                enabled: true,
                OR: [
                    { title: { contains: query } },
                    { content: { contains: query } }
                ]
            }
        });
    }

    // ==================== Utility Methods ====================

    async disconnect() {
        await this.prisma.$disconnect();
    }

    async healthCheck() {
        try {
            await this.prisma.$queryRaw`SELECT 1`;
            return { status: 'ok', database: 'connected' };
        } catch (error) {
            this.logger?.error('Database health check failed:', error);
            return { status: 'error', database: 'disconnected', error: error.message };
        }
    }
}

module.exports = PrismaService;
