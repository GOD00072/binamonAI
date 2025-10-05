// lib/chatHistoryAI.js - Helper functions for ChatHistoryAI
const prisma = require('./prisma');

class ChatHistoryAI {
    constructor(logger) {
        this.logger = logger;
    }

    // เพิ่มข้อความใหม่
    async addMessage(userId, role, content, imageUrl = null, metadata = null) {
        try {
            const message = await prisma.chatHistoryAI.create({
                data: {
                    userId,
                    role,
                    content,
                    imageUrl,
                    metadata: metadata ? JSON.stringify(metadata) : null
                }
            });
            return message;
        } catch (error) {
            this.logger?.error('Error adding AI chat message:', error);
            throw error;
        }
    }

    // ดึงประวัติแชท
    async getHistory(userId, limit = 50, offset = 0) {
        try {
            const messages = await prisma.chatHistoryAI.findMany({
                where: { userId },
                orderBy: { timestamp: 'desc' },
                take: limit,
                skip: offset
            });
            return messages.reverse(); // เรียงจากเก่าไปใหม่
        } catch (error) {
            this.logger?.error('Error getting AI chat history:', error);
            throw error;
        }
    }

    // ลบประวัติแชททั้งหมดของ user
    async clearHistory(userId) {
        try {
            const result = await prisma.chatHistoryAI.deleteMany({
                where: { userId }
            });
            return result.count;
        } catch (error) {
            this.logger?.error('Error clearing AI chat history:', error);
            throw error;
        }
    }

    // ลบข้อความที่เก่ากว่าวันที่กำหนด
    async clearOldMessages(daysOld = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const result = await prisma.chatHistoryAI.deleteMany({
                where: {
                    timestamp: { lt: cutoffDate }
                }
            });
            return result.count;
        } catch (error) {
            this.logger?.error('Error clearing old AI messages:', error);
            throw error;
        }
    }

    // นับจำนวนข้อความทั้งหมด
    async countMessages(userId) {
        try {
            return await prisma.chatHistoryAI.count({
                where: { userId }
            });
        } catch (error) {
            this.logger?.error('Error counting AI messages:', error);
            throw error;
        }
    }
}

module.exports = ChatHistoryAI;
