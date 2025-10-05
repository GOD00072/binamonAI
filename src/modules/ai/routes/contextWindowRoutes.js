// routes/contextWindowRoutes.js
'use strict';

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs').promises;
const path = require('path');

const prisma = new PrismaClient();

module.exports = (logger) => {
    // Helper function to get ConfigManager default values
    const getConfigManagerDefaults = async () => {
        try {
            const configManagerPath = path.join(__dirname, '..', 'aiservices', 'ConfigManager.js');
            const ConfigManager = require(configManagerPath);
            const tempConfig = new ConfigManager(logger);

            return {
                model_name: tempConfig.MODEL_NAME,
                temperature: tempConfig.generationConfig.temperature,
                max_tokens: tempConfig.generationConfig.maxOutputTokens,
                topK: tempConfig.generationConfig.topK,
                topP: tempConfig.generationConfig.topP
            };
        } catch (error) {
            logger.warn('Could not load ConfigManager defaults, using fallback values');
            return {
                model_name: 'gemini-2.5-pro',
                temperature: 0.7,
                max_tokens: 2000,
                topK: 60,
                topP: 0.6
            };
        }
    };

    // GET /api/context-window - Get context window config
    router.get('/', async (req, res) => {
        try {
            let config = await prisma.contextWindow.findUnique({
                where: { key: 'default' }
            });

            // Create default config if not exists, using ConfigManager values
            if (!config) {
                const defaults = await getConfigManagerDefaults();

                config = await prisma.contextWindow.create({
                    data: {
                        key: 'default',
                        system_prompt: 'คุณคือผู้ช่วยที่ชาญฉลาดในการให้ข้อมูลเกี่ยวกับสินค้า ใช้ข้อมูลจากฐานความรู้และสินค้าเพื่อตอบคำถามอย่างถูกต้องและเป็นประโยชน์',
                        use_product_rag: true,
                        use_knowledge_rag: true,
                        max_context_messages: 10,
                        include_user_history: true,
                        temperature: defaults.temperature,
                        model_name: defaults.model_name,
                        max_tokens: defaults.max_tokens
                    }
                });
            }

            res.json({
                success: true,
                config: config
            });
        } catch (error) {
            logger.error('Error fetching context window config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // PUT /api/context-window - Update context window config
    router.put('/', async (req, res) => {
        try {
            const {
                system_prompt,
                use_product_rag,
                use_knowledge_rag,
                max_context_messages,
                include_user_history,
                temperature,
                model_name,
                max_tokens
            } = req.body;

            const config = await prisma.contextWindow.upsert({
                where: { key: 'default' },
                update: {
                    system_prompt,
                    use_product_rag,
                    use_knowledge_rag,
                    max_context_messages,
                    include_user_history,
                    temperature,
                    model_name,
                    max_tokens
                },
                create: {
                    key: 'default',
                    system_prompt,
                    use_product_rag,
                    use_knowledge_rag,
                    max_context_messages,
                    include_user_history,
                    temperature,
                    model_name,
                    max_tokens
                }
            });

            logger.info('Context window config updated successfully');

            res.json({
                success: true,
                config: config,
                message: 'บันทึกการตั้งค่าสำเร็จ'
            });
        } catch (error) {
            logger.error('Error updating context window config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/context-window/reset - Reset to default (using ConfigManager defaults)
    router.post('/reset', async (req, res) => {
        try {
            const defaults = await getConfigManagerDefaults();

            const config = await prisma.contextWindow.upsert({
                where: { key: 'default' },
                update: {
                    system_prompt: 'คุณคือผู้ช่วยที่ชาญฉลาดในการให้ข้อมูลเกี่ยวกับสินค้า ใช้ข้อมูลจากฐานความรู้และสินค้าเพื่อตอบคำถามอย่างถูกต้องและเป็นประโยชน์',
                    use_product_rag: true,
                    use_knowledge_rag: true,
                    max_context_messages: 10,
                    include_user_history: true,
                    temperature: defaults.temperature,
                    model_name: defaults.model_name,
                    max_tokens: defaults.max_tokens
                },
                create: {
                    key: 'default',
                    system_prompt: 'คุณคือผู้ช่วยที่ชาญฉลาดในการให้ข้อมูลเกี่ยวกับสินค้า ใช้ข้อมูลจากฐานความรู้และสินค้าเพื่อตอบคำถามอย่างถูกต้องและเป็นประโยชน์',
                    use_product_rag: true,
                    use_knowledge_rag: true,
                    max_context_messages: 10,
                    include_user_history: true,
                    temperature: defaults.temperature,
                    model_name: defaults.model_name,
                    max_tokens: defaults.max_tokens
                }
            });

            logger.info('Context window config reset to default (using ConfigManager values)', {
                model_name: defaults.model_name,
                temperature: defaults.temperature,
                max_tokens: defaults.max_tokens
            });

            res.json({
                success: true,
                config: config,
                message: 'รีเซ็ตการตั้งค่าเป็นค่าเริ่มต้นสำเร็จ (อ้างอิงจาก aiAssistant.js ConfigManager)'
            });
        } catch (error) {
            logger.error('Error resetting context window config:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    return router;
};
