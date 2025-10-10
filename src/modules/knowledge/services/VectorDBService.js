// services/VectorDBService.js
'use strict';

const { OpenAI } = require('openai');
const lancedb = require('@lancedb/lancedb');
const _ = require('lodash');
const NodeCache = require('node-cache');
const fs = require('fs').promises;
const path = require('path');
const { DATA_DIR } = require('../../../app/paths');

class VectorDBService {
    constructor(logger) {
        this.logger = logger;
        this.initialized = false;
        this.embedCache = new NodeCache({ stdTTL: 86400 }); // 24 hours
        this.db = null;
        this.tables = {}; // Store table references by name
        this.dbPath = path.join(DATA_DIR, 'lancedb');
    }

    async initialize(apiKey, indexName) {
        // If already initialized with same DB, just return success
        if (this.initialized && this.db) {
            this.logger.info('VectorDB service already initialized, reusing connection', {
                dbPath: this.dbPath,
                currentIndexName: this.indexName,
                requestedIndexName: indexName
            });
            return true;
        }

        try {
            if (apiKey) {
                this.openai = new OpenAI({ apiKey });
                this.logger.info('OpenAI client initialized for VectorDBService.');
            } else {
                this.openai = null;
                this.logger.warn('VectorDBService initialized without an OpenAI API key. Embedding functionality will be disabled.');
            }

            // Ensure LanceDB directory exists
            await fs.mkdir(this.dbPath, { recursive: true });

            // Connect to LanceDB
            this.db = await lancedb.connect(this.dbPath);
            this.indexName = indexName || 'default';

            this.logger.info('LanceDB initialized successfully', {
                dbPath: this.dbPath,
                indexName: this.indexName
            });

            this.initialized = true;
            return true;
        } catch (error) {
            this.initialized = false;
            this.logger.error('Failed to initialize LanceDB service:', error);
            throw error;
        }
    }

    async getOrCreateTable(tableName) {
        if (this.tables[tableName]) {
            return this.tables[tableName];
        }

        try {
            const tableNames = await this.db.tableNames();

            if (tableNames.includes(tableName)) {
                this.tables[tableName] = await this.db.openTable(tableName);
            } else {
                // Create table with proper schema based on table name
                // Note: We pass an array with a sample record to define schema,
                // but we'll delete it immediately to start with an empty table
                let sampleRecord;

                if (tableName === 'knowledge') {
                    // Schema for knowledge entries
                    sampleRecord = {
                        id: '__TEMP_SAMPLE__',
                        vector: Array(3072).fill(0),
                        title: 'sample',
                        content: 'sample',
                        category: 'sample',
                        product_name: '',
                        price: '',
                        sku: '',
                        url: ''
                    };
                } else {
                    // Default schema for products
                    sampleRecord = {
                        id: '__TEMP_SAMPLE__',
                        vector: Array(3072).fill(0),
                        product_name: 'sample',
                        category: 'sample',
                        price: 'sample',
                        sku: 'sample',
                        url: 'sample',
                        title: '',
                        content: ''
                    };
                }

                this.tables[tableName] = await this.db.createTable(tableName, [sampleRecord]);

                // Delete the sample record to start with empty table
                await this.tables[tableName].delete(`id = '__TEMP_SAMPLE__'`);

                this.logger.info(`Created new LanceDB table: ${tableName}`);
            }

            return this.tables[tableName];
        } catch (error) {
            this.logger.error(`Error getting/creating table ${tableName}:`, error);
            throw error;
        }
    }

    async verifyConnection() {
        try {
            const tableNames = await this.db.tableNames();
            this.logger.info('Connected to LanceDB', {
                dbPath: this.dbPath,
                tableCount: tableNames.length,
                tables: tableNames
            });
            return true;
        } catch (error) {
            throw new Error(`LanceDB connection failed: ${error.message}`);
        }
    }

    async getEmbedding(text) {
        if (!this.openai) {
            throw new Error('OpenAI client is not initialized. Please provide an API key in the Vector DB configuration.');
        }
        const cacheKey = `emb_${Buffer.from(text).toString('base64')}`;
        const cached = this.embedCache.get(cacheKey);
        if (cached) return cached;

        const response = await this.openai.embeddings.create({
            input: text,
            model: "text-embedding-3-large"
        });

        if (!response.data?.[0]?.embedding) {
            throw new Error('Invalid embedding response');
        }

        const embedding = response.data[0].embedding;
        this.embedCache.set(cacheKey, embedding);
        return embedding;
    }

    async upsertVector(id, values, metadata, tableName = null) {
        if (!this.initialized) {
            throw new Error('Vector DB service not initialized');
        }

        try {
            const targetTable = tableName || this.indexName;
            const table = await this.getOrCreateTable(targetTable);

            // Get table schema to determine available fields
            const schema = await table.schema;
            const schemaFields = schema?.fields?.map(f => f.name) || [];

            this.logger.info(`Table ${targetTable} schema fields:`, schemaFields);

            // Build record - always use all fields for consistency
            // LanceDB will accept records with same structure as table schema
            const record = {
                id: id,
                vector: values,
                product_name: metadata?.product_name || '',
                category: metadata?.category || '',
                price: metadata?.price || '',
                sku: metadata?.sku || '',
                url: metadata?.url || '',
                title: metadata?.title || '',
                content: metadata?.content || ''
            };

            // Check if record with this ID exists
            const existingRecordsById = await table.query()
                .where(`id = '${id}'`)
                .select(['id'])
                .toArray();

            if (existingRecordsById.length > 0) {
                // Delete all existing records with this ID (in case of duplicates)
                this.logger.info(`Deleting ${existingRecordsById.length} existing record(s) with id=${id}`);
                await table.delete(`id = '${id}'`);

                // Wait a bit for delete to complete
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Add new record
            await table.add([record]);

            this.logger.info(`Vector ${id} upserted successfully to table ${targetTable}`);
            return true;
        } catch (error) {
            this.logger.error(`Error upserting vector ${id}:`, error);
            throw error;
        }
    }

    async queryVectors(embedding, topK, filter = {}, tableName = null) {
        if (!this.initialized) {
            throw new Error('Vector DB service not initialized');
        }

        try {
            if (!embedding || embedding.length !== 3072) {
                throw new Error(`Invalid embedding dimension: expected 3072, got ${embedding?.length}`);
            }

            const targetTable = tableName || this.indexName;
            this.logger.info(`Querying table: ${targetTable}, topK: ${topK}`);

            const table = await this.getOrCreateTable(targetTable);

            // Check table row count
            const rowCount = await table.countRows();
            this.logger.info(`Table ${targetTable} has ${rowCount} rows`);

            if (rowCount === 0) {
                this.logger.warn(`Table ${targetTable} is empty`);
                return [];
            }

            // Query using vector search
            let query = table.search(embedding).limit(topK);

            // Apply metadata filter if provided
            if (filter && Object.keys(filter).length > 0) {
                const filterStr = Object.entries(filter)
                    .map(([key, value]) => `${key} = '${value}'`)
                    .join(' AND ');
                query = query.where(filterStr);
                this.logger.info(`Applied filter: ${filterStr}`);
            }

            // LanceDB v0.22.1: Use toArray() to get results as array
            const resultsArray = await query.toArray();

            this.logger.info(`Query returned ${resultsArray.length} results from table ${targetTable}`);

            // Format results to match Pinecone-like structure
            const matches = resultsArray.map(result => {
                // LanceDB uses L2 distance by default, convert to cosine similarity (0-1)
                // For L2 distance: smaller = more similar
                // Convert to similarity: 1 / (1 + distance^2) or use 1 - normalized distance
                const distance = result._distance !== undefined ? result._distance : 0;
                const score = distance === 0 ? 1 : Math.max(0, 1 - (distance / 2)); // Normalize to 0-1 range

                this.logger.info(`Result: id=${result.id}, distance=${distance}, score=${score}, product_name=${result.product_name}`);

                return {
                    id: result.id,
                    score: score,
                    values: result.vector,
                    metadata: {
                        product_name: result.product_name || '',
                        category: result.category || '',
                        price: result.price || '',
                        sku: result.sku || '',
                        url: result.url || '',
                        title: result.title || '',
                        content: result.content || ''
                    }
                };
            });

            return matches;
        } catch (error) {
            this.logger.error('Vector query failed:', error);
            throw error;
        }
    }

    async deleteVector(id, tableName = null) {
        if (!this.initialized) {
            throw new Error('Vector DB service not initialized');
        }

        try {
            const table = await this.getOrCreateTable(tableName || this.indexName);
            await table.delete(`id = '${id}'`);

            this.logger.info(`Vector ${id} deleted successfully from table ${tableName || this.indexName}`);
            return true;
        } catch (error) {
            this.logger.error(`Error deleting vector ${id}:`, error);
            throw error;
        }
    }

    async getIndexStats(productsDir) {
        try {
            if (!this.initialized) {
                throw new Error('Vector DB service not initialized');
            }

            const tableNames = await this.db.tableNames();
            let totalVectorCount = 0;
            const namespaceStats = {};

            // Get stats for each table
            for (const tableName of tableNames) {
                const table = await this.db.openTable(tableName);
                const count = await table.countRows();
                totalVectorCount += count;
                namespaceStats[tableName] = { vectorCount: count };
            }

            // Get local file stats if productsDir provided
            let jsonFiles = [];
            let lastModified = null;

            if (productsDir) {
                try {
                    const files = await fs.readdir(productsDir);
                    jsonFiles = files.filter(file => file.endsWith('.json'));

                    const fileStats = await Promise.all(
                        jsonFiles.map(async file => {
                            const filePath = path.join(productsDir, file);
                            const stats = await fs.stat(filePath);
                            return { file, mtime: stats.mtime };
                        })
                    );

                    lastModified = fileStats.length > 0
                        ? new Date(Math.max(...fileStats.map(stat => stat.mtime.getTime())))
                        : null;
                } catch (err) {
                    // Ignore if productsDir doesn't exist
                }
            }

            // Calculate database size
            const vectorSize = 3072 * 4; // 3072 dimensions * 4 bytes per float
            const estimatedMetadataSize = 1000; // Average metadata size in bytes
            const totalBytes = totalVectorCount * (vectorSize + estimatedMetadataSize);

            return {
                connected: true,
                totalVectorCount: totalVectorCount,
                dimension: 3072,
                namespaces: tableNames,
                namespaceCount: tableNames.length,
                databaseSize: totalBytes,
                indexName: this.indexName,
                dbPath: this.dbPath,
                lastUpdated: lastModified,
                localFileCount: jsonFiles.length,
                metrics: {
                    vectorsPerNamespace: this.calculateNamespaceMetrics(namespaceStats, totalVectorCount),
                    averageVectorsPerProduct: jsonFiles.length > 0
                        ? totalVectorCount / jsonFiles.length
                        : 0
                }
            };
        } catch (error) {
            this.logger.error('Error getting index stats:', error);
            throw error;
        }
    }

    calculateNamespaceMetrics(namespaceStats, totalVectorCount) {
        return Object.entries(namespaceStats).reduce((acc, [namespace, data]) => {
            acc[namespace] = {
                vectorCount: data.vectorCount || 0,
                percentageOfTotal: totalVectorCount
                    ? ((data.vectorCount || 0) / totalVectorCount * 100).toFixed(2) + '%'
                    : '0%'
            };
            return acc;
        }, {});
    }

    async healthCheck() {
        try {
            if (!this.initialized) {
                return {
                    status: 'not_initialized',
                    error: 'Vector DB service not initialized'
                };
            }

            const tableNames = await this.db.tableNames();
            let totalVectors = 0;

            for (const tableName of tableNames) {
                const table = await this.db.openTable(tableName);
                const count = await table.countRows();
                totalVectors += count;
            }

            return {
                status: 'healthy',
                type: 'lancedb',
                totalVectors: totalVectors,
                tables: tableNames,
                tableCount: tableNames.length,
                dbPath: this.dbPath,
                indexName: this.indexName,
                embeddingCacheStats: this.embedCache.getStats()
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                dbPath: this.dbPath
            };
        }
    }
}

module.exports = { VectorDBService };
