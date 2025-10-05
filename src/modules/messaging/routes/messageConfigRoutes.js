// messageConfigRoutes.js
const express = require('express');
const router = express.Router();

module.exports = (dependencies) => {
    const { messageHandler, chatHistory, logger } = dependencies;

    // GET /api/message-config - Get all message-related configuration
    router.get('/', (req, res) => {
        try {
            const config = {
                messageHandler: {
                    // Aggregation settings
                    aggregationDelay: messageHandler.AGGREGATION_DELAY,
                    maxAggregationTime: messageHandler.MAX_AGGREGATION_TIME,
                    minMessageGap: messageHandler.MIN_MESSAGE_GAP,
                    
                    // TTL settings
                    messageHistoryTTL: messageHandler.MESSAGE_HISTORY_TTL,
                    processingTimeout: messageHandler.PROCESSING_TIMEOUT,
                    
                    // Retry settings
                    maxRetries: messageHandler.MAX_RETRIES,
                    retryDelay: messageHandler.RETRY_DELAY,
                    
                    // Batch settings
                    batchSize: messageHandler.BATCH_SIZE
                },
                chatHistory: {
                    messageTrackingTTL: chatHistory.MESSAGE_TRACKING_TTL
                }
            };

            res.json({
                success: true,
                config,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting message configuration:', error);
            res.status(500).json({
                success: false,
                error: 'Error getting message configuration',
                details: error.message
            });
        }
    });

    // POST /api/message-config/aggregation - Update message aggregation settings
    router.post('/aggregation', (req, res) => {
        try {
            const {
                aggregationDelay,
                maxAggregationTime,
                minMessageGap
            } = req.body;

            // Validate aggregation delay
            if (aggregationDelay !== undefined) {
                if (aggregationDelay < 0 || aggregationDelay > 30000) {
                    return res.status(400).json({
                        success: false,
                        error: 'Aggregation delay must be between 0 and 30000 milliseconds'
                    });
                }
                messageHandler.AGGREGATION_DELAY = aggregationDelay;
            }

            // Validate max aggregation time
            if (maxAggregationTime !== undefined) {
                if (maxAggregationTime < 0 || maxAggregationTime > 60000) {
                    return res.status(400).json({
                        success: false,
                        error: 'Max aggregation time must be between 0 and 60000 milliseconds'
                    });
                }
                messageHandler.MAX_AGGREGATION_TIME = maxAggregationTime;
            }

            // Validate minimum message gap
            if (minMessageGap !== undefined) {
                if (minMessageGap < 0 || minMessageGap > 5000) {
                    return res.status(400).json({
                        success: false,
                        error: 'Minimum message gap must be between 0 and 5000 milliseconds'
                    });
                }
                messageHandler.MIN_MESSAGE_GAP = minMessageGap;
            }

            res.json({
                success: true,
                config: {
                    aggregationDelay: messageHandler.AGGREGATION_DELAY,
                    maxAggregationTime: messageHandler.MAX_AGGREGATION_TIME,
                    minMessageGap: messageHandler.MIN_MESSAGE_GAP
                },
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error updating aggregation settings:', error);
            res.status(500).json({
                success: false,
                error: 'Error updating aggregation settings',
                details: error.message
            });
        }
    });

    // POST /api/message-config/ttl - Update TTL settings
    router.post('/ttl', (req, res) => {
        try {
            const {
                messageHistoryTTL,
                messageTrackingTTL
            } = req.body;

            // Validate message history TTL
            if (messageHistoryTTL !== undefined) {
                if (messageHistoryTTL < 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Message history TTL must be positive'
                    });
                }
                messageHandler.MESSAGE_HISTORY_TTL = messageHistoryTTL;
            }

            // Validate message tracking TTL
            if (messageTrackingTTL !== undefined) {
                if (messageTrackingTTL < 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Message tracking TTL must be positive'
                    });
                }
                chatHistory.MESSAGE_TRACKING_TTL = messageTrackingTTL;
            }

            res.json({
                success: true,
                config: {
                    messageHistoryTTL: messageHandler.MESSAGE_HISTORY_TTL,
                    messageTrackingTTL: chatHistory.MESSAGE_TRACKING_TTL
                },
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error updating TTL settings:', error);
            res.status(500).json({
                success: false,
                error: 'Error updating TTL settings',
                details: error.message
            });
        }
    });

    // POST /api/message-config/maintenance - Run maintenance tasks
    router.post('/maintenance', async (req, res) => {
        try {
            const { cleanupType } = req.body;
            const results = {
                tasksExecuted: []
            };

            switch (cleanupType) {
                case 'all':
                    await Promise.all([
                        chatHistory.cleanupProcessedMessages(),
                        chatHistory.cleanupOldHistories()
                    ]);
                    results.tasksExecuted = ['processedMessages', 'oldHistories'];
                    break;
                    
                case 'processedMessages':
                    await chatHistory.cleanupProcessedMessages();
                    results.tasksExecuted = ['processedMessages'];
                    break;
                    
                case 'oldHistories':
                    await chatHistory.cleanupOldHistories();
                    results.tasksExecuted = ['oldHistories'];
                    break;
                    
                default:
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid cleanup type. Must be "all", "processedMessages", or "oldHistories"'
                    });
            }

            res.json({
                success: true,
                results,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error executing maintenance tasks:', error);
            res.status(500).json({
                success: false,
                error: 'Error executing maintenance tasks',
                details: error.message
            });
        }
    });

    // GET /api/message-config/stats - Get current message handling statistics
    router.get('/stats', (req, res) => {
        try {
            const stats = {
                messageHandler: {
                    queueSize: messageHandler.messageQueue.size,
                    processingCount: messageHandler.processingMessages.size,
                    historySize: messageHandler.messageHistory.size,
                    aggregatingCount: messageHandler.aggregatingMessages.size
                },
                chatHistory: {
                    processedMessagesCount: chatHistory.processedMessages.size
                }
            };

            res.json({
                success: true,
                stats,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.error('Error getting message statistics:', error);
            res.status(500).json({
                success: false,
                error: 'Error getting message statistics',
                details: error.message
            });
        }
    });

    return router;
};