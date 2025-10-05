// routes/websocketRoutes.js
const express = require('express');
const router = express.Router();

module.exports = (dependencies) => {
    const { webSocketManager, lineHandler, logger } = dependencies;


    router.get('/status', async (req, res) => {
        try {
            const status = webSocketManager.getConfiguration();
            res.json({
                success: true,
                status,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting WebSocket status:', error);
            res.status(500).json({
                success: false,
                error: 'Error getting WebSocket status'
            });
        }
    });


    router.post('/config', async (req, res) => {
        try {
            webSocketManager.updateConfiguration(req.body);
            res.json({
                success: true,
                config: webSocketManager.getConfiguration(),
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error updating WebSocket config:', error);
            res.status(500).json({
                success: false,
                error: 'Error updating WebSocket configuration'
            });
        }
    });


    router.get('/connections', async (req, res) => {
        try {
            const connections = webSocketManager.getConnectionsInfo();
            res.json({
                success: true,
                totalConnections: webSocketManager.getActiveConnections(),
                connections: connections,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting WebSocket connections:', error);
            res.status(500).json({
                success: false,
                error: 'Error getting WebSocket connections'
            });
        }
    });

    // POST /api/websocket/broadcast - Broadcast message to all connections
    router.post('/broadcast', (req, res) => {
        try {
            const { event, data } = req.body;
            
            if (!event) {
                return res.status(400).json({
                    success: false,
                    error: 'Event name is required'
                });
            }

            webSocketManager.io.emit(event, {
                ...data,
                timestamp: Date.now(),
                source: 'api'
            });

            res.json({
                success: true,
                message: `Broadcasted event: ${event}`,
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error('Error broadcasting message:', error);
            res.status(500).json({
                success: false,
                error: 'Error broadcasting message'
            });
        }
    });

    // POST /api/websocket/admin/typing/:action - Admin typing control
    router.post('/admin/typing/:action', (req, res) => {
        try {
            const { action } = req.params;
            const { userId, adminId } = req.body;
            
            if (!userId || !adminId) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing userId or adminId'
                });
            }
            
            if (action === 'start') {
                webSocketManager.io.emit('admin_typing_start', { userId, adminId });
            } else if (action === 'stop') {
                webSocketManager.io.emit('admin_typing_stop', { userId, adminId });
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid action. Use start or stop'
                });
            }
            
            res.json({
                success: true,
                action,
                userId,
                adminId,
                timestamp: Date.now()
            });
            
        } catch (error) {
            logger.error('Error handling admin typing status:', error);
            res.status(500).json({
                success: false,
                error: 'Error handling admin typing status'
            });
        }
    });

    // POST /api/websocket/ai/cancel - Cancel AI processing
    router.post('/ai/cancel', (req, res) => {
        try {
            const { userId, messageId } = req.body;
            
            if (!userId || !messageId) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing userId or messageId'
                });
            }

            const cancelled = webSocketManager.cancelAIProcessing(userId, messageId);
            
            res.json({
                success: cancelled,
                userId: userId,
                messageId: messageId,
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error('Error cancelling AI processing:', error);
            res.status(500).json({
                success: false,
                error: 'Error cancelling AI processing'
            });
        }
    });

    // POST /api/websocket/ai/approve - Approve AI response
    router.post('/ai/approve', (req, res) => {
        try {
            const { userId, responseId } = req.body;
            
            if (!userId || !responseId) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing userId or responseId'
                });
            }

            webSocketManager.approveAndSendAIResponse(userId, responseId);
            
            res.json({
                success: true,
                userId: userId,
                responseId: responseId,
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error('Error approving AI response:', error);
            res.status(500).json({
                success: false,
                error: 'Error approving AI response'
            });
        }
    });

    // POST /api/websocket/ai/reject - Reject AI response
    router.post('/ai/reject', (req, res) => {
        try {
            const { userId, responseId, reason } = req.body;
            
            if (!userId || !responseId) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing userId or responseId'
                });
            }

            webSocketManager.rejectAIResponse(userId, responseId, reason || 'No reason provided');
            
            res.json({
                success: true,
                userId: userId,
                responseId: responseId,
                reason: reason,
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error('Error rejecting AI response:', error);
            res.status(500).json({
                success: false,
                error: 'Error rejecting AI response'
            });
        }
    });

    // GET /api/websocket/ai/processing - Get AI processing status
    router.get('/ai/processing', (req, res) => {
        try {
            const processingList = [];
            for (const [userId, data] of webSocketManager.aiProcessingQueue.entries()) {
                processingList.push({
                    userId,
                    messageId: data.messageId,
                    status: data.status,
                    timestamp: data.timestamp,
                    duration: Date.now() - data.timestamp
                });
            }

            res.json({
                success: true,
                processing: processingList,
                count: processingList.length,
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error('Error getting AI processing status:', error);
            res.status(500).json({
                success: false,
                error: 'Error getting AI processing status'
            });
        }
    });

    // GET /api/websocket/ai/pending - Get pending approvals
    router.get('/ai/pending', (req, res) => {
        try {
            const pendingList = [];
            for (const [userId, data] of webSocketManager.pendingAIResponses.entries()) {
                pendingList.push({
                    userId,
                    responseId: data.responseId,
                    messageId: data.messageId,
                    response: data.response,
                    timestamp: data.timestamp,
                    waitingTime: Date.now() - data.timestamp
                });
            }

            res.json({
                success: true,
                pending: pendingList,
                count: pendingList.length,
                timestamp: Date.now()
            });
            } catch (error) {
           logger.error('Error getting pending approvals:', error);
           res.status(500).json({
               success: false,
               error: 'Error getting pending approvals'
           });
       }
   });

   return router;
};  