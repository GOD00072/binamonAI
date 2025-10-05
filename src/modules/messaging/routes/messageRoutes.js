// routes/messageRoutes.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;

// Message deduplication helper
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

// Helper function to format message data
function formatMessageData(message, userId) {
    return {
        content: message.content,
        timestamp: Date.now(),
        role: message.role || 'admin',
        userId: userId,
        messageId: message.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
}

module.exports = (dependencies) => {
    const { chatHistory, lineHandler, messageHandler, logger, webSocketManager } = dependencies;

    // GET /api/messages/:userId - Get user messages
    router.get('/:userId', async (req, res) => {
        try {
            const userId = req.params.userId;
            const type = req.query.type || 'api';
            
            let history;
            if (type === 'ai') {
                history = await chatHistory.loadAIChatHistory(userId);
            } else {
                history = await chatHistory.loadAPIChatHistory(userId);
            }
            
            res.json({ 
                success: true,
                messages: history?.messages || []
            });
        } catch (error) {
            logger.error('Error getting messages:', error);
            res.status(500).json({ 
                success: false,
                error: 'Error getting messages' 
            });
        }
    });

    // GET /api/messages/history/:userId - Get chat history
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

            if (history?.messages) {
                const deduplicatedMessages = deduplicateMessages(history.messages);
                history.messages = deduplicatedMessages;
            }
            
            res.json({
                success: true,
                history: history || { messages: [], lastUpdated: 0, totalTokens: { input: 0, output: 0 } }
            });
        } catch (error) {
            logger.error('Error getting chat history:', error);
            res.status(500).json({ 
                success: false,
                error: 'Error getting chat history' 
            });
        }
    });

    // GET /api/messages/unread/:userId - Get unread messages
    router.get('/unread/:userId', async (req, res) => {
        try {
            const userId = req.params.userId;
            const lastRead = await chatHistory.getLastRead(userId);
            const history = await chatHistory.loadAPIChatHistory(userId);
            
            const unreadMessages = (history?.messages || []).filter(msg => {
                return msg.timestamp > lastRead && msg.role !== 'admin';
            });

            res.json({
                success: true,
                count: unreadMessages.length,
                messages: unreadMessages,
                lastRead: lastRead
            });
        } catch (error) {
            logger.error('Error getting unread messages:', error);
            res.status(500).json({ 
                success: false,
                error: 'Error getting unread messages' 
            });
        }
    });

    // POST /api/messages/read/:userId - Mark messages as read
    router.post('/read/:userId', async (req, res) => {
        try {
            const userId = req.params.userId;
            const timestamp = Date.now();
            await chatHistory.updateLastRead(userId, timestamp);
            
            // แจ้งเตือนผ่าน WebSocket ว่าข้อความถูกอ่านแล้ว
            if (webSocketManager) {
                webSocketManager.io.emit('messages_marked_read', {
                    userId: userId,
                    lastReadTimestamp: timestamp,
                    readBy: req.user,
                    timestamp: Date.now()
                });
            }
            
            res.json({ 
                success: true, 
                timestamp 
            });
        } catch (error) {
            logger.error('Error updating last read:', error);
            res.status(500).json({ 
                success: false,
                error: 'Error updating last read' 
            });
        }
    });

    // POST /api/messages/send - Send message
    router.post('/send', async (req, res) => {
        const { userId, message } = req.body;

        if (!userId || !message || !message.content) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: userId and message content'
            });
        }

        try {
            const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            const adminMessage = {
                content: message.content,
                timestamp: Date.now(),
                role: 'admin',
                messageId: messageId
            };

            // Save to chat history
            await chatHistory.saveHistory(userId, {
                messages: [adminMessage],
                lastUpdated: Date.now()
            }, 'api');

            // Send message via LINE
            const lineResult = await lineHandler.pushMessage(
                userId,
                message.content,
                messageId
            );

            if (!lineResult) {
                throw new Error('Failed to send LINE message');
            }

            // แจ้งเตือนผ่าน WebSocket
            if (webSocketManager) {
                webSocketManager.notifyNewMessage(userId, adminMessage);
            }

            // Emit real-time update if Socket.IO is available
            if (req.io) {
                req.io.emit('message_sent', {
                    userId,
                    message: adminMessage
                });
            }

            res.json({
                success: true,
                message: adminMessage,
                messageId: messageId
            });

            logger.info('Message sent successfully', {
                userId,
                messageId,
                content: message.content,
                timestamp: adminMessage.timestamp
            });

        } catch (error) {
            logger.error('Error sending message:', {
                error: error.message,
                userId,
                content: message?.content
            });

            res.status(500).json({
                success: false,
                error: 'Failed to send message',
                details: error.message
            });
        }
    });

    // POST /api/messages/notify - Send notification (ใหม่)
    router.post('/notify', (req, res) => {
        try {
            const { userId, message } = req.body;
            
            if (!userId || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing userId or message'
                });
            }
            
            // ส่งการแจ้งเตือนผ่าน WebSocket
            if (webSocketManager) {
                webSocketManager.notifyNewMessage(userId, message);
            }
            
            res.json({
                success: true,
                message: 'Notification sent successfully',
                timestamp: Date.now()
            });
            
        } catch (error) {
            logger.error('Error sending notification:', error);
            res.status(500).json({
                success: false,
                error: 'Error sending notification'
            });
        }
    });

    // GET /api/messages/stats - Get message handler statistics
    router.get('/stats', (req, res) => {
        try {
            const stats = messageHandler.getQueueStats();
            const successCount = messageHandler.messageHistory.size;
            const totalCount = successCount + messageHandler.processingMessages.size;
            
            res.json({
                success: true,
                stats: {
                    processingCount: messageHandler.processingMessages.size,
                    historyCount: messageHandler.messageHistory.size,
                    aggregatingCount: messageHandler.aggregatingMessages.size,
                    successCount,
                    totalCount,
                    configuration: messageHandler.getConfiguration()
                }
            });
        } catch (error) {
            logger.error('Error getting message handler stats:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Error getting message handler stats' 
            });
        }
    });

    // POST /api/messages/config - Update message handler configuration
    router.post('/config', (req, res) => {
        try {
            const config = messageHandler.updateConfiguration(req.body);

            res.json({ 
                success: true, 
                message: 'Message handler configuration updated successfully',
                config: config
            });
        } catch (error) {
            logger.error('Error updating message handler configuration:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Error updating message handler configuration' 
            });
        }
    });

    // POST /api/messages/broadcast - Broadcast message to multiple users (ใหม่)
    router.post('/broadcast', async (req, res) => {
        try {
            const { userIds, message } = req.body;

            if (!Array.isArray(userIds) || !message || !message.content) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing userIds array or message content'
                });
            }

            const results = [];
            const messageId = `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            for (const userId of userIds) {
                try {
                    const adminMessage = {
                        content: message.content,
                        timestamp: Date.now(),
                        role: 'admin',
                        messageId: `${messageId}_${userId}`
                    };

                    // Save to chat history
                    await chatHistory.saveHistory(userId, {
                        messages: [adminMessage],
                        lastUpdated: Date.now()
                    }, 'api');

                    // Send via LINE
                    const lineResult = await lineHandler.pushMessage(userId, message.content, adminMessage.messageId);

                    // Notify via WebSocket
                    if (webSocketManager) {
                        webSocketManager.notifyNewMessage(userId, adminMessage);
                    }

                    results.push({
                        userId,
                        success: lineResult,
                        messageId: adminMessage.messageId
                    });

                } catch (error) {
                    logger.error(`Error broadcasting to user ${userId}:`, error);
                    results.push({
                        userId,
                        success: false,
                        error: error.message
                    });
                }
            }

            const successCount = results.filter(r => r.success).length;

            res.json({
                success: true,
                message: `Broadcast sent to ${successCount}/${userIds.length} users`,
                results,
                summary: {
                    total: userIds.length,
                    successful: successCount,
                    failed: userIds.length - successCount
                }
            });

        } catch (error) {
            logger.error('Error broadcasting messages:', error);
            res.status(500).json({
                success: false,
                error: 'Error broadcasting messages'
            });
        }
    });

    return router;
};