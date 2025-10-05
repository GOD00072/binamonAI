const path = require('path');
const fs = require('fs').promises;
const ExcelJS = require('exceljs');
const { ROOT_DIR } = require('../../../app/paths');

class ProductionProductHandler {
    constructor(logger) {
        this.logger = logger;
        this.productsDir = path.join(ROOT_DIR, 'production');
        
        this.PRICE_TIERS = {
            regular: [
                { min: 1, max: 9999, tier: 1 },
                { min: 10000, max: 29999, tier: 2 },
                { min: 30000, max: 49999, tier: 3 },
                { min: 50000, max: null, tier: 4 }
            ],
            printing: [
                { colors: '1-2', tier: 1 },
                { colors: '3-4', tier: 2 },
                { colors: '5-6', tier: 3 }
            ]
        };
    }

    async initialize() {
        try {
            await fs.mkdir(this.productsDir, { recursive: true });
            this.logger.info('Production products directory initialized');
            return true;
        } catch (error) {
            this.logger.error('Error initializing production products directory:', error);
            throw error;
        }
    }

    async convertExcelToProducts(filePath, progressCallback = null) {
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(filePath);
            
            const worksheet = workbook.getWorksheet('Sheet2');
            const results = {
                total: 0,
                success: 0,
                failed: 0,
                products: []
            };

            for (let i = 3; i < worksheet.rowCount; i += 3) {
                try {
                    const mainRow = worksheet.getRow(i);
                    const secondRow = worksheet.getRow(i + 1);
                    const thirdRow = worksheet.getRow(i + 2);

                    const code = mainRow.getCell(2).text.trim();
                    if (!code) continue;

                    const product = this.extractProductData(mainRow, secondRow, thirdRow);

                    const saveResult = await this.saveProduct(product);
                    
                    results.success++;
                    results.products.push({
                        code: product.code,
                        status: 'success',
                        name: product.name,
                        filepath: saveResult.filepath
                    });

                    if (progressCallback) {
                        progressCallback({
                            current: Math.floor(i / 3),
                            total: Math.floor(worksheet.rowCount / 3),
                            file: product.name,
                            status: 'success'
                        });
                    }

                } catch (error) {
                    this.logger.error(`Error processing row ${i}:`, error);
                    results.failed++;
                    results.products.push({
                        code: mainRow.getCell(2)?.text || 'unknown',
                        status: 'failed',
                        error: error.message
                    });
                }
            }

            results.total = results.success + results.failed;
            return results;

        } catch (error) {
            this.logger.error('Excel conversion error:', error);
            throw error;
        }
    }

    extractProductData(mainRow, secondRow, thirdRow) {
        const regular = this.extractRegularPricing(mainRow, secondRow, thirdRow);
        const printing = this.extractPrintingPricing(mainRow);

        return {
            mc: mainRow.getCell(2).text,
            code: mainRow.getCell(2).text,
            name: mainRow.getCell(3).text || `Product ${mainRow.getCell(2).text}`,
            specs: mainRow.getCell(3).text || '',
            pack_details: {
                pieces_per_pack: parseInt(mainRow.getCell(11).value) || 1,
                boxes_per_case: parseInt(mainRow.getCell(12).value) || 1,
                pieces_per_case: parseInt(mainRow.getCell(13).value) || 1
            },
            pricing: {
                regular: regular,
                printing: printing
            },
            dimensions: {
                length: mainRow.getCell(6).value || 0,
                width: mainRow.getCell(7).value || 0,
                height: mainRow.getCell(8).value || 0,
                weight: mainRow.getCell(9).value || 0
            },
            category: 'Paper Products',
            last_updated: new Date().toISOString()
        };
    }

    extractRegularPricing(mainRow, secondRow, thirdRow) {
        return [
            {
                min: 1,
                max: mainRow.getCell(4).value || 9999,
                price: mainRow.getCell(5).value || 0
            },
            {
                min: mainRow.getCell(4).value ? mainRow.getCell(4).value + 1 : 10000,
                max: secondRow.getCell(4).value || 29999,
                price: secondRow.getCell(5).value || 0
            },
            {
                min: secondRow.getCell(4).value ? secondRow.getCell(4).value + 1 : 30000,
                max: thirdRow.getCell(4).value || 49999,
                price: thirdRow.getCell(5).value || 0
            }
        ].filter(tier => tier.max > 0 && tier.price > 0);
    }

    extractPrintingPricing(mainRow) {
        return [
            { 
                min: 1,
                max: 29999,
                prices: {
                    '1-2': mainRow.getCell(22).value || 0,
                    '3-4': mainRow.getCell(23).value || 0,
                    '5-6': mainRow.getCell(24).value || 0
                }
            },
            { 
                min: 30000,
                max: 49999,
                prices: {
                    '1-2': mainRow.getCell(25).value || 0,
                    '3-4': mainRow.getCell(26).value || 0,
                    '5-6': mainRow.getCell(27).value || 0
                }
            },
            { 
                min: 50000,
                max: null,
                prices: {
                    '1-2': mainRow.getCell(28).value || 0,
                    '3-4': mainRow.getCell(29).value || 0,
                    '5-6': mainRow.getCell(30).value || 0
                }
            }
        ].filter(tier => 
            Object.values(tier.prices).some(price => price > 0)
        );
    }

    async saveProduct(productData) {
        try {
            this.validateProduct(productData);

            const fileName = this.formatFileName(productData);
            const filePath = path.join(this.productsDir, fileName);

            const product = {
                ...productData,
                last_updated: new Date().toISOString(),
                version: '2.0'
            };

            await fs.mkdir(this.productsDir, { recursive: true });

            await fs.writeFile(
                filePath, 
                JSON.stringify(product, null, 2), 
                'utf8'
            );

            this.logger.info(`Saved product: ${fileName}`);

            return {
                success: true,
                filepath: filePath,
                product: product
            };

        } catch (error) {
            this.logger.error('Error saving product:', error);
            throw error;
        }
    }

    validateProduct(productData) {
        const requiredFields = [
            'mc', 'code', 'name', 
            'pack_details', 'pricing', 
            'dimensions', 'category'
        ];

        for (const field of requiredFields) {
            if (!productData[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        const packRequirements = [
            'pieces_per_pack', 
            'boxes_per_case', 
            'pieces_per_case'
        ];

        packRequirements.forEach(req => {
            if (!productData.pack_details[req]) {
                throw new Error(`Invalid pack details: Missing ${req}`);
            }
        });

        this.validatePricingStructure(productData.pricing);
    }

    validatePricingStructure(pricing) {
        if (!Array.isArray(pricing.regular) || pricing.regular.length === 0) {
            throw new Error('Invalid regular pricing: Must be a non-empty array');
        }

        pricing.regular.forEach((tier, index) => {
            if (!tier.min || !tier.max || !tier.price) {
                throw new Error(`Invalid regular pricing tier at index ${index}`);
            }

            if (tier.min >= tier.max && tier.max !== null) {
                throw new Error(`Invalid regular pricing tier range at index ${index}`);
            }
        });

        if (!Array.isArray(pricing.printing) || pricing.printing.length === 0) {
            throw new Error('Invalid printing pricing: Must be a non-empty array');
        }

        pricing.printing.forEach((tier, index) => {
            if (!tier.min || !tier.prices) {
                throw new Error(`Invalid printing pricing tier at index ${index}`);
            }

            const colorRanges = ['1-2', '3-4', '5-6'];
            colorRanges.forEach(range => {
                if (typeof tier.prices[range] !== 'number') {
                    throw new Error(`Missing or invalid price for color range ${range} at tier ${index}`);
                }
            });
        });
    }

    formatFileName(product) {
        const safeName = `${product.mc}_${product.name}`
            .replace(/[/\\?%*:|"<>]/g, '_')
            .replace(/\s+/g, '_')
            .slice(0, 255);
        
        return `${safeName}.json`;
    }

    async checkProductExists(code) {
        try {
            await fs.mkdir(this.productsDir, { recursive: true });
            const files = await fs.readdir(this.productsDir);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const filePath = path.join(this.productsDir, file);
                        const fileContent = await fs.readFile(filePath, 'utf8');
                        const product = JSON.parse(fileContent);
                        
                        if (product.mc === code || product.code === code) {
                            return true;
                        }
                    } catch (readError) {
                        this.logger.warn(`Error reading file ${file}:`, readError);
                    }
                }
            }
            
            return false;
        } catch (error) {
            this.logger.error('Error checking product existence:', error);
            throw error;
        }
    }

    async getProduct(code) {
        try {
            await fs.mkdir(this.productsDir, { recursive: true });
            const files = await fs.readdir(this.productsDir);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const filePath = path.join(this.productsDir, file);
                        const fileContent = await fs.readFile(filePath, 'utf8');
                        const product = JSON.parse(fileContent);
                        
                        if (product.mc === code || product.code === code) {
                            return product;
                        }
                    } catch (readError) {
                        this.logger.warn(`Error reading file ${file}:`, readError);
                    }
                }
            }
            
            return null;
        } catch (error) {
            this.logger.error('Error retrieving product:', error);
            throw error;
        }
    }

    async updateProduct(code, updates) {
        try {
            const existingProduct = await this.getProduct(code);
            
            if (!existingProduct) {
                throw new Error(`Product with code ${code} not found`);
            }

            const updatedProduct = {
                ...existingProduct,
                ...updates,
                last_updated: new Date().toISOString()
            };

            this.validateProduct(updatedProduct);

            const fileName = this.formatFileName(updatedProduct);
            const filePath = path.join(this.productsDir, fileName);

            await fs.writeFile(
                filePath, 
                JSON.stringify(updatedProduct, null, 2), 
                'utf8'
            );

            this.logger.info(`Updated product: ${fileName}`);

            return {
                success: true,
                product: updatedProduct,
                filepath: filePath
            };
        } catch (error) {
            this.logger.error('Error updating product:', error);
            throw error;
        }
    }

    async deleteProduct(code) {
        try {
            const product = await this.getProduct(code);
            
            if (!product) {
                throw new Error(`Product with code ${code} not found`);
            }

            const files = await fs.readdir(this.productsDir);
            const matchingFile = files.find(file => 
                file.startsWith(`${product.mc}_`) && file.endsWith('.json')
            );

            if (!matchingFile) {
                throw new Error(`File for product ${code} not found`);
            }

            const filePath = path.join(this.productsDir, matchingFile);
            await fs.unlink(filePath);

            this.logger.info(`Deleted product: ${code}`);

            return {
                success: true,
                message: `Product ${code} deleted successfully`
            };
        } catch (error) {
            this.logger.error('Error deleting product:', error);
            throw error;
        }
    }

    calculatePrice(product, quantity, printingColors = 0) {
        try {
            const basePrice = this.findBasePrice(
                product.pricing.regular, 
                quantity
            );

            const printingPrice = this.findPrintingPrice(
                product.pricing.printing, 
                quantity,
                printingColors
            );

            const baseAmount = basePrice.price * quantity;
            const printingAmount = printingPrice * quantity;
            const totalAmount = baseAmount + printingAmount;

            return {
                quantity,
                printingColors,
                basePrice: {
                    tier: basePrice,
                    amount: baseAmount
                },
                printingPrice: {
                    tier: printingPrice,
                    amount: printingAmount
                },
                totalAmount,
                pricing: {
                    regular: product.pricing.regular,
                    printing: product.pricing.printing
                }
            };

        } catch (error) {
            this.logger.error('Price calculation error:', error);
            throw new Error('Comprehensive price calculation failed');
        }
    }

    findBasePrice(pricingTiers, quantity) {
        const matchedTier = pricingTiers.find(tier => 
            quantity >= tier.min && 
            (tier.max === null || quantity <= tier.max)
        );

        if (!matchedTier) {
            throw new Error(`No pricing tier found for quantity: ${quantity}`);
        }

        return matchedTier;
    }

    findPrintingPrice(printingTiers, quantity, colors) {
        const colorRange = this.mapColorToRange(colors);

        const matchedTier = printingTiers.find(tier => 
            quantity >= tier.min && 
            (tier.max === null || quantity <= tier.max)
        );

        if (!matchedTier) {
            throw new Error(`No printing tier found for quantity: ${quantity}`);
        }

        return matchedTier.prices[colorRange] || 0;
    }

    mapColorToRange(colors) {
        if (colors <= 2) return '1-2';
        if (colors <= 4) return '3-4';
        if (colors <= 6) return '5-6';
        throw new Error(`Unsupported color count: ${colors}`);
    }

    async getAllProducts() {
        try {
            await fs.mkdir(this.productsDir, { recursive: true });
            const files = await fs.readdir(this.productsDir);
            const products = [];
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const filePath = path.join(this.productsDir, file);
                        const fileContent = await fs.readFile(filePath, 'utf8');
                        const product = JSON.parse(fileContent);
                        products.push(product);
                    } catch (error) {
                        this.logger.error(`Error processing file ${file}:`, error);
                    }
                }
            }
            
            return products;
        } catch (error) {
            this.logger.error('Error getting all products:', error);
            throw error;
        }
    }

    async saveLinkageRecord(linkageData) {
        const { production_code, main_product_id, metadata } = linkageData;
        
        try {
            const linkageDir = path.join(ROOT_DIR, 'linkage_records');
            const filePath = path.join(linkageDir, `${production_code}_linkage.json`);

            const data = {
                production_code,
                main_product_id,
                metadata,
                linkedAt: new Date().toISOString()
            };

            await fs.mkdir(linkageDir, { recursive: true });

            await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');

            this.logger.info(`Linkage record saved: ${production_code} linked to ${main_product_id}`);
            return data;
        } catch (error) {
            this.logger.error('Error saving linkage record:', error);
            throw new Error('Failed to save linkage record');
        }
    }

    async generatePricingReport() {
        try {
            const products = await this.getAllProducts();
            const pricingReport = {
                total_products: products.length,
                pricing_analysis: {
                    regular_pricing: {},
                    printing_pricing: {}
                }
            };

            products.forEach(product => {
                // Analyze Regular Pricing
                product.pricing.regular.forEach((tier, index) => {
                    const tierKey = `tier_${index + 1}`;
                    if (!pricingReport.pricing_analysis.regular_pricing[tierKey]) {
                        pricingReport.pricing_analysis.regular_pricing[tierKey] = {
                            min: tier.min,
                            max: tier.max,
                            products_count: 0,
                            avg_price: 0,
                            prices: []
                        };
                    }
                    
                    pricingReport.pricing_analysis.regular_pricing[tierKey].products_count++;
                    pricingReport.pricing_analysis.regular_pricing[tierKey].prices.push(tier.price);
                });

                // Analyze Printing Pricing
                product.pricing.printing.forEach((tier, index) => {
                    const tierKey = `tier_${index + 1}`;
                    if (!pricingReport.pricing_analysis.printing_pricing[tierKey]) {
                        pricingReport.pricing_analysis.printing_pricing[tierKey] = {
                            min: tier.min,
                            max: tier.max,
                            products_count: 0,
                            avg_prices: {}
                        };
                    }
                    
                    pricingReport.pricing_analysis.printing_pricing[tierKey].products_count++;
                    
                    // Calculate average prices for each color range
                    Object.entries(tier.prices).forEach(([colorRange, price]) => {
                        if (!pricingReport.pricing_analysis.printing_pricing[tierKey].avg_prices[colorRange]) {
                            pricingReport.pricing_analysis.printing_pricing[tierKey].avg_prices[colorRange] = {
                                total_price: 0,
                                count: 0
                            };
                        }
                        
                        pricingReport.pricing_analysis.printing_pricing[tierKey].avg_prices[colorRange].total_price += price;
                        pricingReport.pricing_analysis.printing_pricing[tierKey].avg_prices[colorRange].count++;
                    });
                });
            });

            // Calculate averages
            Object.values(pricingReport.pricing_analysis.regular_pricing).forEach(tier => {
                tier.avg_price = tier.prices.reduce((a, b) => a + b, 0) / tier.prices.length;
            });

            Object.values(pricingReport.pricing_analysis.printing_pricing).forEach(tier => {
                Object.entries(tier.avg_prices).forEach(([colorRange, priceData]) => {
                    priceData.avg_price = priceData.total_price / priceData.count;
                    delete priceData.total_price;
                    delete priceData.count;
                });
            });

            return pricingReport;
        } catch (error) {
            this.logger.error('Error generating pricing report:', error);
            throw new Error('Failed to generate pricing report');
        }
    }
}

module.exports = ProductionProductHandler;
