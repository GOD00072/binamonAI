// services/ProductMetadataService.js

const fs = require('fs').promises;
const path = require('path');

class ProductMetadataService {
    constructor(logger, baseDir = './products') {
        this.logger = logger;
        this.baseDir = baseDir;
        this.processedUrlsFile = path.join(baseDir, 'processed_urls.json');
        this.productStatsFile = path.join(baseDir, 'product_stats.json');
        this.processedUrls = new Set();
        this.productStats = {
            totalProducts: 0,
            categoryCounts: {},
            lastUpdated: null
        };
        this.initialized = false;
    }

    async initialize() {
        try {
            // สร้างโฟลเดอร์ products หากยังไม่มี
            await fs.mkdir(this.baseDir, { recursive: true });
            
            // โหลด processed URLs ที่มีอยู่
            await this.loadProcessedUrls();
            
            // โหลดสถิติผลิตภัณฑ์
            await this.loadProductStats();
            
            this.initialized = true;
            this.logger.info('ProductMetadataService initialized successfully', {
                processedUrlsCount: this.processedUrls.size,
                totalProducts: this.productStats.totalProducts
            });
        } catch (error) {
            this.logger.error('Failed to initialize ProductMetadataService:', error);
            throw error;
        }
    }

    async loadProcessedUrls() {
        try {
            const data = await fs.readFile(this.processedUrlsFile, 'utf8');
            const urls = JSON.parse(data);
            
            if (Array.isArray(urls)) {
                this.processedUrls = new Set(urls);
            } else {
                this.processedUrls = new Set();
            }
            
            this.logger.info(`Loaded ${this.processedUrls.size} processed URLs`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // ไฟล์ยังไม่มี สร้างใหม่
                this.processedUrls = new Set();
                await this.saveProcessedUrls();
                this.logger.info('Created new processed URLs file');
            } else {
                this.logger.error('Error loading processed URLs:', error);
                this.processedUrls = new Set();
            }
        }
    }

    async saveProcessedUrls() {
        try {
            const urls = Array.from(this.processedUrls);
            await fs.writeFile(
                this.processedUrlsFile, 
                JSON.stringify(urls, null, 2), 
                'utf8'
            );
        } catch (error) {
            this.logger.error('Error saving processed URLs:', error);
        }
    }

    async loadProductStats() {
        try {
            const data = await fs.readFile(this.productStatsFile, 'utf8');
            this.productStats = JSON.parse(data);
            this.logger.info('Loaded product statistics', this.productStats);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // ไฟล์ยังไม่มี สร้างใหม่
                await this.saveProductStats();
                this.logger.info('Created new product stats file');
            } else {
                this.logger.error('Error loading product stats:', error);
            }
        }
    }

    async saveProductStats() {
        try {
            this.productStats.lastUpdated = new Date().toISOString();
            await fs.writeFile(
                this.productStatsFile,
                JSON.stringify(this.productStats, null, 2),
                'utf8'
            );
        } catch (error) {
            this.logger.error('Error saving product stats:', error);
        }
    }

    isUrlProcessed(url) {
        if (!url) return false;
        
        // ปรับแต่ง URL ให้เป็นมาตรฐาน
        const normalizedUrl = this.normalizeUrl(url);
        return this.processedUrls.has(normalizedUrl);
    }

    async markUrlAsProcessed(url) {
        if (!url) return;
        
        const normalizedUrl = this.normalizeUrl(url);
        this.processedUrls.add(normalizedUrl);
        
        // บันทึกทุกครั้งที่เพิ่ม URL ใหม่
        await this.saveProcessedUrls();
        
        this.logger.debug(`URL marked as processed: ${normalizedUrl}`);
    }

    async markUrlsAsProcessed(urls) {
        if (!Array.isArray(urls) || urls.length === 0) return;
        
        let addedCount = 0;
        
        for (const url of urls) {
            if (url) {
                const normalizedUrl = this.normalizeUrl(url);
                if (!this.processedUrls.has(normalizedUrl)) {
                    this.processedUrls.add(normalizedUrl);
                    addedCount++;
                }
            }
        }
        
        if (addedCount > 0) {
            await this.saveProcessedUrls();
            this.logger.info(`Marked ${addedCount} new URLs as processed`);
        }
    }

    normalizeUrl(url) {
        try {
            // ลบ trailing slash และ query parameters
            let normalized = url.trim().toLowerCase();
            
            // ลบ query parameters
            const urlObj = new URL(normalized);
            normalized = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
            
            // ลบ trailing slash
            if (normalized.endsWith('/') && normalized.length > 1) {
                normalized = normalized.slice(0, -1);
            }
            
            return normalized;
        } catch (error) {
            // หาก URL ไม่ถูกต้อง ให้คืนค่าเดิม
            return url.trim().toLowerCase();
        }
    }

    filterUnprocessedUrls(urls) {
        if (!Array.isArray(urls)) return [];
        
        return urls.filter(url => {
            if (!url) return false;
            return !this.isUrlProcessed(url);
        });
    }

    getProcessedUrlsCount() {
        return this.processedUrls.size;
    }

    getProcessedUrls() {
        return Array.from(this.processedUrls);
    }

    async clearProcessedUrls() {
        this.processedUrls.clear();
        await this.saveProcessedUrls();
        this.logger.info('Cleared all processed URLs');
    }

    async removeUrl(url) {
        if (!url) return false;
        
        const normalizedUrl = this.normalizeUrl(url);
        const wasRemoved = this.processedUrls.delete(normalizedUrl);
        
        if (wasRemoved) {
            await this.saveProcessedUrls();
            this.logger.info(`Removed URL from processed list: ${normalizedUrl}`);
        }
        
        return wasRemoved;
    }

    async removeUrls(urls) {
        if (!Array.isArray(urls) || urls.length === 0) return 0;
        
        let removedCount = 0;
        
        for (const url of urls) {
            if (url) {
                const normalizedUrl = this.normalizeUrl(url);
                if (this.processedUrls.delete(normalizedUrl)) {
                    removedCount++;
                }
            }
        }
        
        if (removedCount > 0) {
            await this.saveProcessedUrls();
            this.logger.info(`Removed ${removedCount} URLs from processed list`);
        }
        
        return removedCount;
    }

    getDuplicateAnalysis(urls) {
        if (!Array.isArray(urls)) return { duplicates: [], unique: [], summary: {} };
        
        const duplicates = [];
        const unique = [];
        
        for (const url of urls) {
            if (!url) continue;
            
            if (this.isUrlProcessed(url)) {
                duplicates.push(url);
            } else {
                unique.push(url);
            }
        }
        
        return {
            duplicates,
            unique,
            summary: {
                total: urls.length,
                duplicates: duplicates.length,
                unique: unique.length,
                processedUrlsTotal: this.processedUrls.size
            }
        };
    }

    // ===== EMBEDDING TEXT CREATION =====

    createProductEmbeddingText(product) {
        try {
            if (!product) {
                this.logger.warn('No product data provided for embedding text creation');
                return '';
            }

            // Combine relevant product information for embedding
            const textParts = [];

            // Product name (most important)
            if (product.product_name) {
                textParts.push(product.product_name);
            }

            // Category
            if (product.category) {
                textParts.push(product.category);
            }

            // Short description
            if (product.short_description) {
                textParts.push(this.cleanTextForEmbedding(product.short_description));
            }

            // SKU
            if (product.sku) {
                textParts.push(`รหัสสินค้า ${product.sku}`);
            }

            // Price information
            if (product.price) {
                textParts.push(this.cleanTextForEmbedding(product.price));
            }

            // Extract details as text
            if (product.details && typeof product.details === 'object') {
                Object.entries(product.details).forEach(([key, value]) => {
                    if (Array.isArray(value)) {
                        textParts.push(`${key}: ${value.join(' ')}`);
                    } else if (typeof value === 'string' && value.trim()) {
                        textParts.push(`${key}: ${this.cleanTextForEmbedding(value)}`);
                    }
                });
            }

            // Voodoo pricing information
            if (product.voodoo_pricing && product.voodoo_pricing.prices) {
                const pricingText = product.voodoo_pricing.prices
                    .map(p => `${p.quantity} ${p.price}`)
                    .join(' ');
                textParts.push(`ราคาขายจากโรงงาน ${pricingText}`);
            }

            // Production data if available
            if (product.production_pricing) {
                textParts.push('ข้อมูลการผลิต pricing production manufacturing');
            }

            if (product.production_dimensions) {
                const dimText = this.extractDimensionsText(product.production_dimensions);
                if (dimText) {
                    textParts.push(`ขนาดการผลิต ${dimText}`);
                }
            }

            if (product.production_pack_details) {
                textParts.push('รายละเอียดแพ็คการผลิต packing details');
            }

            // Related products (limited to avoid too much noise)
            if (product.related_products && Array.isArray(product.related_products)) {
                const relatedNames = product.related_products
                    .map(p => p.title)
                    .filter(title => title)
                    .slice(0, 3) // Limit to first 3
                    .join(' ');
                if (relatedNames) {
                    textParts.push(`สินค้าที่เกี่ยวข้อง ${relatedNames}`);
                }
            }

            // Compatible products
            if (product.compatible_products && Array.isArray(product.compatible_products)) {
                const compatibleNames = product.compatible_products
                    .map(p => p.title)
                    .filter(title => title)
                    .slice(0, 2) // Limit to first 2
                    .join(' ');
                if (compatibleNames) {
                    textParts.push(`สินค้าที่ใช้ร่วมกันได้ ${compatibleNames}`);
                }
            }

            // Extract dimensions from product name and details
            const extractedDimensions = this.extractDimensionsFromText(product.product_name || '');
            if (extractedDimensions) {
                textParts.push(extractedDimensions);
            }

            // Add material keywords if found
            const materialKeywords = this.extractMaterialKeywords(product);
            if (materialKeywords.length > 0) {
                textParts.push(materialKeywords.join(' '));
            }

            // Join all parts with spaces and clean up
            const embeddingText = textParts
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();

            this.logger.debug(`Created embedding text for product ${product.sku || 'unknown'}`, {
                textLength: embeddingText.length,
                partsCount: textParts.length
            });

            return embeddingText;

        } catch (error) {
            this.logger.error('Error creating embedding text:', error);
            return product.product_name || product.sku || 'Unknown Product';
        }
    }

    cleanTextForEmbedding(text) {
        if (!text || typeof text !== 'string') return '';
        
        return text
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/[^\u0E00-\u0E7Fa-zA-Z0-9\s\.\-\+\×x]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    extractDimensionsFromText(text) {
        if (!text) return '';
        
        const dimensions = [];
        
        // Extract various dimension patterns
        const patterns = [
            /(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/g, // 3D: 10x20x30
            /(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/g, // 2D: 10x20
            /(\d+(?:\.\d+)?)\s*(cm|ซม|มม|mm|นิ้ว|inch)/g, // Single dimension with unit
            /(\d+(?:\.\d+)?)\s*(ml|มล|ลิตร|L|oz|ออนซ์)/g // Volume
        ];
        
        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                dimensions.push(match[0]);
            }
        });
        
        return dimensions.length > 0 ? dimensions.join(' ') : '';
    }

    extractDimensionsText(productionDimensions) {
        if (!productionDimensions) return '';
        
        try {
            let dimObj = productionDimensions;
            if (typeof productionDimensions === 'string') {
                dimObj = JSON.parse(productionDimensions);
            }
            
            const parts = [];
            
            if (dimObj.length) parts.push(`ยาว ${dimObj.length}`);
            if (dimObj.width) parts.push(`กว้าง ${dimObj.width}`);
            if (dimObj.height) parts.push(`สูง ${dimObj.height}`);
            if (dimObj.diameter) parts.push(`เส้นผ่านศูนย์กลาง ${dimObj.diameter}`);
            if (dimObj.volume) parts.push(`ปริมาตร ${dimObj.volume}`);
            
            return parts.join(' ');
        } catch (error) {
            return '';
        }
    }

    extractMaterialKeywords(product) {
        const materials = [];
        const materialMap = {
            'กระดาษ': ['paper', 'กระดาษ', 'แข็ง', 'ลูกฟูก'],
            'พลาสติก': ['plastic', 'พลาสติก', 'PP', 'PE', 'PET', 'PVC'],
            'ไบโอ': ['bio', 'ไบโอ', 'biodegradable', 'ย่อยสลาย', 'เป็นมิตรกับสิ่งแวดล้อม'],
            'โฟม': ['foam', 'โฟม', 'สไตโรโฟม'],
            'อลูมิเนียม': ['aluminum', 'อลูมิเนียม', 'โลหะ']
        };
        
        const searchText = [
            product.product_name || '',
            product.category || '',
            product.short_description || '',
            JSON.stringify(product.details || {})
        ].join(' ').toLowerCase();
        
        Object.entries(materialMap).forEach(([material, keywords]) => {
            if (keywords.some(keyword => searchText.includes(keyword.toLowerCase()))) {
                materials.push(material);
            }
        });
        
        return materials;
    }

    // ===== METADATA PREPARATION =====

    prepareMetadata(product) {
        try {
            if (!product) {
                this.logger.warn('No product data provided for metadata preparation');
                return {};
            }

            const metadata = {};

            // Basic product information
            if (product.product_name) metadata.product_name = this.truncateString(product.product_name, 500);
            if (product.sku) metadata.sku = product.sku;
            if (product.category) metadata.category = this.truncateString(product.category, 300);
            if (product.url) metadata.url = product.url;
            if (product.short_description) {
                metadata.short_description = this.truncateString(product.short_description, 1000);
            }
            if (product.price) metadata.price = this.truncateString(product.price, 200);

            // Stock information
            if (product.stock_quantity !== undefined && product.stock_quantity !== null) {
                metadata.stock_quantity = product.stock_quantity.toString();
            }
            if (product.stock_status) metadata.stock_status = product.stock_status;

            // Serialize complex objects as JSON strings with size limits
            if (product.details) {
                const detailsStr = typeof product.details === 'string' ? 
                    product.details : JSON.stringify(product.details);
                metadata.details = this.truncateString(detailsStr, 2000);
            }

            if (product.voodoo_pricing) {
                const pricingStr = typeof product.voodoo_pricing === 'string' ? 
                    product.voodoo_pricing : JSON.stringify(product.voodoo_pricing);
                metadata.voodoo_pricing = this.truncateString(pricingStr, 1000);
            }

            // Production data
            if (product.production_links) {
                const linksStr = typeof product.production_links === 'string' ? 
                    product.production_links : JSON.stringify(product.production_links);
                metadata.production_links = this.truncateString(linksStr, 1500);
            }

            if (product.production_pricing) {
                const prodPricingStr = typeof product.production_pricing === 'string' ? 
                    product.production_pricing : JSON.stringify(product.production_pricing);
                metadata.production_pricing = this.truncateString(prodPricingStr, 1500);
            }

            if (product.production_dimensions) {
                const dimStr = typeof product.production_dimensions === 'string' ? 
                    product.production_dimensions : JSON.stringify(product.production_dimensions);
                metadata.production_dimensions = this.truncateString(dimStr, 500);
            }

            if (product.production_pack_details) {
                const packStr = typeof product.production_pack_details === 'string' ? 
                    product.production_pack_details : JSON.stringify(product.production_pack_details);
                metadata.production_pack_details = this.truncateString(packStr, 1000);
            }

            if (product.production_color_printing) {
                const colorStr = typeof product.production_color_printing === 'string' ? 
                    product.production_color_printing : JSON.stringify(product.production_color_printing);
                metadata.production_color_printing = this.truncateString(colorStr, 1000);
            }

            // Related products (limit size)
            if (product.related_products) {
                const relatedStr = typeof product.related_products === 'string' ? 
                    product.related_products : JSON.stringify(product.related_products);
                metadata.related_products = this.truncateString(relatedStr, 1500);
            }

            if (product.compatible_products) {
                const compatibleStr = typeof product.compatible_products === 'string' ? 
                    product.compatible_products : JSON.stringify(product.compatible_products);
                metadata.compatible_products = this.truncateString(compatibleStr, 1000);
            }

            // Timestamps
            if (product.last_updated) metadata.last_updated = product.last_updated;

            // Add computed metadata
            metadata.has_production_data = !!(product.production_pricing || product.production_dimensions);
            metadata.has_images = !!(product.images && Array.isArray(product.images) && product.images.length > 0);
            metadata.product_type = this.classifyProductType(product);

            this.logger.debug(`Prepared metadata for product ${product.sku || 'unknown'}`, {
                metadataKeys: Object.keys(metadata).length,
                totalSize: JSON.stringify(metadata).length
            });

            return metadata;

        } catch (error) {
            this.logger.error('Error preparing metadata:', error);
            return {
                product_name: product.product_name || 'Unknown Product',
                sku: product.sku || 'unknown',
                error: 'Failed to prepare full metadata'
            };
        }
    }

    truncateString(str, maxLength) {
        if (!str || typeof str !== 'string') return str;
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength - 3) + '...';
    }

    classifyProductType(product) {
        const name = (product.product_name || '').toLowerCase();
        const category = (product.category || '').toLowerCase();
        
        if (name.includes('กล่อง') || category.includes('กล่อง')) return 'box';
        if (name.includes('แก้ว') || name.includes('ถ้วย')) return 'cup';
        if (name.includes('จาน')) return 'plate';
        if (name.includes('ชาม')) return 'bowl';
        if (name.includes('ช้อน') || name.includes('ส้อม')) return 'cutlery';
        if (name.includes('ถุง')) return 'bag';
        if (name.includes('ฝา') || name.includes('ปิด')) return 'lid';
        
        return 'other';
    }

    // ===== PRODUCT STATISTICS =====

    async updateProductStats(product) {
        try {
            this.productStats.totalProducts++;
            
            if (product.category) {
                if (!this.productStats.categoryCounts[product.category]) {
                    this.productStats.categoryCounts[product.category] = 0;
                }
                this.productStats.categoryCounts[product.category]++;
            }
            
            await this.saveProductStats();
        } catch (error) {
            this.logger.error('Error updating product stats:', error);
        }
    }

    async recalculateStats() {
        try {
            this.logger.info('Recalculating product statistics...');
            
            // Reset stats
            this.productStats = {
                totalProducts: 0,
                categoryCounts: {},
                lastUpdated: null
            };
            
            // Read all product files
            const files = await fs.readdir(this.baseDir);
            const jsonFiles = files.filter(file => file.endsWith('.json') && file.startsWith('product_'));
            
            for (const file of jsonFiles) {
                try {
                    const filePath = path.join(this.baseDir, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    const product = JSON.parse(content);
                    
                    await this.updateProductStats(product);
                } catch (error) {
                    this.logger.warn(`Error processing ${file} for stats:`, error);
                }
            }
            
            this.logger.info('Product statistics recalculated', {
                totalProducts: this.productStats.totalProducts,
                categories: Object.keys(this.productStats.categoryCounts).length
            });
            
            return this.productStats;
        } catch (error) {
            this.logger.error('Error recalculating stats:', error);
            throw error;
        }
    }

    // ===== EXPORT/IMPORT =====

    async exportProcessedUrls(filePath) {
        try {
            const urls = Array.from(this.processedUrls);
            const exportData = {
                exportDate: new Date().toISOString(),
                totalUrls: urls.length,
                urls: urls
            };
            
            await fs.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf8');
            
            this.logger.info(`Exported ${urls.length} processed URLs to ${filePath}`);
            return true;
        } catch (error) {
            this.logger.error('Error exporting processed URLs:', error);
            return false;
        }
    }

    async importProcessedUrls(filePath, merge = true) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const importData = JSON.parse(data);
            
            let urlsToImport = [];
            
            if (Array.isArray(importData)) {
                urlsToImport = importData;
            } else if (importData.urls && Array.isArray(importData.urls)) {
                urlsToImport = importData.urls;
            } else {
                throw new Error('Invalid import file format');
            }
            
            if (!merge) {
                this.processedUrls.clear();
            }
            
            let importedCount = 0;
            for (const url of urlsToImport) {
                if (url && typeof url === 'string') {
                    const normalizedUrl = this.normalizeUrl(url);
                    if (!this.processedUrls.has(normalizedUrl)) {
                        this.processedUrls.add(normalizedUrl);
                        importedCount++;
                    }
                }
            }
            
            await this.saveProcessedUrls();
            
            this.logger.info(`Imported ${importedCount} new URLs from ${filePath}`);
            return { success: true, imported: importedCount, total: this.processedUrls.size };
        } catch (error) {
            this.logger.error('Error importing processed URLs:', error);
            return { success: false, error: error.message };
        }
    }

    // ===== STATUS AND HEALTH CHECK =====

    getStats() {
        return {
            totalProcessedUrls: this.processedUrls.size,
            initialized: this.initialized,
            processedUrlsFile: this.processedUrlsFile,
            productStatsFile: this.productStatsFile,
            baseDir: this.baseDir,
            productStats: this.productStats
        };
    }

    async healthCheck() {
        try {
            // ตรวจสอบการเข้าถึงไฟล์
            await fs.access(this.baseDir);
            
            // ตรวจสอบขนาดของ processed URLs
            const urlsCount = this.processedUrls.size;
            
            return {
                status: 'healthy',
                initialized: this.initialized,
                processedUrlsCount: urlsCount,
                totalProducts: this.productStats.totalProducts,
                canWrite: true,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                initialized: this.initialized,
                processedUrlsCount: this.processedUrls.size,
                canWrite: false,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = { ProductMetadataService };