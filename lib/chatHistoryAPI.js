// lib/chatHistoryAPI.js - Helper functions for ChatHistoryAPI (LINE messages)
const prisma = require('./prisma');

class ChatHistoryAPI {
    constructor(logger) {
        this.logger = logger;
    }

    // เพิ่มข้อความใหม่จาก LINE API
    async addMessage(data) {
        try {
            const {
                userId,
                messageId = null,
                type,
                content = null,
                imageUrl = null,
                stickerPackageId = null,
                stickerId = null,
                source = 'line',
                metadata = null
            } = data;

            const message = await prisma.chatHistoryAPI.create({
                data: {
                    userId,
                    messageId,
                    type,
                    content,
                    imageUrl,
                    stickerPackageId,
                    stickerId,
                    source,
                    metadata: metadata ? JSON.stringify(metadata) : null
                }
            });
            return message;
        } catch (error) {
            this.logger?.error('Error adding API chat message:', error);
            throw error;
        }
    }

    // ดึงประวัติแชท
    async getHistory(userId, limit = 50, offset = 0) {
        try {
            const messages = await prisma.chatHistoryAPI.findMany({
                where: { userId },
                orderBy: { timestamp: 'desc' },
                take: limit,
                skip: offset
            });
            return messages.reverse();
        } catch (error) {
            this.logger?.error('Error getting API chat history:', error);
            throw error;
        }
    }

    // ค้นหาข้อความจาก messageId
    async findByMessageId(messageId) {
        try {
            return await prisma.chatHistoryAPI.findUnique({
                where: { messageId }
            });
        } catch (error) {
            this.logger?.error('Error finding message by ID:', error);
            throw error;
        }
    }

    // ลบประวัติแชททั้งหมดของ user
    async clearHistory(userId) {
        try {
            const result = await prisma.chatHistoryAPI.deleteMany({
                where: { userId }
            });
            return result.count;
        } catch (error) {
            this.logger?.error('Error clearing API chat history:', error);
            throw error;
        }
    }

    // ดึงข้อความตามประเภท
    async getMessagesByType(userId, type, limit = 20) {
        try {
            return await prisma.chatHistoryAPI.findMany({
                where: { userId, type },
                orderBy: { timestamp: 'desc' },
                take: limit
            });
        } catch (error) {
            this.logger?.error('Error getting messages by type:', error);
            throw error;
        }
    }

    // นับจำนวนข้อความทั้งหมด
    async countMessages(userId) {
        try {
            return await prisma.chatHistoryAPI.count({
                where: { userId }
            });
        } catch (error) {
            this.logger?.error('Error counting API messages:', error);
            throw error;
        }
    }
}

module.exports = ChatHistoryAPI;
