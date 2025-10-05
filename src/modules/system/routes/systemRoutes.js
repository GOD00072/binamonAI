// routes/systemRoutes.js
const express = require('express');
const router = express.Router();
const os = require('os');
const fs = require('fs').promises;
const path = require('path');

module.exports = (dependencies) => {
    const { logger, webSocketManager, lineHandler, aiAssistant, chatHistory } = dependencies;

    // GET /api/system/health - System health check
    router.get('/health', async (req, res) => {
        try {
            const health = {
                status: 'healthy',
                timestamp: Date.now(),
                system: {
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    cpu: process.cpuUsage(),
                    platform: os.platform(),
                    nodeVersion: process.version
                },
                services: {
                    webSocket: {
                        status: webSocketManager ? 'running' : 'stopped',
                        connections: webSocketManager ? webSocketManager.getActiveConnections() : 0
                    },
                    lineHandler: {
                        status: lineHandler ? 'running' : 'stopped',
                        aiEnabled: lineHandler ? lineHandler.getAiStatus().globalEnabled : false
                    },
                    aiAssistant: {
                        status: aiAssistant && aiAssistant.initialized ? 'running' : 'stopped',
                        model: aiAssistant ? aiAssistant.MODEL_NAME : 'unknown'
                    },
                    chatHistory: {
                        status: chatHistory ? 'running' : 'stopped'
                    }
                }
            };

            // Check if any service is down
            const servicesDown = Object.values(health.services).filter(service => service.status !== 'running');
            if (servicesDown.length > 0) {
                health.status = 'degraded';
            }

            const statusCode = health.status === 'healthy' ? 200 : 503;
            res.status(statusCode).json(health);

        } catch (error) {
            logger.error('Error getting system health:', error);
            res.status(500).json({
                status: 'error',
                error: error.message,
                timestamp: Date.now()
            });
        }
    });

    // GET /api/system/stats - System statistics
    router.get('/stats', async (req, res) => {
        try {
            const stats = {
                timestamp: Date.now(),
                system: {
                    uptime: process.uptime(),
                    memory: {
                        usage: process.memoryUsage(),
                        system: {
                            total: os.totalmem(),
                            free: os.freemem(),
                            used: os.totalmem() - os.freemem()
                        }
                    },
                    cpu: {
                        usage: process.cpuUsage(),
                        cores: os.cpus().length,
                        loadAverage: os.loadavg()
                    },
                    platform: os.platform(),
                    arch: os.arch(),
                    nodeVersion: process.version
                },
                application: {
                    webSocket: webSocketManager ? {
                        connections: webSocketManager.getActiveConnections(),
                        aiProcessing: webSocketManager.aiProcessingQueue.size,
                        pendingApprovals: webSocketManager.pendingAIResponses.size,
                        adminSessions: webSocketManager.adminSessions.size
                    } : null,
                    messageHandler: {
                        processing: 0, // messageHandler stats if available
                        history: 0,
                        aggregating: 0
                    }
                }
            };

            res.json({
                success: true,
                stats
            });

        } catch (error) {
            logger.error('Error getting system stats:', error);
            res.status(500).json({
                success: false,
                error: 'Error getting system statistics'
            });
        }
    });

    // GET /api/system/logs - Get recent logs
    router.get('/logs', async (req, res) => {
        try {
            const { type = 'info', lines = 100 } = req.query;
            const logFile = path.join(__dirname, '..', 'logs', `${type}.log`);
            
            try {
                const logContent = await fs.readFile(logFile, 'utf8');
                const logLines = logContent.split('\n').filter(line => line.trim());
                const recentLines = logLines.slice(-parseInt(lines));
                
                res.json({
                    success: true,
                    logType: type,
                    totalLines: logLines.length,
                    returnedLines: recentLines.length,
                    logs: recentLines
                });
            } catch (fileError) {
                res.json({
                    success: true,
                    logType: type,
                    totalLines: 0,
                    returnedLines: 0,
                    logs: [],
                    message: 'Log file not found or empty'
                });
            }

        } catch (error) {
            logger.error('Error getting logs:', error);
            res.status(500).json({
                success: false,
                error: 'Error getting logs'
            });
        }
    });

    // POST /api/system/gc - Force garbage collection
    router.post('/gc', (req, res) => {
        try {
            if (global.gc) {
                const beforeMemory = process.memoryUsage();
                global.gc();
                const afterMemory = process.memoryUsage();
                
                res.json({
                    success: true,
                    message: 'Garbage collection completed',
                    memory: {
                        before: beforeMemory,
                        after: afterMemory,
                        freed: beforeMemory.heapUsed - afterMemory.heapUsed
                    }
                });
            } else {
                res.json({
                    success: false,
                    message: 'Garbage collection not available. Start with --expose-gc flag.'
                });
            }
        } catch (error) {
            logger.error('Error during garbage collection:', error);
            res.status(500).json({
                success: false,
                error: 'Error during garbage collection'
            });
        }
    });

    return router;
};