// scripts/migrate-json-to-prisma.js - ย้ายข้อมูลจาก JSON files ไป Prisma
const fs = require('fs').promises;
const path = require('path');
const PrismaService = require('../services/prismaService');

class JSONToPrismaMigrator {
    constructor() {
        this.logger = console;
        this.prismaService = new PrismaService(this.logger);
        this.stats = {
            products: { success: 0, failed: 0 },
            chatAI: { success: 0, failed: 0 },
            chatAPI: { success: 0, failed: 0 },
            productHistory: { success: 0, failed: 0 },
            userLanguages: { success: 0, failed: 0 }
        };
    }

    // ==================== Migrate Products ====================
    async migrateProducts() {
        this.logger.log('\n📦 Migrating Products...');
        const productsDir = path.join(__dirname, '..', 'products');

        try {
            const files = await fs.readdir(productsDir);
            const jsonFiles = files.filter(f => f.endsWith('.json'));

            this.logger.log(`Found ${jsonFiles.length} product files`);

            for (const file of jsonFiles) {
                try {
                    const content = await fs.readFile(path.join(productsDir, file), 'utf8');
                    const product = JSON.parse(content);

                    // สร้างสินค้าใหม่
                    const newProduct = await this.prismaService.createProduct({
                        product_name: product.product_name,
                        sku: product.sku || null,
                        url: product.url || null,
                        category: product.category || null,
                        price: product.price || null,
                        stock_quantity: product.stock_quantity || null,
                        short_description: product.short_description || null,
                        description: product.long_description || null,
                        details: product.details ? JSON.stringify(product.details) : null,
                        specifications: product.specifications ? JSON.stringify(product.specifications) : null,
                        manual: product.manual || false
                    });

                    // เพิ่มรูปภาพ
                    if (product.images && Array.isArray(product.images)) {
                        for (const [index, img] of product.images.entries()) {
                            await this.prismaService.addProductImage(newProduct.id, {
                                url: img.url || img.src,
                                localPath: img.localPath || null,
                                filename: img.filename || null,
                                alt: img.alt || null,
                                title: img.title || null,
                                order: index,
                                isPrimary: index === 0,
                                size: img.size || null,
                                contentType: img.contentType || null
                            });
                        }
                    }

                    this.stats.products.success++;
                    if (this.stats.products.success % 10 === 0) {
                        this.logger.log(`  ✓ Migrated ${this.stats.products.success} products...`);
                    }
                } catch (error) {
                    this.logger.error(`  ✗ Failed to migrate ${file}:`, error.message);
                    this.stats.products.failed++;
                }
            }

            this.logger.log(`✅ Products: ${this.stats.products.success} success, ${this.stats.products.failed} failed`);
        } catch (error) {
            this.logger.error('Error migrating products:', error);
        }
    }

    // ==================== Migrate Chat Histories AI ====================
    async migrateChatHistoriesAI() {
        this.logger.log('\n💬 Migrating Chat Histories AI...');
        const chatAIDir = path.join(__dirname, '..', 'data', 'chat_histories_ai');

        try {
            await fs.access(chatAIDir);
            const files = await fs.readdir(chatAIDir);
            const jsonFiles = files.filter(f => f.endsWith('.json'));

            this.logger.log(`Found ${jsonFiles.length} chat AI history files`);

            for (const file of jsonFiles) {
                try {
                    const content = await fs.readFile(path.join(chatAIDir, file), 'utf8');
                    const data = JSON.parse(content);
                    const userId = file.replace('.json', '');

                    if (data.messages && Array.isArray(data.messages)) {
                        for (const msg of data.messages) {
                            await this.prismaService.addChatAI({
                                userId,
                                role: msg.role,
                                content: msg.content,
                                messageId: msg.messageId || null,
                                products: msg.products || [],
                                senderProfile: msg.senderProfile || null,
                                source: msg.source || null,
                                timestamp: msg.timestamp,
                                saved_at: msg.saved_at || msg.timestamp
                            });
                        }
                    }

                    this.stats.chatAI.success++;
                    this.logger.log(`  ✓ Migrated ${userId}`);
                } catch (error) {
                    this.logger.error(`  ✗ Failed to migrate ${file}:`, error.message);
                    this.stats.chatAI.failed++;
                }
            }

            this.logger.log(`✅ Chat AI: ${this.stats.chatAI.success} success, ${this.stats.chatAI.failed} failed`);
        } catch (error) {
            this.logger.log('⚠️  Chat AI directory not found, skipping...');
        }
    }

    // ==================== Migrate Chat Histories API ====================
    async migrateChatHistoriesAPI() {
        this.logger.log('\n📱 Migrating Chat Histories API...');
        const chatAPIDir = path.join(__dirname, '..', 'data', 'chat_histories_api');

        try {
            await fs.access(chatAPIDir);
            const files = await fs.readdir(chatAPIDir);
            const jsonFiles = files.filter(f => f.endsWith('.json'));

            this.logger.log(`Found ${jsonFiles.length} chat API history files`);

            for (const file of jsonFiles) {
                try {
                    const content = await fs.readFile(path.join(chatAPIDir, file), 'utf8');
                    const data = JSON.parse(content);
                    const userId = file.replace('.json', '');

                    if (data.messages && Array.isArray(data.messages)) {
                        for (const msg of data.messages) {
                            await this.prismaService.addChatAPI({
                                userId,
                                messageId: msg.messageId || null,
                                role: msg.role,
                                content: msg.content || null,
                                products: msg.products || [],
                                senderProfile: msg.senderProfile || null,
                                source: msg.source || 'line',
                                timestamp: msg.timestamp,
                                saved_at: msg.saved_at || msg.timestamp
                            });
                        }
                    }

                    this.stats.chatAPI.success++;
                    this.logger.log(`  ✓ Migrated ${userId}`);
                } catch (error) {
                    this.logger.error(`  ✗ Failed to migrate ${file}:`, error.message);
                    this.stats.chatAPI.failed++;
                }
            }

            this.logger.log(`✅ Chat API: ${this.stats.chatAPI.success} success, ${this.stats.chatAPI.failed} failed`);
        } catch (error) {
            this.logger.log('⚠️  Chat API directory not found, skipping...');
        }
    }

    // ==================== Migrate Product Histories ====================
    async migrateProductHistories() {
        this.logger.log('\n📊 Migrating Product Histories...');
        const productHistDir = path.join(__dirname, '..', 'data', 'product_histories');

        try {
            await fs.access(productHistDir);
            const files = await fs.readdir(productHistDir);
            const jsonFiles = files.filter(f => f.endsWith('.json'));

            this.logger.log(`Found ${jsonFiles.length} product history files`);

            for (const file of jsonFiles) {
                try {
                    const content = await fs.readFile(path.join(productHistDir, file), 'utf8');
                    const data = JSON.parse(content);
                    const userId = data.userId;

                    if (data.products) {
                        for (const [productId, productData] of Object.entries(data.products)) {
                            if (productData.interactions && Array.isArray(productData.interactions)) {
                                for (const interaction of productData.interactions) {
                                    await this.prismaService.addProductHistory({
                                        userId,
                                        product_id: productId,
                                        product_name: productData.product_name,
                                        category: productData.category || null,
                                        relevance_score: interaction.relevance_score,
                                        context: interaction.context || null,
                                        timestamp: interaction.timestamp
                                    });
                                }
                            }
                        }
                    }

                    this.stats.productHistory.success++;
                    this.logger.log(`  ✓ Migrated ${userId}`);
                } catch (error) {
                    this.logger.error(`  ✗ Failed to migrate ${file}:`, error.message);
                    this.stats.productHistory.failed++;
                }
            }

            this.logger.log(`✅ Product History: ${this.stats.productHistory.success} success, ${this.stats.productHistory.failed} failed`);
        } catch (error) {
            this.logger.log('⚠️  Product History directory not found, skipping...');
        }
    }

    // ==================== Migrate User Languages ====================
    async migrateUserLanguages() {
        this.logger.log('\n🌐 Migrating User Languages...');
        const userLangDir = path.join(__dirname, '..', 'data', 'user_languages');

        try {
            await fs.access(userLangDir);
            const files = await fs.readdir(userLangDir);
            const jsonFiles = files.filter(f => f.endsWith('.json'));

            this.logger.log(`Found ${jsonFiles.length} user language files`);

            for (const file of jsonFiles) {
                try {
                    const content = await fs.readFile(path.join(userLangDir, file), 'utf8');
                    const data = JSON.parse(content);

                    await this.prismaService.setUserLanguage({
                        userId: data.userId,
                        language: data.language,
                        isLocked: data.isLocked || false,
                        firstDetected: data.firstDetected || null,
                        conversationStarted: data.conversationStarted || false,
                        detectionHistory: data.detectionHistory || [],
                        lastUpdateTime: data.lastUpdateTime || Date.now(),
                        createdAt: data.createdAt || Date.now(),
                        version: data.version || "2.0"
                    });

                    this.stats.userLanguages.success++;
                    this.logger.log(`  ✓ Migrated ${data.userId}`);
                } catch (error) {
                    this.logger.error(`  ✗ Failed to migrate ${file}:`, error.message);
                    this.stats.userLanguages.failed++;
                }
            }

            this.logger.log(`✅ User Languages: ${this.stats.userLanguages.success} success, ${this.stats.userLanguages.failed} failed`);
        } catch (error) {
            this.logger.log('⚠️  User Languages directory not found, skipping...');
        }
    }

    // ==================== Run All Migrations ====================
    async migrateAll() {
        this.logger.log('🚀 Starting JSON to Prisma Migration...\n');
        const startTime = Date.now();

        await this.migrateProducts();
        await this.migrateChatHistoriesAI();
        await this.migrateChatHistoriesAPI();
        await this.migrateProductHistories();
        await this.migrateUserLanguages();

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        this.logger.log('\n' + '='.repeat(50));
        this.logger.log('📊 Migration Summary:');
        this.logger.log('='.repeat(50));
        this.logger.log(`Products:         ${this.stats.products.success} ✓ / ${this.stats.products.failed} ✗`);
        this.logger.log(`Chat AI:          ${this.stats.chatAI.success} ✓ / ${this.stats.chatAI.failed} ✗`);
        this.logger.log(`Chat API:         ${this.stats.chatAPI.success} ✓ / ${this.stats.chatAPI.failed} ✗`);
        this.logger.log(`Product History:  ${this.stats.productHistory.success} ✓ / ${this.stats.productHistory.failed} ✗`);
        this.logger.log(`User Languages:   ${this.stats.userLanguages.success} ✓ / ${this.stats.userLanguages.failed} ✗`);
        this.logger.log('='.repeat(50));
        this.logger.log(`⏱️  Total time: ${duration}s`);
        this.logger.log('✅ Migration completed!\n');

        await this.prismaService.disconnect();
    }
}

// Run migration if called directly
if (require.main === module) {
    const migrator = new JSONToPrismaMigrator();
    migrator.migrateAll().catch(error => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
}

module.exports = JSONToPrismaMigrator;
