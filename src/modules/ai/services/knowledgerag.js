'use strict';

const lancedb = require('@lancedb/lancedb');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Import DocumentProcessor
// const DocumentProcessor = require('./cor_services/DocumentProcessor'); // ลบแล้ว

class KnowledgeRAG {
    constructor(logger) {
        this.logger = logger;
        this.db = null;
        this.tables = {}; // Store table references by language namespace
        this.embeddings = {};  // Store embeddings by language
        this.textSplitters = {}; // Store text splitters by language
        // this.documentProcessor = null; // ลบแล้ว
        this.initialized = false;
        this.dbPath = path.join(__dirname, '..', 'data', 'lancedb_knowledge');
        
        // ไม่แยกตามภาษา - ใช้ namespace เดียว
        this.SUPPORTED_LANGUAGES = ['DEFAULT'];
        this.DEFAULT_LANGUAGE = 'DEFAULT';

        // Configuration - ใช้ namespace เดียว 'knowledge'
        this.languageConfigs = {
            DEFAULT: {
                namespace: 'knowledge',
                chunkSize: 2000,
                chunkOverlap: 200,
                embeddingModel: 'text-embedding-3-large',
                separators: ['\n\n', '\n', ' ', '']
            }
        };
        
        // Configuration
        this.config = {
            openai: {
                apiKey: process.env.OPENAI_API_KEY
            },
            search: {
                topK: 1,
                scoreThreshold: 0.3,
                maxTokens: 8000,
                crossLanguageSearch: false // Enable/disable cross-language search
            },
            embedding: {
                dimension: 3072 // text-embedding-3-large dimension
            }
        };

        // Knowledge storage paths per language
        this.knowledgeBasePath = path.join(__dirname, '..', 'data', 'knowledge');
        this.metadataPaths = {};
        
        // Initialize metadata paths for each language
        this.SUPPORTED_LANGUAGES.forEach(lang => {
            this.metadataPaths[lang] = path.join(this.knowledgeBasePath, `metadata_${lang.toLowerCase()}.json`);
        });
        
        // Initialize directory and DocumentProcessor
        this.ensureDirectoryExists();
        // this.documentProcessor = new DocumentProcessor(logger); // ลบแล้ว
    }

    // Detect language from text
    detectLanguage(text) {
        try {
            if (!text) return this.DEFAULT_LANGUAGE;
            
            // Language detection patterns
            const patterns = {
                TH: /[\u0E00-\u0E7F]/,  // Thai characters
                CN: /[\u4E00-\u9FFF]/,  // Chinese characters
                JP: /[\u3040-\u309F\u30A0-\u30FF]/,  // Hiragana and Katakana
                KR: /[\uAC00-\uD7AF]/,  // Hangul
                EN: /^[A-Za-z\s\d\.\,\!\?\-]+$/  // English (if no other scripts detected)
            };

            // Count characters for each language
            const counts = {};
            for (const [lang, pattern] of Object.entries(patterns)) {
                const matches = text.match(pattern);
                counts[lang] = matches ? matches.length : 0;
            }

            // Find language with most characters
            let detectedLang = this.DEFAULT_LANGUAGE;
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

            this.logger.debug(`Language detected: ${detectedLang} for text sample: ${text.substring(0, 50)}`);
            return detectedLang;

        } catch (error) {
            this.logger.error('Error detecting language:', error);
            return this.DEFAULT_LANGUAGE;
        }
    }

    // Initialize RAG system with language support
    async initialize() {
        try {
            // Validate environment variables
            if (!this.config.openai.apiKey) {
                throw new Error('OPENAI_API_KEY is required');
            }

            // Ensure LanceDB directory exists
            await fs.mkdir(this.dbPath, { recursive: true });

            // Initialize LanceDB
            this.db = await lancedb.connect(this.dbPath);

            this.logger.info('LanceDB client initialized', { dbPath: this.dbPath });

            // Initialize embeddings and text splitters for each language
            for (const lang of this.SUPPORTED_LANGUAGES) {
                const langConfig = this.languageConfigs[lang];

                // Initialize embeddings for this language
                this.embeddings[lang] = new OpenAIEmbeddings({
                    openAIApiKey: this.config.openai.apiKey,
                    modelName: langConfig.embeddingModel,
                    dimensions: this.config.embedding.dimension
                });

                // Initialize text splitter for this language
                this.textSplitters[lang] = new RecursiveCharacterTextSplitter({
                    chunkSize: langConfig.chunkSize,
                    chunkOverlap: langConfig.chunkOverlap,
                    separators: langConfig.separators
                });

                this.logger.info(`Initialized embeddings and text splitter for language: ${lang}`);
            }

            // Initialize LanceDB tables for each language
            await this.initializeLanceDBTables();

            // Test DocumentProcessor
            // if (this.documentProcessor) {
            //     const testResult = await this.documentProcessor.testGeminiAPI();
            //     this.logger.info('DocumentProcessor Gemini test:', testResult);
            // }

            this.initialized = true;
            this.logger.info('KnowledgeRAG system initialized successfully with multi-language support');

            return true;
        } catch (error) {
            this.logger.error('Error initializing KnowledgeRAG:', error);
            this.initialized = false;
            throw error;
        }
    }

    // Initialize LanceDB tables for each language namespace
    async initializeLanceDBTables() {
        try {
            const tableNames = await this.db.tableNames();
            const namespaces = Object.values(this.languageConfigs).map(c => c.namespace);

            // Create or open table for each language namespace
            for (const namespace of namespaces) {
                if (tableNames.includes(namespace)) {
                    this.tables[namespace] = await this.db.openTable(namespace);
                    this.logger.info(`Opened existing LanceDB table: ${namespace}`);
                } else {
                    // Create table with proper schema matching our data structure (ไม่มี language field)
                    const schema = {
                        id: '',
                        vector: Array(3072).fill(0),
                        text: '',
                        category: '',
                        file_name: '',
                        chunk_index: 0,
                        chunk_count: 1,
                        created_at: new Date().toISOString()
                    };
                    this.tables[namespace] = await this.db.createTable(namespace, [schema]);
                    this.logger.info(`Created new LanceDB table: ${namespace}`);
                }
            }

            // Log table information
            this.logger.info(`LanceDB tables initialized:`, {
                dbPath: this.dbPath,
                namespaces: namespaces,
                dimension: this.config.embedding.dimension
            });

        } catch (error) {
            this.logger.error('Error initializing LanceDB tables:', error);
            throw error;
        }
    }

    // Add knowledge with language detection and namespace
// Add knowledge with language detection and namespace
async addKnowledge(knowledge, language = null) {
    try {
        if (!this.initialized) {
            await this.initialize();
        }

        // Validate required fields
        if (!knowledge.category || !knowledge.file_name || !knowledge.text) {
            throw new Error('Missing required fields: category, file_name, text');
        }

        // ใช้ DEFAULT language สำหรับทุกเอกสาร
        const lang = this.DEFAULT_LANGUAGE;
        const langConfig = this.languageConfigs[lang];

        this.logger.info(`Adding knowledge to namespace: ${langConfig.namespace}`, {
            category: knowledge.category,
            file_name: knowledge.file_name,
            namespace: langConfig.namespace,
            textLength: knowledge.text.length
        });

        // Generate unique ID without language prefix
        const knowledgeId = this.generateKnowledgeId(knowledge);

        // Prepare document metadata
        const metadata = {
            id: knowledgeId,
            category: knowledge.category,
            file_name: knowledge.file_name,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            word_count: knowledge.text.split(' ').length,
            namespace: langConfig.namespace,
            tags: knowledge.tags || [],
            source: knowledge.source || 'manual'
        };

        let textChunks;
        const MAX_SINGLE_CHUNK_SIZE = 8000; // ขนาดสูงสุดที่ไม่ต้องแบ่ง chunk

        // ตรวจสอบขนาดข้อความ
        if (knowledge.text.length <= MAX_SINGLE_CHUNK_SIZE) {
            // ใช้ข้อความทั้งหมดเป็น chunk เดียว
            textChunks = [knowledge.text];
            this.logger.info(`Text is small enough (${knowledge.text.length} chars), using single chunk`, {
                knowledgeId,
                category: knowledge.category,
                language: lang,
                namespace: langConfig.namespace
            });
        } else {
            // ใช้ text splitter ตามปกติสำหรับข้อความยาว
            const textSplitter = this.textSplitters[lang];
            textChunks = await textSplitter.splitText(knowledge.text);
            
            this.logger.info(`Text is large (${knowledge.text.length} chars), splitting into ${textChunks.length} chunks`, {
                knowledgeId,
                category: knowledge.category,
                language: lang,
                namespace: langConfig.namespace,
                originalLength: knowledge.text.length,
                averageChunkSize: Math.round(knowledge.text.length / textChunks.length)
            });
        }

        // Generate embeddings using language-specific model
        const embedModel = this.embeddings[lang];
        const vectors = [];
        
        for (let i = 0; i < textChunks.length; i++) {
            const chunk = textChunks[i];
            const chunkId = `${knowledgeId}_chunk_${i}`;
            
            this.logger.debug(`Generating embedding for chunk ${i + 1}/${textChunks.length}`, {
                chunkId,
                chunkLength: chunk.length,
                language: lang,
                isSingleChunk: textChunks.length === 1
            });
            
            // Generate embedding
            const embedding = await embedModel.embedQuery(chunk);
            
            // Validate embedding dimension
            if (embedding.length !== this.config.embedding.dimension) {
                this.logger.warn(`Embedding dimension mismatch: expected ${this.config.embedding.dimension}, got ${embedding.length}`);
            }
            
            // Prepare vector for Pinecone with namespace
            const vector = {
                id: chunkId,
                values: embedding,
                metadata: {
                    ...metadata,
                    chunk_index: i,
                    chunk_count: textChunks.length,
                    chunk_id: chunkId,
                    text: chunk,
                    is_single_chunk: textChunks.length === 1, // เพิ่มข้อมูลว่าเป็น chunk เดียวหรือไม่
                    original_text_length: knowledge.text.length // เพิ่มข้อมูลความยาวต้นฉบับ
                }
            };
            
            vectors.push(vector);
        }

        // Add vectors to LanceDB table for the language-specific namespace
        const table = this.tables[langConfig.namespace];
        if (!table) {
            throw new Error(`Table not found for namespace: ${langConfig.namespace}`);
        }

        // Convert Pinecone format to LanceDB format
        const records = vectors.map(v => {
            // Remove 'id' from metadata to avoid schema conflict
            const { id: metadataId, ...cleanMetadata } = v.metadata;

            return {
                id: v.id,
                vector: v.values,
                text: v.metadata.text,
                category: cleanMetadata.category || '',
                file_name: cleanMetadata.file_name || '',
                chunk_index: cleanMetadata.chunk_index || 0,
                chunk_count: cleanMetadata.chunk_count || 1,
                created_at: cleanMetadata.created_at || new Date().toISOString()
            };
        });

        // Add records to table
        await table.add(records);

        this.logger.info(`Added knowledge to LanceDB`, {
            knowledgeId,
            vectorCount: vectors.length,
            chunks: textChunks.length,
            namespace: langConfig.namespace,
            embeddingModel: langConfig.embeddingModel,
            dimension: this.config.embedding.dimension,
            processingType: textChunks.length === 1 ? 'single_chunk' : 'multi_chunk',
            originalTextLength: knowledge.text.length,
            maxSingleChunkSize: MAX_SINGLE_CHUNK_SIZE
        });

        // Save metadata to language-specific storage
        await this.saveKnowledgeMetadata(knowledgeId, {
            ...metadata,
            text: knowledge.text,
            vector_ids: vectors.map(v => v.id),
            chunk_count: textChunks.length,
            embedding_model: langConfig.embeddingModel,
            embedding_dimension: this.config.embedding.dimension,
            is_single_chunk: textChunks.length === 1,
            original_text_length: knowledge.text.length,
            processing_type: textChunks.length === 1 ? 'single_chunk' : 'multi_chunk'
        }, lang);

        this.logger.info('Knowledge added successfully', {
            id: knowledgeId,
            category: knowledge.category,
            file_name: knowledge.file_name,
            namespace: langConfig.namespace,
            chunks: textChunks.length,
            processingType: textChunks.length === 1 ? 'single_chunk' : 'multi_chunk'
        });

        return {
            success: true,
            id: knowledgeId,
            namespace: langConfig.namespace,
            chunks: textChunks.length,
            vector_ids: vectors.map(v => v.id),
            embedding_model: langConfig.embeddingModel,
            embedding_dimension: this.config.embedding.dimension,
            processing_type: textChunks.length === 1 ? 'single_chunk' : 'multi_chunk',
            original_text_length: knowledge.text.length,
            chunk_sizes: textChunks.map(chunk => chunk.length)
        };

    } catch (error) {
        this.logger.error('Error adding knowledge:', error);
        return {
            success: false,
            error: error.message
        };
    }
}
    // Search knowledge with language-specific namespace
async searchKnowledge(query, options = {}) {
    try {
        if (!this.initialized) {
            await this.initialize();
        }

        // Detect language from query or use provided language
        const queryLanguage = options.language || this.detectLanguage(query);
        const searchLanguages = options.crossLanguage ? this.SUPPORTED_LANGUAGES : [queryLanguage];

        const searchOptions = {
            topK: options.topK || this.config.search.topK,
            filter: options.filter || {},
            scoreThreshold: options.scoreThreshold || this.config.search.scoreThreshold
        };

        this.logger.info('Searching knowledge', {
            query: query.substring(0, 100),
            languages: searchLanguages,
            options: searchOptions
        });

        let allResults = [];

        // Search in each language namespace, fallback to DEFAULT if not found
        for (const lang of searchLanguages) {
            let langConfig = this.languageConfigs[lang];
            let embedModel = this.embeddings[lang];

            // Fallback to DEFAULT if language-specific config not found
            if (!langConfig) {
                this.logger.info(`Language config not found for: ${lang}, using DEFAULT namespace`);
                langConfig = this.languageConfigs['DEFAULT'];
                embedModel = this.embeddings['DEFAULT'];
            }

            if (!langConfig) {
                this.logger.warn(`DEFAULT config not found, skipping...`);
                continue;
            }

            if (!embedModel) {
                this.logger.warn(`Embedding model not found for DEFAULT, skipping...`);
                continue;
            }

            this.logger.debug(`Searching in namespace: ${langConfig.namespace}`);

            // Generate query embedding
            const queryEmbedding = await embedModel.embedQuery(query);

            // Validate embedding dimension
            if (queryEmbedding.length !== this.config.embedding.dimension) {
                this.logger.warn(`Query embedding dimension mismatch for ${lang}: expected ${this.config.embedding.dimension}, got ${queryEmbedding.length}`);
            }

            // Perform LanceDB search for this table
            const table = this.tables[langConfig.namespace];
            if (!table) {
                this.logger.warn(`Table not found for namespace: ${langConfig.namespace}`);
                continue;
            }

            let searchResults;
            try {
                // Query LanceDB table
                let query = table.search(queryEmbedding).limit(searchOptions.topK);

                // Add filter if specified
                if (Object.keys(searchOptions.filter).length > 0) {
                    const filterStr = Object.entries(searchOptions.filter)
                        .map(([key, value]) => `metadata.${key} = '${value}'`)
                        .join(' AND ');
                    query = query.where(filterStr);
                }

                // LanceDB: Use toArray() instead of execute()
                const resultsArray = await query.toArray();

                this.logger.debug(`LanceDB query results from ${langConfig.namespace}:`, {
                    count: resultsArray.length,
                    sample: resultsArray.length > 0 ? {
                        id: resultsArray[0].id,
                        distance: resultsArray[0]._distance
                    } : null
                });

                // Format results to match Pinecone structure
                searchResults = {
                    matches: resultsArray.map(result => {
                        const distance = result._distance !== undefined ? result._distance : 0;
                        const score = distance === 0 ? 1 : Math.max(0, 1 - (distance / 2));

                        return {
                            id: result.id,
                            score,
                            metadata: result.metadata || {},
                            record: {
                                text: result.text,
                                category: result.category,
                                file_name: result.file_name,
                                chunk_index: result.chunk_index,
                                chunk_count: result.chunk_count,
                                created_at: result.created_at,
                                namespace: langConfig.namespace
                            }
                        };
                    })
                };
            } catch (queryError) {
                this.logger.error(`Error querying table ${langConfig.namespace}:`, queryError);
                continue; // Skip this namespace if error
            }

            this.logger.debug(`LanceDB search completed for ${lang}`, {
                namespace: langConfig.namespace,
                totalResults: searchResults.matches?.length || 0
            });

            const languageResults = [];
            for (const match of (searchResults.matches || [])) {
                if (match.score < searchOptions.scoreThreshold) {
                    continue;
                }

                const metadata = match.metadata || {};
                const record = match.record || {};
                const rawId = match.id || metadata.id || record.id || null;
                const knowledgeId = metadata.id || (rawId ? rawId.split('_chunk_')[0] : null);

                let mergedMetadata = {
                    id: metadata.id || knowledgeId || rawId,
                    category: metadata.category ?? record.category ?? '',
                    file_name: metadata.file_name ?? record.file_name ?? '',
                    text: metadata.text ?? record.text ?? '',
                    chunk_index: metadata.chunk_index ?? record.chunk_index ?? 0,
                    chunk_count: metadata.chunk_count ?? record.chunk_count ?? 1,
                    created_at: metadata.created_at ?? record.created_at ?? new Date().toISOString(),
                    updated_at: metadata.updated_at ?? metadata.created_at ?? record.created_at ?? null,
                    word_count: metadata.word_count ?? null,
                    tags: metadata.tags ?? null,
                    source: metadata.source ?? null,
                    chunk_id: metadata.chunk_id ?? null,
                    namespace: metadata.namespace ?? record.namespace ?? langConfig.namespace
                };

                if ((!mergedMetadata.text || mergedMetadata.text.length === 0) && knowledgeId) {
                    try {
                        const storedMetadata = await this.getKnowledgeMetadata(knowledgeId, this.DEFAULT_LANGUAGE);
                        if (storedMetadata) {
                            mergedMetadata = {
                                ...mergedMetadata,
                                ...storedMetadata
                            };
                        }
                    } catch (metaError) {
                        this.logger.warn('Failed to enrich knowledge result with stored metadata', {
                            knowledgeId,
                            error: metaError.message
                        });
                    }
                }

                languageResults.push({
                    id: mergedMetadata.id,
                    category: mergedMetadata.category,
                    file_name: mergedMetadata.file_name,
                    text: mergedMetadata.text,
                    relevance_score: match.score,
                    confidence_score: this.calculateConfidenceScore(match.score),
                    score_threshold: searchOptions.scoreThreshold,
                    chunk_index: mergedMetadata.chunk_index,
                    chunk_count: mergedMetadata.chunk_count,
                    created_at: mergedMetadata.created_at,
                    updated_at: mergedMetadata.updated_at,
                    word_count: mergedMetadata.word_count,
                    language: lang,
                    namespace: mergedMetadata.namespace,
                    tags: mergedMetadata.tags,
                    source: mergedMetadata.source,
                    chunk_id: mergedMetadata.chunk_id,
                    embedding_model: langConfig.embeddingModel
                });
            }

            allResults = allResults.concat(languageResults);
        }

        // Sort all results by relevance score
        allResults.sort((a, b) => b.relevance_score - a.relevance_score);

        // Limit to topK across all languages
        const finalResults = allResults.slice(0, searchOptions.topK);

        this.logger.info('Knowledge search completed', {
            totalResults: allResults.length,
            filteredResults: finalResults.length,
            query: query.substring(0, 50),
            languagesSearched: searchLanguages
        });

        return {
            success: true,
            query,
            results: finalResults,
            total_results: finalResults.length,
            languages_searched: searchLanguages,
            search_options: searchOptions
        };

    } catch (error) {
        this.logger.error('Error searching knowledge:', error);
        return {
            success: false,
            error: error.message,
            query,
            results: []
        };
    }
}

    // Delete knowledge from specific language namespace
    async deleteKnowledge(knowledgeId) {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            // Extract language from knowledgeId (format: LANG_hash)
            const lang = knowledgeId.split('_')[0];
            if (!this.SUPPORTED_LANGUAGES.includes(lang)) {
                throw new Error(`Invalid language in knowledge ID: ${lang}`);
            }

            const langConfig = this.languageConfigs[lang];

            // Get metadata to find vector IDs
            const metadata = await this.getKnowledgeMetadata(knowledgeId, lang);
            if (!metadata) {
                throw new Error(`Knowledge with ID ${knowledgeId} not found`);
            }

            // Delete vectors from Pinecone namespace
            await this.deleteKnowledgeVectors(knowledgeId, lang);

            // Delete local metadata
            await this.deleteKnowledgeMetadata(knowledgeId, lang);

            this.logger.info('Knowledge deleted successfully', {
                id: knowledgeId,
                language: lang,
                namespace: langConfig.namespace,
                category: metadata.category,
                file_name: metadata.file_name
            });

            return {
                success: true,
                id: knowledgeId,
                language: lang,
                namespace: langConfig.namespace,
                deleted_chunks: metadata.chunk_count || 0
            };

        } catch (error) {
            this.logger.error('Error deleting knowledge:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Helper: Delete knowledge vectors from specific namespace
async deleteKnowledgeVectors(knowledgeId, language) {
    try {
        const langConfig = this.languageConfigs[language];
        const metadata = await this.getKnowledgeMetadata(knowledgeId, language);
        
        if (metadata && metadata.vector_ids) {
            // Delete vectors from LanceDB table
            const table = this.tables[langConfig.namespace];
            if (table) {
                // Delete records by IDs
                for (const id of metadata.vector_ids) {
                    await table.delete(`id = '${id}'`);
                }
            }

            this.logger.info('Deleted vectors from LanceDB', { 
                knowledgeId,
                language,
                namespace: langConfig.namespace,
                vectorCount: metadata.vector_ids.length 
            });
        }
    } catch (error) {
        this.logger.error('Error deleting vectors:', error);
        throw error;
    }
}

    // Get knowledge by category with language filter
    async listKnowledgeByCategory(category = null, language = null) {
        try {
            const languagesToSearch = language ? [language] : this.SUPPORTED_LANGUAGES;
            let allKnowledge = [];

            for (const lang of languagesToSearch) {
                const metadata = await this.getAllKnowledgeMetadata(lang);
                let langKnowledge = Object.values(metadata);
                
                if (category) {
                    langKnowledge = langKnowledge.filter(
                        knowledge => knowledge.category === category
                    );
                }

                // Add language info to each item
                langKnowledge = langKnowledge.map(item => ({
                    ...item,
                    language: lang,
                    namespace: this.languageConfigs[lang].namespace
                }));

                allKnowledge = allKnowledge.concat(langKnowledge);
            }

            // Sort by updated_at descending
            allKnowledge.sort((a, b) => 
                new Date(b.updated_at) - new Date(a.updated_at)
            );

            return {
                success: true,
                knowledge: allKnowledge,
                total: allKnowledge.length,
                category: category || 'all',
                languages: languagesToSearch
            };

        } catch (error) {
            this.logger.error('Error listing knowledge:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get categories across all languages or specific language
    async getCategories(language = null) {
        try {
            const languagesToSearch = language ? [language] : this.SUPPORTED_LANGUAGES;
            const categoriesByLanguage = {};
            const allCategories = {};

            for (const lang of languagesToSearch) {
                const metadata = await this.getAllKnowledgeMetadata(lang);
                categoriesByLanguage[lang] = {};

                Object.values(metadata).forEach(knowledge => {
                    const category = knowledge.category || 'uncategorized';
                    
                    // Count by language
                    categoriesByLanguage[lang][category] = (categoriesByLanguage[lang][category] || 0) + 1;
                    
                    // Count overall
                    allCategories[category] = (allCategories[category] || 0) + 1;
                });
            }

            return {
                success: true,
                categories: allCategories,
                categoriesByLanguage,
                total_categories: Object.keys(allCategories).length,
                languages: languagesToSearch
            };

        } catch (error) {
            this.logger.error('Error getting categories:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Generate context for AI from search results with language awareness
    async generateContext(query, options = {}) {
        try {
            const searchResults = await this.searchKnowledge(query, options);
            
            if (!searchResults.success || searchResults.results.length === 0) {
                return {
                    success: false,
                    context: '',
                    sources: []
                };
            }

            const contextParts = [];
            const sources = [];

            // Group results by language for better organization
            const resultsByLanguage = {};
            searchResults.results.forEach(result => {
                if (!resultsByLanguage[result.language]) {
                    resultsByLanguage[result.language] = [];
                }
                resultsByLanguage[result.language].push(result);
            });

            // Format context by language
            Object.entries(resultsByLanguage).forEach(([lang, langResults]) => {
                const langHeaders = {
                    TH: 'ความรู้ภาษาไทย',
                    EN: 'English Knowledge',
                    CN: '中文知识',
                    KR: '한국어 지식',
                    JP: '日本語の知識'
                };

                contextParts.push(`[${langHeaders[lang] || lang}]`);

                langResults.forEach((result, index) => {
                    const contextPart = [
                        `${index + 1}. ${result.category} - ${result.file_name}`,
                        result.text,
                        `(Confidence: ${(result.confidence_score * 100).toFixed(1)}%)`
                    ].join('\n');

                    contextParts.push(contextPart);
                    
                    sources.push({
                        id: result.id,
                        category: result.category,
                        file_name: result.file_name,
                        language: result.language,
                        namespace: result.namespace,
                        relevance_score: result.relevance_score,
                        confidence_score: result.confidence_score,
                        chunk_index: result.chunk_index
                    });
                });
            });

            const context = contextParts.join('\n\n---\n\n');

            return {
                success: true,
                context,
                sources,
                total_sources: sources.length,
                languages: Object.keys(resultsByLanguage),
                query
            };

        } catch (error) {
            this.logger.error('Error generating context:', error);
            return {
                success: false,
                context: '',
                sources: [],
                error: error.message
            };
        }
    }

    // Helper: Save knowledge metadata to language-specific storage
    async saveKnowledgeMetadata(knowledgeId, metadata, language) {
        try {
            const metadataPath = this.metadataPaths[language];
            let allMetadata = {};
            
            try {
                const existingData = await fs.readFile(metadataPath, 'utf8');
                allMetadata = JSON.parse(existingData);
            } catch (error) {
                // File doesn't exist or is empty, start with empty object
            }

            allMetadata[knowledgeId] = metadata;

            await fs.writeFile(
                metadataPath, 
                JSON.stringify(allMetadata, null, 2), 
                'utf8'
            );

            this.logger.debug('Saved knowledge metadata', { 
                knowledgeId, 
                language,
                file: metadataPath 
            });
        } catch (error) {
            this.logger.error('Error saving metadata:', error);
            throw error;
        }
    }

    // Helper: Get knowledge metadata from language-specific storage
    async getKnowledgeMetadata(knowledgeId, language) {
        try {
            const allMetadata = await this.getAllKnowledgeMetadata(language);
            return allMetadata[knowledgeId] || null;
        } catch (error) {
            this.logger.error('Error getting metadata:', error);
            return null;
        }
    }

    // Helper: Get all knowledge metadata for a specific language
    async getAllKnowledgeMetadata(language) {
        try {
            const metadataPath = this.metadataPaths[language];
            const data = await fs.readFile(metadataPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return {}; // File doesn't exist
            }
            this.logger.error('Error reading metadata file:', error);
            throw error;
        }
    }

    // Helper: Delete knowledge metadata from language-specific storage
    async deleteKnowledgeMetadata(knowledgeId, language) {
        try {
            const metadataPath = this.metadataPaths[language];
            const allMetadata = await this.getAllKnowledgeMetadata(language);
            delete allMetadata[knowledgeId];

            await fs.writeFile(
                metadataPath, 
                JSON.stringify(allMetadata, null, 2), 
                'utf8'
            );

            this.logger.debug('Deleted knowledge metadata', { 
                knowledgeId,
                language 
            });
        } catch (error) {
            this.logger.error('Error deleting metadata:', error);
            throw error;
        }
    }

    // Health check with LanceDB table information
    async healthCheck() {
        try {
            const status = {
                initialized: this.initialized,
                lancedb_connected: false,
                embeddings_ready: {},
                db_ready: false,
                table_stats_by_namespace: {},
                local_knowledge_count_by_language: {},
                supported_languages: this.SUPPORTED_LANGUAGES,
                default_language: this.DEFAULT_LANGUAGE,
                db_path: this.dbPath
            };

            if (this.initialized) {
                // Check LanceDB connection
                try {
                    const tableNames = await this.db.tableNames();
                    status.lancedb_connected = true;
                    status.db_ready = true;

                    // Get stats for each table/namespace
                    for (const lang of this.SUPPORTED_LANGUAGES) {
                        const namespace = this.languageConfigs[lang].namespace;
                        try {
                            const table = this.tables[namespace];
                            if (table) {
                                const rowCount = await table.countRows();
                                status.table_stats_by_namespace[lang] = {
                                    namespace: namespace,
                                    vectorCount: rowCount,
                                    exists: true
                                };
                            } else {
                                status.table_stats_by_namespace[lang] = {
                                    namespace: namespace,
                                    exists: false
                                };
                            }
                        } catch (error) {
                            this.logger.warn(`Failed to get stats for table ${namespace}:`, error);
                        }
                    }
                } catch (error) {
                    this.logger.warn('LanceDB health check failed:', error);
                }

                // Check embeddings for each language
                for (const lang of this.SUPPORTED_LANGUAGES) {
                    try {
                        const embedModel = this.embeddings[lang];
                        const testEmbedding = await embedModel.embedQuery("test");
                        status.embeddings_ready[lang] = {
                            ready: true,
                            dimension: testEmbedding.length,
                            model: this.languageConfigs[lang].embeddingModel
                        };
                    } catch (error) {
                        status.embeddings_ready[lang] = {
                            ready: false,
                            error: error.message
                        };
                    }
                }

                // Count local knowledge by language
                for (const lang of this.SUPPORTED_LANGUAGES) {
                    try {
                        const metadata = await this.getAllKnowledgeMetadata(lang);
                        status.local_knowledge_count_by_language[lang] = Object.keys(metadata).length;
                    } catch (error) {
                        status.local_knowledge_count_by_language[lang] = 0;
                    }
                }
            }

            return {
                success: true,
                status,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.logger.error('Health check failed:', error);
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Get system statistics with language breakdown
    async getStatistics() {
        try {
            const stats = {
                total_knowledge: 0,
                by_language: {},
                categories: {},
                languages: {},
                sources: {},
                total_words: 0,
                total_chunks: 0,
                oldest_entry: null,
                newest_entry: null
            };

            for (const lang of this.SUPPORTED_LANGUAGES) {
                const metadata = await this.getAllKnowledgeMetadata(lang);
                const langKnowledge = Object.values(metadata);

                stats.by_language[lang] = {
                    total: langKnowledge.length,
                    categories: {},
                    total_words: 0,
                    total_chunks: 0
                };

                langKnowledge.forEach(k => {
                    // Overall stats
                    stats.total_knowledge++;
                    stats.total_words += k.word_count || 0;
                    stats.total_chunks += k.chunk_count || 0;

                    // Language-specific stats
                    stats.by_language[lang].total_words += k.word_count || 0;
                    stats.by_language[lang].total_chunks += k.chunk_count || 0;

                    // Categories
                    const category = k.category || 'uncategorized';
                    stats.categories[category] = (stats.categories[category] || 0) + 1;
                    stats.by_language[lang].categories[category] = 
                        (stats.by_language[lang].categories[category] || 0) + 1;

                    // Sources
                    const source = k.source || 'unknown';
                    stats.sources[source] = (stats.sources[source] || 0) + 1;

                    // Track dates
                    const createdAt = new Date(k.created_at);
                    if (!stats.oldest_entry || createdAt < new Date(stats.oldest_entry)) {
                        stats.oldest_entry = k.created_at;
                    }
                    if (!stats.newest_entry || createdAt > new Date(stats.newest_entry)) {
                        stats.newest_entry = k.created_at;
                    }
                });

                // Count language usage
                stats.languages[lang] = langKnowledge.length;
            }

            return {
                success: true,
                statistics: stats,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.logger.error('Error getting statistics:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Helper methods
    generateKnowledgeId(knowledge) {
        const source = `${knowledge.category}_${knowledge.file_name}_${Date.now()}`;
        return crypto.createHash('md5').update(source).digest('hex');
    }

    calculateConfidenceScore(relevanceScore) {
        return Math.min(1, Math.max(0, relevanceScore * 1.2));
    }

    async ensureDirectoryExists() {
        try {
            await fs.mkdir(this.knowledgeBasePath, { recursive: true });
            this.logger.info(`Knowledge base directory ensured: ${this.knowledgeBasePath}`);
        } catch (error) {
            this.logger.error('Error creating knowledge directory:', error);
            throw error;
        }
    }
}

module.exports = KnowledgeRAG;
