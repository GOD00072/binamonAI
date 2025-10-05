// services/ProductSearchService.js
'use strict';

const path = require('path');
const fs = require('fs').promises;
const { PRODUCTS_DIR } = require('../../../app/paths');

class ProductSearchService {
    constructor(logger, vectorDBService, cacheService, chatHistory) {
        this.logger = logger;
        this.vectorDBService = vectorDBService;
        this.cacheService = cacheService;
        this.chatHistory = chatHistory;
        
        // Configuration parameters
        this.TOP_RESULTS = 5;
        this.CONTEXT_WINDOW = 15;
        this.RELEVANCE_THRESHOLD = 0.03;

        // Intent detection patterns
        this.intentKeywords = {
            price: ['ราคา', 'กี่บาท', 'แพง', 'ถูก', 'ลด', 'โปรโมชั่น', 'บาท', 'ราคาเท่าไหร่', 'เท่าไร'],
            availability: ['มีของ', 'สต็อก', 'พร้อมส่ง', 'ของหมด', 'สั่งได้', 'เหลือ', 'มีกี่', 'คงเหลือ', 'เหลือเท่าไหร่'],
            delivery: ['ส่ง', 'จัดส่ง', 'เวลาส่ง', 'ค่าส่ง', 'ขนส่ง', 'รับของ', 'ส่งไปที่'],
            specification: ['สเปค', 'ขนาด', 'รายละเอียด', 'วัสดุ', 'น้ำหนัก', 'ml', 'มล', 'รูปทรง', 'มิติ'],
            material: ['กระดาษ', 'พลาสติก', 'ลูกฟูก', 'เคลือบ', 'pe', 'แกรม']
        };
        
        // Enhanced product attribute mappings
        this.productAttributes = {
            dimensions: ['ml', 'oz', 'ออนซ์', 'มล', 'ลิตร', 'L', 'cm', 'ซม', 'นิ้ว', 'กิโล', 'kg', 'มม'],
            materials: ['กระดาษ', 'พลาสติก', 'ไบโอ', 'bio', 'paper', 'plastic', 'PET', 'PP', 'PE', 'ลูกฟูก', 'คราฟท์', 'ขาว'],
            types: ['แก้ว', 'กล่อง', 'ถ้วย', 'จาน', 'ช้อน', 'ส้อม', 'มีด', 'ฝา', 'ถุง', 'ถาด', 'ไดคัท', 'ใส่อาหาร'],
            categories: ['ร้อน', 'เย็น', 'แช่แข็ง', 'อาหาร', 'เครื่องดื่ม', 'ของหวาน', 'ซอส', 'ทะเล', 'ไก่ทอด']
        };
        
        // Chat context state
        this.conversationState = new Map();
        this.productContextCache = cacheService;
        
        // Initialize context expiration cleanup
        setInterval(() => this.cleanupExpiredContexts(), 1000 * 60 * 60); // Clean every hour
    }

    async searchProducts(query, userId = 'default') {
        try {
            const startTime = Date.now();
            this.logger.info(`Starting product search for query: "${query}"`, { userId });
            
            // Load chat and conversation history
            const chatHistory = await this.chatHistory.loadAIChatHistory(userId);
            const userState = await this.loadUserState(userId);
            
            // Analyze if this is a follow-up query
            const isFollowup = this.isFollowupQuery(query, userState);
            this.logger.info(`Query followup analysis:`, { 
                isFollowup,
                lastProductId: userState.lastProductId,
                queryLength: query.length
            });
            
            // Enhance query for better search results
            const enhancedQuery = this.enhanceQueryForSearch(query);
            this.logger.info(`Enhanced query: "${enhancedQuery}"`, { userId });
            
            // Analyze query and extract meaningful information
            const analysisResult = await this.analyzeQuery(enhancedQuery, userId, userState, isFollowup);
            
            // Process historical context to inform search
            const historicalContext = await this.processHistoricalContext(chatHistory);
            
            // Fetch candidate search results
            let searchResults = [];
            let searchMethod = 'fallback';
            
            try {
                // Try vector search first
                const embedding = await this.vectorDBService.getEmbedding(analysisResult.enhancedQuery);
                
                if (embedding && embedding.length > 0) {
                    searchResults = await this.performVectorSearch(embedding, analysisResult);
                    searchMethod = 'vector';
                    
                    this.logger.info(`Vector search returned ${searchResults.length} results`, {
                        query: enhancedQuery,
                        userId,
                        vectorLength: embedding.length 
                    });
                } else {
                    throw new Error('Empty embedding returned');
                }
            } catch (vectorSearchError) {
                this.logger.warn('Vector search failed, using keyword search', {
                    error: vectorSearchError.message
                });
                
                // Fall back to keyword search
                searchResults = await this.performKeywordSearch(enhancedQuery, analysisResult);
                searchMethod = 'keyword';
                
                this.logger.info(`Keyword search returned ${searchResults.length} results`, {
                    query: enhancedQuery, 
                    userId
                });
            }
            
            // If still no results, try directory fallback
            if (searchResults.length === 0) {
                this.logger.warn('No search results found with primary methods, trying directory fallback');
                searchResults = await this.directoryFallbackSearch(enhancedQuery, analysisResult);
                searchMethod = 'directory';
                
                this.logger.info(`Directory fallback returned ${searchResults.length} results`, {
                    query: enhancedQuery
                });
                
                // If still no results, try with general keywords
                if (searchResults.length === 0) {
                    const generalKeywords = this.extractGeneralKeywords(query);
                    this.logger.info(`Trying with general keywords: ${generalKeywords.join(', ')}`);
                    
                    searchResults = await this.directoryFallbackSearch(
                        generalKeywords.join(' '), 
                        analysisResult
                    );
                    searchMethod = 'general_keywords';
                    
                    this.logger.info(`General keywords search returned ${searchResults.length} results`);
                }
            }
            
            // Special handling for followup queries about previous products
            if (isFollowup && searchResults.length === 0 && userState.lastProductId) {
                this.logger.info(`Follow-up query with no results, retrieving last product: ${userState.lastProductId}`);
                
                try {
                    // Get the product directly from the cache or DB
                    const lastProduct = await this.getProductById(userState.lastProductId);
                    
                    if (lastProduct) {
                        searchResults = [lastProduct];
                        searchMethod = 'context_retrieval';
                        
                        this.logger.info(`Retrieved last product for context continuity`, {
                            productId: lastProduct.id,
                            productName: lastProduct.product_name
                        });
                    }
                } catch (productError) {
                    this.logger.error(`Failed to retrieve last product:`, {
                        productId: userState.lastProductId,
                        error: productError.message
                    });
                }
            }
            
            // If followup query, consider historical products
            if (isFollowup && 
                historicalContext.productInterests && 
                historicalContext.productInterests.length > 0 &&
                searchResults.length === 0) {
                
                if (historicalContext.relevantProducts && historicalContext.relevantProducts.length > 0) {
                    const relevantProducts = historicalContext.relevantProducts;
                    
                    this.logger.info('Using complete products from history for followup query:', {
                        query,
                        productCount: relevantProducts.length,
                        products: relevantProducts.map(p => p.product_name)
                    });
                    
                    searchResults = [...relevantProducts];
                    searchMethod = 'history_retrieval';
                }
            }
            
            // Rank, boost, and filter results
            const rankedResults = await this.rankAndFilterResults(
                searchResults,
                analysisResult,
                historicalContext,
                userState,
                isFollowup,
                query
            );
            
            // Update conversation state with this interaction
            if (rankedResults.length > 0) {
                const topProduct = rankedResults[0];
                await this.updateUserState(userId, {
                    lastProductId: topProduct.id,
                    lastProductName: topProduct.product_name,
                    lastQuery: query,
                    lastQueryTime: Date.now(),
                    lastIntent: analysisResult.intent
                });
                
                this.logger.info(`Updated conversation state with top product: ${topProduct.product_name}`, {
                    userId,
                    productId: topProduct.id
                });
            }
            
            // Save search context for later use
            await this.updateProductContext(userId, rankedResults);
            
            const endTime = Date.now();
            this.logger.info(`Search completed in ${endTime - startTime}ms with ${rankedResults.length} results`, {
                query,
                userId,
                searchMethod,
                executionTimeMs: endTime - startTime
            });
            
            return {
                results: rankedResults,
                analysis: {
                    ...analysisResult,
                    historicalContext,
                    isFollowup
                },
                metadata: {
                    totalResults: rankedResults.length,
                    searchMethod,
                    executionTimeMs: endTime - startTime
                }
            };
        } catch (error) {
            this.logger.error('Search failed:', {
                error: error.message,
                stack: error.stack,
                query
            });
            
            return {
                results: [],
                analysis: { originalQuery: query },
                metadata: { 
                    totalResults: 0,
                    searchMethod: 'failed',
                    error: error.message
                }
            };
        }
    }

    async getProductById(productId) {
        try {
            // Try to get from cache first
            const cacheKey = `product_${productId}`;
            let product = this.cacheService.get(cacheKey);
            
            if (product) {
                return product;
            }
            
            // If not in cache, try to fetch using vector DB ID lookup
            try {
                product = await this.vectorDBService.getVectorById(productId, 'products');
                
                if (product) {
                    // Transform to standard format
                    const transformedProduct = this.transformProductData(product);
                    
                    // Cache for future use
                    this.cacheService.set(cacheKey, transformedProduct, 3600); // 1 hour
                    
                    return transformedProduct;
                }
            } catch (vectorError) {
                this.logger.warn(`Failed to get product by vector ID: ${productId}`, {
                    error: vectorError.message
                });
            }
            
            // As last resort, try direct file lookup
            const fs = require('fs').promises;
            const path = require('path');
            
            // Get the products directory
            const productsDir = PRODUCTS_DIR;
            let filePath;
            
            // Try different possible file patterns
            const possiblePaths = [
                path.join(productsDir, `${productId}.json`),
                path.join(productsDir, `product_${productId}.json`),
                path.join(productsDir, `${productId.replace('product_', '')}.json`)
            ];
            
            for (const testPath of possiblePaths) {
                try {
                    await fs.access(testPath);
                    filePath = testPath;
                    break;
                } catch {
                    // File doesn't exist, try next
                }
            }
            
            if (filePath) {
                const content = await fs.readFile(filePath, 'utf8');
                product = JSON.parse(content);
                
                // Cache for future use
                this.cacheService.set(cacheKey, product, 3600); // 1 hour
                
                return product;
            }
            
            // Product not found
            return null;
        } catch (error) {
            this.logger.error(`Error getting product by ID: ${productId}`, {
                error: error.message
            });
            return null;
        }
    }

    cleanupExpiredContexts() {
        try {
            const now = Date.now();
            const expiredCount = 0;
            
            for (const [userId, state] of this.conversationState.entries()) {
                // Expire context after 30 minutes of inactivity
                if (now - state.lastQueryTime > 30 * 60 * 1000) {
                    this.conversationState.delete(userId);
                    expiredCount++;
                }
            }
            
            if (expiredCount > 0) {
                this.logger.info(`Cleaned up ${expiredCount} expired conversation contexts`);
            }
        } catch (error) {
            this.logger.error('Error cleaning up expired contexts:', error);
        }
    }

    enhanceQueryForSearch(query) {
        try {
            // ตัดคำฟุ่มเฟือยออก
            let enhancedQuery = query.replace(/ต้องการ|อยากได้|ช่วยหา|มีไหม|หน่อย|ครับ|ค่ะ/g, ' ');
            
            // แทนที่คำที่มีความหมายเฉพาะ
            const replacements = {
                'ถ้วย': 'ถ้วย แก้ว cup',
                'แก้ว': 'แก้ว ถ้วย cup',
                'กล่อง': 'กล่อง box',
                'จาน': 'จาน plate dish',
                'ช้อน': 'ช้อน spoon',
                'ส้อม': 'ส้อม fork',
                'ฝา': 'ฝา lid cover',
                'พลาสติก': 'พลาสติก plastic',
                'กระดาษ': 'กระดาษ paper',
                'ขาว': 'ขาว white',
                'ใส': 'ใส clear',
                'ใส่อาหาร': 'ใส่อาหาร food container',
                'ใส่เครื่องดื่ม': 'ใส่เครื่องดื่ม beverage',
                'ร้อน': 'ร้อน hot',
                'เย็น': 'เย็น cold'
            };
            
            Object.entries(replacements).forEach(([term, replacement]) => {
                const regex = new RegExp(`\\b${term}\\b`, 'gi');
                if (regex.test(enhancedQuery)) {
                    enhancedQuery = enhancedQuery.replace(regex, replacement);
                }
            });
            
            // ลบช่องว่างซ้ำและตัดขอบ
            enhancedQuery = enhancedQuery.replace(/\s+/g, ' ').trim();
            
            return enhancedQuery;
        } catch (error) {
            this.logger.error('Error enhancing query:', error);
            return query;
        }
    }

    extractGeneralKeywords(query) {
        try {
            const generalCategories = [
                'กล่อง', 'แก้ว', 'ถ้วย', 'จาน', 'ช้อน', 'ส้อม', 'มีด', 'ฝา',
                'ถุง', 'ถาด', 'หลอด', 'กระดาษ', 'พลาสติก', 'ไบโอ', 'ใส่อาหาร',
                'เครื่องดื่ม', 'ของหวาน', 'อาหาร', 'ใส', 'ขาว', 'น้ำตาล', 'ดำ'
            ];
            
            // แยกคำจากคำถาม
            const queryWords = query.toLowerCase().split(/\s+/);
            
            // หาคำที่ตรงกับหมวดหมู่ทั่วไป
            const matchedKeywords = queryWords.filter(word => 
                generalCategories.some(category => word.includes(category) || category.includes(word))
            );
            
            // ค้นหาตัวเลข (ขนาด)
            const numbers = query.match(/\d+(\.\d+)?/g) || [];
            
            // ถ้าไม่พบคำสำคัญใดๆ ใช้คำทั่วไป
            if (matchedKeywords.length === 0 && numbers.length === 0) {
                return ['กล่อง', 'แก้ว', 'บรรจุภัณฑ์'];
            }
            
            // ถ้ามีตัวเลขแต่ไม่มีคำสำคัญ เพิ่มคำทั่วไป
            if (matchedKeywords.length === 0 && numbers.length > 0) {
                matchedKeywords.push('บรรจุภัณฑ์');
            }
            
            // รวมคำสำคัญกับตัวเลข
            return [...matchedKeywords, ...numbers];
        } catch (error) {
            this.logger.error('Error extracting general keywords:', error);
            return ['กล่อง', 'แก้ว', 'บรรจุภัณฑ์'];
        }
    }

    async directoryFallbackSearch(query, analysisResult) {
        try {
            this.logger.info('Using directory fallback search', { query });
            
            const fs = require('fs').promises;
            const path = require('path');
            
            // Get the products directory
            const productsDir = PRODUCTS_DIR;
            
            // Read all JSON files
            const files = await fs.readdir(productsDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));
            
            this.logger.info(`Scanning ${jsonFiles.length} product files in directory`);
            
            // Process up to 150 files to improve coverage
            const processLimit = Math.min(150, jsonFiles.length);
            const matchedProducts = [];
            
            // Extract key terms from the query with Thai language awareness
            const searchTerms = query.toLowerCase()
                .split(/\s+/)
                .filter(term => term.length > 1)
                .filter(term => !['และ', 'หรือ', 'ที่', 'ใน', 'เป็น', 'ของ', 'อยู่', 'ก็', 'ได้', 'ไม่', 'ให้', 'มี'].includes(term));
            
            // Extract dimensions with Thai number handling
            const dimensionMatches = [];
            const genericNumberMatches = query.match(/\d+(\.\d+)?/g) || [];
            
            // Specific dimension patterns
            const dimensionPatterns = [
                /(\d+(\.\d+)?)\s*x\s*(\d+(\.\d+)?)\s*x\s*(\d+(\.\d+)?)/i,  // 3D dimensions like 10x20x30
                /(\d+(\.\d+)?)\s*x\s*(\d+(\.\d+)?)/i,                      // 2D dimensions like 10x20
                /(\d+(\.\d+)?)\s*(มล|ml|ซม|cm|นิ้ว|inch|mm|มม|oz|ออนซ์)/i, // Sized with units
                /ขนาด\s*(\d+(\.\d+)?)/i,                                   // Thai size prefix
                /size\s*([sml])/i,                                         // S/M/L sizes
                /ไซส์\s*([sml])/i                                          // Thai S/M/L sizes
            ];
            
            dimensionPatterns.forEach(pattern => {
                const matches = query.match(pattern);
                if (matches) {
                    dimensionMatches.push(matches[0]);
                }
            });
            
            this.logger.info(`Query analysis for directory search:`, {
                searchTerms,
                dimensionMatches,
                genericNumbers: genericNumberMatches
            });
            
            // ปรับปรุงการค้นหาให้ยืดหยุ่นมากขึ้น
            // เพิ่มคำที่เกี่ยวข้องเพื่อการค้นหาที่ดีขึ้น
            const expandedTerms = [...searchTerms];
            const termExpansions = {
                'แก้ว': ['cup', 'ถ้วย', 'คัพ'],
                'ถ้วย': ['cup', 'แก้ว', 'ถ้วยกระดาษ'],
                'กล่อง': ['box', 'กล่องกระดาษ', 'กล่องพลาสติก'],
                'จาน': ['plate', 'dish'],
                'ฝา': ['lid', 'cover'],
                'ขาว': ['white'],
                'ใส': ['clear', 'transparent'],
                'ถุง': ['bag', 'ถุงกระดาษ', 'ถุงพลาสติก']
            };
            
            searchTerms.forEach(term => {
                if (termExpansions[term]) {
                    expandedTerms.push(...termExpansions[term]);
                }
            });
            
            // Combine all the product files to search through
            let productFilesToProcess = [...jsonFiles];
            
            // First try to find products matching specific dimensions for better results
            if (dimensionMatches.length > 0) {
                const dimensionFilteredFiles = [];
                
                for (let i = 0; i < processLimit; i++) {
                    if (i >= productFilesToProcess.length) break;
                    
                    try {
                        const filePath = path.join(productsDir, productFilesToProcess[i]);
                        const content = await fs.readFile(filePath, 'utf8');
                        const product = JSON.parse(content);
                        
                        const productText = [
                            product.product_name || '',
                            product.category || '',
                            product.short_description || '',
                            JSON.stringify(product.details || {})
                        ].join(' ').toLowerCase();
                        
                        // Check if product matches any of the dimension patterns
                        const hasDimensionMatch = dimensionMatches.some(dim => 
                            productText.includes(dim.toLowerCase())
                        );
                        
                        if (hasDimensionMatch) {
                            dimensionFilteredFiles.push(productFilesToProcess[i]);
                        }
                    } catch (err) {
                        // Skip files with errors
                        continue;
                    }
                }
                
                // If we found dimension-matching products, focus on those
                if (dimensionFilteredFiles.length > 0) {
                    this.logger.info(`Found ${dimensionFilteredFiles.length} products matching dimensions`);
                    productFilesToProcess = dimensionFilteredFiles;
                }
            }
            
            // Process products for matching with expanded flexibility
            for (let i = 0; i < Math.min(processLimit, productFilesToProcess.length); i++) {
                try {
                    const filePath = path.join(productsDir, productFilesToProcess[i]);
                    const content = await fs.readFile(filePath, 'utf8');
                    const product = JSON.parse(content);
                    
                    // Simple text matching against product name, category, description, and details
                    const productText = [
                        product.product_name || '',
                        product.category || '',
                        product.short_description || '',
                        JSON.stringify(product.details || {})
                    ].join(' ').toLowerCase();
                    
                    // Calculate match score based on term frequency and dimension match
                    let matchScore = 0;
                    
                    // Check for expanded term matches with higher tolerance
                    expandedTerms.forEach(term => {
                        if (productText.includes(term)) {
                            matchScore += 0.15;
                        }
                    });
                    
                    // Boost score for exact dimension matches
                    dimensionMatches.forEach(dim => {
                        if (productText.includes(dim.toLowerCase())) {
                            matchScore += 0.3;
                        }
                    });
                    
                    // Partial dimension matches
                    genericNumberMatches.forEach(num => {
                        // Check for more flexible number matches
                        // ค้นหาตัวเลขที่คล้ายกัน +/- 10%
                        const targetNum = parseFloat(num);
                        const regex = new RegExp(`\\b(\\d+(\\.\\d+)?)\\b`, 'g');
                        let match;
                        while ((match = regex.exec(productText)) !== null) {
                            const foundNum = parseFloat(match[1]);
                            if (Math.abs(foundNum - targetNum) / targetNum <= 0.1) {
                                matchScore += 0.25; // ให้คะแนนสูงสำหรับตัวเลขที่คล้ายกัน
                                break;
                            }
                        }
                    });
                    
                    // Boost score if category keywords match
                    const categoryKeywords = ["กล่อง", "แก้ว", "ถ้วย", "ถุง", "ฝา", "จาน", "ช้อน", "ส้อม"];
                    categoryKeywords.forEach(keyword => {
                        if (query.toLowerCase().includes(keyword) && productText.includes(keyword)) {
                            matchScore += 0.25;
                        }
                    });
                    
                    // Boost score if size keywords match
                    const sizeKeywords = ["เล็ก", "กลาง", "ใหญ่", "S", "M", "L", "size"];
                    sizeKeywords.forEach(keyword => {
                        if (query.toLowerCase().includes(keyword.toLowerCase()) && 
                            productText.toLowerCase().includes(keyword.toLowerCase())) {
                            matchScore += 0.2;
                        }
                    });
                    
                    // ลดเกณฑ์การคัดเลือกลงเพื่อให้ได้ผลลัพธ์มากขึ้น
                    if (matchScore > 0.1) { // ลดจาก 0.15 เป็น 0.1
                        let productId = product.id || productFilesToProcess[i].replace('.json', '');
                        // Add sku as fallback ID if available
                        if (!productId && product.sku) {
                            productId = `product_${product.sku}`;
                        }
                        
                        // Convert to standard format
                        const standardizedProduct = {
                            ...product,
                            id: productId,
                            score: matchScore,
                            values: null, // No embedding values in fallback
                            // Ensure these fields are present even if null
                            product_name: product.product_name || productId,
                            category: product.category || 'ไม่ระบุหมวดหมู่',
                            stock_quantity: product.stock_quantity || null,
                            price: product.price || '',
                            voodoo_pricing: product.voodoo_pricing || null,
                            details: product.details || {},
                            related_products: product.related_products || []
                        };
                        
                        matchedProducts.push(standardizedProduct);
                    }
                } catch (err) {
                    this.logger.warn(`Error processing file ${productFilesToProcess[i]}:`, err);
                    continue;
                }
            }
            
            // Sort by match score
            matchedProducts.sort((a, b) => b.score - a.score);
            
            this.logger.info(`Directory fallback found ${matchedProducts.length} matches`, { 
                query,
                topMatches: matchedProducts.slice(0, 3).map(p => p.product_name)
            });
            
            return matchedProducts.slice(0, this.TOP_RESULTS);
        } catch (error) {
            this.logger.error('Directory fallback search failed:', error);
            return [];
        }
    }

    async performVectorSearch(embedding, analysisResult) {
        try {
            if (!embedding) {
                throw new Error('Invalid embedding');
            }
            
            // ลดข้อจำกัดของ filter เพื่อให้ได้ผลลัพธ์มากขึ้น
            let filter = {};
            
            // เพิ่ม filter เฉพาะเมื่ามีความชัดเจนสูง
            if (analysisResult.intent.availability && analysisResult.confidence > 70) {
                filter = { stock_quantity: { $gt: 0 } };
            }
            
            // ถ้ามีหมวดหมู่เฉพาะที่ต้องการและมีความมั่นใจสูง
            if (analysisResult.attributes.categories && 
                analysisResult.attributes.categories.length > 0 &&
                analysisResult.confidence > 80) {
                // วิธีนี้จะใช้ได้เฉพาะเมื่อค้นหาหมวดหมู่เดียว
                const category = analysisResult.attributes.categories[0].value;
                filter.category = category;
            }
            
            // เพิ่มจำนวนผลลัพธ์เริ่มต้นเพื่อให้มีโอกาสได้ผลลัพธ์มากขึ้น
            const initialResults = await this.vectorDBService.queryVectors(
                embedding,
                this.TOP_RESULTS * 5, // เพิ่มจำนวนผลลัพธ์ที่ดึงมา
                filter,
                'products' // Use 'products' table
            );

            if (!initialResults || initialResults.length === 0) {
                // ลองค้นหาอีกครั้งแต่ไม่ใช้ filter
                this.logger.info('No results with filter, trying without filter');
                const unfilteredResults = await this.vectorDBService.queryVectors(
                    embedding,
                    this.TOP_RESULTS * 5,
                    {}, // ไม่ใช้ filter
                    'products' // Use 'products' table
                );
                
                if (!unfilteredResults || unfilteredResults.length === 0) {
                    return [];
                }
                
                return unfilteredResults.map(match => this.transformProductData(match));
            }
            
            // Transform results to a standard format
            const transformedResults = initialResults.map(match => {
                return this.transformProductData(match);
            });
            
            return transformedResults;
        } catch (error) {
            this.logger.error('Vector search failed:', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
 
    async performKeywordSearch(query, analysisResult) {
        try {
            this.logger.info('Performing keyword search', { query });
            
            // แยกคำสำคัญและวิเคราะห์
            const terms = query.toLowerCase()
                .split(/\s+/)
                .filter(t => t.length > 1)
                .filter(t => !['และ', 'หรือ', 'ที่', 'ใน', 'เป็น', 'ของ', 'อยู่', 'ก็', 'ได้'].includes(t));
            
            // ดึงตัวเลขและขนาด
            const numbers = query.match(/\d+(\.\d+)?/g) || [];
            const dimensions = query.match(/\d+\s*x\s*\d+(\s*x\s*\d+)?/g) || [];
            
            // ดึงข้อมูลขนาด (S, M, L)
            const sizeMatch = query.match(/size\s*([sml])/i);
            const sizeThai = query.match(/(เล็ก|กลาง|ใหญ่)/i);
            
            // สร้างคำสำหรับค้นหา
            const searchCriteria = {
                terms,
                numbers,
                dimensions,
                size: sizeMatch ? sizeMatch[1].toUpperCase() : 
                      sizeThai ? sizeThai[1] : null
            };
            
            this.logger.info('Keyword search criteria', { searchCriteria });
            
            // ใช้ directoryFallbackSearch แทน
            return await this.directoryFallbackSearch(query, analysisResult);
        } catch (error) {
            this.logger.error('Keyword search failed:', error);
            return [];
        }
    }
 
    transformProductData(match) {
        try {
            const metadata = match.metadata || {};
            
            // Prepare voodoo_pricing object
            let voodooPricing = null;
            if (metadata.voodoo_pricing) {
                try {
                    voodooPricing = typeof metadata.voodoo_pricing === 'string' ? 
                        JSON.parse(metadata.voodoo_pricing) : metadata.voodoo_pricing;
                } catch (e) {
                    this.logger.warn(`Failed to parse voodoo_pricing`, {
                        error: e.message,
                        productId: match.id
                    });
                }
            }
            
            // Prepare details object
            let details = {};
            if (metadata.details) {
                try {
                    details = typeof metadata.details === 'string' ? 
                        JSON.parse(metadata.details) : metadata.details;
                } catch (e) {
                    this.logger.warn(`Failed to parse details`, {
                        error: e.message,
                        productId: match.id
                    });
                }
            }
            
            // Safely parse JSON fields
            const safeParseJson = (jsonData, fieldName) => {
                if (!jsonData) return null;
                
                try {
                    return typeof jsonData === 'string' ? 
                        JSON.parse(jsonData) : jsonData;
                } catch (e) {
                    this.logger.warn(`Failed to parse ${fieldName}`, {
                        error: e.message,
                        productId: match.id
                    });
                    return null;
                }
            };
            
            return {
                id: match.id,
                product_name: metadata.product_name || '',
                category: metadata.category || '',
                url: metadata.url || '',
                short_description: metadata.short_description || '',
                price: metadata.price || '',
                stock_quantity: metadata.stock_quantity ? parseInt(metadata.stock_quantity) : null,
                stock_status: metadata.stock_status || null,
                details: details,
                voodoo_pricing: voodooPricing,
                production_links: safeParseJson(metadata.production_links, 'production_links'),
                production_pricing: safeParseJson(metadata.production_pricing, 'production_pricing'),
                production_dimensions: safeParseJson(metadata.production_dimensions, 'production_dimensions'),
                production_pack_details: safeParseJson(metadata.production_pack_details, 'production_pack_details'),
                compatible_products: safeParseJson(metadata.compatible_products, 'compatible_products') || [],
                related_products: safeParseJson(metadata.related_products, 'related_products') || [],
                score: match.score || 0,
                production_color_printing: safeParseJson(metadata.production_color_printing, 'production_color_printing'),
                sku: metadata.sku || match.id.replace(/^product_/, '')
            };
        } catch (error) {
            this.logger.error('Error transforming product data:', {
                error: error.message,
                matchId: match?.id || 'unknown'
            });
            
            // Return simplified object in case of error
            return {
                id: match.id || 'unknown',
                product_name: match.metadata?.product_name || 'Product Name Unavailable',
                category: match.metadata?.category || '',
                score: match.score || 0
            };
        }
    }
 
    isFollowupQuery(query, userState = {}) {
        // Short queries are likely followups
        if (query.length < 10) return true;
        
        // Followup indicators in Thai
        const followupIndicators = [
            'เท่าไหร่', 'กี่บาท', 'มีกี่', 'เหลือ', 'ยังมี', 'ราคา', 
            'จัดส่ง', 'ส่ง', 'ส่งไปที่', 'ขนาด', 'มีสี', 'มีสินค้า', 
            'อันนี้', 'ของอัน', 'ของชิ้น', 'ทำไม', 'ยังไง', 'อย่างไร',
            'สั่งยังไง', 'วิธี', 'ราคานี้', 'สินค้านี้', 'ตัวนี้', 'แบบนี้',
            'เหลือกี่', 'มั้ย', 'ไหม', 'กี่ชิ้น', 'กี่อัน'
        ];
        
        // Check for followup indicators
        const hasIndicator = followupIndicators.some(indicator => 
            query.toLowerCase().includes(indicator.toLowerCase())
        );
        
        // Check if this is a very recent followup to a previous query
        const isRecentInteraction = userState.lastQueryTime && 
            (Date.now() - userState.lastQueryTime < 5 * 60 * 1000); // Within 5 minutes
        
        // Check if the query shares numbers with the last product
        const hasSharedNumbers = this.hasSharedNumbers(query, userState.lastProductName);
        
        return hasIndicator || isRecentInteraction || hasSharedNumbers;
    }
 
    hasSharedNumbers(query, productName) {
        if (!query || !productName) return false;
        
        try {
            // ดึงตัวเลขจากคำถาม
            const queryNumbers = query.match(/\d+(\.\d+)?/g) || [];
            if (queryNumbers.length === 0) return false;
            
            // ดึงตัวเลขจากชื่อสินค้า
            const productNumbers = productName.match(/\d+(\.\d+)?/g) || [];
            if (productNumbers.length === 0) return false;
            
            // ตรวจสอบว่ามีตัวเลขตรงกันหรือไม่
            return queryNumbers.some(num => productNumbers.includes(num));
        } catch (error) {
            this.logger.error('Error checking shared numbers:', error);
            return false;
        }
    }
 
    async analyzeQuery(query, userId, userState = {}, isFollowup = false) {
        try {
            const attributes = this.extractProductAttributes(query);
            const context = await this.getConversationContext(userId);
            const intent = this.analyzeQueryIntent(query);
            const enhancedQuery = this.buildEnhancedQuery(query, attributes, context);
            
            // Calculate confidence based on query clarity
            const confidence = this.calculateQueryConfidence(attributes, context, query, isFollowup);
            
            return {
                originalQuery: query,
                enhancedQuery,
                attributes,
                context,
                intent,
                confidence,
                isFollowup
            };
        } catch (error) {
            this.logger.error('Query analysis failed:', error);
            return {
                originalQuery: query,
                enhancedQuery: query,
                attributes: this.getDefaultAttributes(),
                context: { recentQueries: [], previousAttributes: [] },
                intent: this.getDefaultIntent(),
                confidence: 0,
                isFollowup
            };
        }
    }
 
    extractProductAttributes(query) {
        if (!query || typeof query !== 'string') {
            return this.getDefaultAttributes();
        }
 
        const attributes = this.getDefaultAttributes();
 
        try {
            // Extract dimensions with numerical values
            const dimensionRegex = /(\d+(?:\.\d+)?)\s*(ml|มล|oz|ออนซ์|ลิตร|L|cm|ซม|นิ้ว|mm|มม)/gi;
            const dimensionMatches = Array.from(query.matchAll(dimensionRegex));
            
            for (const match of dimensionMatches) {
                attributes.dimensions.push({
                    value: parseFloat(match[1]),
                    unit: match[2].toLowerCase(),
                    original: match[0]
                });
            }
            
            // Extract 3D dimensions like 10x20x30
            const dim3dRegex = /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/gi;
            const dim3dMatches = Array.from(query.matchAll(dim3dRegex));
            
            for (const match of dim3dMatches) {
                attributes.dimensions.push({
                    type: '3d',
                    length: parseFloat(match[1]),
                    width: parseFloat(match[2]),
                    height: parseFloat(match[3]),
                    original: match[0]
                });
            }
            
            // Extract 2D dimensions like 10x20
            const dim2dRegex = /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/gi;
            const dim2dMatches = Array.from(query.matchAll(dim2dRegex))
                .filter(match => !query.includes(`${match[0]}x`)); // Exclude matches that are part of 3D dimensions
            
            for (const match of dim2dMatches) {
                attributes.dimensions.push({
                    type: '2d',
                    length: parseFloat(match[1]),
                    width: parseFloat(match[2]),
                    original: match[0]
                });
            }
            
            // Extract size indicators (S, M, L)
            const sizeRegex = /\b(size\s*([sml])|\(size\s*([sml])\)|(ไซส์|ขนาด)\s*([sml]))\b/i;
            const sizeMatch = query.match(sizeRegex);
            
            if (sizeMatch) {
                const size = (sizeMatch[2] || sizeMatch[3] || sizeMatch[5] || '').toUpperCase();
                attributes.dimensions.push({
                    type: 'size',
                    value: size,
                    original: sizeMatch[0]
                });
            }
 
            // Extract other attributes
            Object.entries(this.productAttributes).forEach(([category, keywords]) => {
                if (category === 'dimensions') return;
 
                keywords.forEach(keyword => {
                    if (query.toLowerCase().includes(keyword.toLowerCase())) {
                        attributes[category].push({
                            value: keyword,
                            matchIndex: query.toLowerCase().indexOf(keyword.toLowerCase())
                        });
                    }
                });
            });
 
            return attributes;
        } catch (error) {
            this.logger.error('Error extracting attributes:', error);
            return this.getDefaultAttributes();
        }
    }
 
    analyzeQueryIntent(query) {
        const intent = this.getDefaultIntent();
        try {
            Object.entries(this.intentKeywords).forEach(([key, keywords]) => {
                intent[key] = keywords.some(keyword => 
                    query.toLowerCase().includes(keyword.toLowerCase())
                );
            });
            
            // Special handling for price queries
            if (query.includes('ราคา') || query.includes('บาท') || query.includes('เท่าไหร่')) {
                intent.price = true;
            }
            
            // Special handling for availability queries
            if (query.includes('เหลือ') || query.includes('มีอยู่') || query.includes('สต็อก')) {
                intent.availability = true;
            }
            
            // If it's an empty query but we know there was a product before
            if (query.length < 5 && !Object.values(intent).some(v => v === true)) {
                // Default to checking availability for very short queries
                intent.availability = true;
            }
        } catch (error) {
            this.logger.error('Error analyzing intent:', error);
        }
        return intent;
    }
 
    getDefaultIntent() {
        return {
            price: false,
            availability: false,
            delivery: false,
            specification: false,
            material: false
        };
    }
 
    getDefaultAttributes() {
        return {
            dimensions: [],
            materials: [],
            types: [],
            categories: []
        };
    }
 
    async getConversationContext(userId) {
        try {
            if (!userId) return null;
 
            const cachedContext = this.cacheService.get(`context_${userId}`, 'conversation');
            if (cachedContext) return cachedContext;
 
            const history = await this.chatHistory.loadAIChatHistory(userId);
            if (!history?.messages) {
                return {
                    recentQueries: [],
                    previousAttributes: []
                };
            }
 
            const recentMessages = history.messages
                .filter(msg => msg.role === 'user')
                .slice(-this.CONTEXT_WINDOW)
                .map(msg => msg.content);
 
            const context = {
                recentQueries: recentMessages,
                previousAttributes: recentMessages.map(msg => 
                    this.extractProductAttributes(msg)
                )
            };
 
            this.cacheService.set(`context_${userId}`, context, 1800, 'conversation'); // 30 min
            return context;
        } catch (error) {
            this.logger.error('Error getting conversation context:', error);
            return {
                recentQueries: [],
                previousAttributes: []
            };
        }
    }
 
    buildEnhancedQuery(query, currentAttributes, context) {
        try {
            let enhancedQuery = query;
 
            if (context?.previousAttributes?.length > 0) {
                const recentAttributes = context.previousAttributes.slice(-2);
                
                recentAttributes.forEach(prevAttr => {
                    // Add dimensions if missing
                    if (currentAttributes.dimensions.length === 0 && 
                        prevAttr.dimensions?.length > 0) {
                        const dim = prevAttr.dimensions[0];
                        if (dim.original) {
                            enhancedQuery += ` ${dim.original}`;
                        } else if (dim.value && dim.unit) {
                            enhancedQuery += ` ${dim.value}${dim.unit}`;
                        }
                    }
 
                    // Add materials if missing
                    if (currentAttributes.materials.length === 0 && 
                        prevAttr.materials?.length > 0) {
                        const material = prevAttr.materials[0].value;
                        enhancedQuery += ` ${material}`;
                    }
 
                    // Add types if missing
                    if (currentAttributes.types.length === 0 &&
                        prevAttr.types?.length > 0) {
                        const type = prevAttr.types[0].value;
                        enhancedQuery += ` ${type}`;
                    }
                });
            }
 
            return enhancedQuery;
        } catch (error) {
            this.logger.error('Error building enhanced query:', error);
            return query;
        }
    }
 
    calculateQueryConfidence(attributes, context, query, isFollowup) {
        try {
            let confidence = 1.0;
            
            // Shorter queries are often less clear
            if (query.length < 10) {
                confidence *= 0.7;
            }
            
            // Check required attributes
            const hasAttributes = attributes.dimensions.length > 0 || 
                                 attributes.materials.length > 0 || 
                                 attributes.types.length > 0 ||
                                 attributes.categories.length > 0;
            
            if (!hasAttributes) {
                confidence *= 0.5;
            }
            
            // Follow-up queries are more confident when context is available
            if (isFollowup && context?.recentQueries?.length > 0) {
                confidence *= 1.2; // Boost confidence for follow-ups with context
            }
 
            // Adjust for attribute specificity
            if (attributes.dimensions && attributes.dimensions.length > 0) {
                confidence *= 1.2;
            }
 
            if (attributes.materials && attributes.materials.length > 0) {
                confidence *= 1.1;
            }
 
            if (attributes.categories && attributes.categories.length > 0) {
                confidence *= 1.1;
            }
 
            return Math.min(Math.round(confidence * 100), 100);
        } catch (error) {
            this.logger.error('Error calculating confidence:', error);
            return 0;
        }
    }
 
    async processHistoricalContext(history) {
        try {
            if (!history || !history.messages) {
                return {
                    recentQueries: [],
                    productInterests: [],
                    frequentCategories: [],
                    relevantProducts: []
                };
            }
    
            // ดึงข้อความของผู้ใช้ล่าสุด 10 รายการ
            const recentUserMessages = history.messages
                .filter(msg => msg.role === 'user')
                .slice(-10)
                .map(msg => msg.content);
    
            // ติดตามการโต้ตอบกับสินค้า
            const productInteractions = {};
            const completeProducts = {}; // เก็บข้อมูลสินค้าเต็มรูปแบบ
            
            history.messages.forEach(msg => {
                if (msg.products && Array.isArray(msg.products)) {
                    msg.products.forEach(product => {
                        // เพิ่มการเก็บข้อมูลสินค้าเต็มรูปแบบ
                        if (product.id) {
                            completeProducts[product.id] = product;
                        }
                        
                        if (!productInteractions[product.id]) {
                            productInteractions[product.id] = {
                                count: 0,
                                product_name: product.product_name,
                                category: product.category,
                                lastSeen: 0,
                                url: product.url || null,
                                price: product.price || null,
                                stock_quantity: product.stock_quantity || null,
                                details: product.details || null,
                                voodoo_pricing: product.voodoo_pricing || null
                            };
                        }
                        
                        productInteractions[product.id].count++;
                        productInteractions[product.id].lastSeen = Math.max(
                            productInteractions[product.id].lastSeen, 
                            msg.timestamp || 0
                        );
                    });
                }
            });
    
            // ดึงหมวดหมู่จากการโต้ตอบ
            const categories = {};
            Object.values(productInteractions).forEach(product => {
                if (product.category) {
                    if (!categories[product.category]) {
                        categories[product.category] = {
                            count: 0,
                            products: []
                        };
                    }
                    categories[product.category].count += product.count;
                    if (!categories[product.category].products.includes(product.id)) {
                        categories[product.category].products.push(product.id);
                    }
                }
            });
    
            const frequentCategories = Object.entries(categories)
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 3)
                .map(([category, data]) => ({
                    name: category,
                    count: data.count,
                    products: data.products
                }));
    
            // เรียงลำดับสินค้าตามการดูล่าสุด
            const sortedProducts = Object.entries(productInteractions)
                .sort((a, b) => b[1].lastSeen - a[1].lastSeen);
            
            // สร้างรายการสินค้าที่เกี่ยวข้องเต็มรูปแบบ
            const relevantProducts = sortedProducts
                .slice(0, 5) // เอาแค่ 5 รายการล่าสุด
                .map(([id]) => {
                    const product = completeProducts[id];
                    if (product) {
                        // เพิ่มข้อมูลการมีปฏิสัมพันธ์เข้าไปในสินค้า
                        return {
                            ...product,
                            interaction_data: {
                                count: productInteractions[id].count,
                                lastSeen: productInteractions[id].lastSeen,
                                formatted_time: new Date(productInteractions[id].lastSeen).toLocaleString('th-TH')
                            }
                        };
                    }
                    return undefined;
                })
                .filter(product => product !== undefined);
    
            return {
                recentQueries: recentUserMessages,
                productInterests: sortedProducts
                    .slice(0, 5)
                    .map(([id, data]) => ({
                        id,
                        name: data.product_name,
                        category: data.category,
                        count: data.count,
                        lastSeen: data.lastSeen
                    })),
                frequentCategories: frequentCategories.map(c => c.name),
                relevantProducts: relevantProducts // ส่งข้อมูลสินค้าเต็มรูปแบบพร้อมข้อมูลการมีปฏิสัมพันธ์
            };
        } catch (error) {
            this.logger.error('Error processing historical context:', error);
            return {
                recentQueries: [],
                productInterests: [],
                frequentCategories: [],
                relevantProducts: []
            };
        }
    }
 
    async rankAndFilterResults(searchResults, analysisResult, historicalContext, userState = {}, isFollowup = false, query = '') {
        try {
            let prioritizedResults = [];
            
            // เริ่มด้วยการเพิ่มสินค้าที่ผู้ใช้เคยสนใจล่าสุดเข้าไปในผลลัพธ์ก่อน
            if (historicalContext && historicalContext.relevantProducts && historicalContext.relevantProducts.length > 0) {
                // เพิ่มสินค้าที่ผู้ใช้เคยสนใจล่าสุดเข้าไปในผลลัพธ์
                historicalContext.relevantProducts.forEach(product => {
                    // เพิ่มคะแนนให้สูงเพื่อให้อยู่อันดับต้นๆ
                    prioritizedResults.push({
                        ...product,
                        boostedScore: 50, // ให้คะแนนเริ่มต้นที่ 50 สำหรับสินค้าที่เคยสนใจ
                        boostFactors: { historicalInterest: true }
                    });
                });
            }
            
            // ถ้ามีผลลัพธ์จากการค้นหา เพิ่มเข้าไปในรายการ
            if (searchResults && searchResults.length > 0) {
                // เพิ่มคะแนนแต่ละสินค้า
                const rankedSearchResults = searchResults.map(result => {
                    // เริ่มต้นที่คะแนนดิบ x 10 เพื่อปรับสเกลให้เทียบง่ายกับเกณฑ์ 30 คะแนน
                    let score = (result.score || 0) * 10;
                    const boostFactors = {};
 
                    // เพิ่มคะแนนตามการวิเคราะห์คำถาม
                    if (analysisResult?.attributes) {
                        // เพิ่มคะแนนสำหรับขนาดที่ตรงกัน
                        if (analysisResult.attributes.dimensions.length > 0) {
                            const dimensionMatch = this.checkDimensionMatch(
                                result, 
                                analysisResult.attributes.dimensions
                            );
                            
                            if (dimensionMatch) {
                                score += 15;
                                boostFactors.dimensionMatch = 15;
                            }
                        }
 
                        // เพิ่มคะแนนสำหรับวัสดุที่ตรงกัน
                        if (analysisResult.attributes.materials.length > 0) {
                            const materialMatch = this.checkMaterialMatch(
                                result, 
                                analysisResult.attributes.materials
                            );
                            
                            if (materialMatch) {
                                score += 12;
                                boostFactors.materialMatch = 12;
                            }
                        }
 
                        // เพิ่มคะแนนสำหรับประเภทที่ตรงกัน
                        if (analysisResult.attributes.types.length > 0) {
                            const typeMatch = this.checkTypeMatch(
                                result, 
                                analysisResult.attributes.types
                            );
                            
                            if (typeMatch) {
                                score += 15;
                                boostFactors.typeMatch = 15;
                            }
                        }
                    }
 
                    // ถ้าเป็นคำถามต่อเนื่องและมีสินค้าล่าสุด
                    if (isFollowup && userState.lastProductId === result.id) {
                        score += 20;
                        boostFactors.followupProduct = 20;
                    }
 
                    // ตรวจสอบความคล้ายของตัวเลขในคำค้นหาและชื่อสินค้า
                    if (query && result.product_name && this.hasSharedNumbers(query, result.product_name)) {
                        score += 15;
                        boostFactors.sharedNumbers = 15;
                    }
 
                    // ตรวจสอบสต็อกสินค้า (ถ้าสนใจเรื่องความพร้อมใช้)
                    if (analysisResult?.intent?.availability && result.stock_quantity !== undefined) {
                        const stockBoost = result.stock_quantity > 0 ? 10 : -10;
                        score += stockBoost;
                        boostFactors.stockStatus = stockBoost;
                    }
 
                    // เพิ่มข้อมูลปฏิสัมพันธ์ถ้ามี
                    if (historicalContext && historicalContext.productInterests) {
                        const interactionData = historicalContext.productInterests.find(p => p.id === result.id);
                        if (interactionData) {
                            result.interaction_data = {
                                count: interactionData.count,
                                lastSeen: interactionData.lastSeen,
                                formatted_time: new Date(interactionData.lastSeen).toLocaleString('th-TH')
                            };
                        }
                    }
 
                    return {
                        ...result,
                        boostedScore: score,
                        boostFactors
                    };
                });
                
                // รวมผลลัพธ์เข้าด้วยกัน แต่ไม่เพิ่มสินค้าซ้ำ
                const existingIds = new Set(prioritizedResults.map(p => p.id));
                
                rankedSearchResults.forEach(result => {
                    if (!existingIds.has(result.id)) {
                        prioritizedResults.push(result);
                        existingIds.add(result.id);
                    }
                });
            }
 
            // กรองเฉพาะสินค้าที่มีคะแนนมากกว่า 0 (ลดจาก 15)
            const filteredResults = prioritizedResults.filter(result => result.boostedScore > 0);
            
            // เรียงตามคะแนนและตัดให้เหลือตามจำนวนที่ต้องการ
            const sortedResults = filteredResults
                .sort((a, b) => b.boostedScore - a.boostedScore)
                .slice(0, this.TOP_RESULTS);
            
            return sortedResults;
        } catch (error) {
            this.logger.error('Error ranking and filtering results:', error);
            return searchResults?.slice(0, this.TOP_RESULTS) || [];
       }
   }

   checkDimensionMatch(product, queryDimensions) {
       try {
           if (!product || !queryDimensions || queryDimensions.length === 0) {
               return false;
           }

           // รวมข้อมูลสินค้าทั้งหมดสำหรับการค้นหา
           const productText = [
               product.product_name || '',
               product.short_description || '',
               typeof product.details === 'string' ? 
                   product.details : JSON.stringify(product.details || {})
           ].join(' ').toLowerCase();

           // ตรวจสอบการตรงกันของขนาด
           return queryDimensions.some(dim => {
               // ขนาด 3 มิติ (กว้าง x ยาว x สูง)
               if (dim.type === '3d') {
                   const dimString = `${dim.length}x${dim.width}x${dim.height}`;
                   return productText.includes(dimString);
               } 
               // ขนาด 2 มิติ (กว้าง x ยาว)
               else if (dim.type === '2d') {
                   const dimString = `${dim.length}x${dim.width}`;
                   return productText.includes(dimString);
               }
               // ขนาด (S, M, L)
               else if (dim.type === 'size') {
                   return productText.includes(`size ${dim.value}`) || 
                          productText.includes(`ไซส์ ${dim.value}`);
               }
               // ขนาดทั่วไปพร้อมหน่วย
               else if (dim.unit && dim.value) {
                   // ตรวจสอบความใกล้เคียง ให้ความยืดหยุ่นได้ 10%
                   const targetValue = dim.value;
                   const regex = new RegExp(`(\\d+(\\.\\d+)?)\\s*${dim.unit}`, 'gi');
                   const matches = [...productText.matchAll(regex)];
                   
                   return matches.some(match => {
                       const foundValue = parseFloat(match[1]);
                       // ถ้าค่าที่พบอยู่ในช่วง +/- 10% ของค่าที่ค้นหา
                       return Math.abs(foundValue - targetValue) / targetValue <= 0.1;
                   });
               }
               
               return false;
           });
       } catch (error) {
           this.logger.error('Error checking dimension match:', error);
           return false;
       }
   }

   checkMaterialMatch(product, queryMaterials) {
       try {
           if (!product || !queryMaterials || queryMaterials.length === 0) {
               return false;
           }

           // รวมข้อมูลสินค้าทั้งหมดสำหรับการค้นหา
           const searchContext = [
               product.product_name || '',
               product.category || '',
               product.short_description || '',
               typeof product.details === 'string' ? 
                   product.details : JSON.stringify(product.details || {})
           ].join(' ').toLowerCase();

           // การแปลงวัสดุที่มีความเหมือนกัน
           const materialMap = {
               'paper': ['กระดาษ', 'คราฟท์', 'เปเปอร์'],
               'plastic': ['พลาสติก', 'พีพี', 'พีอี', 'พีวีซี', 'pet', 'pp', 'pe', 'pvc'],
               'bio': ['ไบโอ', 'รักษ์โลก', 'ย่อยสลายได้', 'eco']
           };

           return queryMaterials.some(material => {
               const materialValue = material.value.toLowerCase();
               
               // ตรวจสอบโดยตรง
               if (searchContext.includes(materialValue)) {
                   return true;
               }
               
               // ตรวจสอบผ่านการแปลง
               for (const [key, variants] of Object.entries(materialMap)) {
                   if (materialValue === key || variants.includes(materialValue)) {
                       return variants.some(v => searchContext.includes(v)) ||
                              searchContext.includes(key);
                   }
               }
               
               return false;
           });
       } catch (error) {
           this.logger.error('Error checking material match:', error);
           return false;
       }
   }

   checkTypeMatch(product, queryTypes) {
       try {
           if (!product || !queryTypes || queryTypes.length === 0) {
               return false;
           }

           // รวมข้อมูลสินค้าทั้งหมดสำหรับการค้นหา
           const searchContext = [
               product.product_name || '',
               product.category || '',
               product.short_description || '',
               typeof product.details === 'string' ? 
                   product.details : JSON.stringify(product.details || {})
           ].join(' ').toLowerCase();

           // การแปลงประเภทที่มีความเหมือนกัน
           const typeMap = {
               'cup': ['แก้ว', 'ถ้วย', 'คัพ'],
               'box': ['กล่อง', 'บ็อกซ์'],
               'plate': ['จาน', 'เพลท'],
               'bowl': ['ชาม', 'โบล์'],
               'lid': ['ฝา', 'ลิด'],
               'cutlery': ['ช้อน', 'ส้อม', 'มีด', 'ชุดช้อนส้อม']
           };

           return queryTypes.some(type => {
               const typeValue = type.value.toLowerCase();
               
               // ตรวจสอบโดยตรง
               if (searchContext.includes(typeValue)) {
                   return true;
               }
               
               // ตรวจสอบผ่านการแปลง
               for (const [key, variants] of Object.entries(typeMap)) {
                   if (typeValue === key || variants.includes(typeValue)) {
                       return variants.some(v => searchContext.includes(v)) ||
                              searchContext.includes(key);
                   }
               }
               
               return false;
           });
       } catch (error) {
           this.logger.error('Error checking type match:', error);
           return false;
       }
   }

   async updateProductContext(userId, rankedResults) {
    try {
        // ตรวจสอบว่า this.productContextCache มีอยู่จริงก่อนใช้งาน
        if (!this.productContextCache) {
            // ถ้าไม่มีให้ใช้ cacheService แทน
            const contextKey = `product_context_${userId}`;
            const contextData = rankedResults.map(result => ({
                id: result.id,
                product_name: result.product_name,
                category: result.category,
                score: result.boostedScore || result.score,
                timestamp: Date.now(),
                interaction_data: result.interaction_data
            }));

            this.cacheService.set(contextKey, contextData, 1800); // 30 minutes TTL
        } else {
            // ถ้ามี productContextCache ใช้ตามปกติ
            const contextKey = `product_context_${userId}`;
            const contextData = rankedResults.map(result => ({
                id: result.id,
                product_name: result.product_name,
                category: result.category,
                score: result.boostedScore || result.score,
                timestamp: Date.now(),
                interaction_data: result.interaction_data
            }));

            this.productContextCache.set(contextKey, contextData, 1800); // 30 minutes TTL
        }
    } catch (error) {
        this.logger.error('Error updating product context:', error);
    }
}

   async loadUserState(userId) {
       try {
           // Try to get from in-memory map first
           if (this.conversationState.has(userId)) {
               return this.conversationState.get(userId);
           }
           
           // Try to get from cache
           const cachedState = this.cacheService.get(`userState_${userId}`);
           if (cachedState) {
               // Update in-memory map
               this.conversationState.set(userId, cachedState);
               return cachedState;
           }
           
           // Default empty state
           return {
               lastProductId: null,
               lastProductName: null,
               lastQuery: null,
               lastQueryTime: null,
               lastIntent: null
           };
       } catch (error) {
           this.logger.error(`Error loading user state for ${userId}:`, error);
           return {
               lastProductId: null,
               lastProductName: null,
               lastQuery: null,
               lastQueryTime: null,
               lastIntent: null
           };
       }
   }

   async updateUserState(userId, updates) {
       try {
           // Get current state
           let currentState = this.conversationState.has(userId) ?
               this.conversationState.get(userId) : 
               {
                   lastProductId: null,
                   lastProductName: null,
                   lastQuery: null,
                   lastQueryTime: null,
                   lastIntent: null
               };
               
           // Update state with new values
           const newState = {
               ...currentState,
               ...updates
           };
           
           // Store in memory
           this.conversationState.set(userId, newState);
           
           // Store in cache
           this.cacheService.set(`userState_${userId}`, newState, 3600); // 1 hour TTL
           
           return true;
       } catch (error) {
           this.logger.error(`Error updating user state for ${userId}:`, error);
           return false;
       }
   }
}

module.exports = { ProductSearchService };
