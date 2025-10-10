'use strict';

const fs = require('fs').promises;
const path = require('path');
const cld = require('cld'); // เพิ่ม CLD สำหรับตรวจจับภาษา
const prisma = require('../../../../lib/prisma');

class ConfigManager {
    constructor(logger) {
        this.logger = logger;

        // API Version tracking
        this.API_VERSION = "v1";
        this.MODEL_URL = null;
        this.USE_DIRECT_URL = false;

        // Default language - ใช้ภาษาไทยเป็นหลัก
        this.defaultLanguage = 'TH';
        this.supportedLanguages = ['TH', 'EN', 'JP', 'CN', 'KR'];

        // Per-user language management with file storage
        this.userLanguageSettings = new Map();
        this.currentUserId = null;
        this.userLanguageDataPath = path.join(__dirname, '..', 'data', 'user_languages');

        // Global fallback language
        this.globalLanguage = 'TH';

        // Configuration
        this.MODEL_NAME = "gemini-2.5-pro";
        this.generationConfig = {
            temperature: 0.7,
            topK: 60,
            topP: 0.6,
            maxOutputTokens: 35000
        };

        // Cost tracking configuration
        this.costConfig = {
            rates: {
                input: { normal: 1.25, long: 2.50 },
                output: { normal: 5.00, long: 10.00 },
                caching: { normal: 0.3125, long: 0.625 }
            },
            longPromptThreshold: 12120000
        };

        // Enhanced Language detection configuration with CLD
        this.languageDetectionConfig = {
            // Thai detection settings - ตรวจจับทุกคำขั้นต่ำ 1 คำ
            thai: {
                minTextLength: 1, // ตรวจจับทุกคำขั้นต่ำ 1 คำ
                minCharacters: 1, // อย่างน้อย 1 ตัวอักษรไทย
                confidenceThreshold: 0.3,
                characterWeight: 2.0,
                alwaysDetectIfPresent: true,
                fallbackPriority: true
            },
            // English detection settings - เริ่มตรวจเมื่อ 15 คำขึ้นไป
            english: {
                minWords: 15, // เริ่มตรวจเมื่อ 15 คำขึ้นไป
                minTextLength: 50,
                confidenceThreshold: 0.6,
                thaiRatioThreshold: 0.6, // ต้องมากกว่าภาษาไทย 60% ขึ้นไป
                wordRatioThreshold: 0.7,
                englishWordsRatio: 0.5,
                businessWordBonus: 0.2
            },
            // Other languages
            otherLanguages: {
                minTextLength: 20,
                confidenceThreshold: 0.7,
                cldRequiredConfidence: 0.8
            },
            // General settings
            cacheTimeout: 5000,
            lockAfterFirstDetection: true,
            preferThaiLanguage: true,
            fallbackToThai: true,
            
            // CLD specific settings
            useCLD: true,
            cldMinLength: 10,
            cldConfidenceThreshold: 0.6,
            cldLanguageMap: {
                'THAI': 'TH',
                'ENGLISH': 'EN', 
                'CHINESE': 'CN',
                'CHINESE_SIMPLIFIED': 'CN',
                'CHINESE_TRADITIONAL': 'CN',
                'JAPANESE': 'JP',
                'KOREAN': 'KR'
            }
        };

        // Unified Formatter Configuration
        this.unifiedFormatterConfig = {
            enabled: true,
            sections: {
                knowledgeContext: {
                    enabled: true,
                    order: 1,
                    title: {
                        'TH': 'ความรู้ที่เกี่ยวข้อง',
                        'EN': 'Relevant Knowledge',
                        'JP': '関連する知識',
                        'CN': '相关知识',
                        'KR': '관련 지식'
                    },
                    maxResults: 1,
                    scoreThreshold: 0.55,
                    includeConfidence: true,
                    summarizeContent: true,
                    maxContentLength: 500000,
                    groupByCategory: true
                },
                productContext: {
                    enabled: true,
                    order: 2,
                    title: {
                        'TH': 'ข้อมูลสินค้าที่เกี่ยวข้อง',
                        'EN': 'Relevant Product Information',
                        'JP': '関連製品情報',
                        'CN': '相关产品信息',
                        'KR': '관련 제품 정보'
                    },
                    useProductFormatter: true,
                    enhanceWithKnowledge: true
                },
                contextIntegration: {
                    enabled: true,
                    crossReference: true,
                    prioritizeKnowledge: false,
                    combineRelatedContent: true
                }
            },
            formatting: {
                separators: {
                    section: '\n\n---\n\n',
                    subsection: '\n\n',
                    item: '\n'
                },
                indentation: {
                    level1: '',
                    level2: '  • ',
                    level3: '    ◦ '
                },
                confidenceDisplay: {
                    enabled: true,
                    format: '(ความเชื่อมั่น: {confidence}%)',
                    threshold: 0.5
                }
            }
        };

        // Knowledge RAG Configuration - will be loaded from API
        this.knowledgeConfig = {
            enabled: true,
            searchSettings: {
                topK: 5,
                scoreThreshold: 0.25,
                maxContentLength: 200000,
                maxTokens: 80000,
                includeMetadata: true,
                sortBy: 'relevance'
            },
            formatting: {
                maxPreviewLength: 300000,
                includeSource: true,
                includeConfidence: true,
                groupByCategory: true
            },
            integration: {
                withProducts: true,
                enhanceProductData: true,
                crossReference: true
            }
        };

        // Load search settings from API on initialization
        this.loadSearchSettingsFromAPI();

        // Multi-language template configurations - ใช้ไทยเป็นหลัก
        this.languageTemplates = {
            TH: {
                conversation: {
                    personality: 'คุณคือ "เจ้าหงส์" AI Chatbot ผู้เชี่ยวชาญด้านบรรจุภัณฑ์ที่มีประสบการณ์มากกว่า 30 ปี จากบริษัท หงส์ไทยฟู้ดแพคเกจจิ้ง จำกัด',
                    greeting: 'สวัสดีค่ะ เจ้าหงส์ยินดีให้คำปรึกษาเกี่ยวกับบรรจุภัณฑ์นะคะ 🙂',
                    closing: 'หากมีข้อสงสัยเพิ่มเติม สามารถสอบถามได้เลยนะคะ 😊',
                    guidelines: [
                        'ตอบคำถามตรงประเด็น เข้าใจง่าย',
                        'ให้ข้อมูลที่เป็นประโยชน์และครบถ้วน',
                        'แนะนำสินค้าที่เหมาะสมตามความต้องการของลูกค้า',
                        'แจ้งราคาเป็นช่วงตามปริมาณการสั่งซื้อ และช่วงราคาสินค้าสั่งผลิต',
                        'ส่ง url ของสินค้าให้ทุกครั้ง'
                    ]
                }
            },
            EN: {
                conversation: {
                    personality: 'You are "Je-Hong" AI Chatbot, a 70+ year-old Chinese-style female AI chatbot representing Hong Thai Packaging. She\'s an industry veteran in paper packaging, known for her straightforward yet polite and service-minded personality.',
                    greeting: 'Hello! Ms. Hong here, happy to provide consultation about packaging solutions 🙂',
                    closing: 'If you have any further questions, feel free to ask anytime 😊',
                    guidelines: [
                        'Answer questions directly and clearly',
                        'Provide useful and comprehensive information',
                        'Recommend suitable products according to customer needs',
                        'Always provide price ranges based on order quantities and custom production pricing',
                        'Always include product URLs'
                    ]
                }
            },
            JP: {
                conversation: {
                    personality: 'あなたはホンさんです。ホンタイフードパッケージング株式会社の30年以上の経験を持つ紙パッケージングの専門家です。',
                    greeting: 'こんにちは！ホンです。パッケージングに関するご相談をお受けいたします 🙂',
                    closing: 'ご質問がございましたら、いつでもお気軽にお声かけください 😊',
                    guidelines: [
                        '質問に直接的かつ明確に回答する',
                        '有用で包括的な情報を提供する',
                        'お客様のニーズに適した製品を推奨する',
                        '注文数量に基づく価格帯とカスタム生産価格を常に提供する',
                        '製品URLを常に含める'
                    ]
                }
            },
            CN: {
                conversation: {
                    personality: '您是洪女士，来自洪泰食品包装有限公司，拥有超过30年经验的纸质包装专家。',
                    greeting: '您好！我是洪女士，很高兴为您提供包装解决方案咨询 🙂',
                    closing: '如果您有任何进一步的问题，随时欢迎咨询 😊',
                    guidelines: [
                        '直接明确地回答问题',
                        '提供有用和全面的信息',
                        '根据客户需求推荐合适的产品',
                        '始终提供基于订单数量的价格范围和定制生产价格',
                        '始终包含产品URL'
                    ]
                }
            },
            KR: {
                conversation: {
                    personality: '당신은 홍타이푸드패키징 주식회사에서 30년 이상의 경험을 가진 종이 포장 전문가 홍 씨입니다.',
                    greeting: '안녕하세요! 홍입니다. 포장 솔루션에 대한 상담을 도와드리겠습니다 🙂',
                    closing: '추가 질문이 있으시면 언제든지 문의해 주세요 😊',
                    guidelines: [
                        '질문에 직접적이고 명확하게 답변하기',
                        '유용하고 포괄적인 정보 제공하기',
                        '고객 요구에 맞는 적합한 제품 추천하기',
                        '항상 주문 수량에 따른 가격대와 맞춤 생산 가격 제공하기',
                        '항상 제품 URL 포함하기'
                    ]
                }
            }
        };

        // Current template config (defaults to Thai)
        this.templateConfig = this.languageTemplates[this.defaultLanguage];
        
        // Settings file paths

        // Initialize Google AI Models Service
        const GoogleAIModelsService = require('./GoogleAIModelsService');
        this.googleAIModelsService = new GoogleAIModelsService(logger);

        // Language detection cache
        this.userLanguageCache = new Map();

        // Enhanced language-specific keywords for better detection
        this.languageKeywords = {
            TH: [
                // Common Thai words
                'สวัสดี', 'ขอบคุณ', 'กรุณา', 'ค่ะ', 'ครับ', 'ได้', 'ไม่', 'มี', 'เป็น', 'ใน', 'ของ', 'จาก', 'ที่', 'และ', 'หรือ',
                // Business/Product words
                'สินค้า', 'ราคา', 'ซื้อ', 'สั่ง', 'บาท', 'ใบ', 'ชิ้น', 'กล่อง', 'แก้ว', 'กระดาษ', 'บรรจุภัณฑ์',
                // Action words
                'อยาก', 'ต้องการ', 'สอบถาม', 'ปรึกษา', 'ขอ', 'ช่วย', 'บอก', 'แจ้ง', 'ส่ง', 'จัดส่ง',
                // Question words
                'อย่างไร', 'สั่งยังไง', 'วิธี', 'ราคานี้', 'สินค้านี้', 'มั้ย', 'ไหม', 'กี่ชิ้น', 'กี่บาท', 'ยังไง', 'เท่าไหร่'
            ],
            EN: [
                // Common English words
                'hello', 'hi', 'thank', 'thanks', 'please', 'yes', 'no', 'the', 'and', 'or', 'for', 'with', 'in', 'on', 'at', 'by', 'from', 'to', 'of',
                // Verbs
                'is', 'are', 'was', 'were', 'have', 'has', 'had', 'will', 'would', 'can', 'could', 'should', 'may', 'might',
                // Business words
                'product', 'price', 'buy', 'order', 'delivery', 'shipping', 'size', 'color', 'cup', 'paper', 'packaging', 'something', 'website',
                // Corporate terms
                'corporate', 'governance', 'environmental', 'policy', 'management', 'business', 'company', 'organization', 
                'sustainability', 'compliance', 'standards', 'certification', 'quality', 'iso', 'leadership',
                // Question words
                'how', 'what', 'where', 'when', 'why', 'which', 'who', 'much', 'many', 'cost', 'about'
            ],
            JP: [
                'こんにちは', 'ありがとう', 'すみません', 'はい', 'いいえ', 'です', 'ます', 'である', 'ください', 'お願い',
                '商品', '価格', '購入', '注文', '配送', 'サイズ', '色', 'カップ', '紙', 'パッケージ'
            ],
            CN: [
                '您好', '你好', '谢谢', '请', '是', '不是', '有', '没有', '的', '在', '和', '或者', '从', '到',
                '产品', '价格', '购买', '订单', '配送', '尺寸', '颜色', '杯子', '纸', '包装'
            ],
            KR: [
                '안녕하세요', '감사합니다', '죄송합니다', '네', '아니요', '입니다', '합니다', '있습니다', '없습니다', '이', '그', '저',
                '제품', '가격', '구매', '주문', '배송', '크기', '색상', '컵', '종이', '포장'
            ]
        };

        // Initialize user language system and settings
        this.initializeUserLanguageSystem().catch(err => {
            logger.error("Failed to initialize user language system:", err);
        });

        this.initializeAllLanguageSettings().catch(err => {
            logger.error("Failed to initialize language settings:", err);
        });
    }

    /**
     * Initialize user language system and directory
     */
    async initializeUserLanguageSystem() {
        try {
            // Create directory if not exists
            await fs.mkdir(this.userLanguageDataPath, { recursive: true });
            this.logger.info('User language data directory initialized', {
                path: this.userLanguageDataPath
            });

            // Load existing user data on startup
            const loadResult = await this.loadAllUserLanguageData();
            this.logger.info('User language system initialized', {
                directory: this.userLanguageDataPath,
                loadedUsers: loadResult.loaded,
                failedUsers: loadResult.failed,
                totalFiles: loadResult.total
            });
        } catch (error) {
            this.logger.error('Failed to initialize user language system:', error);
        }
    }

    /**
     * Get user language file path
     */
    getUserLanguageFilePath(userId) {
        // Clean userId for filename safety
        const cleanUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
        return path.join(this.userLanguageDataPath, `${cleanUserId}.json`);
    }

    /**
     * Load user language data from file
     */
    async loadUserLanguageData(userId) {
        try {
            const filePath = this.getUserLanguageFilePath(userId);
            const data = await fs.readFile(filePath, 'utf8');
            const userData = JSON.parse(data);
            
            // Validate and migrate old data structure if needed
            if (!userData.detectionHistory) {
                userData.detectionHistory = [];
            }
            if (!userData.createdAt) {
                userData.createdAt = userData.lastUpdateTime || Date.now();
            }
            
            this.logger.debug('User language data loaded from file', {
                userId: userId.substring(0, 10) + '...',
                language: userData.language,
                isLocked: userData.isLocked,
                hasHistory: userData.detectionHistory.length > 0
            });
            
            return userData;
        } catch (error) {
            if (error.code !== 'ENOENT') {
                this.logger.warn('Error loading user language data:', {
                    userId: userId.substring(0, 10) + '...',
                    error: error.message
                });
            }
            return null;
        }
    }

    /**
     * Save user language data to file
     */
    async saveUserLanguageData(userId, userData) {
        try {
            const filePath = this.getUserLanguageFilePath(userId);
            
            // Ensure userData has required fields
            const dataToSave = {
                userId: userData.userId || userId,
                language: userData.language || this.defaultLanguage,
                isLocked: userData.isLocked || false,
                firstDetected: userData.firstDetected || null,
                conversationStarted: userData.conversationStarted || false,
                lastUpdateTime: userData.lastUpdateTime || Date.now(),
                detectionHistory: userData.detectionHistory || [],
                createdAt: userData.createdAt || Date.now(),
                version: '2.0' // Version for future migrations
            };
            
            await fs.writeFile(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
            
            this.logger.debug('User language data saved to file', {
                userId: userId.substring(0, 10) + '...',
                language: dataToSave.language,
                isLocked: dataToSave.isLocked,
                filePath: filePath
            });
            
            return true;
        } catch (error) {
            this.logger.error('Error saving user language data:', {
                userId: userId.substring(0, 10) + '...',
                error: error.message
            });
            return false;
        }
    }

    /**
     * Enhanced language detection using CLD and custom rules
     */
    async detectLanguageWithCLD(text) {
        try {
            if (!text || text.length < this.languageDetectionConfig.cldMinLength) {
                return null;
            }

            const result = await cld.detect(text);
            
            this.logger.debug('CLD detection result', {
                language: result.language,
                confidence: result.confidence,
                textLength: text.length,
                isReliable: result.isReliable
            });

            // Map CLD language codes to our system
            const detectedLang = this.languageDetectionConfig.cldLanguageMap[result.language];
            
            if (detectedLang && result.confidence >= this.languageDetectionConfig.cldConfidenceThreshold) {
                return {
                    language: detectedLang,
                    confidence: result.confidence,
                    isReliable: result.isReliable,
                    method: 'CLD'
                };
            }

            return null;
        } catch (error) {
            this.logger.debug('CLD detection failed:', error.message);
            return null;
        }
    }

    /**
     * Enhanced language detection with new strict rules
     */
    async detectLanguage(text, userId = null) {
        if (!text || typeof text !== 'string') {
            return this.getUserLanguage(userId);
        }

        const targetUserId = userId || this.currentUserId;
        
        // Check if user language is locked
        if (targetUserId) {
            const userSetting = this.userLanguageSettings.get(targetUserId);
            if (userSetting && userSetting.isLocked) {
                this.logger.debug('Language is locked for user', {
                    userId: targetUserId.substring(0, 10) + '...',
                    lockedLanguage: userSetting.language
                });
                return userSetting.language;
            }
        }

        const cleanText = text.trim();
        const textLength = cleanText.length;
        const words = cleanText.split(/\s+/).filter(word => word.length > 0);
        const wordCount = words.length;
        
        this.logger.debug('Starting language detection', {
            textLength,
            wordCount,
            userId: targetUserId ? targetUserId.substring(0, 10) + '...' : 'unknown',
            textPreview: cleanText.substring(0, 50) + (cleanText.length > 50 ? '...' : '')
        });

        // Check cache first
        if (targetUserId) {
            const cached = this.userLanguageCache.get(targetUserId);
            if (cached && cached.text === cleanText && 
                (Date.now() - cached.timestamp) < this.languageDetectionConfig.cacheTimeout) {
                return cached.language;
            }
        }

        let detectedLanguage = this.defaultLanguage;
        let confidence = 0.3;
        let detectionMethod = 'fallback_thai';

        // 1. Thai detection (highest priority - ตรวจทุกคำขั้นต่ำ 1 คำ)
        const thaiCharCount = (cleanText.match(/[\u0E00-\u0E7F]/g) || []).length;
        const thaiRatio = textLength > 0 ? thaiCharCount / textLength : 0;
        
        if (thaiCharCount >= this.languageDetectionConfig.thai.minCharacters && 
            textLength >= this.languageDetectionConfig.thai.minTextLength) {
            
            // Apply Thai character weight
            const weightedThaiRatio = thaiRatio * this.languageDetectionConfig.thai.characterWeight;
            
            // Check for Thai keywords
            const thaiKeywords = this.languageKeywords.TH;
            const thaiKeywordCount = thaiKeywords.filter(keyword => 
                cleanText.toLowerCase().includes(keyword.toLowerCase())
            ).length;
            
            detectedLanguage = 'TH';
            confidence = Math.min(0.95, this.languageDetectionConfig.thai.confidenceThreshold + 
                        weightedThaiRatio * 0.3 + 
                        (thaiKeywordCount / Math.max(thaiKeywords.length, 1)) * 0.2);
            detectionMethod = 'thai_characters_and_keywords';
            
            this.logger.debug('Thai text detected', {
                thaiCharCount,
                thaiRatio: thaiRatio.toFixed(3),
                weightedRatio: weightedThaiRatio.toFixed(3),
                thaiKeywordCount,
                confidence: confidence.toFixed(3),
                method: detectionMethod
            });
        }
        // 2. English detection with strict rules (15 คำขึ้นไป และ >60% ของไทย)
        else if (wordCount >= this.languageDetectionConfig.english.minWords && 
                 textLength >= this.languageDetectionConfig.english.minTextLength) {
            
            // Calculate English content
            const englishKeywords = this.languageKeywords.EN;
            const englishWords = words.filter(word => {
                const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
                return cleanWord.length > 0 && englishKeywords.includes(cleanWord);
            });
            
            const englishWordRatio = englishWords.length / wordCount;
            const isAllEnglishChars = /^[a-zA-Z\s.,!?0-9\-'\"()\/\n\r]+$/.test(cleanText);
            
            // Business/technical words detection
            const businessWords = [
                'corporate', 'governance', 'environmental', 'policy', 'management', 
                'business', 'company', 'organization', 'sustainability', 'compliance',
                'standards', 'certification', 'quality', 'iso', 'leadership',
                'buy', 'price', 'order', 'product', 'website', 'delivery', 'shipping', 
                'cost', 'service', 'customer', 'solution', 'technology', 'system'
            ];
            const businessWordCount = words.filter(word => 
                businessWords.includes(word.toLowerCase().replace(/[^a-z]/g, ''))
            ).length;
            
            // Calculate English confidence
            let englishConfidence = 0;
            if (isAllEnglishChars) englishConfidence += 0.3;
            if (englishWordRatio >= this.languageDetectionConfig.english.englishWordsRatio) englishConfidence += 0.3;
            if (businessWordCount > 0) englishConfidence += this.languageDetectionConfig.english.businessWordBonus;
            if (wordCount >= 20) englishConfidence += 0.1;
            if (wordCount >= 30) englishConfidence += 0.1;
            
            // Calculate ratio comparison with Thai
            const englishVsThaiRatio = thaiRatio > 0 ? englishWordRatio / thaiRatio : englishWordRatio * 10;
            
            this.logger.debug('English detection analysis', {
                wordCount,
                englishWords: englishWords.length,
                englishWordRatio: englishWordRatio.toFixed(3),
                thaiRatio: thaiRatio.toFixed(3),
                englishVsThaiRatio: englishVsThaiRatio.toFixed(3),
                isAllEnglishChars,
                businessWordCount,
                englishConfidence: englishConfidence.toFixed(3),
                requiredThaiRatio: this.languageDetectionConfig.english.thaiRatioThreshold,
                requiredWordRatio: this.languageDetectionConfig.english.wordRatioThreshold
            });
            
            // Apply strict rules: English must significantly exceed Thai
            const passesThaiRatioTest = englishVsThaiRatio >= this.languageDetectionConfig.english.thaiRatioThreshold;
            const passesWordRatioTest = englishWordRatio >= this.languageDetectionConfig.english.wordRatioThreshold;
            const passesConfidenceTest = englishConfidence >= this.languageDetectionConfig.english.confidenceThreshold;
            
            if (passesConfidenceTest && passesThaiRatioTest && passesWordRatioTest) {
                detectedLanguage = 'EN';
                confidence = Math.min(0.9, englishConfidence);
                detectionMethod = 'english_strict_analysis';
                
                this.logger.debug('English detected with strict rules', {
                    confidence: confidence.toFixed(3),
                    method: detectionMethod,
                    passedThaiRatioTest,
                    passedWordRatioTest,
                    passedConfidenceTest
                });
            } else {
                // Not enough evidence for English, fallback to Thai
                detectedLanguage = this.defaultLanguage;
                confidence = 0.7;
                detectionMethod = 'fallback_thai_insufficient_english';
                
                this.logger.debug('Insufficient evidence for English, using Thai fallback', {
                    reason: 'strict_english_rules_not_met',
                    englishConfidence: englishConfidence.toFixed(3),
                    englishVsThaiRatio: englishVsThaiRatio.toFixed(3),
                    passedTests: { passesConfidenceTest, passesThaiRatioTest, passesWordRatioTest }
                });
            }
        }
        // 3. Try CLD detection for other languages
        else if (this.languageDetectionConfig.useCLD && 
                textLength >= this.languageDetectionConfig.cldMinLength) {
            try {
                const cldResult = await this.detectLanguageWithCLD(cleanText);
                if (cldResult && 
                    cldResult.confidence >= this.languageDetectionConfig.otherLanguages.cldRequiredConfidence) {
                    
                    // For non-Thai/English languages, use CLD result with high confidence
                    if (cldResult.language !== 'TH' && cldResult.language !== 'EN') {
                        detectedLanguage = cldResult.language;
                        confidence = cldResult.confidence;
                        detectionMethod = 'cld_other_language';
                        
                        this.logger.debug('CLD detected other language', {
                            language: cldResult.language,
                            confidence: cldResult.confidence,
                            method: detectionMethod
                        });
                    }
                }
            } catch (cldError) {
                this.logger.debug('CLD detection error:', cldError.message);
            }
        }

        // Always fallback to Thai if confidence is too low and preferThaiLanguage is true
        if (detectedLanguage !== 'TH' && confidence < 0.5 && this.languageDetectionConfig.fallbackToThai) {
            this.logger.debug('Low confidence for non-Thai language, falling back to Thai', {
                originalDetection: detectedLanguage,
                originalConfidence: confidence.toFixed(3),
                fallbackReason: 'low_confidence_prefer_thai'
            });
            detectedLanguage = 'TH';
            confidence = 0.8;
            detectionMethod = 'fallback_thai_low_confidence';
        }

        // Update cache for user
        if (targetUserId) {
            this.userLanguageCache.set(targetUserId, {
                text: cleanText,
                language: detectedLanguage,
                timestamp: Date.now(),
                confidence: confidence,
                method: detectionMethod
            });
        }

        this.logger.info('Language detection completed', {
            userId: targetUserId ? targetUserId.substring(0, 10) + '...' : 'no_user',
            textPreview: cleanText.substring(0, 50) + (cleanText.length > 50 ? '...' : ''),
            detected: detectedLanguage,
            confidence: confidence.toFixed(3),
            method: detectionMethod,
            textLength,
            wordCount,
            thaiCharCount,
            thaiRatio: thaiRatio.toFixed(3),
            preferThai: this.languageDetectionConfig.preferThaiLanguage
        });

        return detectedLanguage;
    }

    /**
     * Set current user and load their language data
     */
    async setCurrentUser(userId) {
        try {
            if (!userId) {
                this.logger.warn('No user ID provided for context setting');
                return false;
            }

            this.currentUserId = userId;
            
            // Load user language data from file
            let userData = await this.loadUserLanguageData(userId);
            
            if (!userData) {
                // Create new user data
                userData = {
                    userId: userId,
                    language: this.defaultLanguage,
                    isLocked: false,
                    firstDetected: null,
                    conversationStarted: false,
                    lastUpdateTime: Date.now(),
                    detectionHistory: [],
                    createdAt: Date.now(),
                    version: '2.0'
                };
                
                await this.saveUserLanguageData(userId, userData);
                this.logger.info('Created new user language data', {
                    userId: userId.substring(0, 10) + '...',
                    defaultLanguage: this.defaultLanguage
                });
            }
            
            // Store in memory cache
            this.userLanguageSettings.set(userId, userData);
            
            // โหลด settings สำหรับภาษาของผู้ใช้
            await this.reloadSettings();
            
            this.logger.info('User context set with language data loaded', {
                userId: userId.substring(0, 10) + '...',
                userLanguage: userData.language,
                isLocked: userData.isLocked,
                conversationStarted: userData.conversationStarted,
                hasDetectionHistory: userData.detectionHistory.length > 0
            });
            
            return true;
        } catch (error) {
            this.logger.error('Error setting user context:', error);
            return false;
        }
    }

    /**
     * Set language for specific user with file persistence
     */
    async setLanguage(language, userText = null, userId = null) {
        try {
            const targetUserId = userId || this.currentUserId;
            
            if (!targetUserId) {
                this.logger.warn('No user ID provided for language setting');
                return false;
            }

            let targetLanguage = language;
            
            // Detect language if not provided
            if (!targetLanguage && userText) {
                targetLanguage = await this.detectLanguage(userText, targetUserId);
            }
            
            // Validate language
            if (!targetLanguage || !this.supportedLanguages.includes(targetLanguage.toUpperCase())) {
                targetLanguage = this.defaultLanguage;
            }
            
            // Get or create user setting
            let userSetting = this.userLanguageSettings.get(targetUserId);
            if (!userSetting) {
                userSetting = {
                    userId: targetUserId,
                    language: this.defaultLanguage,
                    isLocked: false,
                    firstDetected: null,
                    conversationStarted: false,
                    lastUpdateTime: Date.now(),
                    detectionHistory: [],
                    createdAt: Date.now(),
                    version: '2.0'
                };
            }
            
            // Check if language is locked for this user
            if (userSetting.isLocked && targetLanguage !== userSetting.language) {
                this.logger.info('Language change blocked - user language is locked', {
                    userId: targetUserId.substring(0, 10) + '...',
                    requestedLanguage: targetLanguage,
                    lockedLanguage: userSetting.language,
                    firstDetected: userSetting.firstDetected
                });
                return false;
            }
            
            const prevLang = userSetting.language;
            
            // Prevent language switching for very short text (unless it's Thai)
            if (!userSetting.isLocked && userText && userText.trim().length < 5 && 
                targetLanguage !== prevLang && targetLanguage !== 'TH') {
                
                this.logger.info('Text too short for reliable language detection, keeping current language', {
                    userId: targetUserId.substring(0, 10) + '...',
                    textLength: userText.trim().length,
                    detectedLang: targetLanguage,
                    currentLang: prevLang
                });
                return false;
            }

            // Update user language
            userSetting.language = targetLanguage.toUpperCase();
            userSetting.lastUpdateTime = Date.now();
            
            // Add to detection history
            if (!userSetting.detectionHistory) {
                userSetting.detectionHistory = [];
            }
            userSetting.detectionHistory.push({
                language: targetLanguage.toUpperCase(),
                timestamp: Date.now(),
                userText: userText ? userText.substring(0, 100) : null,
                method: 'auto_detected',
                textLength: userText ? userText.length : 0,
                wordCount: userText ? userText.split(/\s+/).length : 0
            });
            
            // Keep only last 20 detection records
            if (userSetting.detectionHistory.length > 20) {
                userSetting.detectionHistory = userSetting.detectionHistory.slice(-20);
            }
            
            // Lock language after first detection
            if (!userSetting.conversationStarted && userText && userText.trim().length >= 1) {
                userSetting.firstDetected = userSetting.language;
                userSetting.isLocked = this.languageDetectionConfig.lockAfterFirstDetection;
                userSetting.conversationStarted = true;
                
                this.logger.info('First language detection and lock activated', {
                    userId: targetUserId.substring(0, 10) + '...',
                    detectedLanguage: userSetting.language,
                    isLocked: userSetting.isLocked,
                    userText: userText.substring(0, 50) + '...'
                });
            }
            
            // Save to memory and file
            this.userLanguageSettings.set(targetUserId, userSetting);
            const fileSaved = await this.saveUserLanguageData(targetUserId, userSetting);
            
            // Update template config if this is current user
            if (targetUserId === this.currentUserId) {
                if (this.languageTemplates[userSetting.language]) {
                    this.templateConfig = {
                        conversation: { ...this.languageTemplates[userSetting.language].conversation }
                    };
                }
            }
            
            if (prevLang !== userSetting.language) {
                this.logger.info('User language changed and saved to file', {
                    userId: targetUserId.substring(0, 10) + '...',
                    from: prevLang,
                    to: userSetting.language,
                    autoDetected: !language && !!userText,
                    isLocked: userSetting.isLocked,
                    firstDetected: userSetting.firstDetected,
                    fileSaved: fileSaved
                });
            }
            
            return true;
            
        } catch (error) {
            this.logger.error('Error setting user language:', error);
            return false;
        }
    }

    /**
     * Get user's current language
     */
    getUserLanguage(userId) {
        if (!userId) return this.defaultLanguage;
        
        const userSetting = this.userLanguageSettings.get(userId);
        return userSetting ? userSetting.language : this.defaultLanguage;
    }

    /**
     * Get user's language lock status with full details
     */
    getUserLanguageLockStatus(userId) {
        if (!userId) return { isLocked: false, language: this.defaultLanguage };
        
        const userSetting = this.userLanguageSettings.get(userId);
        if (!userSetting) {
            return { 
                isLocked: false, 
                language: this.defaultLanguage,
                firstDetected: null,
                conversationStarted: false,
                detectionHistory: [],
                createdAt: null,
                lastUpdateTime: null
            };
        }
        
        return {
            isLocked: userSetting.isLocked,
            language: userSetting.language,
            firstDetected: userSetting.firstDetected,
            conversationStarted: userSetting.conversationStarted,
            detectionHistory: userSetting.detectionHistory || [],
            createdAt: userSetting.createdAt,
            lastUpdateTime: userSetting.lastUpdateTime,
            totalDetections: userSetting.detectionHistory ? userSetting.detectionHistory.length : 0
        };
    }

    /**
     * Unlock language for specific user
     */
    async unlockUserLanguage(userId = null) {
        const targetUserId = userId || this.currentUserId;
        
        if (!targetUserId) {
            this.logger.warn('No user ID provided for language unlock');
            return false;
        }

        let userSetting = this.userLanguageSettings.get(targetUserId);
        if (!userSetting) {
            userSetting = {
                userId: targetUserId,
                language: this.defaultLanguage,
                isLocked: false,
                firstDetected: null,
                conversationStarted: false,
                lastUpdateTime: Date.now(),
                detectionHistory: [],
                createdAt: Date.now(),
                version: '2.0'
            };
        } else {
            userSetting.isLocked = false;
            userSetting.firstDetected = null;
            userSetting.conversationStarted = false;
            userSetting.lastUpdateTime = Date.now();
            
            // Add unlock record to history
            if (!userSetting.detectionHistory) {
                userSetting.detectionHistory = [];
            }
            userSetting.detectionHistory.push({
                language: userSetting.language,
                timestamp: Date.now(),
                userText: null,
                method: 'manual_unlock',
                action: 'unlocked'
            });
        }
        
        // Save to memory and file
        this.userLanguageSettings.set(targetUserId, userSetting);
        const fileSaved = await this.saveUserLanguageData(targetUserId, userSetting);
        
        // Clear language detection cache for this user
        this.userLanguageCache.delete(targetUserId);
        
        this.logger.info('User language unlocked and saved to file', {
            userId: targetUserId.substring(0, 10) + '...',
            currentLanguage: userSetting.language,
            fileSaved: fileSaved
        });
        
        return true;
    }

    /**
     * Reset conversation for specific user
     */
    async resetUserConversation(userId = null) {
        const targetUserId = userId || this.currentUserId;
        
        if (!targetUserId) {
            this.logger.warn('No user ID provided for conversation reset');
            return false;
        }

        const success = await this.unlockUserLanguage(targetUserId);
        this.logger.info('User conversation reset - language detection system reinitialized', {
            userId: targetUserId.substring(0, 10) + '...',
            success: success
        });
        return success;
    }

    /**
     * Calculate language confidence with enhanced logic
     */
    calculateLanguageConfidence(text, detectedLang) {
        if (!text || !detectedLang) return 0.5;

        let confidence = 0.5;
        const cleanText = text.toLowerCase().trim();
        const words = cleanText.split(/\s+/).filter(word => word.length > 0);
        const textLength = cleanText.length;
        
        if (detectedLang === 'TH') {
            const thaiCharCount = (cleanText.match(/[\u0E00-\u0E7F]/g) || []).length;
            if (thaiCharCount > 0) {
                const thaiRatio = thaiCharCount / textLength;
                confidence = Math.min(0.95, 0.7 + thaiRatio * 0.25); // Very high confidence for Thai characters
                
                // Bonus for Thai keywords
                const thaiKeywords = this.languageKeywords.TH;
                const foundKeywords = thaiKeywords.filter(keyword => cleanText.includes(keyword)).length;
                confidence += Math.min(0.05, (foundKeywords / thaiKeywords.length) * 0.05);
            }
        } else if (detectedLang === 'EN') {
            const englishKeywords = this.languageKeywords.EN;
            const matchCount = words.filter(word => {
                const cleanWord = word.replace(/[^a-z]/g, '');
                return englishKeywords.includes(cleanWord);
            }).length;
            
            const ratio = words.length > 0 ? matchCount / words.length : 0;
            const isAllEnglishChars = /^[a-zA-Z\s.,!?0-9\-'\"()\/\n\r]+$/.test(cleanText);
            
            confidence = Math.min(0.85, 0.4 + ratio * 0.3 + (isAllEnglishChars ? 0.15 : 0));
            
            // Bonus for business words
            const businessWords = ['corporate', 'business', 'management', 'product', 'service'];
            const businessCount = words.filter(word => 
                businessWords.includes(word.toLowerCase().replace(/[^a-z]/g, ''))
            ).length;
            if (businessCount > 0) {
                confidence += Math.min(0.1, businessCount * 0.03);
            }
            
        } else if (detectedLang === 'CN') {
            const chineseCharCount = (cleanText.match(/[\u4E00-\u9FFF]/g) || []).length;
            const chineseKeywords = this.languageKeywords.CN;
            const keywordCount = chineseKeywords.filter(keyword => cleanText.includes(keyword)).length;
            confidence = Math.min(0.9, 0.6 + (chineseCharCount / textLength) * 0.2 + (keywordCount * 0.1));
            
        } else if (detectedLang === 'JP') {
            const japaneseCharCount = (cleanText.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length;
            const japaneseKeywords = this.languageKeywords.JP;
            const keywordCount = japaneseKeywords.filter(keyword => cleanText.includes(keyword)).length;
            confidence = Math.min(0.9, 0.6 + (japaneseCharCount / textLength) * 0.2 + (keywordCount * 0.1));
            
        } else if (detectedLang === 'KR') {
            const koreanCharCount = (cleanText.match(/[\uAC00-\uD7AF]/g) || []).length;
            const koreanKeywords = this.languageKeywords.KR;
            const keywordCount = koreanKeywords.filter(keyword => cleanText.includes(keyword)).length;
            confidence = Math.min(0.9, 0.6 + (koreanCharCount / textLength) * 0.2 + (keywordCount * 0.1));
        }
        
        return confidence;
    }

    /**
     * Get current language based on current user
     */
    getCurrentLanguage() {
        if (this.currentUserId) {
            return this.getUserLanguage(this.currentUserId);
        }
        return this.defaultLanguage;
    }

    /**
     * Enhanced user language statistics with file data
     */
    async getUserLanguageStatistics() {
        const stats = {
            totalUsers: this.userLanguageSettings.size,
            languageDistribution: {},
            lockedUsers: 0,
            conversationStartedUsers: 0,
            defaultLanguage: this.defaultLanguage,
            fileSystemStats: {
                totalUserFiles: 0,
                loadedFromFile: 0,
                failedToLoad: 0
            },
            detectionStats: {
                totalDetections: 0,
                avgDetectionsPerUser: 0,
                languageChanges: 0
            }
        };

        // Initialize language distribution
        this.supportedLanguages.forEach(lang => {
            stats.languageDistribution[lang] = 0;
        });

        // Calculate statistics from loaded user data
        let totalDetections = 0;
        let languageChanges = 0;

        for (const [userId, setting] of this.userLanguageSettings.entries()) {
            stats.languageDistribution[setting.language]++;
            if (setting.isLocked) stats.lockedUsers++;
            if (setting.conversationStarted) stats.conversationStartedUsers++;
            
            if (setting.detectionHistory && setting.detectionHistory.length > 0) {
                totalDetections += setting.detectionHistory.length;
                
                // Count language changes
                let lastLang = null;
                for (const detection of setting.detectionHistory) {
                    if (lastLang && lastLang !== detection.language) {
                        languageChanges++;
                    }
                    lastLang = detection.language;
                }
            }
        }

        stats.detectionStats.totalDetections = totalDetections;
        stats.detectionStats.avgDetectionsPerUser = stats.totalUsers > 0 ? 
            (totalDetections / stats.totalUsers).toFixed(2) : 0;
        stats.detectionStats.languageChanges = languageChanges;

        // Check file system stats
        try {
            const files = await fs.readdir(this.userLanguageDataPath);
            const jsonFiles = files.filter(f => f.endsWith('.json'));
            stats.fileSystemStats.totalUserFiles = jsonFiles.length;
            stats.fileSystemStats.loadedFromFile = this.userLanguageSettings.size;
        } catch (error) {
            this.logger.warn('Could not read user language directory:', error.message);
        }

        return {
            ...stats,
            cacheSize: this.userLanguageCache.size,
            detectionConfig: this.languageDetectionConfig,
            timestamp: Date.now()
        };
    }

    /**
     * Load all user language data from files
     */
    async loadAllUserLanguageData() {
        try {
            const files = await fs.readdir(this.userLanguageDataPath);
            const jsonFiles = files.filter(f => f.endsWith('.json'));
            
            let loadedCount = 0;
            let failedCount = 0;
            
            for (const file of jsonFiles) {
                try {
                    const userId = file.replace('.json', '').replace(/_/g, ''); // Clean back userId
                    const userData = await this.loadUserLanguageData(userId);
                    
                    if (userData) {
                        this.userLanguageSettings.set(userId, userData);
                        loadedCount++;
                    }
                } catch (error) {
                    this.logger.warn('Failed to load user language file:', {
                        file,
                        error: error.message
                    });
                    failedCount++;
                }
            }
            
            this.logger.info('User language data bulk load completed', {
                totalFiles: jsonFiles.length,
                loaded: loadedCount,
                failed: failedCount
            });
            
            return { loaded: loadedCount, failed: failedCount, total: jsonFiles.length };
            
        } catch (error) {
            this.logger.error('Error loading all user language data:', error);
            return { loaded: 0, failed: 0, total: 0 };
        }
    }

    /**
     * Clear language detection cache
     */
    clearLanguageDetectionCache(userId = null) {
        if (userId) {
            this.userLanguageCache.delete(userId);
            this.logger.info('Language detection cache cleared for user', {
                userId: userId.substring(0, 10) + '...'
            });
        } else {
            this.userLanguageCache.clear();
            this.logger.info('Language detection cache cleared for all users');
        }
        return true;
    }

    /**
     * Get supported languages info with user context
     */
    getSupportedLanguages() {
        const currentUserId = this.currentUserId;
        const userLanguageStatus = currentUserId ? this.getUserLanguageLockStatus(currentUserId) : null;
        
        return {
            languages: this.supportedLanguages,
            defaultLanguage: this.defaultLanguage,
            currentUser: currentUserId ? currentUserId.substring(0, 10) + '...' : null,
            currentUserLanguage: currentUserId ? this.getUserLanguage(currentUserId) : this.defaultLanguage,
            available: Object.keys(this.languageTemplates),
            timestamp: Date.now(),
            detectionConfig: { ...this.languageDetectionConfig },
            userLockStatus: userLanguageStatus,
            totalUsers: this.userLanguageSettings.size
        };
    }

    // เมธอดสำหรับโหลดและบันทึก settings (เหมือนเดิม แต่ปรับให้รองรับ per-user)
    async reloadSettings(userText = null, userId = null) {
        try {
            const targetUserId = userId || this.currentUserId;
            let languageChanged = false;
            
            // ตรวจจับภาษาเฉพาะเมื่อไม่ได้ล็อค
            if (userText && targetUserId) {
                const userSetting = this.userLanguageSettings.get(targetUserId);
                if (!userSetting || !userSetting.isLocked) {
                    const detectedLang = await this.detectLanguage(userText, targetUserId);
                    if (detectedLang !== this.getUserLanguage(targetUserId)) {
                        const confidence = this.calculateLanguageConfidence(userText, detectedLang);
                        
                        this.logger.info('Language detection analysis for user', {
                            userId: targetUserId.substring(0, 10) + '...',
                            text: userText.substring(0, 50),
                            detected: detectedLang,
                            current: this.getUserLanguage(targetUserId),
                            confidence: confidence.toFixed(2),
                            threshold: detectedLang === 'TH' ? 
                                this.languageDetectionConfig.thai.confidenceThreshold : 
                                this.languageDetectionConfig.english.confidenceThreshold
                        });
                        
                        if (await this.setLanguage(detectedLang, userText, targetUserId)) {
                            languageChanged = true;
                            this.logger.info(`User language changed to ${detectedLang}`, {
                                userId: targetUserId.substring(0, 10) + '...'
                            });
                        }
                    }
                } else {
                    this.logger.info('Language detection skipped - user language is locked', {
                        userId: targetUserId.substring(0, 10) + '...',
                        lockedLanguage: userSetting.language
                    });
                }
            }

            const currentLanguage = this.getCurrentLanguage();
            const settings = await this.loadLanguageSettings(currentLanguage);

            // โหลดการตั้งค่าต่างๆ (เหมือนเดิม)
            if (settings.modelConfig?.modelName) {
                await this.updateModelDetails(settings.modelConfig.modelName);
            }

            if (settings.generationConfig) {
                this.generationConfig = { ...this.generationConfig, ...settings.generationConfig };
            }

            if (settings.languageDetectionConfig) {
                this.languageDetectionConfig = { ...this.languageDetectionConfig, ...settings.languageDetectionConfig };
            }

            if (settings.unifiedFormatterConfig) {
                this.unifiedFormatterConfig = { 
                    ...this.unifiedFormatterConfig, 
                    ...settings.unifiedFormatterConfig 
                };
            }

            if (settings.knowledgeConfig) {
                this.knowledgeConfig = { 
                    ...this.knowledgeConfig, 
                    ...settings.knowledgeConfig 
                };
            }

            if (settings.templateConfig?.conversation) {
                this.templateConfig.conversation = {
                    personality: settings.templateConfig.conversation.personality,
                    greeting: settings.templateConfig.conversation.greeting,
                    closing: settings.templateConfig.conversation.closing,
                    guidelines: Array.isArray(settings.templateConfig.conversation.guidelines) 
                        ? [...settings.templateConfig.conversation.guidelines] 
                        : [settings.templateConfig.conversation.guidelines]
                };
                
                if (!this.languageTemplates[currentLanguage]) {
                    this.languageTemplates[currentLanguage] = { conversation: {} };
                }
                this.languageTemplates[currentLanguage].conversation = {
                    ...this.templateConfig.conversation
                };
            }

            if (settings.costConfig) {
                this.costConfig = { ...this.costConfig, ...settings.costConfig };
            }

            this.logger.info('Settings reloaded successfully for user', {
                userId: targetUserId ? targetUserId.substring(0, 10) + '...' : 'no_user',
                language: currentLanguage,
                languageChanged,
                userLockStatus: targetUserId ? this.getUserLanguageLockStatus(targetUserId) : null
            });
            
            return true;
        } catch (error) {
            this.logger.error('Error reloading settings:', error);
            return false;
        }
    }

    // เก็บเมธอดอื่นๆ เหมือนเดิม...
    
    // เมธอดสำหรับการจัดการ Google AI Models
    async getAvailableModels() {
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                this.logger.warn('GEMINI_API_KEY not found, using fallback models');
                return this.googleAIModelsService._getFallbackModels();
            }
            
            const models = await this.googleAIModelsService.getAvailableModels(apiKey);
            
            this.logger.info('Available Google AI models retrieved', {
                count: models.length,
                recommended: models.filter(m => m.recommended).length
            });
            
            return models;
        } catch (error) {
            this.logger.error('Error getting available models:', error);
            return this.googleAIModelsService._getFallbackModels();
        }
    }

    async updateModelDetails(modelName) {
        try {
            const modelInfo = await this.validateModelName(modelName);
            
            if (!modelInfo) {
                this.logger.warn(`Cannot update details: Invalid or unavailable model: ${modelName}. Keeping current: ${this.MODEL_NAME}`);
                return {
                    success: false,
                    modelNameTried: modelName,
                    currentModelName: this.MODEL_NAME
                };
            }
            
            const previousModelName = this.MODEL_NAME;
            this.MODEL_NAME = modelName;
            this.API_VERSION = modelInfo.apiVersion;
            this.USE_DIRECT_URL = modelInfo.useDirectUrl;
            this.MODEL_URL = modelInfo.useDirectUrl ? 
                `https://generativelanguage.googleapis.com/${modelInfo.apiVersion}/models/${modelName}` : 
                null;
            
            if (modelInfo.outputTokenLimit) {
                const defaultMaxOutput = 1999;
                this.generationConfig.maxOutputTokens = Math.min(
                    this.generationConfig.maxOutputTokens || defaultMaxOutput,
                    modelInfo.outputTokenLimit
                );
            }
            
            if (previousModelName !== modelName) {
                this.logger.info('Model details updated successfully', {
                    previousModelName: previousModelName,
                    newModelName: this.MODEL_NAME,
                    apiVersion: this.API_VERSION,
                    useDirectUrl: this.USE_DIRECT_URL,
                    category: modelInfo.category,
                    recommended: modelInfo.recommended
                });
            }
            
            return {
                success: true,
                modelInfo: modelInfo,
                config: {
                    modelName: this.MODEL_NAME,
                    apiVersion: this.API_VERSION,
                    useDirectUrl: this.USE_DIRECT_URL,
                    modelUrl: this.MODEL_URL
                }
            };
        } catch (error) {
            this.logger.error('Error updating model details:', { message: error.message, modelNameAttempted: modelName });
            return {
                success: false,
                modelNameTried: modelName,
                currentModelName: this.MODEL_NAME
            };
        }
    }

    async validateModelName(modelName) {
        try {
            const availableModels = await this.getAvailableModels();
            const model = availableModels.find(m => m.name === modelName);
            
            if (!model) {
                this.logger.warn(`Model ${modelName} not found in available models`);
                return false;
            }
            
            return model;
        } catch (error) {
            this.logger.error(`Error validating model ${modelName}:`, error);
            return false;
        }
    }

    clearModelsCache() {
        try {
            if (this.googleAIModelsService && typeof this.googleAIModelsService.clearCache === 'function') {
                this.googleAIModelsService.clearCache();
                this.logger.info('Google AI models cache cleared');
                return true;
            }
            this.logger.warn('GoogleAIModelsService not available for cache clearing');
            return false;
        } catch (error) {
            this.logger.error('Error clearing models cache:', error);
            return false;
        }
    }

    // เมธอดสำหรับ settings management
    async loadLanguageSettings(language = null) {
        const lang = language || this.getCurrentLanguage();

        try {
            const contextConfig = await prisma.contextWindow.findUnique({ where: { key: 'default' } });

            const templateSource = this.languageTemplates[lang] || this.languageTemplates[this.defaultLanguage];
            const templateClone = templateSource ? JSON.parse(JSON.stringify(templateSource)) : null;

            if (templateClone && contextConfig?.system_prompt) {
                templateClone.conversation.personality = contextConfig.system_prompt;
            }

            const generationConfig = {
                ...this.generationConfig,
                temperature: contextConfig?.temperature ?? this.generationConfig.temperature,
                maxOutputTokens: contextConfig?.max_tokens ?? this.generationConfig.maxOutputTokens,
                modelName: contextConfig?.model_name ?? this.MODEL_NAME
            };

            const knowledgeConfig = {
                ...this.knowledgeConfig,
                enabled: contextConfig?.use_knowledge_rag ?? this.knowledgeConfig.enabled,
                useProductRAG: contextConfig?.use_product_rag ?? this.knowledgeConfig.useProductRAG ?? true,
                useKnowledgeRAG: contextConfig?.use_knowledge_rag ?? this.knowledgeConfig.useKnowledgeRAG ?? true
            };

            const response = {
                language: lang,
                modelConfig: {
                    modelName: generationConfig.modelName,
                    apiVersion: this.API_VERSION,
                    modelUrl: this.MODEL_URL,
                    useDirectUrl: this.USE_DIRECT_URL
                },
                generationConfig,
                templateConfig: templateClone ? { conversation: templateClone.conversation } : undefined,
                costConfig: { ...this.costConfig },
                languageDetectionConfig: { ...this.languageDetectionConfig },
                unifiedFormatterConfig: JSON.parse(JSON.stringify(this.unifiedFormatterConfig)),
                knowledgeConfig,
                metadata: {
                    source: 'contextWindow',
                    key: contextConfig?.key ?? 'default',
                    lastUpdated: contextConfig?.last_updated ?? null
                }
            };

            this.logger.info('Language settings loaded from context window', {
                language: lang,
                model: response.modelConfig.modelName,
                temperature: generationConfig.temperature,
                useProductRAG: knowledgeConfig.useProductRAG,
                useKnowledgeRAG: knowledgeConfig.useKnowledgeRAG
            });

            return response;
        } catch (error) {
            this.logger.error('Error loading language settings from database, falling back to defaults', {
                language: lang,
                error: error.message
            });

            const fallbackTemplate = this.languageTemplates[lang] || this.languageTemplates[this.defaultLanguage];

            return {
                language: lang,
                modelConfig: {
                    modelName: this.MODEL_NAME,
                    apiVersion: this.API_VERSION,
                    modelUrl: this.MODEL_URL,
                    useDirectUrl: this.USE_DIRECT_URL
                },
                generationConfig: { ...this.generationConfig },
                templateConfig: fallbackTemplate ? { conversation: JSON.parse(JSON.stringify(fallbackTemplate.conversation)) } : undefined,
                costConfig: { ...this.costConfig },
                languageDetectionConfig: { ...this.languageDetectionConfig },
                unifiedFormatterConfig: JSON.parse(JSON.stringify(this.unifiedFormatterConfig)),
                knowledgeConfig: { ...this.knowledgeConfig },
                metadata: {
                    source: 'fallback',
                    error: error.message
                }
            };
        }
    }

    async saveLanguageSettings(settings, language = null) {
        const lang = language || this.getCurrentLanguage();

        try {
            const conversation = settings?.templateConfig?.conversation || null;
            const generation = settings?.generationConfig || {};
            const knowledge = settings?.knowledgeConfig || {};
            const contextOptions = settings?.contextConfig || {};

            const systemPrompt = conversation?.personality || this.languageTemplates[this.defaultLanguage].conversation.personality;
            const temperature = generation.temperature ?? this.generationConfig.temperature;
            const maxTokens = generation.maxOutputTokens ?? this.generationConfig.maxOutputTokens;
            const modelName = settings?.modelConfig?.modelName ?? this.MODEL_NAME;
            const useProductRAG = knowledge.useProductRAG ?? knowledge.enabled ?? this.knowledgeConfig.useProductRAG ?? true;
            const useKnowledgeRAG = knowledge.useKnowledgeRAG ?? knowledge.enabled ?? this.knowledgeConfig.useKnowledgeRAG ?? true;
            const maxContextMessages = contextOptions.maxContextMessages ?? null;
            const includeUserHistory = contextOptions.includeUserHistory ?? null;

            const persistToContextWindow = lang === this.defaultLanguage || settings?.metadata?.applyGlobally;

            if (persistToContextWindow) {
                await prisma.contextWindow.upsert({
                    where: { key: 'default' },
                    update: {
                        system_prompt: systemPrompt,
                        use_product_rag: useProductRAG,
                        use_knowledge_rag: useKnowledgeRAG,
                        temperature,
                        text_model_name: modelName,
                        max_tokens: maxTokens,
                        ...(maxContextMessages !== null ? { max_context_messages: maxContextMessages } : {}),
                        ...(includeUserHistory !== null ? { include_user_history: includeUserHistory } : {})
                    },
                    create: {
                        key: 'default',
                        system_prompt: systemPrompt,
                        use_product_rag: useProductRAG,
                        use_knowledge_rag: useKnowledgeRAG,
                        temperature,
                        text_model_name: modelName,
                        max_tokens: maxTokens,
                        max_context_messages: maxContextMessages ?? 10,
                        include_user_history: includeUserHistory ?? true
                    }
                });
            }

            if (!this.languageTemplates[lang]) {
                this.languageTemplates[lang] = { conversation: {} };
            }

            if (conversation) {
                const guidelines = Array.isArray(conversation.guidelines)
                    ? [...conversation.guidelines]
                    : conversation.guidelines ? [conversation.guidelines] : [];

                this.languageTemplates[lang].conversation = {
                    personality: conversation.personality || systemPrompt,
                    greeting: conversation.greeting || this.languageTemplates[lang].conversation?.greeting || '',
                    closing: conversation.closing || this.languageTemplates[lang].conversation?.closing || '',
                    guidelines: guidelines.length > 0 ? guidelines : (this.languageTemplates[lang].conversation?.guidelines || [])
                };

                if (lang === this.getCurrentLanguage()) {
                    this.templateConfig.conversation = { ...this.languageTemplates[lang].conversation };
                }
            } else if (lang === this.getCurrentLanguage()) {
                this.templateConfig.conversation.personality = systemPrompt;
            }

            this.generationConfig = {
                ...this.generationConfig,
                temperature,
                maxOutputTokens: maxTokens,
                modelName,
                topK: generation.topK ?? this.generationConfig.topK,
                topP: generation.topP ?? this.generationConfig.topP
            };

            this.MODEL_NAME = modelName;

            this.knowledgeConfig = {
                ...this.knowledgeConfig,
                enabled: knowledge.enabled ?? this.knowledgeConfig.enabled ?? useKnowledgeRAG,
                useProductRAG,
                useKnowledgeRAG
            };

            if (settings?.unifiedFormatterConfig) {
                this.unifiedFormatterConfig = this.deepMerge(this.unifiedFormatterConfig, settings.unifiedFormatterConfig);
            }

            if (settings?.languageDetectionConfig) {
                this.languageDetectionConfig = {
                    ...this.languageDetectionConfig,
                    ...settings.languageDetectionConfig
                };
            }

            if (settings?.costConfig) {
                this.costConfig = {
                    ...this.costConfig,
                    ...settings.costConfig
                };
            }

            this.logger.info('Language settings saved', {
                language: lang,
                model: modelName,
                temperature,
                useProductRAG,
                useKnowledgeRAG,
                persistedToContextWindow: persistToContextWindow
            });

            return true;
        } catch (error) {
            this.logger.error('Error saving language settings to database', {
                language: language || this.getCurrentLanguage(),
                error: error.message
            });
            return false;
        }
    }

    createCompleteLanguageSettings(language) {
        const template = this.languageTemplates[language] || this.languageTemplates['TH'];
        
        const completeSettings = {
            language: language,
            modelConfig: {
                modelName: this.MODEL_NAME,
                apiVersion: this.API_VERSION,
                modelUrl: this.MODEL_URL || "",
                useDirectUrl: this.USE_DIRECT_URL
            },
            generationConfig: { 
                temperature: 0.7,
                topK: 60,
                topP: 0.6,
                maxOutputTokens: 30264
            },
            templateConfig: {
                conversation: {
                    personality: template.conversation.personality,
                    greeting: template.conversation.greeting,
                    closing: template.conversation.closing,
                    guidelines: [...template.conversation.guidelines]
                }
            },
            costConfig: { ...this.costConfig },
            languageDetectionConfig: { ...this.languageDetectionConfig },
            unifiedFormatterConfig: JSON.parse(JSON.stringify(this.unifiedFormatterConfig)),
            knowledgeConfig: JSON.parse(JSON.stringify(this.knowledgeConfig)),
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };
        
        return completeSettings;
    }

    async initializeAllLanguageSettings() {
        try {
            const results = {};
            for (const lang of this.supportedLanguages) {
                try {
                    const completeSettings = this.createCompleteLanguageSettings(lang);
                    await this.saveLanguageSettings(completeSettings, lang);
                    results[lang] = 'initialized';
                } catch (langError) {
                    this.logger.error(`Error initializing settings for ${lang}:`, langError);
                    results[lang] = 'error';
                }
            }
            
            this.logger.info('Language settings initialization completed via context window', results);
            return results;
        } catch (error) {
            this.logger.error('Error initializing language settings:', error);
            throw error;
        }
    }

    // เมธอดสำหรับ configuration management
    getUnifiedFormatterConfig(language = null) {
        const lang = language || this.getCurrentLanguage();
        const config = JSON.parse(JSON.stringify(this.unifiedFormatterConfig));
        
        Object.keys(config.sections).forEach(sectionKey => {
            const section = config.sections[sectionKey];
            if (section.title && typeof section.title === 'object') {
                section.title = section.title[lang] || section.title['EN'];
            }
        });
        
        return config;
    }

    async updateUnifiedFormatterConfig(newConfig, language = null) {
        try {
            const lang = language || this.getCurrentLanguage();
            
            this.unifiedFormatterConfig = this.deepMerge(this.unifiedFormatterConfig, newConfig);
            
            const currentSettings = await this.loadLanguageSettings(lang);
            currentSettings.unifiedFormatterConfig = this.unifiedFormatterConfig;
            await this.saveLanguageSettings(currentSettings, lang);
            
            this.logger.info('Unified formatter configuration updated', {
                language: lang,
                updatedFields: Object.keys(newConfig)
            });
            
            return true;
        } catch (error) {
            this.logger.error('Error updating unified formatter configuration:', error);
            return false;
        }
    }

    getKnowledgeConfig(language = null) {
        return JSON.parse(JSON.stringify(this.knowledgeConfig));
    }

    async updateKnowledgeConfig(newConfig, language = null) {
        try {
            const lang = language || this.getCurrentLanguage();
            
            this.knowledgeConfig = this.deepMerge(this.knowledgeConfig, newConfig);
            
            const currentSettings = await this.loadLanguageSettings(lang);
            currentSettings.knowledgeConfig = this.knowledgeConfig;
            await this.saveLanguageSettings(currentSettings, lang);
            
            this.logger.info('Knowledge configuration updated', {
                language: lang,
                updatedFields: Object.keys(newConfig)
            });
            
            return true;
        } catch (error) {
            this.logger.error('Error updating knowledge configuration:', error);
            return false;
        }
    }

    getTemplateConfig(language = null) {
        const lang = language || this.getCurrentLanguage();
        
        const conversationConfig = (lang === this.getCurrentLanguage() && this.templateConfig.conversation) 
                                    ? this.templateConfig.conversation 
                                    : this.languageTemplates[lang]?.conversation;

        return {
            conversation: conversationConfig ? { ...conversationConfig } : 
                           (this.languageTemplates['TH'].conversation ? {...this.languageTemplates['TH'].conversation} : {}),
            generationConfig: { ...this.generationConfig },
            language: lang
        };
    }

    async updateTemplateConfig(config, language = null) {
        try {
            const lang = language || this.getCurrentLanguage();
            
            if (!config || !config.conversation) {
                throw new Error('Configuration is required and must include a conversation object');
            }
            
            if (lang === this.getCurrentLanguage()) {
                 this.templateConfig.conversation = {
                    ...(this.templateConfig.conversation || {}),
                    ...config.conversation
                };
            }
            
            if (!this.languageTemplates[lang]) {
                this.languageTemplates[lang] = { conversation: {} };
            }
            this.languageTemplates[lang].conversation = {
                ...(this.languageTemplates[lang].conversation || {}),
                ...config.conversation
            };
            
            const currentSettings = await this.loadLanguageSettings(lang);
            if (!currentSettings.templateConfig) {
                currentSettings.templateConfig = {};
            }
            currentSettings.templateConfig.conversation = { 
                ...(currentSettings.templateConfig.conversation || {}),
                ...this.languageTemplates[lang].conversation
            };
            await this.saveLanguageSettings(currentSettings, lang);
            
            this.logger.info('Template configuration updated successfully', {
                language: lang,
                updatedFields: Object.keys(config.conversation || {})
            });
            return true;
        } catch (error) {
            this.logger.error('Error updating template configuration:', error);
            throw error;
        }
    }

    // Helper method for deep merge
    deepMerge(target, source) {
        const isObject = (obj) => obj && typeof obj === 'object' && !Array.isArray(obj);
        
        if (!isObject(target) || !isObject(source)) {
            return source;
        }

        Object.keys(source).forEach(key => {
            const targetValue = target[key];
            const sourceValue = source[key];

            if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
                target[key] = sourceValue;
            } else if (isObject(targetValue) && isObject(sourceValue)) {
                target[key] = this.deepMerge(Object.assign({}, targetValue), sourceValue);
            } else {
                target[key] = sourceValue;
            }
        });

        return target;
    }

    // Load search settings from configuration API
    async loadSearchSettingsFromAPI() {
        try {
            const axios = require('axios');
            const apiUrl = process.env.API_BASE_URL || 'http://localhost:3001';

            const response = await axios.get(`${apiUrl}/api/configuration/search`);

            if (response.data && response.data.success && response.data.config) {
                const apiSettings = response.data.config;

                // Update search settings from API
                this.knowledgeConfig.searchSettings = {
                    ...this.knowledgeConfig.searchSettings,
                    topK: apiSettings.topK || this.knowledgeConfig.searchSettings.topK,
                    scoreThreshold: apiSettings.scoreThreshold || this.knowledgeConfig.searchSettings.scoreThreshold,
                    maxTokens: apiSettings.maxTokens || this.knowledgeConfig.searchSettings.maxTokens,
                    maxContentLength: apiSettings.maxContentLength || this.knowledgeConfig.searchSettings.maxContentLength,
                    includeMetadata: apiSettings.includeMetadata !== undefined ? apiSettings.includeMetadata : this.knowledgeConfig.searchSettings.includeMetadata,
                    sortBy: apiSettings.sortBy || this.knowledgeConfig.searchSettings.sortBy
                };

                this.logger.info('Search settings loaded from API', {
                    topK: this.knowledgeConfig.searchSettings.topK,
                    scoreThreshold: this.knowledgeConfig.searchSettings.scoreThreshold,
                    maxTokens: this.knowledgeConfig.searchSettings.maxTokens,
                    includeMetadata: this.knowledgeConfig.searchSettings.includeMetadata
                });
            }
        } catch (error) {
            this.logger.warn('Failed to load search settings from API, using defaults', {
                error: error.message,
                defaults: this.knowledgeConfig.searchSettings
            });
        }
    }
}

module.exports = ConfigManager;
