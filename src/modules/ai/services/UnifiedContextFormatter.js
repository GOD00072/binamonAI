// aiservices/UnifiedContextFormatter.js
'use strict';

class UnifiedContextFormatter {
    constructor(logger, knowledgeRAG, configManager = null, productFormatter = null) {
        this.logger = logger;
        this.knowledgeRAG = knowledgeRAG;
        this.configManager = configManager;
        this.productFormatter = productFormatter;
        
        // Language detection patterns
        this.languagePatterns = {
            TH: /[\u0E00-\u0E7F]/,  // Thai characters
            CN: /[\u4E00-\u9FFF]/,  // Chinese characters  
            JP: /[\u3040-\u309F\u30A0-\u30FF]/,  // Hiragana and Katakana
            KR: /[\uAC00-\uD7AF]/,  // Hangul
            EN: /^[A-Za-z\s\d\.\,\!\?\-]+$/  // English
        };
        
        // User language cache
        this.userLanguageCache = new Map();
        this.userContextCache = new Map();
        
        // Default configuration with multilingual titles
        this.defaultConfig = {
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
                    maxContentLength: 2000000, // 2MB - ไม่จำกัด
                    summarizeContent: false,
                    maxResults: 1,
                    scoreThreshold: 0.5,
                    groupByCategory: true,
                    includeConfidence: true
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
                    enhanceWithKnowledge: true,
                    maxProducts: 100,
                    showRelatedProducts: true,
                    showCompatibleProducts: true,
                    combineRelatedAndCompatible: true
                },
                contextIntegration: { 
                    enabled: true,
                    crossReference: true,
                    maxCrossReferences: 20,
                    prioritizeKnowledge: false,
                    combineRelatedContent: true
                }
            },
            formatting: {
                indentation: {
                    level1: '',
                    level2: '  • ',
                    level3: '    ◦ ',
                    level4: '      - '
                },
                separators: {
                    section: '\n\n---\n\n',
                    subsection: '\n\n',
                    item: '\n',
                    subitem: '\n'
                },
                confidenceDisplay: {
                    enabled: true,
                    threshold: 0.5,
                    format: {
                        'TH': 'ความเชื่อมั่น: {confidence}%',
                        'EN': 'Confidence: {confidence}%',
                        'CN': '置信度: {confidence}%',
                        'KR': '신뢰도: {confidence}%',
                        'JP': '信頼度: {confidence}%'
                    }
                }
            }
        };

        // Initialize cache cleanup interval
        this.setupCacheCleanup();
    }

    // Setup cache cleanup interval
    setupCacheCleanup() {
        setInterval(() => {
            this.cleanupCache();
        }, 300000); // Clean every 5 minutes
    }

    // Clean expired cache entries
    cleanupCache() {
        const now = Date.now();
        const maxAge = 3600000; // 1 hour

        for (const [userId, contexts] of this.userContextCache.entries()) {
            for (const [lang, context] of contexts.entries()) {
                if (now - context.timestamp > maxAge) {
                    contexts.delete(lang);
                }
            }
            if (contexts.size === 0) {
                this.userContextCache.delete(userId);
            }
        }

        // Clean language cache
        const maxLangCacheAge = 7200000; // 2 hours
        for (const [userId, timestamp] of this.userLanguageCache.entries()) {
            if (now - timestamp > maxLangCacheAge) {
                this.userLanguageCache.delete(userId);
            }
        }
    }

    // Detect language from text
    detectLanguage(text) {
        try {
            if (!text) return 'TH'; // Default to Thai
            
            // Count characters for each language
            const counts = {};
            for (const [lang, pattern] of Object.entries(this.languagePatterns)) {
                const matches = text.match(pattern);
                counts[lang] = matches ? matches.length : 0;
            }

            // Find language with most characters
            let detectedLang = 'TH';
            let maxCount = 0;
            
            for (const [lang, count] of Object.entries(counts)) {
                if (count > maxCount) {
                    maxCount = count;
                    detectedLang = lang;
                }
            }

            // If no specific language detected, check for English
            if (maxCount === 0 && /[A-Za-z]/.test(text)) {
                detectedLang = 'EN';
            }

            this.logger.debug(`Language detected: ${detectedLang} from query: ${text.substring(0, 50)}`);
            return detectedLang;

        } catch (error) {
            this.logger.error('Error detecting language:', error);
            return 'TH';
        }
    }

    // Get or detect user language
    getUserLanguage(userId, query) {
        // Check cache first
        if (this.userLanguageCache.has(userId)) {
            const cached = this.userLanguageCache.get(userId);
            
            // Verify if current query matches cached language
            const currentLang = this.detectLanguage(query);
            if (currentLang !== cached.language) {
                this.logger.info(`User ${userId} language changed from ${cached.language} to ${currentLang}`);
                this.userLanguageCache.set(userId, {
                    language: currentLang,
                    timestamp: Date.now()
                });
                return currentLang;
            }
            
            return cached.language;
        }

        // Detect language for new user
        const detectedLang = this.detectLanguage(query);
        this.userLanguageCache.set(userId, {
            language: detectedLang,
            timestamp: Date.now()
        });
        
        this.logger.info(`New user ${userId} detected language: ${detectedLang}`);
        return detectedLang;
    }

    // Main method to format unified context
    async formatUnifiedContext(options = {}) {
        try {
            const {
                query,
                userId,
                products = [],
                knowledgeResults = [],
                language = null,
                userProfile = null,
                historicalContext = null,
                customConfig = null
            } = options;

            // Detect language from query for specific user
            const detectedLang = userId ? this.getUserLanguage(userId, query) : this.detectLanguage(query);
            const lang = language || detectedLang;

            // Merge config safely
            const config = this.mergeConfig(customConfig || this.configManager?.getUnifiedFormatterConfig?.(lang) || this.defaultConfig);

            if (!config.enabled) {
                return this.formatFallbackContext(products, knowledgeResults, lang);
            }

            const sections = [];
            const enabledSections = Object.entries(config.sections)
                .filter(([, sectionConfig]) => sectionConfig.enabled)
                .sort(([, a], [, b]) => (a.order || 99) - (b.order || 99));

            this.logger.info('Formatting unified context for user', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                detectedLanguage: detectedLang,
                usedLanguage: lang,
                namespace: `knowledge-${lang.toLowerCase()}`,
                productsCount: products.length,
                knowledgeCount: knowledgeResults.length,
                enabledSections: enabledSections.map(([key]) => key),
                hasUserProfile: !!userProfile,
                hasHistoricalContext: !!historicalContext
            });

            // Process sections in order
            for (const [sectionKey, sectionConfig] of enabledSections) {
                let sectionContent = '';

                if (sectionKey === 'knowledgeContext' && knowledgeResults.length > 0) {
                    sectionContent = await this.formatKnowledgeSection(
                        knowledgeResults, 
                        sectionConfig, 
                        config.formatting,
                        lang,
                        userId
                    );
                } else if (sectionKey === 'productContext' && products.length > 0) {
                    sectionContent = await this.formatProductSection(
                        products, 
                        sectionConfig, 
                        config.formatting,
                        lang,
                        knowledgeResults,
                        userId
                    );
                }

                if (sectionContent) {
                    sections.push(sectionContent);
                }
            }

            // Cross-reference with enhanced integration
            if (config.sections.contextIntegration?.enabled && 
                config.sections.contextIntegration.crossReference &&
                products.length > 0 && knowledgeResults.length > 0) {
                const crossRefContent = this.formatCrossReference(
                    products, 
                    knowledgeResults, 
                    config.formatting,
                    lang,
                    userId
                );
                if (crossRefContent) {
                    sections.push(crossRefContent);
                }
            }

            const result = sections.join(config.formatting.separators.section);
            
            // Cache user context
            if (userId) {
                this.cacheUserContext(userId, lang, {
                    query,
                    result,
                    timestamp: Date.now(),
                    productsCount: products.length,
                    knowledgeCount: knowledgeResults.length
                });
            }
            
            this.logger.info('Unified context formatted successfully for user', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                language: lang,
                namespace: `knowledge-${lang.toLowerCase()}`,
                sectionsCount: sections.length,
                totalLength: result.length,
                cacheUpdated: !!userId
            });

            return result;

        } catch (error) {
            this.logger.error('Error formatting unified context:', error);
            return this.formatFallbackContext(options.products, options.knowledgeResults, options.language);
        }
    }

    // Format knowledge section with enhanced grouping
    async formatKnowledgeSection(knowledgeResults, sectionConfig, formatting, language, userId) {
        try {
            if (!knowledgeResults || knowledgeResults.length === 0) {
                return '';
            }

            const lines = [];
            
            // Get title for the language
            const sectionTitle = this.getSectionTitle(sectionConfig.title, language);
            lines.push(`${formatting.indentation.level1}${sectionTitle}:`);

            const defaultThreshold = sectionConfig.scoreThreshold ?? 0.25;
            const resultThreshold = knowledgeResults.reduce((min, result) => {
                if (typeof result.score_threshold === 'number') {
                    return Math.min(min, result.score_threshold);
                }
                return min;
            }, defaultThreshold);
            const effectiveThreshold = Math.min(defaultThreshold, resultThreshold);

            // Filter results by score threshold
            const filteredResults = knowledgeResults
                .filter(result => result.relevance_score >= effectiveThreshold)
                .slice(0, sectionConfig.maxResults || 15);

            if (filteredResults.length === 0) {
                const noKnowledgeMsg = {
                    'TH': 'ไม่พบความรู้ที่เกี่ยวข้อง',
                    'EN': 'No relevant knowledge found',
                    'JP': '関連する知識が見つかりません',
                    'CN': '未找到相关知识',
                    'KR': '관련 지식을 찾을 수 없습니다'
                };
                lines.push(`${formatting.indentation.level2}${noKnowledgeMsg[language] || noKnowledgeMsg['TH']}`);
                return lines.join(formatting.separators.item);
            }

            // Group by category if enabled
            if (sectionConfig.groupByCategory) {
                const groupedResults = this.groupKnowledgeByCategory(filteredResults);
                
                Object.entries(groupedResults).forEach(([category, results]) => {
                    const categoryLabels = {
                        'TH': 'หมวดหมู่',
                        'EN': 'Category',
                        'CN': '类别',
                        'KR': '카테고리',
                        'JP': 'カテゴリー'
                    };
                    
                    lines.push(`${formatting.indentation.level2}${categoryLabels[language]}: ${category}`);
                    
                    results.forEach((result, index) => {
                        const content = this.formatKnowledgeItem(
                            result, 
                            index, 
                            sectionConfig, 
                            formatting,
                            language
                        );
                        lines.push(content);
                    });
                });
            } else {
                filteredResults.forEach((result, index) => {
                    const content = this.formatKnowledgeItem(
                        result, 
                        index, 
                        sectionConfig, 
                        formatting,
                        language
                    );
                    lines.push(content);
                });
            }

            return lines.join(formatting.separators.item || '\n');

        } catch (error) {
            this.logger.error('Error formatting knowledge section:', error);
            return '';
        }
    }

    // Format individual knowledge item - แสดงเต็มไม่ตัด
    formatKnowledgeItem(result, index, sectionConfig, formatting, language) {
        const lines = [];
        
        // Add file name (ไม่ตัด)
        if (result.file_name) {
            lines.push(`${formatting.indentation.level3}${index + 1}. ${result.file_name}`);
        }

        // Add category if available
        if (result.category) {
            const categoryLabels = {
                'TH': 'หมวด',
                'EN': 'Category',
                'CN': '类别',
                'KR': '카테고리',
                'JP': 'カテゴリー'
            };
            lines.push(`${formatting.indentation.level4}${categoryLabels[language]}: ${result.category}`);
        }

        // Add full content (ไม่ตัดเนื้อหา)
        if (result.text) {
            lines.push(`${formatting.indentation.level4}${result.text}`);
        }

        // Confidence score
        if (sectionConfig.includeConfidence && result.relevance_score && 
            formatting.confidenceDisplay.enabled) {
            if (result.relevance_score >= formatting.confidenceDisplay.threshold) {
                const confidence = (result.relevance_score * 100).toFixed(1);
                const confidenceFormat = formatting.confidenceDisplay.format[language] || 
                                       formatting.confidenceDisplay.format['TH'] || 
                                       'Confidence: {confidence}%';
                const confidenceText = confidenceFormat.replace('{confidence}', confidence);
                lines.push(`${formatting.indentation.level4}${confidenceText}`);
            }
        }

        // Tags if available
        if (result.tags && result.tags.length > 0) {
            const tagLabels = {
                'TH': 'แท็ก',
                'EN': 'Tags',
                'CN': '标签',
                'KR': '태그',
                'JP': 'タグ'
            };
            lines.push(`${formatting.indentation.level4}${tagLabels[language]}: ${result.tags.join(', ')}`);
        }

        // Source information
        if (result.source || result.id) {
            const sourceLabels = {
                'TH': 'แหล่งที่มา',
                'EN': 'Source',
                'CN': '来源',
                'KR': '출처',
                'JP': '出典'
            };
            const sourceInfo = result.source || `ID: ${result.id}`;
            lines.push(`${formatting.indentation.level4}${sourceLabels[language]}: ${sourceInfo}`);
        }

        return lines.join('\n');
    }

    // Format product section with enhanced related/compatible products
    async formatProductSection(products, sectionConfig, formatting, language, knowledgeResults = [], userId) {
        try {
            if (!products || products.length === 0) {
                return '';
            }

            const lines = [];
            
            // Get title for the language
            const sectionTitle = this.getSectionTitle(sectionConfig.title, language);
            lines.push(`${formatting.indentation.level1}${sectionTitle}:`);

            // Limit products
            const limitedProducts = products.slice(0, sectionConfig.maxProducts || 50);

            // Format main products
            if (sectionConfig.useProductFormatter && this.productFormatter) {
                // Use existing product formatter
                let formattedProducts = this.productFormatter.formatProducts(limitedProducts);
                
                // Adapt formatting
                formattedProducts = this.adaptProductFormatterOutput(
                    formattedProducts, 
                    formatting,
                    language
                );

                // Enhance with knowledge if enabled
                if (sectionConfig.enhanceWithKnowledge && knowledgeResults.length > 0) {
                    formattedProducts = this.enhanceProductsWithKnowledge(
                        formattedProducts, 
                        knowledgeResults, 
                        formatting,
                        language
                    );
                }

                lines.push(formattedProducts);
            } else {
                // Basic formatter with language support
                limitedProducts.forEach((product, index) => {
                    const productContent = this.formatBasicProduct(product, index, formatting, language);
                    lines.push(productContent);
                });
            }

            // Add related and compatible products
            if (sectionConfig.showRelatedProducts || sectionConfig.showCompatibleProducts) {
                const relatedContent = this.formatAllRelatedProducts(
                    limitedProducts, 
                    sectionConfig, 
                    formatting, 
                    language
                );
                if (relatedContent) {
                    lines.push('');
                    lines.push(relatedContent);
                }
            }

            return lines.join(formatting.separators.subsection);

        } catch (error) {
            this.logger.error('Error formatting product section:', error);
            return '';
        }
    }

    // Format all related products (related_products + compatible_products)
    formatAllRelatedProducts(products, sectionConfig, formatting, language) {
        try {
            const allRelatedProducts = [];
            const seenUrls = new Set();
            
            // Collect related_products and compatible_products
            products.forEach(product => {
                // Add related products
                if (sectionConfig.showRelatedProducts && 
                    product.related_products && 
                    Array.isArray(product.related_products)) {
                    
                    product.related_products.forEach(relatedProduct => {
                        if (relatedProduct.url && !seenUrls.has(relatedProduct.url)) {
                            seenUrls.add(relatedProduct.url);
                            allRelatedProducts.push({
                                ...relatedProduct,
                                sourceProduct: product.product_name,
                                sourceType: 'related',
                                sourceUrl: product.url
                            });
                        }
                    });
                }

                // Add compatible products
                if (sectionConfig.showCompatibleProducts && 
                    product.compatible_products && 
                    Array.isArray(product.compatible_products)) {
                    
                    product.compatible_products.forEach(compatibleProduct => {
                        if (compatibleProduct.url && !seenUrls.has(compatibleProduct.url)) {
                            seenUrls.add(compatibleProduct.url);
                            allRelatedProducts.push({
                                ...compatibleProduct,
                                sourceProduct: product.product_name,
                                sourceType: 'compatible',
                                sourceUrl: product.url
                            });
                        }
                    });
                }
            });

            if (allRelatedProducts.length === 0) {
                return '';
            }

            const lines = [];
            
            // Decide on title based on combination setting
            if (sectionConfig.combineRelatedAndCompatible) {
                const combinedTitles = {
                    'TH': 'สินค้าที่เกี่ยวข้องและเข้ากันได้',
                    'EN': 'Related and Compatible Products',
                    'JP': '関連・互換製品',
                    'CN': '相关和兼容产品',
                    'KR': '관련 및 호환 제품'
                };
                lines.push(`${formatting.indentation.level1}${combinedTitles[language] || combinedTitles['TH']}:`);
                
                // Group by type if needed
                const relatedProducts = allRelatedProducts.filter(p => p.sourceType === 'related');
                const compatibleProducts = allRelatedProducts.filter(p => p.sourceType === 'compatible');
                
                if (relatedProducts.length > 0) {
                    const relatedTitles = {
                        'TH': 'สินค้าที่เกี่ยวข้อง',
                        'EN': 'Related Products',
                        'JP': '関連製品',
                        'CN': '相关产品',
                        'KR': '관련 제품'
                    };
                    lines.push(`${formatting.indentation.level2}${relatedTitles[language]}:`);
                    this.formatRelatedProductsList(relatedProducts, lines, formatting, language);
                }
                
                if (compatibleProducts.length > 0) {
                    const compatibleTitles = {
                        'TH': 'สินค้าที่เข้ากันได้',
                        'EN': 'Compatible Products',
                        'JP': '互換製品',
                        'CN': '兼容产品',
                        'KR': '호환 제품'
                    };
                    lines.push(`${formatting.indentation.level2}${compatibleTitles[language]}:`);
                    this.formatRelatedProductsList(compatibleProducts, lines, formatting, language);
                }
            } else {
                // Show all together
                const allTitles = {
                    'TH': 'สินค้าที่เกี่ยวข้อง',
                    'EN': 'Related Products',
                    'JP': '関連製品',
                    'CN': '相关产品',
                    'KR': '관련 제품'
                };
                lines.push(`${formatting.indentation.level1}${allTitles[language] || allTitles['TH']}:`);
                this.formatRelatedProductsList(allRelatedProducts, lines, formatting, language);
            }

            return lines.join('\n');

        } catch (error) {
            this.logger.error('Error formatting all related products:', error);
            return '';
        }
    }

    // Format related products list
    formatRelatedProductsList(productsList, lines, formatting, language) {
        const labels = {
            price: {
                'TH': 'ราคา',
                'EN': 'Price',
                'CN': '价格',
                'KR': '가격',
                'JP': '価格'
            },
            minOrder: {
                'TH': 'สั่งขั้นต่ำ',
                'EN': 'Minimum Order',
                'CN': '最小订单',
                'KR': '최소 주문',
                'JP': '最小注文'
            },
            sourceFrom: {
                'TH': 'เกี่ยวข้องกับ',
                'EN': 'Related to',
                'CN': '与...相关',
                'KR': '관련 제품',
                'JP': '関連元'
            },
            type: {
                related: {
                    'TH': 'สินค้าที่เกี่ยวข้อง',
                    'EN': 'Related',
                    'CN': '相关',
                    'KR': '관련',
                    'JP': '関連'
                },
                compatible: {
                    'TH': 'สินค้าที่เข้ากันได้',
                    'EN': 'Compatible',
                    'CN': '兼容',
                    'KR': '호환',
                    'JP': '互換'
                }
            }
        };

        productsList.forEach((relatedProduct, index) => {
            // Product name (ไม่ตัด)
            lines.push(`${formatting.indentation.level3}${index + 1}. ${relatedProduct.title || relatedProduct.product_name || 'ไม่ระบุชื่อ'}`);
            
            // Type indicator
            if (relatedProduct.sourceType) {
                const typeLabel = labels.type[relatedProduct.sourceType];
                if (typeLabel) {
                    lines.push(`${formatting.indentation.level4}ประเภท: ${typeLabel[language] || typeLabel['TH']}`);
                }
            }
            
            // Price information
            if (relatedProduct.price_text) {
                lines.push(`${formatting.indentation.level4}${labels.price[language]}: ${relatedProduct.price_text}`);
            }
            
            // Minimum order
            if (relatedProduct.min_order) {
                lines.push(`${formatting.indentation.level4}${labels.minOrder[language]}: ${relatedProduct.min_order}`);
            }
            
            // URL
            if (relatedProduct.url) {
                lines.push(`${formatting.indentation.level4}URL: ${relatedProduct.url}`);
            }
            
            // Source product information
            if (relatedProduct.sourceProduct) {
                lines.push(`${formatting.indentation.level4}${labels.sourceFrom[language]}: ${relatedProduct.sourceProduct}`);
            }

            // Additional details if available
            if (relatedProduct.description) {
                lines.push(`${formatting.indentation.level4}รายละเอียด: ${relatedProduct.description}`);
            }

            // Separator between products
            if (index < productsList.length - 1) {
                lines.push('');
            }
        });
    }

    // Format basic product information - แสดงเต็มไม่ตัด
    formatBasicProduct(product, index, formatting, language) {
        const lines = [];
        
        // Product name (ไม่ตัดชื่อสินค้า)
        const productName = product.product_name || 'ไม่ระบุชื่อ';
        lines.push(`${formatting.indentation.level2}${index + 1}. ${productName}`);
        
        const labels = {
            price: {
                'TH': 'ราคา',
                'EN': 'Price',
                'CN': '价格',
                'KR': '가격',
                'JP': '価格'
            },
            stock: {
                'TH': 'จำนวนคงเหลือ',
                'EN': 'Stock',
                'CN': '库存',
                'KR': '재고',
                'JP': '在庫'
            },
            unit: {
                'TH': 'ชิ้น',
                'EN': 'units',
                'CN': '件',
                'KR': '개',
                'JP': '個'
            },
            category: {
                'TH': 'หมวดหมู่',
                'EN': 'Category',
                'CN': '类别',
                'KR': '카테고리',
                'JP': 'カテゴリー'
            },
            sku: {
                'TH': 'รหัสสินค้า',
                'EN': 'SKU',
                'CN': '商品编码',
                'KR': '상품 코드',
                'JP': '商品コード'
            },
            description: {
                'TH': 'รายละเอียด',
                'EN': 'Description',
                'CN': '描述',
                'KR': '설명',
                'JP': '説明'
            }
        };
        
        // Price
        if (product.price) {
            lines.push(`${formatting.indentation.level3}${labels.price[language] || labels.price['TH']}: ${product.price}`);
        }
        
        // Stock quantity
        if (product.stock_quantity !== undefined) {
            lines.push(`${formatting.indentation.level3}${labels.stock[language] || labels.stock['TH']}: ${product.stock_quantity} ${labels.unit[language] || labels.unit['TH']}`);
        }

        // Category
        if (product.category) {
            lines.push(`${formatting.indentation.level3}${labels.category[language] || labels.category['TH']}: ${product.category}`);
        }

        // SKU
        if (product.sku) {
            lines.push(`${formatting.indentation.level3}${labels.sku[language] || labels.sku['TH']}: ${product.sku}`);
        }

        // Short description (ไม่ตัด)
        if (product.short_description) {
            lines.push(`${formatting.indentation.level3}${labels.description[language] || labels.description['TH']}: ${product.short_description}`);
        }

        // URL
        if (product.url) {
            lines.push(`${formatting.indentation.level3}URL: ${product.url}`);
        }

        // Voodoo pricing if available
        if (product.voodoo_pricing && product.voodoo_pricing.prices) {
            const pricingLabels = {
                'TH': 'ราคาขายจากโรงงาน',
                'EN': 'Factory Direct Pricing',
                'CN': '工厂直销价格',
                'KR': '공장 직판 가격',
                'JP': '工場直販価格'
            };
            lines.push(`${formatting.indentation.level3}${pricingLabels[language] || pricingLabels['TH']}:`);
            
            product.voodoo_pricing.prices.forEach(priceInfo => {
                lines.push(`${formatting.indentation.level4}${priceInfo.quantity}: ฿${priceInfo.price}`);
            });
        }

        return lines.join('\n');
    }

    // Get section title based on language
    getSectionTitle(titleConfig, language) {
        if (typeof titleConfig === 'string') {
            return titleConfig;
        }
        
        if (typeof titleConfig === 'object' && titleConfig !== null) {
            return titleConfig[language] || titleConfig['TH'] || titleConfig['EN'] || 'Section Title';
        }
        
        return 'Section Title';
    }

    // Format cross references between products and knowledge
    formatCrossReference(products, knowledgeResults, formatting, language, userId) {
        try {
            if (!products.length || !knowledgeResults.length) {
                return '';
            }

            const crossRefs = this.findCrossReferences(products, knowledgeResults);
            if (crossRefs.length === 0) {
                return '';
            }

            const lines = [];
            const titles = {
                'TH': 'ข้อมูลที่เชื่อมโยงกัน',
                'EN': 'Cross-Referenced Information',
                'JP': '相互参照情報',
                'CN': '交叉引用信息',
                'KR': '상호 참조 정보'
            };

            lines.push(`${formatting.indentation.level1}${titles[language] || titles['TH']}:`);

            crossRefs.forEach((ref, index) => {
                const descriptionTemplates = {
                    'TH': `สินค้า "${ref.productName}" เชื่อมโยงกับเอกสาร "${ref.knowledgeName}"`,
                    'EN': `Product "${ref.productName}" is related to document "${ref.knowledgeName}"`,
                    'CN': `产品 "${ref.productName}" 与文档 "${ref.knowledgeName}" 相关`,
                    'KR': `제품 "${ref.productName}"이(가) 문서 "${ref.knowledgeName}"과(와) 관련됨`,
                    'JP': `製品「${ref.productName}」は文書「${ref.knowledgeName}」に関連しています`
                };
                
                lines.push(`${formatting.indentation.level2}${index + 1}. ${descriptionTemplates[language] || ref.description}`);
                
                if (ref.matches && ref.matches.length > 0) {
                    const detailsTemplates = {
                        'TH': `คำสำคัญที่ตรงกัน: ${ref.matches.join(', ')}`,
                        'EN': `Matching keywords: ${ref.matches.join(', ')}`,
                        'CN': `匹配关键词: ${ref.matches.join(', ')}`,
                        'KR': `일치하는 키워드: ${ref.matches.join(', ')}`,
                        'JP': `一致するキーワード: ${ref.matches.join(', ')}`
                    };
                    lines.push(`${formatting.indentation.level3}${detailsTemplates[language] || ref.details}`);
                }

                // Match strength indicator
                if (ref.matchStrength > 0.5) {
                    const strengthLabels = {
                        'TH': 'ความเกี่ยวข้อง: สูง',
                        'EN': 'Relevance: High',
                        'CN': '相关性: 高',
                        'KR': '관련성: 높음',
                        'JP': '関連性: 高'
                    };
                    lines.push(`${formatting.indentation.level3}${strengthLabels[language] || strengthLabels['TH']}`);
                }
            });

            return lines.join(formatting.separators.item);

        } catch (error) {
            this.logger.error('Error formatting cross reference:', error);
            return '';
        }
    }

    // Find cross references between products and knowledge
    findCrossReferences(products, knowledgeResults) {
        const crossRefs = [];

        try {
            products.forEach(product => {
                knowledgeResults.forEach(knowledge => {
                    if (product.product_name && knowledge.text) {
                        const productKeywords = product.product_name.toLowerCase().split(/\s+/)
                            .filter(keyword => keyword.length > 2);
                        const knowledgeText = knowledge.text.toLowerCase();

                        const matches = productKeywords.filter(keyword => 
                            knowledgeText.includes(keyword)
                        );

                        if (matches.length > 0) {
                            crossRefs.push({
                                productName: product.product_name, // ไม่ตัด
                                knowledgeName: knowledge.file_name, // ไม่ตัด
                                description: `สินค้า "${product.product_name}" เชื่อมโยงกับเอกสาร "${knowledge.file_name}"`,
                                details: `คำสำคัญที่ตรงกัน: ${matches.join(', ')}`,
                                matches: matches,
                                productId: product.id,
                                knowledgeId: knowledge.id,
                                matchStrength: matches.length / productKeywords.length
                            });
                        }
                    }
                });
            });

            // Sort by match strength
            return crossRefs.sort((a, b) => b.matchStrength - a.matchStrength)
                           .slice(0, 20); // Limit to top 20 cross-references

        } catch (error) {
            this.logger.error('Error finding cross references:', error);
            return [];
        }
    }

    // Adapt product formatter output for unified format
    adaptProductFormatterOutput(formattedProducts, formatting, language) {
        if (!formattedProducts) return '';
        
        const lines = formattedProducts.split('\n');
        const adaptedLines = lines.map(line => {
            // Translate common product labels based on language
            if (language !== 'TH') {
                const translations = {
                    'EN': {
                        'สินค้าอันดับที่': 'Product #',
                        'ราคา': 'Price',
                        'จำนวน': 'Quantity',
                        'หมวดหมู่': 'Category',
                        'คงเหลือ': 'In stock',
                        'รหัสสินค้า': 'SKU'
                    },
                    'CN': {
                        'สินค้าอันดับที่': '产品 #',
                        'ราคา': '价格',
                        'จำนวน': '数量',
                        'หมวดหมู่': '类别',
                        'คงเหลือ': '库存',
                        'รหัสสินค้า': '商品编码'
                    },
                    'KR': {
                        'สินค้าอันดับที่': '제품 #',
                        'ราคา': '가격',
                        'จำนวน': '수량',
                        'หมวดหมู่': '카테고리',
                        'คงเหลือ': '재고',
                        'รหัสสินค้า': '상품 코드'
                    },
                    'JP': {
                        'สินค้าอันดับที่': '製品 #',
                        'ราคา': '価格',
                        'จำนวน': '数量',
                        'หมวดหมู่': 'カテゴリー',
                        'คงเหลือ': '在庫',
                        'รหัสสินค้า': '商品コード'
                    }
                };

                if (translations[language]) {
                    let translatedLine = line;
                    Object.entries(translations[language]).forEach(([thai, translated]) => {
                        translatedLine = translatedLine.replace(new RegExp(thai, 'g'), translated);
                    });
                    line = translatedLine;
                }
            }

            // Adjust indentation
            if (line.startsWith('สินค้า') || line.startsWith('Product') || /^[0-9]+\./.test(line.trim())) {
                return `${formatting.indentation.level2}${line}`;
            } else if (line.startsWith('  • ')) {
                return `${formatting.indentation.level3}${line.substring(4)}`;
            } else if (line.startsWith('    ◦ ')) {
                return `${formatting.indentation.level4}${line.substring(6)}`;
            }
            return line;
        });

        return adaptedLines.join('\n');
    }

    // Enhance products with knowledge information
    enhanceProductsWithKnowledge(formattedProducts, knowledgeResults, formatting, language) {
        try {
            let enhanced = formattedProducts;

            const enhanceLabels = {
                'TH': 'ข้อมูลเพิ่มเติมจากฐานความรู้',
                'EN': 'Additional Information from Knowledge Base',
                'CN': '来自知识库的附加信息',
                'KR': '지식 베이스의 추가 정보',
                'JP': 'ナレッジベースからの追加情報'
            };

            // Find relevant knowledge for products
            const relevantKnowledge = knowledgeResults.filter(knowledge => 
                knowledge.relevance_score >= 0.8
            ).slice(0, 1); // Top 5 most relevant

            if (relevantKnowledge.length > 0) {
                enhanced += `\n\n${formatting.indentation.level2}${enhanceLabels[language] || enhanceLabels['TH']}:`;
                
                relevantKnowledge.forEach((knowledge, index) => {
                    if (knowledge.text && knowledge.file_name) {
                        enhanced += `\n${formatting.indentation.level3}${index + 1}. ${knowledge.file_name}`;
                        enhanced += `\n${formatting.indentation.level4}${knowledge.text}`;
                    }
                });
            }

            return enhanced;

        } catch (error) {
            this.logger.error('Error enhancing products with knowledge:', error);
            return formattedProducts;
        }
    }

    // Group knowledge by category
    groupKnowledgeByCategory(knowledgeResults) {
        const grouped = {};
        
        knowledgeResults.forEach(result => {
            const category = result.category || 'ไม่ระบุหมวดหมู่';
            if (!grouped[category]) {
                grouped[category] = [];
            }
            grouped[category].push(result);
        });

        // Sort categories by number of items (descending)
        const sortedGrouped = {};
        Object.keys(grouped)
            .sort((a, b) => grouped[b].length - grouped[a].length)
            .forEach(key => {
                sortedGrouped[key] = grouped[key];
            });

        return sortedGrouped;
    }

    // Format fallback context when main formatting fails
    formatFallbackContext(products, knowledgeResults, language = 'TH') {
        const sections = [];
        
        const headers = {
            knowledge: {
                'TH': 'ความรู้ที่เกี่ยวข้อง:',
                'EN': 'Related Knowledge:',
                'CN': '相关知识:',
                'KR': '관련 지식:',
                'JP': '関連知識:'
            },
            products: {
                'TH': 'ข้อมูลสินค้าที่เกี่ยวข้อง:',
                'EN': 'Related Product Information:',
                'CN': '相关产品信息:',
                'KR': '관련 제품 정보:',
                'JP': '関連製品情報:'
            }
        };
        
        // Add knowledge section
        if (knowledgeResults && knowledgeResults.length > 0) {
            sections.push(headers.knowledge[language] || headers.knowledge['TH']);
            knowledgeResults.slice(0, 5).forEach((result, index) => {
                sections.push(`${index + 1}. ${result.file_name || 'Unknown'}: ${(result.text || '').substring(0, 200)}${result.text && result.text.length > 200 ? '...' : ''}`);
            });
        }

        // Add products section
        if (products && products.length > 0) {
            sections.push('\n' + (headers.products[language] || headers.products['TH']));
            products.slice(0, 10).forEach((product, index) => {
                sections.push(`${index + 1}. ${product.product_name || 'ไม่ระบุชื่อ'}`);
                if (product.price) sections.push(`   ราคา: ${product.price}`);
                if (product.url) sections.push(`   URL: ${product.url}`);
            });
        }

        return sections.join('\n');
    }

    // Cache user context
    cacheUserContext(userId, language, context) {
        if (!this.userContextCache.has(userId)) {
            this.userContextCache.set(userId, new Map());
        }
        
        const userCache = this.userContextCache.get(userId);
        userCache.set(language, context);
        
        // Keep only last 3 contexts per user per language
        if (userCache.size > 3) {
            const oldestKey = userCache.keys().next().value;
            userCache.delete(oldestKey);
        }
    }

    // Get cached context for user
    getCachedUserContext(userId, language) {
        if (!this.userContextCache.has(userId)) {
            return null;
        }
        
        const userCache = this.userContextCache.get(userId);
        return userCache.get(language) || null;
    }

    // Clear user cache
    clearUserCache(userId = null) {
        if (userId) {
            this.userLanguageCache.delete(userId);
            this.userContextCache.delete(userId);
            this.logger.info(`Cleared cache for user ${userId.substring(0, 10)}...`);
        } else {
            this.userLanguageCache.clear();
            this.userContextCache.clear();
            this.logger.info('Cleared all user caches');
        }
    }

    // Get user statistics
    getUserStatistics() {
        const stats = {
            totalUsers: this.userLanguageCache.size,
            languageDistribution: {},
            contextCacheSize: this.userContextCache.size,
            cachedContexts: [],
            cacheMemoryUsage: 0
        };

        // Count language distribution
        for (const [userId, data] of this.userLanguageCache.entries()) {
            const lang = data.language || 'TH';
            stats.languageDistribution[lang] = (stats.languageDistribution[lang] || 0) + 1;
        }

        // Get cached context info and calculate memory usage
        for (const [userId, contexts] of this.userContextCache.entries()) {
            for (const [lang, context] of contexts.entries()) {
                const contextInfo = {
                    userId: userId.substring(0, 10) + '...',
                    language: lang,
                    timestamp: context.timestamp,
                    size: context.result?.length || 0,
                    productsCount: context.productsCount || 0,
                    knowledgeCount: context.knowledgeCount || 0
                };
                stats.cachedContexts.push(contextInfo);
                stats.cacheMemoryUsage += contextInfo.size;
            }
        }

        return stats;
    }

    // Safe config merging with improved error handling
    mergeConfig(config) {
        try {
            const merged = JSON.parse(JSON.stringify(this.defaultConfig));
            
            if (!config) return merged;
            
            // Deep merge with safe handling
            const deepMerge = (target, source) => {
                if (!source || typeof source !== 'object') return;
                
                Object.keys(source).forEach(key => {
                    try {
                        const sourceValue = source[key];
                        const targetValue = target[key];
                        
                        // Handle null/undefined
                        if (sourceValue === null || sourceValue === undefined) {
                            return;
                        }
                        
                        // Handle string vs object conflicts
                        if (typeof targetValue === 'string' && typeof sourceValue === 'object' && sourceValue !== null) {
                            target[key] = sourceValue; // Object wins over string
                        } else if (typeof targetValue === 'object' && targetValue !== null && typeof sourceValue === 'string') {
                            // Keep target object, ignore source string
                            return;
                        } else if (Array.isArray(sourceValue)) {
                            target[key] = [...sourceValue]; // Clone array
                        } else if (sourceValue && typeof sourceValue === 'object' && 
                                  targetValue && typeof targetValue === 'object' && 
                                  !Array.isArray(sourceValue) && !Array.isArray(targetValue)) {
                            // Both are objects, merge recursively
                            if (!target[key]) target[key] = {};
                            deepMerge(target[key], sourceValue);
                        } else {
                            // Simple assignment
                            target[key] = sourceValue;
                        }
                    } catch (keyError) {
                        this.logger.warn(`Error merging config key ${key}:`, keyError);
                    }
                });
            };
            
            deepMerge(merged, config);
            return merged;
            
        } catch (error) {
            this.logger.error('Error in config merge, using default:', error);
            return JSON.parse(JSON.stringify(this.defaultConfig));
        }
    }

    // Configuration management methods
    updateConfig(newConfig) {
        try {
            if (this.configManager && typeof this.configManager.updateUnifiedFormatterConfig === 'function') {
                return this.configManager.updateUnifiedFormatterConfig(newConfig);
            }
            this.defaultConfig = this.mergeConfig(newConfig);
            this.logger.info('Configuration updated successfully');
            return true;
        } catch (error) {
            this.logger.error('Error updating configuration:', error);
            return false;
        }
    }

    getConfig(language = null) {
        try {
            if (this.configManager && typeof this.configManager.getUnifiedFormatterConfig === 'function') {
                return this.configManager.getUnifiedFormatterConfig(language);
            }
            return JSON.parse(JSON.stringify(this.defaultConfig));
        } catch (error) {
            this.logger.error('Error getting configuration:', error);
            return this.defaultConfig;
        }
    }

    resetConfig() {
        try {
            const resetConfig = {
                enabled: true,
                sections: {
                    knowledgeContext: { enabled: true, order: 1 },
                    productContext: { enabled: true, order: 2 },
                    contextIntegration: { enabled: true }
                }
            };
            
            if (this.configManager && typeof this.configManager.updateUnifiedFormatterConfig === 'function') {
                return this.configManager.updateUnifiedFormatterConfig(resetConfig);
            }
            
            this.defaultConfig = this.mergeConfig(resetConfig);
            this.logger.info('Configuration reset to defaults');
            return true;
        } catch (error) {
            this.logger.error('Error resetting configuration:', error);
            return false;
        }
    }

    // Health check with detailed status
    healthCheck() {
        try {
            const stats = this.getUserStatistics();
            
            return {
                status: 'healthy',
                version: '2.0.0',
                components: {
                    knowledgeRAG: !!this.knowledgeRAG,
                    configManager: !!this.configManager,
                    productFormatter: !!this.productFormatter
                },
                performance: {
                    userCacheSize: this.userLanguageCache.size,
                    contextCacheSize: this.userContextCache.size,
                    cacheMemoryUsage: stats.cacheMemoryUsage,
                    totalUsers: stats.totalUsers
                },
                languageSupport: {
                    supportedLanguages: Object.keys(this.languagePatterns),
                    languageDistribution: stats.languageDistribution
                },
                cacheStats: {
                    contexts: stats.cachedContexts.length,
                    avgContextSize: stats.cacheMemoryUsage / Math.max(stats.cachedContexts.length, 1),
                    oldestContext: stats.cachedContexts.length > 0 ? 
                        Math.min(...stats.cachedContexts.map(c => c.timestamp)) : null
                },
                timestamp: Date.now()
            };
        } catch (error) {
            this.logger.error('Error in health check:', error);
            return {
                status: 'error',
                error: error.message,
                timestamp: Date.now()
            };
        }
    }

    // Performance monitoring
    getPerformanceMetrics() {
        const stats = this.getUserStatistics();
        
        return {
            cacheEfficiency: {
                userLanguageCache: this.userLanguageCache.size,
                contextCache: this.userContextCache.size,
                memoryUsage: stats.cacheMemoryUsage,
                averageContextSize: stats.cacheMemoryUsage / Math.max(stats.cachedContexts.length, 1)
            },
            languageMetrics: {
                totalUsers: stats.totalUsers,
                languageDistribution: stats.languageDistribution,
                mostUsedLanguage: Object.entries(stats.languageDistribution)
                    .sort(([,a], [,b]) => b - a)[0]?.[0] || 'TH'
            },
            contextMetrics: {
                totalContexts: stats.cachedContexts.length,
                averageAge: stats.cachedContexts.length > 0 ? 
                    (Date.now() - stats.cachedContexts.reduce((sum, c) => sum + c.timestamp, 0) / stats.cachedContexts.length) / 1000 : 0,
                averageProductsPerContext: stats.cachedContexts.length > 0 ?
                    stats.cachedContexts.reduce((sum, c) => sum + (c.productsCount || 0), 0) / stats.cachedContexts.length : 0,
                averageKnowledgePerContext: stats.cachedContexts.length > 0 ?
                    stats.cachedContexts.reduce((sum, c) => sum + (c.knowledgeCount || 0), 0) / stats.cachedContexts.length : 0
            },
            timestamp: Date.now()
        };
    }

    // Cleanup and shutdown
    cleanup() {
        try {
            this.clearUserCache();
            this.logger.info('UnifiedContextFormatter cleanup completed');
        } catch (error) {
            this.logger.error('Error during cleanup:', error);
        }
    }
}

module.exports = UnifiedContextFormatter;
