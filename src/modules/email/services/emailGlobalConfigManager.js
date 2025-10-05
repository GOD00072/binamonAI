const path = require('path');
const fs = require('fs').promises;
const nodemailer = require('nodemailer');

class EmailGlobalConfigManager {
    constructor(logger) {
        this.logger = logger;
        this.configDir = path.join(__dirname, '..', 'data', 'global_configs');
        this.configPath = path.join(this.configDir, 'email_global_config.json');
        
        this.defaultConfig = {
            emailSettings: {
                defaultSenderEmail: process.env.EMAIL_USER || '',
                defaultRecipientEmail: process.env.RECIPIENT_EMAIL || '',
                smtpConfig: {
                    service: 'gmail',
                    host: 'smtp.gmail.com',
                    port: 587,
                    secure: false
                },
                credentialsConfigured: false
            },
            
            summarySettings: {
                minFileSizeKB: 10,
                maxHistoryDays: 7,
                defaultFormat: 'detailed',
                maxSummaryLength: 2000,
                supportedFormats: [
                    'brief', 
                    'detailed', 
                    'comprehensive'
                ]
            },
            
            countdownSettings: {
                defaultDuration: 300,
                minDuration: 60,
                maxDuration: 1800
            },
            
            serviceRestrictions: {
                maxCustomEmails: 5,
                maxEmailsPerDay: 10,
                allowCustomSubjects: true,
                allowCustomFooters: true
            },
            
            loggingSettings: {
                enableEmailSendLogging: true,
                retainLogDays: 30
            },
            
            securitySettings: {
                requireEmailVerification: false,
                maxFailedSendAttempts: 3
            }
        };
    }

    async ensureDirectoryExists() {
        try {
            await fs.mkdir(this.configDir, { recursive: true });
        } catch (error) {
            this.logger.error('Error creating global config directory:', error);
        }
    }

    async loadConfig() {
        try {
            await this.ensureDirectoryExists();
            
            try {
                await fs.access(this.configPath);
            } catch {
                await this.saveConfig(this.defaultConfig);
                return this.defaultConfig;
            }

            const configData = await fs.readFile(this.configPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            this.logger.error('Error loading global email config:', error);
            return this.defaultConfig;
        }
    }

    async saveConfig(config) {
        try {
            await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
            return true;
        } catch (error) {
            this.logger.error('Error saving global email config:', error);
            return false;
        }
    }

    validateConfigUpdates(updates) {
        const errors = [];

        if (updates.emailSettings) {
            const emailSettings = updates.emailSettings;
            if (emailSettings.defaultSenderEmail && 
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailSettings.defaultSenderEmail)) {
                errors.push('อีเมลผู้ส่งไม่ถูกต้อง');
            }
            if (emailSettings.defaultRecipientEmail && 
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailSettings.defaultRecipientEmail)) {
                errors.push('อีเมลผู้รับไม่ถูกต้อง');
            }
        }

        if (updates.summarySettings) {
            const summarySets = updates.summarySettings;
            if (summarySets.minFileSizeKB !== undefined && 
                (typeof summarySets.minFileSizeKB !== 'number' || summarySets.minFileSizeKB < 0)) {
                errors.push('ขนาดไฟล์ขั้นต่ำไม่ถูกต้อง');
            }
            if (summarySets.maxHistoryDays !== undefined && 
                (typeof summarySets.maxHistoryDays !== 'number' || summarySets.maxHistoryDays < 1 || summarySets.maxHistoryDays > 30)) {
                errors.push('จำนวนวันประวัติการสนทนาไม่ถูกต้อง');
            }
        }

        if (updates.countdownSettings) {
            const countdownSets = updates.countdownSettings;
            if (countdownSets.defaultDuration !== undefined) {
                const duration = countdownSets.defaultDuration;
                if (typeof duration !== 'number' || 
                    duration < this.defaultConfig.countdownSettings.minDuration || 
                    duration > this.defaultConfig.countdownSettings.maxDuration) {
                    errors.push('ระยะเวลานับถอยหลังไม่ถูกต้อง');
                }
            }
        }

        if (updates.serviceRestrictions) {
            const serviceSets = updates.serviceRestrictions;
            if (serviceSets.maxCustomEmails !== undefined && 
                (typeof serviceSets.maxCustomEmails !== 'number' || 
                 serviceSets.maxCustomEmails < 1 || 
                 serviceSets.maxCustomEmails > 10)) {
                errors.push('จำนวนอีเมลที่กำหนดเองไม่ถูกต้อง');
            }
        }

        return errors;
    }

    async updateConfig(updates) {
        try {
            const validationErrors = this.validateConfigUpdates(updates);
            if (validationErrors.length > 0) {
                throw new Error(validationErrors.join(', '));
            }

            const currentConfig = await this.loadConfig();
            const updatedConfig = this.deepMerge(currentConfig, updates);
            const saveSuccess = await this.saveConfig(updatedConfig);
            return saveSuccess ? updatedConfig : false;
        } catch (error) {
            this.logger.error('Error updating global email config:', error);
            return false;
        }
    }

    deepMerge(target, source) {
        const output = { ...target };
        
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = this.deepMerge(target[key], source[key]);
                    }
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        
        return output;
    }

    isObject(item) {
        return (item && typeof item === 'object' && !Array.isArray(item));
    }

    async getConfigSection(section) {
        const config = await this.loadConfig();
        return config[section] || {};
    }

    async updateConfigSection(section, updates) {
        const sectionUpdates = { [section]: updates };
        return await this.updateConfig(sectionUpdates);
    }

    async validateEmailCredentials(email, password) {
        if (!email || !password) {
            return {
                valid: false,
                message: 'กรุณาระบุอีเมลและรหัสผ่าน'
            };
        }

        if (!/^[^\s@]+@gmail\.com$/.test(email)) {
            return {
                valid: false,
                message: 'ต้องใช้อีเมล Gmail เท่านั้น'
            };
        }

        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: email,
                    pass: password
                },
                secure: false,
                requireTLS: true
            });

            await new Promise((resolve, reject) => {
                transporter.verify((error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });

            return {
                valid: true,
                message: 'ตรวจสอบอีเมลสำเร็จ'
            };
        } catch (error) {
            this.logger.error('Email credential validation error:', error);
            return {
                valid: false,
                message: 'ไม่สามารถเชื่อมต่ออีเมลได้ กรุณาตรวจสอบข้อมูลอีก'
            };
        }
    }

    async updateEmailCredentials(email, password) {
        try {
            const validationResult = await this.validateEmailCredentials(email, password);
            
            if (!validationResult.valid) {
                return {
                    success: false,
                    message: validationResult.message
                };
            }

            const currentConfig = await this.loadConfig();

            const updatedConfig = {
                ...currentConfig,
                emailSettings: {
                    ...currentConfig.emailSettings,
                    defaultSenderEmail: email,
                    credentialsConfigured: true
                }
            };

            const saveSuccess = await this.saveConfig(updatedConfig);

            if (saveSuccess) {
                process.env.EMAIL_USER = email;
                process.env.EMAIL_PASS = password;

                return {
                    success: true,
                    message: 'อัปเดตข้อมูลอีเมลสำเร็จ'
                };
            } else {
                return {
                    success: false,
                    message: 'ไม่สามารถบันทึกการตั้งค่าอีเมลได้'
                };
            }
        } catch (error) {
            this.logger.error('Error updating email credentials:', error);
            return {
                success: false,
                message: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูลอีเมล'
            };
        }
    }

    async areEmailCredentialsConfigured() {
        const config = await this.loadConfig();
        return config.emailSettings.credentialsConfigured === true;
    }

    async resetEmailCredentials() {
        try {
            const currentConfig = await this.loadConfig();

            const updatedConfig = {
                ...currentConfig,
                emailSettings: {
                    ...currentConfig.emailSettings,
                    defaultSenderEmail: '',
                    credentialsConfigured: false
                }
            };

            const saveSuccess = await this.saveConfig(updatedConfig);

            if (saveSuccess) {
                delete process.env.EMAIL_USER;
                delete process.env.EMAIL_PASS;

                return {
                    success: true,
                    message: 'รีเซ็ตข้อมูลอีเมลสำเร็จ'
                };
            } else {
                return {
                    success: false,
                    message: 'ไม่สามารถรีเซ็ตการตั้งค่าอีเมลได้'
                };
            }
        } catch (error) {
            this.logger.error('Error resetting email credentials:', error);
            return {
                success: false,
                message: 'เกิดข้อผิดพลาดในการรีเซ็ตข้อมูลอีเมล'
            };
        }
    }
}

module.exports = EmailGlobalConfigManager;