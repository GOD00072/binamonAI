// productImageManager.js
'use strict';

const fs = require('fs').promises;
const path = require('path');

class ProductImageManager {
    constructor(logger) {
        this.logger = logger;
        this.dataDir = path.join(__dirname, 'data', 'product_image_manager');
        this.productImagesPath = path.join(this.dataDir, 'product_images.json');
        this.productImages = new Map(); // productUrl -> imageConfig
    }

    async initialize() {
        try {
            await fs.mkdir(this.dataDir, { recursive: true });
            await this.loadProductImages();
            this.logger.info('ProductImageManager initialized successfully');
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize ProductImageManager:', error);
            return false;
        }
    }

    async loadProductImages() {
        try {
            const data = await fs.readFile(this.productImagesPath, 'utf8');
            const productImagesObj = JSON.parse(data);
            
            this.productImages.clear();
            Object.entries(productImagesObj).forEach(([url, config]) => {
                this.productImages.set(url, config);
            });
            
            this.logger.info(`Loaded image configs for ${this.productImages.size} products`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                this.logger.error('Error loading product images:', error);
            }
        }
    }

    async saveProductImages() {
        try {
            const productImagesObj = Object.fromEntries(this.productImages);
            await fs.writeFile(
                this.productImagesPath,
                JSON.stringify(productImagesObj, null, 2),
                'utf8'
            );
            this.logger.info('Product images configuration saved');
        } catch (error) {
            this.logger.error('Error saving product images:', error);
        }
    }

    // ดึงการตั้งค่ารูปภาพของสินค้า
    getProductImageConfig(productUrl) {
        return this.productImages.get(productUrl) || null;
    }

    // ตั้งค่ารูปภาพที่เลือกสำหรับสินค้า
    async setProductImageSelection(productUrl, selectedImages, productData) {
        try {
            const config = {
                productUrl: productUrl,
                productName: productData.productName,
                sku: productData.sku,
                totalImages: productData.images.length,
                selectedImages: selectedImages, // array of image objects with selected flag
                lastUpdated: new Date().toISOString(),
                autoSelectFirst3: true // เริ่มต้นเลือก 3 แรก
            };

            this.productImages.set(productUrl, config);
            await this.saveProductImages();

            this.logger.info('Product image selection updated', {
                productUrl: productUrl,
                selectedCount: selectedImages.filter(img => img.selected).length,
                totalCount: selectedImages.length
            });

            return config;
        } catch (error) {
            this.logger.error('Error setting product image selection:', error);
            throw error;
        }
    }

    // สร้างการตั้งค่าเริ่มต้น (เลือก 3 รูปแรก)
    createDefaultSelection(productData) {
        const images = productData.images || [];
        const selectedImages = images.map((img, index) => ({
            ...img,
            selected: index < 3, // เลือก 3 รูปแรก
            order: index,
            selectionOrder: index < 3 ? index + 1 : null
        }));

        return {
            productUrl: productData.url || '',
            productName: productData.productName || '',
            sku: productData.sku || '',
            totalImages: images.length,
            selectedImages: selectedImages,
            lastUpdated: new Date().toISOString(),
            autoSelectFirst3: true
        };
    }

    // ดึงรูปภาพที่เลือกแล้วสำหรับส่ง
    getSelectedImagesForSending(productUrl) {
        const config = this.getProductImageConfig(productUrl);
        if (!config) {
            return [];
        }

        return config.selectedImages
            .filter(img => img.selected)
            .sort((a, b) => (a.selectionOrder || 999) - (b.selectionOrder || 999));
    }

    // อัปเดตการเลือกรูปภาพ
    async updateImageSelection(productUrl, imageFilename, selected, selectionOrder = null) {
        try {
            const config = this.getProductImageConfig(productUrl);
            if (!config) {
                throw new Error('Product configuration not found');
            }

            const imageIndex = config.selectedImages.findIndex(img => img.filename === imageFilename);
            if (imageIndex === -1) {
                throw new Error('Image not found in product');
            }

            config.selectedImages[imageIndex].selected = selected;
            config.selectedImages[imageIndex].selectionOrder = selected ? selectionOrder : null;
            config.lastUpdated = new Date().toISOString();

            this.productImages.set(productUrl, config);
            await this.saveProductImages();

            this.logger.info('Image selection updated', {
                productUrl: productUrl,
                imageFilename: imageFilename,
                selected: selected,
                selectionOrder: selectionOrder
            });

            return config;
        } catch (error) {
            this.logger.error('Error updating image selection:', error);
            throw error;
        }
    }

    // เพิ่มรูปภาพใหม่ให้สินค้า
    async addImageToProduct(productUrl, imageFile, selected = false) {
        try {
            const config = this.getProductImageConfig(productUrl);
            if (!config) {
                throw new Error('Product configuration not found');
            }

            const newImage = {
                filename: imageFile.filename,
                localPath: imageFile.path,
                url: null,
                isPrimary: false,
                order: config.selectedImages.length,
                size: imageFile.size,
                alt: imageFile.alt || '',
                title: imageFile.title || '',
                addedManually: true,
                addedAt: new Date().toISOString(),
                status: 'downloaded',
                selected: selected,
                selectionOrder: selected ? this.getNextSelectionOrder(config) : null
            };

            config.selectedImages.push(newImage);
            config.totalImages = config.selectedImages.length;
            config.lastUpdated = new Date().toISOString();

            this.productImages.set(productUrl, config);
            await this.saveProductImages();

            this.logger.info('Image added to product', {
                productUrl: productUrl,
                filename: imageFile.filename,
                selected: selected
            });

            return config;
        } catch (error) {
            this.logger.error('Error adding image to product:', error);
            throw error;
        }
    }

    // ลบรูปภาพออกจากสินค้า
    async removeImageFromProduct(productUrl, imageFilename) {
        try {
            const config = this.getProductImageConfig(productUrl);
            if (!config) {
                throw new Error('Product configuration not found');
            }

            const imageIndex = config.selectedImages.findIndex(img => img.filename === imageFilename);
            if (imageIndex === -1) {
                throw new Error('Image not found in product');
            }

            const removedImage = config.selectedImages.splice(imageIndex, 1)[0];
            config.totalImages = config.selectedImages.length;
            config.lastUpdated = new Date().toISOString();

            // อัปเดต order ของรูปที่เหลือ
            config.selectedImages.forEach((img, index) => {
                img.order = index;
            });

            this.productImages.set(productUrl, config);
            await this.saveProductImages();

            this.logger.info('Image removed from product', {
                productUrl: productUrl,
                filename: imageFilename
            });

            return { config, removedImage };
        } catch (error) {
            this.logger.error('Error removing image from product:', error);
            throw error;
        }
    }

    // หาลำดับการเลือกถัดไป
    getNextSelectionOrder(config) {
        const selectedImages = config.selectedImages.filter(img => img.selected);
        const maxOrder = Math.max(...selectedImages.map(img => img.selectionOrder || 0), 0);
        return maxOrder + 1;
    }

    // ดึงสถิติการเลือกรูป
    getSelectionStatistics() {
        const stats = {
            totalProducts: this.productImages.size,
            productsWithSelections: 0,
            totalSelectedImages: 0,
            averageSelectedPerProduct: 0
        };

        for (const [url, config] of this.productImages.entries()) {
            const selectedCount = config.selectedImages.filter(img => img.selected).length;
            if (selectedCount > 0) {
                stats.productsWithSelections++;
                stats.totalSelectedImages += selectedCount;
            }
        }

        if (stats.productsWithSelections > 0) {
            stats.averageSelectedPerProduct = Math.round(
                stats.totalSelectedImages / stats.productsWithSelections * 10
            ) / 10;
        }

        return stats;
    }

    // เคลียร์การเลือกทั้งหมดของสินค้า
    async clearProductSelection(productUrl) {
        try {
            const config = this.getProductImageConfig(productUrl);
            if (!config) {
                throw new Error('Product configuration not found');
            }

            config.selectedImages.forEach(img => {
                img.selected = false;
                img.selectionOrder = null;
            });
            config.lastUpdated = new Date().toISOString();

            this.productImages.set(productUrl, config);
            await this.saveProductImages();

            this.logger.info('Product selection cleared', {
                productUrl: productUrl
            });

            return config;
        } catch (error) {
            this.logger.error('Error clearing product selection:', error);
            throw error;
        }
    }

    // รีเซ็ตเป็นการเลือก 3 รูปแรก
    async resetToDefaultSelection(productUrl) {
        try {
            const config = this.getProductImageConfig(productUrl);
            if (!config) {
                throw new Error('Product configuration not found');
            }

            config.selectedImages.forEach((img, index) => {
                img.selected = index < 3;
                img.selectionOrder = index < 3 ? index + 1 : null;
            });
            config.lastUpdated = new Date().toISOString();

            this.productImages.set(productUrl, config);
            await this.saveProductImages();

            this.logger.info('Product selection reset to default', {
                productUrl: productUrl,
                selectedCount: 3
            });

            return config;
        } catch (error) {
            this.logger.error('Error resetting to default selection:', error);
            throw error;
        }
    }
}

module.exports = ProductImageManager;