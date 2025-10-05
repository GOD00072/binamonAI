// settingsManager.js
const fs = require('fs').promises;
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../..');
const SETTINGS_DIR = path.join(ROOT_DIR, 'data');

class SettingsManager {
    constructor(logger) {
        this.logger = logger;
        this.settingsPath = path.join(SETTINGS_DIR, 'settings.json');
        this.settings = null;
        this.defaultSettings = {
            system: {
                geminiApiKey: process.env.GEMINI_API_KEY || '',
                lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
            },
            ai: {
                modelName: "gemini-2.5-pro",
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.9,
                    maxOutputTokens: 1999
                },
                costConfig: {
                    rates: {
                        input: { normal: 1.25, ๆlong: 2.50 },
                        output: { normal: 5.00, long: 10.00 },
                        caching: { normal: 0.3125, long: 0.625 }
                    },
                    longPromptThreshold: 128000
                },
                templates: {    
                    conversation: 
                        "คุณเป็นผู้ช่วยขายสินค้า มีข้อมูลสินค้าดังนี้:\n" +
                        "${productContext}\n\n" +
                        "คำถามจากลูกค้า: ${query}\n\n" +
                        "กรุณาตอบคำถามโดยใช้ข้อมูลสินค้าที่มีให้ ตอบอย่างสุภาพและเป็นกันเอง\n" +
                        "${newProducts.length > 0 ? 'กรุณาแนะนำสินค้าใหม่ที่เกี่ยวข้องก่อน' : ''}",
                    product: 
                        "ชื่อสินค้า: ${product_name}\n" +
                        "${short_description ? 'คำอธิบายสั้น: ' + short_description : ''}\n" +
                        "ราคา: ${price}\n" +
                        "${voodoo_pricing ? 'ราคาพิเศษ: ' + formatVoodooPricing(voodoo_pricing) : ''}\n" +
                        "${details ? 'รายละเอียด: ' + details : ''}\n" +
                        "${compatible_products ? 'สินค้าที่ใช้ร่วมกันได้: ' + formatArray(compatible_products) : ''}\n" +
                        "${related_products ? 'สินค้าที่เกี่ยวข้อง: ' + formatArray(related_products) : ''}\n" +
                        "${usage ? 'การใช้งาน: ' + usage : ''}"
                }
            },
            products: {
                maxResults: 5,
                indexName: process.env.PINECONE_INDEX_NAME || '',
                cache: {
                    productTTL: 300,
                    sentProductsTTL: 86400
                }
            },
            messageHandler: {
                processingTimeout: 10000,
                messageHistoryTTL: 3600000,
                maxRetries: 3,
                retryDelay: 1000,
                batchSize: 10,
                aggregation: {
                    delay: 12000,
                    maxTime: 30000,
                    minGap: 500
                }
            }
        };
    }

    async initialize() {
        try {
            await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
            
            try {
                const data = await fs.readFile(this.settingsPath, 'utf8');
                this.settings = JSON.parse(data);
                
                // Update environment variables if they exist in settings
                if (this.settings.system) {
                    if (this.settings.system.geminiApiKey) {
                        process.env.GEMINI_API_KEY = this.settings.system.geminiApiKey;
                    }
                    if (this.settings.system.lineChannelAccessToken) {
                        process.env.LINE_CHANNEL_ACCESS_TOKEN = this.settings.system.lineChannelAccessToken;
                    }
                }
                
                this.logger.info('Settings loaded successfully');
            } catch (error) {
                if (error.code === 'ENOENT') {
                    this.logger.info('Settings file not found, creating with defaults');
                    this.settings = this.defaultSettings;
                    await this.saveSettings();
                } else {
                    throw error;
                }
            }
            
            return this.settings;
        } catch (error) {
            this.logger.error('Error initializing settings:', error);
            throw error;
        }
    }

    async saveSettings() {
        try {
            // Update system settings with current env variables
            this.settings.system = {
                ...this.settings.system,
                geminiApiKey: process.env.GEMINI_API_KEY,
                lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
            };
            
            await fs.writeFile(
                this.settingsPath,
                JSON.stringify(this.settings, null, 2),
                'utf8'
            );
            this.logger.info('Settings saved successfully');
            return true;
        } catch (error) {
            this.logger.error('Error saving settings:', error);
            throw error;
        }
    }

    async updateSystemSettings(settings) {
        try {
            this.settings.system = {
                ...this.settings.system,
                ...settings
            };

            // Update environment variables
            if (settings.geminiApiKey) {
                process.env.GEMINI_API_KEY = settings.geminiApiKey;
            }
            if (settings.lineChannelAccessToken) {
                process.env.LINE_CHANNEL_ACCESS_TOKEN = settings.lineChannelAccessToken;
            }

            await this.saveSettings();
            return this.settings.system;
        } catch (error) {
            this.logger.error('Error updating system settings:', error);
            throw error;
        }
    }

    async updateAISettings(settings) {
        try {
            // Special handling for templates
            if (settings.templates) {
                this.settings.ai.templates = {
                    ...this.settings.ai.templates,
                    ...settings.templates
                };
                delete settings.templates;
            }

            this.settings.ai = {
                ...this.settings.ai,
                ...settings
            };

            await this.saveSettings();
            return this.settings.ai;
        } catch (error) {
            this.logger.error('Error updating AI settings:', error);
            throw error;
        }
    }

    async updateTemplates(templates) {
        try {
            this.settings.ai.templates = {
                ...this.settings.ai.templates,
                ...templates
            };
            await this.saveSettings();
            return this.settings.ai.templates;
        } catch (error) {
            this.logger.error('Error updating templates:', error);
            throw error;
        }
    }

    async updateProductSettings(settings) {
        try {
            this.settings.products = {
                ...this.settings.products,
                ...settings
            };
            await this.saveSettings();
            return this.settings.products;
        } catch (error) {
            this.logger.error('Error updating product settings:', error);
            throw error;
        }
    }

    async updateMessageHandlerSettings(settings) {
        try {
            this.settings.messageHandler = {
                ...this.settings.messageHandler,
                ...settings
            };
            await this.saveSettings();
            return this.settings.messageHandler;
        } catch (error) {
            this.logger.error('Error updating message handler settings:', error);
            throw error;
        }
    }

    getSettings() {
        return this.settings;
    }

    async resetToDefaults() {
        try {
            this.settings = {
                ...this.defaultSettings,
                system: {
                    ...this.defaultSettings.system,
                    geminiApiKey: process.env.GEMINI_API_KEY,
                    lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
                }
            };
            await this.saveSettings();
            return this.settings;
        } catch (error) {
            this.logger.error('Error resetting settings to defaults:', error);
            throw error;
        }
    }
}

module.exports = SettingsManager;
