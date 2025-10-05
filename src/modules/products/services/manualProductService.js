'use strict';

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../../../../lib/prisma');
const PrismaService = require('../../../infrastructure/database/prismaService');
const { PRODUCTS_DIR } = require('../../../app/paths');

class ManualProductService {
    constructor(logger) {
        this.logger = logger;
        this.manualImagesDir = path.join(PRODUCTS_DIR, 'images', 'manual');
        this.prismaService = new PrismaService(logger);

        this.initialize();
    }

    async initialize() {
        try {
            await fs.mkdir(this.manualImagesDir, { recursive: true });
            this.logger.info('ManualProductService initialized with Prisma');
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize ManualProductService:', error);
            return false;
        }
    }

    // เพิ่ม URL ใหม่
    async addURL(url, productName) {
        try {
            if (!url || !productName) {
                throw new Error('URL และชื่อสินค้าจำเป็น');
            }

            // ตรวจสอบว่ามี URL นี้อยู่แล้วหรือไม่
            const existing = await this.findProductByUrl(url);
            if (existing) {
                throw new Error('URL นี้มีอยู่แล้ว');
            }

            const product = await this.prismaService.createProduct({
                product_name: productName,
                url: url,
                sku: null,
                manual: true
            });

            this.logger.info('Manual product added to database:', { url, productName, id: product.id });
            return { success: true, product };

        } catch (error) {
            this.logger.error('Error adding manual product:', error);
            throw error;
        }
    }

    // เพิ่มรูปให้ URL
    async addImage(url, imageFile) {
        try {
            if (!imageFile || !imageFile.buffer) {
                throw new Error('ไฟล์รูปภาพไม่ถูกต้อง');
            }

            const product = await this.findProductByUrl(url);
            if (!product) {
                throw new Error('ไม่พบ URL นี้');
            }

            const ext = path.extname(imageFile.originalname || '.jpg');
            const filename = `manual_${Date.now()}_${uuidv4()}${ext}`;
            const localPath = path.join(this.manualImagesDir, filename);

            await fs.writeFile(localPath, imageFile.buffer);

            // Get current image count for order
            const existingImages = await this.prismaService.getProductImages(product.id);

            const imageData = await this.prismaService.addProductImage(product.id, {
                url: localPath,
                localPath: localPath,
                filename: filename,
                alt: imageFile.originalname || filename,
                order: existingImages.length,
                isPrimary: existingImages.length === 0,
                size: imageFile.buffer.length,
                contentType: imageFile.mimetype || 'image/jpeg'
            });

            this.logger.info('Image added to manual product in database:', { url, filename, imageId: imageData.id });
            return { success: true, image: imageData };

        } catch (error) {
            this.logger.error('Error adding image:', error);
            throw error;
        }
    }

    // ค้นหาสินค้าจาก URL
    async findProductByUrl(url) {
        try {
            const product = await prisma.product.findFirst({
                where: { url: url },
                include: { images: true }
            });
            return product;
        } catch (error) {
            this.logger.error('Error finding product by URL:', error);
            return null;
        }
    }

    // ดูรายการสินค้าทั้งหมด (manual products only)
    async getAllProducts() {
        try {
            const products = await this.prismaService.getAllProducts({
                where: { manual: true },
                include: { images: true }
            });
            return products;
        } catch (error) {
            this.logger.error('Error getting all manual products:', error);
            return [];
        }
    }
}

module.exports = ManualProductService;
