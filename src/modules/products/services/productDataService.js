const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { DATA_DIR, PRODUCTS_DIR } = require('../../../app/paths');

// API Configuration
const STOCK_API_BASE_URL = 'https://hongthaipackaging.com/wp-json/wc-stock-logger/v1/products/sku';
const API_TOKEN = 'w2yYxihhILPT03pKfv8QpQSqygL4zm1cpAEciW2lyxiCQVYL1sksxdxzPa44ABJB';

// ===============================
// UTILITY FUNCTIONS
// ===============================

// ฟังก์ชันอ่านไฟล์ JSON
async function readJSONFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error.message);
        return null;
    }
}

// ฟังก์ชันเขียนไฟล์ JSON
async function writeJSONFile(filePath, data) {
    try {
        // สร้างโฟลเดอร์ถ้ายังไม่มี
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        
        // เขียนไฟล์
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`Error writing file ${filePath}:`, error.message);
        return false;
    }
}

// ฟังก์ชันตรวจสอบว่าไฟล์มีอยู่หรือไม่
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// ฟังก์ชันสร้าง URL pattern จากชื่อสินค้า
function generateUrlFromProductName(productName) {
    return productName
        .toLowerCase()
        .replace(/[^\w\s-ก-๙]/g, '') // รองรับภาษาไทย
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}

// ฟังก์ชันดึงรายการไฟล์ JSON จากโฟลเดอร์
async function getJSONFilesFromDirectory(dirPath) {
    try {
        if (!await fileExists(dirPath)) {
            console.warn(`Directory not found: ${dirPath}`);
            return [];
        }
        
        const files = await fs.readdir(dirPath);
        return files.filter(file => file.endsWith('.json'));
    } catch (error) {
        console.error(`Error reading directory ${dirPath}:`, error.message);
        return [];
    }
}

// ฟังก์ชันตรวจสอบว่าต้องซิงหรือไม่ (ตรวจสอบเวลาซ้ำ)
async function shouldSyncStock(sku, forceSync = false) {
    if (forceSync) return true;
    
    try {
        const existingData = await getStoredStockData(sku);
        if (!existingData) return true; // ไม่มีข้อมูลเดิม ต้องซิง
        
        const lastSyncTime = new Date(existingData.sync_timestamp);
        const now = new Date();
        const timeDiff = (now.getTime() - lastSyncTime.getTime()) / (1000 * 60); // ผลต่างเป็นนาที
        
        // ถ้าซิงมาแล้วไม่เกิน 5 นาที ให้ข้าม
        if (timeDiff < 5) {
            console.log(`⏭️  SKU ${sku} was synced ${timeDiff.toFixed(1)} minutes ago, skipping...`);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error(`Error checking sync status for SKU ${sku}:`, error.message);
        return true; // ถ้ามีปัญหาให้ซิงต่อไป
    }
}

// ฟังก์ชันดึงข้อมูล stock จาก API พร้อมเพิ่ม last_movement_date และ movement_history
async function getStockFromAPI(sku) {
    try {
        if (!sku) {
            console.warn('SKU is empty or undefined');
            return null;
        }

        const url = `${STOCK_API_BASE_URL}/${sku}/logs`;
        console.log(`Fetching stock data for SKU: ${sku}`);
        
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000 // 10 วินาที timeout
        });

        if (response.data && response.data.status === 'success' && response.data.data) {
            const stockData = response.data.data;
            const currentTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
            
            let movementHistory = stockData.movement_history || [];
            let lastMovementDate = null;
            
            // หา movement ล่าสุด
            if (movementHistory && movementHistory.length > 0) {
                // เรียงลำดับตาม created_at และเอาล่าสุด
                const sortedMovements = movementHistory.sort((a, b) => 
                    new Date(b.created_at) - new Date(a.created_at)
                );
                lastMovementDate = sortedMovements[0].created_at;
            } else {
                // ถ้าไม่มี movement_history ให้สร้าง movement_history เพิ่มขึ้นมา
                lastMovementDate = currentTime;
                
                // สร้าง movement entry ใหม่สำหรับการซิง
                const syncMovement = {
                    id: Date.now(), // ใช้ timestamp เป็น ID ชั่วคราว
                    old_stock: stockData.current_stock || 0,
                    new_stock: stockData.current_stock || 0,
                    change_amount: 0,
                    change_type: "sync",
                    reason: "Stock synchronized from API",
                    user_id: 0,
                    user_name: "System",
                    order_id: 0,
                    created_at: currentTime
                };
                
                movementHistory = [syncMovement];
                console.log(`📝 Created sync movement entry for SKU: ${sku}`);
            }
            
            return {
                sku: stockData.sku,
                product_id: stockData.product_id,
                product_name: stockData.product_name,
                current_stock: stockData.current_stock || 0,
                movement_history: movementHistory,
                last_movement_date: lastMovementDate,
                last_updated: new Date().toISOString(),
                sync_timestamp: new Date().toISOString()
            };
        } else {
            console.warn(`No stock data found for SKU: ${sku}`);
            return null;
        }
    } catch (error) {
        console.error(`Error fetching stock for SKU ${sku}:`, error.message);
        return null;
    }
}

// ===============================
// STOCK MOVEMENT ANALYSIS FUNCTIONS
// ===============================

// ฟังก์ชันวิเคราะห์ movement history พร้อมการจัดหมวดหมู่ slow move (นับจาก last_movement_date)
function analyzeMovementHistory(movementHistory, daysPeriod = 30, lastMovementDate = null, syncTimestamp = null) {
    const now = new Date();
    
    // กำหนดวันที่ที่จะใช้ในการนับอายุ
    let referenceDate = null;
    let referenceType = 'unknown';
    
    if (lastMovementDate) {
        // ใช้ last_movement_date เป็นหลัก
        referenceDate = new Date(lastMovementDate);
        referenceType = 'last_movement_date';
    } else if (!movementHistory || movementHistory.length === 0) {
        // ถ้าไม่มี movement_history และไม่มี last_movement_date ให้ใช้เวลาซิง
        referenceDate = syncTimestamp ? new Date(syncTimestamp) : new Date();
        referenceType = 'sync_timestamp';
    } else {
        // หา movement ล่าสุดจาก movement_history
        const sortedMovements = movementHistory.sort((a, b) => 
            new Date(b.created_at) - new Date(a.created_at)
        );
        referenceDate = new Date(sortedMovements[0].created_at);
        referenceType = 'movement_history';
    }
    
    // กรณีที่ไม่มี movement_history
    if (!movementHistory || movementHistory.length === 0) {
        const daysSinceReference = Math.floor((now.getTime() - referenceDate.getTime()) / (24 * 60 * 60 * 1000));
        
        // จัดหมวดหมู่ slow move
        let slowMoveCategory = 'normal';
        let slowMoveLevel = 'normal';
        let ageCategory = 'Normal (≤60 วัน)';
        let isBaseline = false;
        
        if (daysSinceReference > 180) {
            slowMoveCategory = 'dead-stock';
            slowMoveLevel = 'dead-stock';
            ageCategory = 'Dead Stock (>180 วัน)';
        } else if (daysSinceReference > 150) {
            slowMoveCategory = 'very-slow-move-3';
            slowMoveLevel = 'very-slow-move-3';
            ageCategory = 'Very Slow Move #3 (151-180 วัน)';
        } else if (daysSinceReference > 120) {
            slowMoveCategory = 'very-slow-move-2';
            slowMoveLevel = 'very-slow-move-2';
            ageCategory = 'Very Slow Move #2 (121-150 วัน)';
        } else if (daysSinceReference > 90) {
            slowMoveCategory = 'very-slow-move-1';
            slowMoveLevel = 'very-slow-move-1';
            ageCategory = 'Very Slow Move #1 (91-120 วัน)';
        } else if (daysSinceReference > 60) {
            slowMoveCategory = 'slow-move';
            slowMoveLevel = 'slow-move';
            ageCategory = 'Slow Move (61-90 วัน)';
        } else {
            slowMoveCategory = 'normal';
            slowMoveLevel = 'normal';
            if (referenceType === 'sync_timestamp') {
                ageCategory = daysSinceReference === 0 ? 'Normal (≤60 วัน) - Baseline' : 'Normal (≤60 วัน)';
                isBaseline = daysSinceReference === 0;
            } else {
                ageCategory = 'Normal (≤60 วัน)';
            }
        }
        
        return {
            totalMovements: 0,
            salesMovements: 0,
            restockMovements: 0,
            totalSold: 0,
            totalRestocked: 0,
            uniqueOrders: new Set(),
            recentActivity: false,
            averageOrderSize: 0,
            movementFrequency: 0,
            salesVelocity: 0,
            lastMovementDate: referenceDate,
            lastRestockDate: null,
            orderCompletions: 0,
            orderCancellations: 0,
            daysSinceLastMovement: daysSinceReference,
            daysSinceLastRestock: null,
            slowMoveCategory: slowMoveCategory,
            ageAnalysis: {
                hasMovementHistory: false,
                daysSinceLastMovement: daysSinceReference,
                slowMoveLevel: slowMoveLevel,
                ageCategory: ageCategory,
                isBaseline: isBaseline,
                referenceDate: referenceDate.toISOString(),
                referenceType: referenceType
            }
        };
    }

    // กรณีที่มี movement_history
    const periodStart = new Date(now.getTime() - (daysPeriod * 24 * 60 * 60 * 1000));
    
    let totalSold = 0;
    let totalRestocked = 0;
    let salesMovements = 0;
    let restockMovements = 0;
    let orderCompletions = 0;
    let orderCancellations = 0;
    const uniqueOrders = new Set();
    const orderSizes = [];
    
    let lastMovementFromHistory = null;
    let lastRestockDate = null;

    // วิเคราะห์ movement history
    movementHistory.forEach(movement => {
        const movementDate = new Date(movement.created_at);
        
        // อัพเดท lastMovementFromHistory
        if (!lastMovementFromHistory || movementDate > lastMovementFromHistory) {
            lastMovementFromHistory = movementDate;
        }
        
        // ติดตามวันที่ restock ล่าสุด (ไม่นับ sync movement)
        if (movement.change_type === 'increase' && movement.change_amount > 0 && movement.change_type !== 'sync') {
            if (!lastRestockDate || movementDate > lastRestockDate) {
                lastRestockDate = movementDate;
            }
        }
        
        // วิเคราะห์เฉพาะ movement ในช่วงเวลาที่กำหนด (สำหรับสถิติ) และไม่นับ sync movement
        if (movementDate >= periodStart && movement.change_type !== 'sync') {
            const changeAmount = Math.abs(movement.change_amount || 0);
            
            if (movement.change_type === 'decrease') {
                totalSold += changeAmount;
                salesMovements++;
                
                if (movement.reason === 'Order completed' && movement.order_id > 0) {
                    orderCompletions++;
                    uniqueOrders.add(movement.order_id);
                    orderSizes.push(changeAmount);
                }
                
            } else if (movement.change_type === 'increase') {
                totalRestocked += changeAmount;
                restockMovements++;
                
                if (movement.reason === 'Order cancelled/refunded' && movement.order_id > 0) {
                    orderCancellations++;
                }
            }
        }
    });

    const totalMovements = salesMovements + restockMovements;
    const recentActivity = referenceDate && (now.getTime() - referenceDate.getTime()) < (7 * 24 * 60 * 60 * 1000);
    const averageOrderSize = orderSizes.length > 0 ? orderSizes.reduce((sum, size) => sum + size, 0) / orderSizes.length : 0;
    const movementFrequency = totalMovements / daysPeriod;
    const salesVelocity = totalSold / daysPeriod;

    // คำนวณวันที่ผ่านไปตั้งแต่ reference date (last_movement_date หรือ movement ล่าสุด)
    const daysSinceLastMovement = Math.floor((now.getTime() - referenceDate.getTime()) / (24 * 60 * 60 * 1000));

    // คำนวณวันที่ผ่านไปตั้งแต่ restock ล่าสุด (เก็บไว้สำหรับข้อมูลเพิ่มเติม)
    let daysSinceLastRestock = null;
    if (lastRestockDate) {
        daysSinceLastRestock = Math.floor((now.getTime() - lastRestockDate.getTime()) / (24 * 60 * 60 * 1000));
    }

    // จัดหมวดหมู่ slow move ตาม daysSinceLastMovement
    let slowMoveCategory = null;
    let ageAnalysis = {
        hasMovementHistory: true,
        daysSinceLastMovement: daysSinceLastMovement,
        slowMoveLevel: 'normal',
        ageCategory: 'Normal (≤60 วัน)',
        isBaseline: false,
        referenceDate: referenceDate.toISOString(),
        referenceType: referenceType
    };

    if (daysSinceLastMovement > 180) {
        slowMoveCategory = 'dead-stock';
        ageAnalysis.slowMoveLevel = 'dead-stock';
        ageAnalysis.ageCategory = 'Dead Stock (>180 วัน)';
    } else if (daysSinceLastMovement > 150) {
        slowMoveCategory = 'very-slow-move-3';
        ageAnalysis.slowMoveLevel = 'very-slow-move-3';
        ageAnalysis.ageCategory = 'Very Slow Move #3 (151-180 วัน)';
    } else if (daysSinceLastMovement > 120) {
        slowMoveCategory = 'very-slow-move-2';
        ageAnalysis.slowMoveLevel = 'very-slow-move-2';
        ageAnalysis.ageCategory = 'Very Slow Move #2 (121-150 วัน)';
    } else if (daysSinceLastMovement > 90) {
        slowMoveCategory = 'very-slow-move-1';
        ageAnalysis.slowMoveLevel = 'very-slow-move-1';
        ageAnalysis.ageCategory = 'Very Slow Move #1 (91-120 วัน)';
    } else if (daysSinceLastMovement > 60) {
        slowMoveCategory = 'slow-move';
        ageAnalysis.slowMoveLevel = 'slow-move';
        ageAnalysis.ageCategory = 'Slow Move (61-90 วัน)';
    } else {
        slowMoveCategory = 'normal';
        ageAnalysis.slowMoveLevel = 'normal';
        ageAnalysis.ageCategory = 'Normal (≤60 วัน)';
    }

    return {
        totalMovements,
        salesMovements,
        restockMovements,
        totalSold,
        totalRestocked,
        uniqueOrders,
        recentActivity,
        averageOrderSize,
        movementFrequency,
        salesVelocity,
        lastMovementDate: referenceDate, // ใช้ reference date
        lastRestockDate,
        orderCompletions,
        orderCancellations,
        daysSinceLastMovement,
        daysSinceLastRestock,
        slowMoveCategory,
        ageAnalysis,
        netSales: totalSold - (orderCancellations > 0 ? totalSold * 0.1 : 0),
        turnoverRate: totalSold > 0 ? totalSold / Math.max(totalSold + totalRestocked, 1) : 0
    };
}

// ฟังก์ชันคำนวณ Hot Product Score (ปรับปรุงให้รวม slow move analysis)
function calculateHotProductScore(product, movementAnalysis, relevance) {
    let score = 0;
    
    // คะแนนจาก Sales Velocity (30%)
    if (movementAnalysis.salesVelocity > 100) score += 30;
    else if (movementAnalysis.salesVelocity > 50) score += 25;
    else if (movementAnalysis.salesVelocity > 20) score += 20;
    else if (movementAnalysis.salesVelocity > 10) score += 15;
    else if (movementAnalysis.salesVelocity > 0) score += 10;
    
    // คะแนนจาก Movement Frequency (20%)
    if (movementAnalysis.movementFrequency > 2) score += 20;
    else if (movementAnalysis.movementFrequency > 1) score += 15;
    else if (movementAnalysis.movementFrequency > 0.5) score += 10;
    else if (movementAnalysis.movementFrequency > 0) score += 5;
    
    // คะแนนจาก Relevance (25%)
    if (relevance > 0.8) score += 25;
    else if (relevance > 0.6) score += 20;
    else if (relevance > 0.4) score += 15;
    else if (relevance > 0.25) score += 10;
    
    // คะแนนจาก Recent Activity (10%)
    if (movementAnalysis.recentActivity) score += 10;
    
    // คะแนนจาก Order Completion Rate (10%)
    const completionRate = movementAnalysis.orderCompletions / Math.max(movementAnalysis.orderCompletions + movementAnalysis.orderCancellations, 1);
    if (completionRate > 0.9) score += 10;
    else if (completionRate > 0.7) score += 7;
    else if (completionRate > 0.5) score += 5;
    
    // คะแนนจาก Age (5%) - สินค้าที่เคลื่อนไหวล่าสุดจะได้คะแนนมากกว่า
    if (movementAnalysis.ageAnalysis.slowMoveLevel === 'normal') score += 5;
    else if (movementAnalysis.ageAnalysis.slowMoveLevel === 'slow-move') score += 2;
    // สินค้าเก่ากว่านั้นไม่ได้คะแนน
    
    // ลบคะแนนสำหรับสินค้าที่ไม่เคลื่อนไหวนาน
    if (movementAnalysis.ageAnalysis.slowMoveLevel === 'very-slow-move-1') score -= 5;
    else if (movementAnalysis.ageAnalysis.slowMoveLevel === 'very-slow-move-2') score -= 10;
    else if (movementAnalysis.ageAnalysis.slowMoveLevel === 'very-slow-move-3') score -= 15;
    else if (movementAnalysis.ageAnalysis.slowMoveLevel === 'dead-stock') score -= 20;
    
    return Math.max(0, Math.min(score, 100)); // จำกัดคะแนนระหว่าง 0-100
}

// ===============================
// STOCK DATA MANAGEMENT
// ===============================

// ฟังก์ชันอ่านข้อมูล stock ที่บันทึกไว้
async function getStoredStockData(sku) {
    try {
        const stockDir = path.join(DATA_DIR, 'Stock');
        const filePath = path.join(stockDir, `${sku}.json`);
        
        if (await fileExists(filePath)) {
            const stockData = await readJSONFile(filePath);
            return stockData;
        }
        return null;
    } catch (error) {
        console.error(`Error reading stored stock data for SKU ${sku}:`, error.message);
        return null;
    }
}

// ฟังก์ชันบันทึกข้อมูล stock
async function saveStockData(sku, stockData) {
    try {
        const stockDir = path.join(DATA_DIR, 'Stock');
        const filePath = path.join(stockDir, `${sku}.json`);
        
        const success = await writeJSONFile(filePath, stockData);
        if (success) {
            console.log(`✅ Saved stock data for SKU: ${sku}`);
        } else {
            console.error(`❌ Failed to save stock data for SKU: ${sku}`);
        }
        return success;
    } catch (error) {
        console.error(`Error saving stock data for SKU ${sku}:`, error.message);
        return false;
    }
}

// ฟังก์ชันซิงข้อมูล stock จาก API และบันทึกลงไฟล์ (พร้อมตรวจสอบการซิงซ้ำ)
async function syncStockData(sku, forceSync = false) {
    try {
        // ตรวจสอบว่าต้องซิงหรือไม่
        if (!await shouldSyncStock(sku, forceSync)) {
            return {
                success: true,
                message: `ข้อมูล stock สำหรับ SKU: ${sku} เป็นปัจจุบันแล้ว (ซิงไปแล้วไม่เกิน 5 นาที)`,
                sku: sku,
                skipped: true
            };
        }
        
        // ดึงข้อมูลเดิม (ถ้ามี) เพื่อรวม movement_history
        const existingData = await getStoredStockData(sku);
        
        // ดึงข้อมูลจาก API
        const apiStockData = await getStockFromAPI(sku);
        
        if (!apiStockData) {
            return {
                success: false,
                message: `ไม่สามารถดึงข้อมูล stock จาก API สำหรับ SKU: ${sku}`,
                sku: sku
            };
        }

        // รวม movement_history เดิมกับใหม่ (ถ้ามีข้อมูลเดิม)
        if (existingData && existingData.movement_history && existingData.movement_history.length > 0) {
            // รวม movement_history โดยไม่ให้ซ้ำ
            const existingMovements = existingData.movement_history;
            const newMovements = apiStockData.movement_history;
            
            // สร้าง Set ของ movement IDs ที่มีอยู่แล้ว
            const existingIds = new Set(existingMovements.map(m => m.id));
            
            // เพิ่มเฉพาะ movement ที่ไม่ซ้ำ
            const uniqueNewMovements = newMovements.filter(m => !existingIds.has(m.id));
            
            // รวม movement_history
            apiStockData.movement_history = [...existingMovements, ...uniqueNewMovements];
            
            // เรียงลำดับใหม่ตาม created_at
            apiStockData.movement_history.sort((a, b) => 
                new Date(b.created_at) - new Date(a.created_at)
            );
            
            // อัปเดต last_movement_date ตาม movement ล่าสุด
            if (apiStockData.movement_history.length > 0) {
                apiStockData.last_movement_date = apiStockData.movement_history[0].created_at;
            }
            
            console.log(`📋 Merged movement history for SKU: ${sku} (${existingMovements.length} existing + ${uniqueNewMovements.length} new = ${apiStockData.movement_history.length} total)`);
        }

        // บันทึกข้อมูลลงไฟล์
        const saveSuccess = await saveStockData(sku, apiStockData);
        
        if (saveSuccess) {
            return {
                success: true,
                message: `ซิงข้อมูล stock สำเร็จสำหรับ SKU: ${sku}`,
                sku: sku,
                data: apiStockData,
                movementHistoryCount: apiStockData.movement_history.length
            };
        } else {
            return {
                success: false,
                message: `ไม่สามารถบันทึกข้อมูล stock สำหรับ SKU: ${sku}`,
                sku: sku
            };
        }
    } catch (error) {
        console.error(`Error syncing stock data for SKU ${sku}:`, error.message);
        return {
            success: false,
            message: `เกิดข้อผิดพลาดในการซิงข้อมูล: ${error.message}`,
            sku: sku
        };
    }
}

// ฟังก์ชันซิงข้อมูล stock หลาย SKU (พร้อมตรวจสอบการซิงซ้ำ)
async function syncMultipleStockData(skus, batchSize = 3, forceSync = false) {
    const results = [];
    let skippedCount = 0;
    
    for (let i = 0; i < skus.length; i += batchSize) {
        const batch = skus.slice(i, i + batchSize);
        console.log(`Syncing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(skus.length/batchSize)}: ${batch.join(', ')}`);
        
        const promises = batch.map(sku => syncStockData(sku, forceSync));
        const batchResults = await Promise.allSettled(promises);
        
        batchResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                results.push(result.value);
                if (result.value.skipped) {
                    skippedCount++;
                }
            } else {
                results.push({
                    success: false,
                    message: `เกิดข้อผิดพลาด: ${result.reason}`,
                    sku: batch[index]
               });
           }
       });
       
       // หน่วงเวลาระหว่าง batch เพื่อไม่ให้ API overload
       if (i + batchSize < skus.length) {
           console.log('Waiting before next batch...');
           await new Promise(resolve => setTimeout(resolve, 2000));
      }
  }
  
  console.log(`📊 Sync completed: ${results.filter(r => r.success && !r.skipped).length} synced, ${skippedCount} skipped, ${results.filter(r => !r.success).length} failed`);
  
  return results;
}

// ฟังก์ชันดึงข้อมูล stock (จากไฟล์ก่อน ถ้าไม่มีค่อยเรียก API)
async function getStockData(sku, autoSync = true) {
  try {
      // ลองอ่านจากไฟล์ก่อน
      let stockData = await getStoredStockData(sku);
      
      if (stockData) {
          return stockData;
      }
      
      // ถ้าไม่มีข้อมูลในไฟล์และเปิด autoSync
      if (autoSync) {
          console.log(`No stored data found for SKU: ${sku}, attempting to sync from API...`);
          const syncResult = await syncStockData(sku);
          
          if (syncResult.success && syncResult.data) {
              return syncResult.data;
          }
      }
      
      return null;
  } catch (error) {
      console.error(`Error getting stock data for SKU ${sku}:`, error.message);
      return null;
  }
}

// ฟังก์ชันดึง SKUs ทั้งหมดที่มีไฟล์ stock บันทึกไว้
async function getAllStoredStockSKUs() {
  try {
      const stockDir = path.join(DATA_DIR, 'Stock');
      
      if (!await fileExists(stockDir)) {
          return [];
      }
      
      const files = await fs.readdir(stockDir);
      const skus = files
          .filter(file => file.endsWith('.json'))
          .map(file => file.replace('.json', ''));
      
      return skus;
  } catch (error) {
      console.error('Error getting stored stock SKUs:', error.message);
      return [];
  }
}

// ===============================
// PRODUCT DATA MANAGEMENT
// ===============================

// ฟังก์ชันดึงข้อมูลสินค้าทั้งหมดจากโฟลเดอร์ Product
async function getAllProducts() {
  try {
      // เปลี่ยนแปลงที่นี่: ตัด 'data' ออกเพื่อให้ชี้ไปที่โฟลเดอร์ 'Product' ใน root directory
      const productsDir = PRODUCTS_DIR;
      
      if (!await fileExists(productsDir)) {
          console.error(`Products directory not found: ${productsDir}`);
          return [];
      }

      const productFiles = await getJSONFilesFromDirectory(productsDir);
      console.log(`📦 Found ${productFiles.length} product files`);
      
      const products = [];
      let productIdCounter = 1;

      for (const file of productFiles) {
          const filePath = path.join(productsDir, file);
          const productData = await readJSONFile(filePath);
          
          if (productData) {
              // สร้าง ID สำหรับสินค้า (ใช้ counter หรือ SKU)
              const productId = productData.sku || productIdCounter++;
              
              const enhancedProduct = {
                  id: productId,
                  ...productData
              };

              // ดึงข้อมูล stock ที่บันทึกไว้ (ถ้ามี)
              if (productData.sku) {
                  const stockData = await getStoredStockData(productData.sku);
                  if (stockData) {
                      enhancedProduct.stock_data = stockData;
                      enhancedProduct.has_stock_history = stockData.movement_history && stockData.movement_history.length > 0;
                      enhancedProduct.stock_last_updated = stockData.last_updated;
                      enhancedProduct.stock_sync_timestamp = stockData.sync_timestamp;
                      
                      // อัปเดต stock_quantity จากข้อมูลที่ซิงล่าสุด
                      if (stockData.current_stock !== undefined) {
                          enhancedProduct.stock_quantity = stockData.current_stock;
                      }
                  } else {
                      enhancedProduct.stock_data = null;
                      enhancedProduct.has_stock_history = false;
                      enhancedProduct.stock_last_updated = null;
                      enhancedProduct.stock_sync_timestamp = null;
                  }
              } else {
                  enhancedProduct.stock_data = null;
                  enhancedProduct.has_stock_history = false;
                  enhancedProduct.stock_last_updated = null;
                  enhancedProduct.stock_sync_timestamp = null;
              }
              
              products.push(enhancedProduct);
          }
      }

      console.log(`✅ Loaded ${products.length} products successfully`);
      return products;
  } catch (error) {
      console.error('Error loading products:', error.message);
      return [];
  }
}
// ฟังก์ชันดึงข้อมูลสินค้าตาม ID
async function getProductById(productId) {
  try {
      const products = await getAllProducts();
      const product = products.find(p => p.id == productId);
      
      if (!product) {
          return null;
      }

      return product;
  } catch (error) {
      console.error(`Error getting product by ID ${productId}:`, error.message);
      return null;
  }
}

// ===============================
// USER INTERACTION DATA
// ===============================

// ฟังก์ชันดึงข้อมูล interactions ทั้งหมดจากโฟลเดอร์ product_histories
async function getAllUserInteractions() {
  try {
      const interactionsDir = path.join(DATA_DIR, 'product_histories');
      
      if (!await fileExists(interactionsDir)) {
          console.error(`Interactions directory not found: ${interactionsDir}`);
          return {};
      }

      const interactionFiles = await getJSONFilesFromDirectory(interactionsDir);
      console.log(`👥 Found ${interactionFiles.length} user interaction files`);
      
      const allInteractions = {};

      for (const file of interactionFiles) {
          const filePath = path.join(interactionsDir, file);
          const userData = await readJSONFile(filePath);
          
          if (userData && userData.userId) {
              allInteractions[userData.userId] = userData;
          }
      }

      console.log(`✅ Loaded interactions for ${Object.keys(allInteractions).length} users`);
      return allInteractions;
  } catch (error) {
      console.error('Error loading user interactions:', error.message);
      return {};
  }
}

// ฟังก์ชันดึงข้อมูล interactions ของ user คนเดียว
async function getUserInteractions(userId) {
  try {
      const allInteractions = await getAllUserInteractions();
      return allInteractions[userId] || null;
  } catch (error) {
      console.error(`Error getting interactions for user ${userId}:`, error.message);
      return null;
  }
}

// ===============================
// URL MATCHING FUNCTIONS
// ===============================

// ฟังก์ชันค้นหาสินค้าจาก URL แบบ fuzzy matching
function findProductByUrlFuzzy(url, productByUrl) {
  // ลองหาแบบตรงเปะก่อน
  if (productByUrl.has(url)) {
      return productByUrl.get(url);
  }
  
  // แยกส่วน path สุดท้าย
  const urlPath = url.split('/').pop();
  
  // ลองหาใน product URLs
  for (const [productUrl, productId] of productByUrl.entries()) {
      const productUrlPath = productUrl.split('/').pop();
      
      // เปรียบเทียบ path สุดท้าย
      if (urlPath === productUrlPath) {
          return productId;
      }
      
      // เปรียบเทียบแบบ substring
      if (productUrl.includes(urlPath) || urlPath.includes(productUrlPath)) {
          return productId;
      }
  }
  
  return null;
}

// ===============================
// DATA COMBINATION & ANALYSIS
// ===============================

// ฟังก์ชันรวมข้อมูลสินค้ากับ interactions
function combineProductsWithInteractions(products, allInteractions) {
  const productByUrl = new Map();
  const combinedProducts = [];

  // สร้าง URL mapping
  products.forEach(product => {
      if (product.url) {
          productByUrl.set(product.url, product.id);
      }
  });

  // รวมข้อมูล interactions กับสินค้า
  products.forEach(product => {
      const combinedProduct = { ...product };
      
      // รวมข้อมูล interactions
      let totalInteractions = 0;
      let totalRelevance = 0;
      let userInteractions = [];
      let userCount = 0;

      Object.entries(allInteractions).forEach(([userId, userData]) => {
          if (userData.products) {
              // ค้นหาโดยใช้ product id ที่ตรงกัน
              Object.entries(userData.products).forEach(([productKey, productInteractions]) => {
                  // ตรวจสอบว่า product key ตรงกับสินค้าหรือไม่
                  const isMatchingProduct = 
                      productKey.includes(product.sku) || // ตรงกับ SKU
                      productInteractions.product_name === product.product_name || // ตรงกับชื่อ
                      (productInteractions.interactions && 
                       productInteractions.interactions.some(interaction => 
                          interaction.context?.url === product.url)); // ตรงกับ URL
                  
                  if (isMatchingProduct && productInteractions.interactions && productInteractions.interactions.length > 0) {
                      userInteractions.push({
                          userId,
                          interactions: productInteractions.interactions,
                          totalInteractions: productInteractions.total_interactions || 0,
                          averageRelevance: productInteractions.average_relevance || 0
                      });
                      
                      totalInteractions += productInteractions.total_interactions || 0;
                      totalRelevance += (productInteractions.average_relevance || 0) * (productInteractions.total_interactions || 0);
                      userCount++;
                  }
              });
          }
      });

      // ค้นหาการ match จาก URL (fallback)
      if (userInteractions.length === 0 && product.url) {
          Object.entries(allInteractions).forEach(([userId, userData]) => {
              if (userData.products) {
                  Object.values(userData.products).forEach(interactionData => {
                      if (interactionData.interactions) {
                          interactionData.interactions.forEach(interaction => {
                              const url = interaction.context?.url;
                              if (url === product.url) {
                                  if (!userInteractions.find(ui => ui.userId === userId)) {
                                      userInteractions.push({
                                          userId,
                                          interactions: [interaction],
                                          totalInteractions: 1,
                                          averageRelevance: interaction.relevance_score || 0
                                      });
                                      
                                      totalInteractions += 1;
                                      totalRelevance += interaction.relevance_score || 0;
                                      userCount++;
                                  }
                              }
                          });
                      }
                  });
              }
          });
      }

      combinedProduct.totalInteractions = totalInteractions;
      combinedProduct.averageRelevance = totalInteractions > 0 ? totalRelevance / totalInteractions : 0;
      combinedProduct.userInteractions = userInteractions;
      combinedProduct.userCount = userCount;

      // เพิ่ม movement analysis ถ้ามีข้อมูล stock
      if (combinedProduct.stock_data && combinedProduct.stock_data.movement_history) {
          combinedProduct.movementAnalysis = analyzeMovementHistory(
              combinedProduct.stock_data.movement_history,
              30,
              combinedProduct.stock_data.last_movement_date,
              combinedProduct.stock_data.sync_timestamp
          );
      } else {
          // สร้าง movement analysis เปล่าสำหรับสินค้าที่ไม่มีข้อมูล
          combinedProduct.movementAnalysis = analyzeMovementHistory(
              [],
              30,
              null,
              combinedProduct.stock_sync_timestamp
          );
      }

      // คำนวณ Hot Product Score
      combinedProduct.hotScore = calculateHotProductScore(
          combinedProduct,
          combinedProduct.movementAnalysis,
          combinedProduct.averageRelevance
      );

      combinedProducts.push(combinedProduct);
  });

  return combinedProducts;
}

// ฟังก์ชันวิเคราะห์ข้อมูลสินค้าแบบครบวงจร - แก้ไขให้ return combinedProducts
function analyzeProductData(products, allInteractions) {
  const combinedProducts = combineProductsWithInteractions(products, allInteractions);
  
  // สถิติพื้นฐาน
  const totalProducts = combinedProducts.length;
  let totalInteractions = 0;
  let totalQualityInteractions = 0;
  let totalUserInteractions = 0;
  let totalSalesMovements = 0;
  let totalSalesVolume = 0;
  let totalRelevanceSum = 0;
  let totalSalesVelocitySum = 0;
  let productsWithInteractions = 0;
  let productsWithQualityInteractions = 0;
  let productsWithMovementHistory = 0;
  let productsWithRecentMovement = 0;
  let productsWithStoredStock = 0;
  let productsWithStockHistory = 0;
  let productsWithRestockHistory = 0;
  let totalDaysSinceRestockSum = 0;

  // จัดหมวดหมู่สินค้า
  const categories = {};
  const stockLevels = { low: [], medium: [], high: [] };
  const interestLevels = { 
      highInterest: [], 
      mediumInterest: [], 
      lowInterest: [], 
      noInterest: [] 
  };
  const movementLevels = {
      highMovement: [],
      mediumMovement: [],
      lowMovement: [],
      noMovement: []
  };
  
  // Slow Move Categories
  const slowMoveCategories = {
      normal: [],
      slowMove: [],
      verySlowMove1: [],
      verySlowMove2: [],
      verySlowMove3: [],
      deadStock: [],
      noData: []
  };

  const deadStock = [];
  const qualityInteractions = [];
  const hotProducts = [];
  
  // Age Analysis
  let oldestStockDays = 0;
  let newestStockDays = Infinity;
  let oldestStockProduct = null;
  let newestStockProduct = null;
  const ageDistribution = {
      '0-30': 0,
      '31-60': 0,
      '61-90': 0,
      '91-120': 0,
      '121-150': 0,
      '151-180': 0,
      '181+': 0
  };

  combinedProducts.forEach(product => {
      // สถิติพื้นฐาน
      totalInteractions += product.totalInteractions;
      totalUserInteractions += product.userInteractions.length;
      
      if (product.totalInteractions > 0) {
          productsWithInteractions++;
          totalRelevanceSum += product.averageRelevance;
      }
      
      if (product.averageRelevance > 0.25) {
          productsWithQualityInteractions++;
          totalQualityInteractions += product.totalInteractions;
          qualityInteractions.push(product);
      }
      
      // สถิติ stock
      if (product.stock_data) {
          productsWithStoredStock++;
      }
      
      if (product.has_stock_history) {
          productsWithStockHistory++;
      }
      
      // สถิติ movement
      if (product.movementAnalysis) {
          if (product.movementAnalysis.totalMovements > 0) {
              productsWithMovementHistory++;
          }
          
          if (product.movementAnalysis.recentActivity) {
              productsWithRecentMovement++;
          }
          
          totalSalesMovements += product.movementAnalysis.salesMovements || 0;
          totalSalesVolume += product.movementAnalysis.totalSold || 0;
          totalSalesVelocitySum += product.movementAnalysis.salesVelocity || 0;
          
          if (product.movementAnalysis.lastRestockDate) {
              productsWithRestockHistory++;
              totalDaysSinceRestockSum += product.movementAnalysis.daysSinceLastRestock || 0;
          }
          
          // จัดหมวดหมู่ movement level
          const salesVelocity = product.movementAnalysis.salesVelocity || 0;
          if (salesVelocity > 50) {
              movementLevels.highMovement.push(product);
          } else if (salesVelocity >= 10) {
              movementLevels.mediumMovement.push(product);
          } else if (salesVelocity > 0) {
              movementLevels.lowMovement.push(product);
          } else {
              movementLevels.noMovement.push(product);
          }
          
          // จัดหมวดหมู่ slow move ตาม ageAnalysis
          if (product.movementAnalysis.ageAnalysis) {
              const ageAnalysis = product.movementAnalysis.ageAnalysis;
              const daysSince = ageAnalysis.daysSinceLastMovement || 0;
              
              // Age Distribution
              if (daysSince <= 30) ageDistribution['0-30']++;
              else if (daysSince <= 60) ageDistribution['31-60']++;
              else if (daysSince <= 90) ageDistribution['61-90']++;
              else if (daysSince <= 120) ageDistribution['91-120']++;
              else if (daysSince <= 150) ageDistribution['121-150']++;
              else if (daysSince <= 180) ageDistribution['151-180']++;
              else ageDistribution['181+']++;
              
              // Oldest/Newest tracking
              if (ageAnalysis.hasMovementHistory || ageAnalysis.referenceType !== 'sync_timestamp') {
                  if (daysSince > oldestStockDays) {
                      oldestStockDays = daysSince;
                      oldestStockProduct = product;
                  }
                  if (daysSince < newestStockDays) {
                      newestStockDays = daysSince;
                      newestStockProduct = product;
                  }
              }
              
              // Slow Move Categories
              switch (ageAnalysis.slowMoveLevel) {
                  case 'normal':
                      slowMoveCategories.normal.push(product);
                      break;
                  case 'slow-move':
                      slowMoveCategories.slowMove.push(product);
                      break;
                  case 'very-slow-move-1':
                      slowMoveCategories.verySlowMove1.push(product);
                      break;
                  case 'very-slow-move-2':
                      slowMoveCategories.verySlowMove2.push(product);
                      break;
                  case 'very-slow-move-3':
                      slowMoveCategories.verySlowMove3.push(product);
                      break;
                  case 'dead-stock':
                      slowMoveCategories.deadStock.push(product);
                      deadStock.push(product);
                      break;
                  default:
                      slowMoveCategories.noData.push(product);
              }
          } else {
              slowMoveCategories.noData.push(product);
          }
      } else {
          movementLevels.noMovement.push(product);
          slowMoveCategories.noData.push(product);
      }
      
      // หมวดหมู่สินค้า
      const category = product.category || 'ไม่ระบุ';
      categories[category] = (categories[category] || 0) + 1;
      
      // ระดับ stock
      const stock = product.stock_quantity || 0;
      if (stock <= 10) {
          stockLevels.low.push(product);
      } else if (stock <= 100) {
          stockLevels.medium.push(product);
      } else {
          stockLevels.high.push(product);
      }
      
      // ระดับความสนใจ
      const relevance = product.averageRelevance || 0;
      if (relevance > 0.7) {
          interestLevels.highInterest.push(product);
      } else if (relevance > 0.5) {
          interestLevels.mediumInterest.push(product);
      } else if (relevance > 0.25) {
          interestLevels.lowInterest.push(product);
      } else {
          interestLevels.noInterest.push(product);
      }
      
      // Hot Products (relevance > 0.25 และมีคะแนน hotScore > 0)
      if (product.averageRelevance > 0.25 && (product.hotScore || 0) > 0) {
          hotProducts.push(product);
      }
  });

  // เรียงลำดับ Hot Products
  hotProducts.sort((a, b) => (b.hotScore || 0) - (a.hotScore || 0));
  
  // เรียงลำดับ Quality Interactions
  qualityInteractions.sort((a, b) => b.averageRelevance - a.averageRelevance);

  // สถิติรวม
  const averageInteractionsPerProduct = productsWithInteractions > 0 ? 
      totalUserInteractions / productsWithInteractions : 0;
  const averageRelevanceOverall = productsWithInteractions > 0 ? 
      totalRelevanceSum / productsWithInteractions : 0;
  const averageSalesVelocity = totalProducts > 0 ? 
      totalSalesVelocitySum / totalProducts : 0;
  const averageDaysSinceRestock = productsWithRestockHistory > 0 ? 
      totalDaysSinceRestockSum / productsWithRestockHistory : 0;

  return {
      totalProducts,
      totalInteractions,
      totalQualityInteractions,
      totalUserInteractions,
      totalSalesMovements,
      totalSalesVolume,
      
      // เพิ่ม combinedProducts ใน return
      combinedProducts,
      
      // สถิติการจับคู่
      matchingStats: {
          productsWithInteractions,
          productsWithQualityInteractions,
          productsWithMovementHistory,
          productsWithRecentMovement,
          productsWithStoredStock,
          productsWithoutStoredStock: totalProducts - productsWithStoredStock,
          productsWithStockHistory,
          productsWithRestockHistory,
          averageInteractionsPerProduct,
          averageRelevanceOverall,
          averageSalesVelocity,
          averageDaysSinceRestock,
          totalUserInteractions
      },
      
      // จัดหมวดหมู่
      categories,
      stockLevels,
      interestLevels,
      movementLevels,
      slowMoveCategories,
      
      // รายการสินค้าพิเศษ
      deadStock,
      qualityInteractions,
      hotProducts,
      
      // Age Analysis
      ageAnalysis: {
          oldestStock: oldestStockProduct ? {
              name: oldestStockProduct.product_name,
              days: oldestStockDays,
              sku: oldestStockProduct.sku
          } : null,
          newestStock: newestStockProduct ? {
              name: newestStockProduct.product_name,
              days: newestStockDays === Infinity ? 0 : newestStockDays,
              sku: newestStockProduct.sku
          } : null,
          distributionByAge: ageDistribution,
          totalWithRestockHistory: productsWithRestockHistory,
          averageDaysSinceRestock
      }
  };
}

// ===============================
// EXPORTS
// ===============================

module.exports = {
  // Utility functions
  readJSONFile,
  writeJSONFile,
  fileExists,
  generateUrlFromProductName,
  getJSONFilesFromDirectory,
  
  // Stock management
  getStockFromAPI,
  getStoredStockData,
  saveStockData,
  syncStockData,
  syncMultipleStockData,
  getStockData,
  getAllStoredStockSKUs,
  shouldSyncStock,
  
  // Product management
  getAllProducts,
  getProductById,
  
  // User interactions
  getAllUserInteractions,
  getUserInteractions,
  
  // Analysis functions
  analyzeMovementHistory,
  calculateHotProductScore,
  combineProductsWithInteractions,
  analyzeProductData,
  findProductByUrlFuzzy
};      
