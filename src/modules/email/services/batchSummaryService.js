const { GoogleGenerativeAI } = require('@google/generative-ai');
const schedule = require('node-schedule');
const path = require('path');
const fs = require('fs').promises;
const _ = require('lodash');

class BatchSummaryService {
    constructor(configManager, globalConfigManager, chatHistory, emailService, logger) {
        this.configManager = configManager;
        this.globalConfigManager = globalConfigManager;
        this.chatHistory = chatHistory;
        this.emailService = emailService;
        this.logger = logger;
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // Scheduled jobs management
        this.scheduledJobs = new Map();
        this.summaryDir = path.join(__dirname, '..', 'data', 'summaries');
        
        // Initialize directories
        this.initialize();
    }

    async initialize() {
        try {
            await fs.mkdir(this.summaryDir, { recursive: true });
            this.logger.info('BatchSummaryService initialized successfully');
        } catch (error) {
            this.logger.error('Error initializing BatchSummaryService:', error);
            throw error;
        }
    }

    async scheduleGlobalSummary(cronExpression, minKbSize, recipients, options = {}) {
        try {
            const jobId = `global_summary_${Date.now()}`;
            
            const job = schedule.scheduleJob(cronExpression, async () => {
                try {
                    this.logger.info(`Starting scheduled summary job: ${jobId}`);
                    
                    const summary = await this.generateGlobalSummary(minKbSize, options);
                    if (summary) {
                        const emailResults = await this.sendSummaryEmails(summary, recipients);
                        
                        await this.saveSummaryResults(jobId, {
                            summary,
                            emailResults,
                            timestamp: new Date(),
                            recipients
                        });
                    }
                } catch (error) {
                    this.logger.error(`Error in scheduled summary job ${jobId}:`, error);
                }
            });

            this.scheduledJobs.set(jobId, {
                job,
                config: {
                    cronExpression,
                    minKbSize,
                    recipients,
                    options
                }
            });

            this.logger.info(`Scheduled new summary job: ${jobId}`);
            return jobId;
        } catch (error) {
            this.logger.error('Error scheduling global summary:', error);
            throw error;
        }
    }

    async generateGlobalSummary(minKbSize, options = {}) {
        try {
            const users = await this.getAllActiveUsers();
            const summaries = [];
            let totalSize = 0;

            for (const user of users) {
                const fileSize = await this.chatHistory.getFileSize(user.userId);
                
                if (fileSize >= minKbSize) {
                    const userSummary = await this.generateUserSummary(user.userId, options);
                    if (userSummary) {
                        summaries.push({
                            ...userSummary,
                            fileSize
                        });
                        totalSize += fileSize;
                    }
                }
            }

            if (summaries.length === 0) {
                this.logger.info('No users meet the minimum size requirement');
                return null;
            }

            const globalSummary = await this.aggregateUserSummaries(summaries);
            const htmlContent = this.generateHtmlSummary(globalSummary);

            // Save summary to file
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const summaryPath = path.join(this.summaryDir, `global_summary_${timestamp}.html`);
            await fs.writeFile(summaryPath, htmlContent);

            return {
                summaryPath,
                htmlContent,
                totalUsers: summaries.length,
                totalSize,
                timestamp: new Date(),
                summaries: globalSummary
            };
        } catch (error) {
            this.logger.error('Error generating global summary:', error);
            throw error;
        }
    }

    async generateUserSummary(userId, options = {}) {
        try {
            const chatHistory = await this.chatHistory.loadAPIChatHistory(userId);
            if (!chatHistory?.messages?.length) {
                return null;
            }

            const userProfile = await this.getUserProfile(userId);
            const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });

            const activityStats = this.analyzeUserActivity(chatHistory.messages);
            const topicAnalysis = await this.analyzeTopics(chatHistory.messages);
            const interactionPatterns = this.analyzeInteractionPatterns(chatHistory.messages);

            // Generate AI summary
            const summaryPrompt = this.createSummaryPrompt({
                userProfile,
                activityStats,
                topicAnalysis,
                interactionPatterns,
                messages: chatHistory.messages
            });

            const result = await model.generateContent(summaryPrompt);

            return {
                userId,
                userProfile,
                activityStats,
                topicAnalysis,
                interactionPatterns,
                summary: result.response.text(),
                timestamp: new Date()
            };
        } catch (error) {
            this.logger.error(`Error generating summary for user ${userId}:`, error);
            return null;
        }
    }

    analyzeUserActivity(messages) {
        const timestamps = messages.map(m => new Date(m.timestamp));
        const uniqueDays = new Set(timestamps.map(t => t.toDateString()));
        const messagesByRole = _.groupBy(messages, 'role');
        
        const responseTimesMs = [];
        for (let i = 1; i < messages.length; i++) {
            if (messages[i].role === 'assistant' && messages[i-1].role === 'user') {
                responseTimesMs.push(messages[i].timestamp - messages[i-1].timestamp);
            }
        }

        return {
            totalMessages: messages.length,
            messagesByRole: {
                user: messagesByRole.user?.length || 0,
                assistant: messagesByRole.assistant?.length || 0,
                system: messagesByRole.system?.length || 0
            },
            timespan: {
                start: new Date(Math.min(...timestamps)),
                end: new Date(Math.max(...timestamps))
            },
            activeDays: uniqueDays.size,
            averageMessagesPerDay: messages.length / uniqueDays.size,
            responseMetrics: {
                averageResponseTime: responseTimesMs.length > 0 ? 
                    _.mean(responseTimesMs) : 0,
                minResponseTime: responseTimesMs.length > 0 ? 
                    _.min(responseTimesMs) : 0,
                maxResponseTime: responseTimesMs.length > 0 ? 
                    _.max(responseTimesMs) : 0
            }
        };
    }

    async analyzeTopics(messages) {
        try {
            const userMessages = messages
                .filter(m => m.role === 'user')
                .map(m => m.content)
                .join('\n');

            const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
            const result = await model.generateContent(`
                Analyze these chat messages and identify:
                1. Main topics discussed
                2. Frequently mentioned products or services
                3. Key customer interests and concerns
                4. Notable patterns or trends
                
                Messages:
                ${userMessages}
            `);

            return {
                analysis: result.response.text(),
                messageCount: messages.length,
                timestamp: new Date()
            };
        } catch (error) {
            this.logger.error('Error analyzing topics:', error);
            return {
                analysis: 'ไม่สามารถวิเคราะห์หัวข้อได้',
                messageCount: messages.length,
                timestamp: new Date()
            };
        }
    }

    analyzeInteractionPatterns(messages) {
        const hourlyDistribution = new Array(24).fill(0);
        const dailyDistribution = new Array(7).fill(0);
        const messageSequences = [];
        
        messages.forEach(msg => {
            const date = new Date(msg.timestamp);
            hourlyDistribution[date.getHours()]++;
            dailyDistribution[date.getDay()]++;
        });

        // Analyze message sequences
        for (let i = 0; i < messages.length - 1; i++) {
            messageSequences.push({
                from: messages[i].role,
                to: messages[i + 1].role,
                timeDiff: messages[i + 1].timestamp - messages[i].timestamp
            });
        }

        return {
            hourlyDistribution,
            dailyDistribution,
            peakHours: this.findPeakHours(hourlyDistribution),
            busyDays: this.findBusyDays(dailyDistribution),
            conversationFlow: this.analyzeConversationFlow(messageSequences)
        };
    }

    findPeakHours(distribution) {
        const threshold = Math.max(...distribution) * 0.7;
        return distribution
            .map((count, hour) => ({ hour, count }))
            .filter(({ count }) => count >= threshold)
            .map(({ hour }) => hour)
            .sort();
    }

    findBusyDays(distribution) {
        const threshold = Math.max(...distribution) * 0.7;
        return distribution
            .map((count, day) => ({ day, count }))
            .filter(({ count }) => count >= threshold)
            .map(({ day }) => day)
            .sort();
    }

    analyzeConversationFlow(sequences) {
        const flows = _.groupBy(sequences, seq => `${seq.from}->${seq.to}`);
        const averageTimings = {};

        Object.entries(flows).forEach(([pattern, instances]) => {
            averageTimings[pattern] = _.mean(instances.map(inst => inst.timeDiff));
        });

        return {
            patterns: Object.keys(flows).map(pattern => ({
                pattern,
                count: flows[pattern].length,
                averageResponseTime: averageTimings[pattern]
            })),
            mostCommon: _.maxBy(Object.entries(flows), ([, instances]) => instances.length)?.[0]
        };
    }

    async aggregateUserSummaries(summaries) {
        const totalUsers = summaries.length;
        const totalMessages = _.sumBy(summaries, s => s.activityStats.totalMessages);
        const allTopics = summaries.map(s => s.topicAnalysis.analysis).join('\n\n');

        // Generate global topics analysis
        const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
        const globalTopicsResult = await model.generateContent(`
            Analyze and summarize the main trends and patterns across all users:
            ${allTopics}
        `);

        const timeRange = {
            start: new Date(Math.min(...summaries.map(s => s.activityStats.timespan.start))),
            end: new Date(Math.max(...summaries.map(s => s.activityStats.timespan.end)))
        };

        // Calculate aggregate metrics
        const aggregateMetrics = {
            averageMessagesPerUser: totalMessages / totalUsers,
            averageActiveDays: _.meanBy(summaries, s => s.activityStats.activeDays),
            averageResponseTime: _.meanBy(summaries, 
                s => s.activityStats.responseMetrics.averageResponseTime
            ),
            totalFileSize: _.sumBy(summaries, 'fileSize')
        };

        return {
            totalUsers,
            totalMessages,
            timeRange,
            aggregateMetrics,
            globalTopics: globalTopicsResult.response.text(),
            userSummaries: summaries
        };
    }

    generateHtmlSummary(globalSummary) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {
                        font-family: 'Helvetica Neue', Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        max-width: 1200px;
                        margin: 0 auto;
                        padding: 20px;
                    }
                    .header {
                        background: #f8f9fa;
                        padding: 20px;
                        border-radius: 8px;
                        margin-bottom: 30px;
                    }
                    .stats-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: 20px;
                        margin-bottom: 30px;
                    }
                    .stat-card {
                        background: white;
                        padding: 20px;
                        border-radius: 8px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    .user-summary {
                        background: white;
                        padding: 20px;
                        border-radius: 8px;
                        margin-bottom: 20px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    .global-topics {
                        background: #f8f9fa;
                        padding: 20px;
                        border-radius: 8px;
                        margin-bottom: 30px;
                    }
                    h1, h2, h3 {
                        color: #2c3e50;
                    }
                    .metrics {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 10px;
                    }
                    .chart {
                        width: 100%;
                        height: 300px;
                        margin: 20px 0;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>รายงานสรุปการสนทนาทั้งหมด</h1>
                    <p>สร้างเมื่อ: ${new Date().toLocaleString('th-TH')}</p>
                </div>

                <div class="stats-grid">
                    <div class="stat-card">
                        <h3>ข้อมูลทั่วไป</h3>
                        <div class="metrics">
                            <p>จำนวนผู้ใช้: ${globalSummary.totalUsers}</p>
                            <p>จำนวนข้อความ: ${globalSummary.totalMessages}</p>
                            <p>ขนาดข้อมูล: ${(globalSummary.aggregateMetrics.totalFileSize / 1024).toFixed(2)} MB</p>
                            <p>จำนวนวันเฉลี่ย: ${Math.round(globalSummary.aggregateMetrics.averageActiveDays)}</p>
                        </div>
                    </div>
                    <div class="stat-card">
                        <h3>ช่วงเวลา</h3>
                        <div class="metrics">
                            <p>เริ่มต้น: ${globalSummary.timeRange.start.toLocaleDateString('th-TH')}</p>
                            <p>สิ้นสุด: ${globalSummary.timeRange.end.toLocaleDateString('th-TH')}</p>
                        </div>
                    </div>

                    <div class="stat-card">
                        <h3>ประสิทธิภาพ</h3>
                        <div class="metrics">
                            <p>ข้อความต่อผู้ใช้: ${Math.round(globalSummary.aggregateMetrics.averageMessagesPerUser)}</p>
                            <p>เวลาตอบกลับเฉลี่ย: ${Math.round(globalSummary.aggregateMetrics.averageResponseTime / 1000)} วินาที</p>
                        </div>
                    </div>
                </div>

                <div class="global-topics">
                    <h2>การวิเคราะห์ภาพรวม</h2>
                    ${globalSummary.globalTopics.split('\n').map(para => `<p>${para}</p>`).join('')}
                </div>

                <h2>สรุปรายบุคคล</h2>
                ${globalSummary.userSummaries.map(user => this.generateUserSummaryHtml(user)).join('')}
            </body>
            </html>
        `;
    }

    generateUserSummaryHtml(userSummary) {
        return `
            <div class="user-summary">
                <div class="user-header">
                    <h3>${userSummary.userProfile.displayName || 'ผู้ใช้งาน'}</h3>
                    <p>Line ID: ${userSummary.userId}</p>
                </div>

                <div class="metrics">
                    <div>
                        <h4>สถิติการใช้งาน</h4>
                        <ul>
                            <li>จำนวนข้อความ: ${userSummary.activityStats.totalMessages}</li>
                            <li>จำนวนวันที่ใช้งาน: ${userSummary.activityStats.activeDays}</li>
                            <li>ข้อความต่อวัน: ${Math.round(userSummary.activityStats.averageMessagesPerDay)}</li>
                        </ul>
                    </div>

                    <div>
                        <h4>ช่วงเวลาที่ใช้งานบ่อย</h4>
                        <ul>
                            <li>ชั่วโมงที่ใช้งานมาก: ${this.formatHours(userSummary.interactionPatterns.peakHours)}</li>
                            <li>วันที่ใช้งานมาก: ${this.formatDays(userSummary.interactionPatterns.busyDays)}</li>
                        </ul>
                    </div>
                </div>

                <div class="topics">
                    <h4>หัวข้อที่สนใจ</h4>
                    ${userSummary.topicAnalysis.analysis.split('\n').map(topic => `<p>${topic}</p>`).join('')}
                </div>

                <div class="summary">
                    <h4>สรุปการสนทนา</h4>
                    ${userSummary.summary.split('\n').map(para => `<p>${para}</p>`).join('')}
                </div>
            </div>
        `;
    }

    async saveSummaryResults(jobId, results) {
        try {
            const resultPath = path.join(this.summaryDir, `${jobId}_results.json`);
            await fs.writeFile(resultPath, JSON.stringify(results, null, 2));
            return true;
        } catch (error) {
            this.logger.error(`Error saving summary results for job ${jobId}:`, error);
            return false;
        }
    }

    async getAllActiveUsers() {
        try {
            const userFiles = await fs.readdir(path.join(__dirname, '..', 'data', 'chat_histories_api'));
            return userFiles
                .filter(file => file.endsWith('.json'))
                .map(file => ({ userId: file.replace('.json', '') }));
        } catch (error) {
            this.logger.error('Error getting active users:', error);
            return [];
        }
    }

    async getUserProfile(userId) {
        try {
            const response = await axios.get(`https://api.line.me/v2/bot/profile/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
                }
            });
            return response.data;
        } catch (error) {
            this.logger.error(`Error getting user profile for ${userId}:`, error);
            return {
                displayName: 'Unknown User',
                userId
            };
        }
    }

    formatHours(hours) {
        return hours.map(hour => `${hour}:00`).join(', ');
    }

    formatDays(days) {
        const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
        return days.map(day => dayNames[day]).join(', ');
    }

    async sendSummaryEmails(summary, recipients) {
        const results = [];
        for (const recipient of recipients) {
            try {
                const result = await this.emailService.sendEmail(
                    'global_summary',
                    summary.htmlContent,
                    recipient.email,
                    'รายงานสรุปการสนทนาประจำวัน'
                );
                results.push({
                    email: recipient.email,
                    success: true,
                    message: result.message
                });
            } catch (error) {
                this.logger.error(`Error sending summary email to ${recipient.email}:`, error);
                results.push({
                    email: recipient.email,
                    success: false,
                    message: error.message
                });
            }
        }
        return results;
    }

    getScheduledJobs() {
        return Array.from(this.scheduledJobs.entries()).map(([id, { job, config }]) => ({
            id,
            nextRun: job.nextInvocation(),
            config
        }));
    }

    cancelJob(jobId) {
        const jobInfo = this.scheduledJobs.get(jobId);
        if (jobInfo) {
            jobInfo.job.cancel();
            this.scheduledJobs.delete(jobId);
            this.logger.info(`Cancelled scheduled job: ${jobId}`);
            return true;
        }
        return false;
    }

    createSummaryPrompt(data) {
        return `
        วิเคราะห์และสรุปการสนทนากับผู้ใช้ต่อไปนี้:

        ข้อมูลผู้ใช้:
        - ชื่อ: ${data.userProfile.displayName}
        - Line ID: ${data.userId}

        สถิติการใช้งาน:
        - จำนวนข้อความทั้งหมด: ${data.activityStats.totalMessages}
        - จำนวนวันที่ใช้งาน: ${data.activityStats.activeDays}
        - ข้อความเฉลี่ยต่อวัน: ${Math.round(data.activityStats.averageMessagesPerDay)}
        - เวลาตอบกลับเฉลี่ย: ${Math.round(data.activityStats.responseMetrics.averageResponseTime / 1000)} วินาที

        รูปแบบการใช้งาน:
        - ช่วงเวลาที่ใช้งานมาก: ${this.formatHours(data.interactionPatterns.peakHours)}
        - วันที่ใช้งานมาก: ${this.formatDays(data.interactionPatterns.busyDays)}

        การวิเคราะห์หัวข้อ:
        ${data.topicAnalysis.analysis}

        กรุณาสรุปประเด็นสำคัญต่อไปนี้:
        1. พฤติกรรมการใช้งานโดยรวม
        2. หัวข้อและความสนใจหลัก
        3. รูปแบบการโต้ตอบและการมีส่วนร่วม
        4. ข้อเสนอแนะสำหรับการปรับปรุงการให้บริการ`;
    }
}

module.exports = BatchSummaryService;