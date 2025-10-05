const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { resolveDataPath } = require('../../../app/paths');

module.exports = (dependencies) => {
    const { 
        logger, 
        messageTracker, 
        emailService, 
        aiAssistant 
    } = dependencies;
    
    const router = express.Router();

    // Generate Comprehensive Summary
    router.post('/comprehensive-summary', async (req, res) => {
        try {
            const summaries = await emailService.generateComprehensiveSummary();
            res.json({
                success: true,
                summaries
            });
        } catch (error) {
            logger.error('Comprehensive summary generation error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการสร้างสรุปภาพรวม',
                error: error.message
            });
        }
    });

    // Update Summary Configuration
    // In email routes
 router.post('/summary-config', async (req, res) => {
    try {
        const { 
            individualSummaryEnabled = true, 
            aggregateSummaryEnabled = true,
            individualUserSettings 
        } = req.body;

        const updatedConfig = await emailService.updateSummaryConfig({
            individualSummaryEnabled, 
            aggregateSummaryEnabled,
            individualUserSettings
        });
        
        res.json({
            success: true,
            config: updatedConfig
        });
    } catch (error) {
        logger.error('Summary configuration update error:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการอัปเดตการตั้งค่าการสรุป',
            error: error.message
        });
    }
});

router.get('/prompt-templates', async (req, res) => {
    try {
        const templates = await emailService.getPromptTemplates();
        res.json({
            success: true,
            templates
        });
    } catch (error) {
        logger.error('Get prompt templates error:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการดึงเทมเพลต prompt',
            error: error.message
        });
    }
});

// Update Individual Summary Prompt
router.post('/prompt-templates/individual', async (req, res) => {
    try {
        const { template } = req.body;
        if (!template) {
            return res.status(400).json({
                success: false,
                message: 'ต้องระบุเทมเพลต prompt'
            });
        }

        const updatedTemplate = await emailService.updateIndividualSummaryPrompt(template);
        res.json({
            success: true,
            template: updatedTemplate
        });
    } catch (error) {
        logger.error('Update individual prompt template error:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการอัปเดตเทมเพลต prompt',
            error: error.message
        });
    }
});

// Update Aggregate Summary Prompt
router.post('/prompt-templates/aggregate', async (req, res) => {
    try {
        const { template } = req.body;
        if (!template) {
            return res.status(400).json({
                success: false,
                message: 'ต้องระบุเทมเพลต prompt'
            });
        }

        const updatedTemplate = await emailService.updateAggregateSummaryPrompt(template);
        res.json({
            success: true,
            template: updatedTemplate
        });
    } catch (error) {
        logger.error('Update aggregate prompt template error:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการอัปเดตเทมเพลต prompt',
            error: error.message
        });
    }
});

    // Get Summary Configuration
    router.get('/summary-config', async (req, res) => {
        try {
            const config = await emailService.summaryConfig;
            res.json({
                success: true,
                config
            });
        } catch (error) {
            logger.error('Get summary configuration error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการดึงการตั้งค่าการสรุป',
                error: error.message
            });
        }
    });

    // Toggle Individual User Summary
    router.post('/toggle-user-summary', async (req, res) => {
        try {
            const { userId, enabled } = req.body;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'ต้องระบุ userId'
                });
            }

            const currentConfig = await emailService.summaryConfig;
            const updatedConfig = await emailService.updateSummaryConfig({
                individualUserSettings: {
                    ...currentConfig.individualUserSettings,
                    [userId]: enabled
                }
            });
            
            res.json({
                success: true,
                config: updatedConfig,
                userSetting: {
                    userId,
                    enabled
                }
            });
        } catch (error) {
            logger.error('Toggle user summary error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะการสรุปผู้ใช้',
                error: error.message
            });
        }
    });

    // Update Default Email Settings
    router.post('/default-settings', async (req, res) => {
        try {
            const updatedSettings = await emailService.updateDefaultSettings(req.body);
            
            res.json({
                success: true,
                message: 'บันทึกการตั้งค่าเรียบร้อยแล้ว',
                settings: {
                    ...updatedSettings,
                    senderPassword: undefined
                }
            });
        } catch (error) {
            logger.error('Update default settings error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า',
                error: error.message
            });
        }
    });

    // Get Default Email Settings
    router.get('/default-settings', async (req, res) => {
        try {
            const settings = await emailService.defaultSettings;
            res.json({
                success: true,
                settings: {
                    ...settings,
                    senderPassword: undefined
                }
            });
        } catch (error) {
            logger.error('Get default settings error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการโหลดการตั้งค่าเริ่มต้น',
                error: error.message
            });
        }
    });

    // Get Summary History
    router.get('/summary-history', async (req, res) => {
        try {
            const historyDir = resolveDataPath('summary_history');
            const historyFiles = await fs.readdir(historyDir);
            
            const histories = await Promise.all(
                historyFiles
                    .filter(file => file.endsWith('.json'))
                    .map(async (file) => {
                        const filePath = path.join(historyDir, file);
                        const content = await fs.readFile(filePath, 'utf8');
                        return {
                            filename: file,
                            timestamp: file.replace('.json', '').replace('summary_', ''),
                            content: JSON.parse(content)
                        };
                    })
            );

            res.json({
                success: true,
                histories: histories.sort((a, b) => 
                    new Date(b.timestamp) - new Date(a.timestamp)
                )
            });
        } catch (error) {
            logger.error('Get summary history error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการดึงประวัติการสรุป',
                error: error.message
            });
        }
    });

    // Scheduler Status
    router.get('/scheduler-status', async (req, res) => {
        try {
            const status = {
                scheduledJobs: Array.from(emailService.scheduledJobs.entries()).map(([time, job]) => ({
                    time,
                    nextInvocation: job.nextInvocation()
                })),
                defaultSettings: emailService.defaultSettings,
                timestamp: new Date().toISOString()
            };

            res.json({
                success: true,
                ...status
            });
        } catch (error) {
            logger.error('Scheduler status error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการดึงสถานะตัวจัดกำหนดการ',
                error: error.message
            });
        }
    });

    // Health Check
    router.get('/health', (req, res) => {
        try {
            const status = {
                status: 'ok',
                timestamp: new Date().toISOString(),
                schedulerActive: emailService.scheduledJobs.size > 0,
                emailConfigured: !!emailService.transporter
            };

            res.json(status);
        } catch (error) {
            logger.error('Health check error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการตรวจสอบระบบ',
                error: error.message
            });
        }
    });

    // Global Error Handler
    router.use((err, req, res, next) => {
        logger.error('Unhandled email route error:', err);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    });

    // 404 Handler
    router.use((req, res) => {
        res.status(404).json({
            success: false,
            message: 'ไม่พบ API endpoint ที่ร้องขอ'
        });
    });

    return router;
};
