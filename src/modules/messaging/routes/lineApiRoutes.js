const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../../..');

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_MESSAGING_API = 'https://api.line.me/v2/bot/message/push';

/**
 * API สำหรับส่งข้อความธรรมดาไปหาผู้ใช้
 * POST /api/line/send-message
 * Body: {
 *   userId: string,
 *   message: string
 * }
 */
router.post('/send-message', async (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุ userId และ message'
      });
    }

    const response = await axios.post(
      LINE_MESSAGING_API,
      {
        to: userId,
        messages: [
          {
            type: 'text',
            text: message
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
        }
      }
    );

    res.json({
      success: true,
      message: 'ส่งข้อความสำเร็จ',
      data: response.data
    });
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการส่งข้อความ',
      details: error.response?.data || error.message
    });
  }
});

/**
 * API สำหรับส่ง Flex Message ไปหาผู้ใช้
 * POST /api/line/send-flex
 * Body: {
 *   userId: string,
 *   flexMessage: object (Flex Message JSON)
 * }
 */
router.post('/send-flex', async (req, res) => {
  try {
    const { userId, flexMessage } = req.body;

    if (!userId || !flexMessage) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุ userId และ flexMessage'
      });
    }

    const response = await axios.post(
      LINE_MESSAGING_API,
      {
        to: userId,
        messages: [
          {
            type: 'flex',
            altText: flexMessage.altText || 'Flex Message',
            contents: flexMessage
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
        }
      }
    );

    res.json({
      success: true,
      message: 'ส่ง Flex Message สำเร็จ',
      data: response.data
    });
  } catch (error) {
    console.error('Error sending flex message:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการส่ง Flex Message',
      details: error.response?.data || error.message
    });
  }
});

/**
 * API สำหรับดูรายละเอียดสินค้าที่ขายดี
 * GET /api/line/best-selling-products
 * Query: limit (optional, default: 10)
 */
router.get('/best-selling-products', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const productsDir = path.join(ROOT_DIR, 'products');

    // อ่านไฟล์สินค้าทั้งหมด
    const files = await fs.readdir(productsDir);
    const productFiles = files.filter(file => file.endsWith('.json'));

    if (productFiles.length === 0) {
      return res.json({
        success: true,
        message: 'ไม่พบข้อมูลสินค้า',
        data: []
      });
    }

    // อ่านข้อมูลสินค้าทั้งหมด
    const allProducts = [];
    for (const file of productFiles) {
      const filePath = path.join(productsDir, file);
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);

      if (Array.isArray(data)) {
        allProducts.push(...data);
      } else if (data.products && Array.isArray(data.products)) {
        allProducts.push(...data.products);
      }
    }

    // จัดเรียงตามจำนวนการดู/ความนิยม (ถ้ามี) หรือตามลำดับ
    const sortedProducts = allProducts
      .filter(product => product.name || product.product_name)
      .map(product => ({
        id: product.id || product.product_id,
        name: product.name || product.product_name,
        price: product.price,
        description: product.description,
        image: product.image || product.image_url,
        category: product.category,
        views: product.views || 0,
        sales: product.sales || 0,
        rating: product.rating || 0
      }))
      .sort((a, b) => (b.sales || 0) - (a.sales || 0))
      .slice(0, limit);

    res.json({
      success: true,
      message: 'ดึงข้อมูลสินค้าที่ขายดีสำเร็จ',
      data: sortedProducts,
      total: sortedProducts.length
    });
  } catch (error) {
    console.error('Error getting best selling products:', error.message);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลสินค้า',
      details: error.message
    });
  }
});

/**
 * API สำหรับส่ง Flex Message แสดงสินค้าที่ขายดี
 * POST /api/line/send-best-selling-flex
 * Body: {
 *   userId: string,
 *   limit: number (optional, default: 5)
 * }
 */
router.post('/send-best-selling-flex', async (req, res) => {
  try {
    const { userId, limit = 5 } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุ userId'
      });
    }

    // ดึงข้อมูลสินค้าที่ขายดี
    const productsDir = path.join(ROOT_DIR, 'products');
    const files = await fs.readdir(productsDir);
    const productFiles = files.filter(file => file.endsWith('.json'));

    const allProducts = [];
    for (const file of productFiles) {
      const filePath = path.join(productsDir, file);
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);

      if (Array.isArray(data)) {
        allProducts.push(...data);
      } else if (data.products && Array.isArray(data.products)) {
        allProducts.push(...data.products);
      }
    }

    const bestSellingProducts = allProducts
      .filter(product => product.name || product.product_name)
      .sort((a, b) => (b.sales || 0) - (a.sales || 0))
      .slice(0, limit);

    // สร้าง Flex Message
    const bubbles = bestSellingProducts.map((product, index) => ({
      type: 'bubble',
      hero: product.image || product.image_url ? {
        type: 'image',
        url: product.image || product.image_url,
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover'
      } : undefined,
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `#${index + 1} ${product.name || product.product_name}`,
            weight: 'bold',
            size: 'lg',
            wrap: true
          },
          {
            type: 'box',
            layout: 'baseline',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: product.price ? `฿${product.price}` : 'ราคา: สอบถาม',
                size: 'xl',
                color: '#FF6B6B',
                weight: 'bold'
              }
            ]
          },
          {
            type: 'text',
            text: product.description || 'ไม่มีรายละเอียด',
            size: 'sm',
            color: '#999999',
            margin: 'md',
            wrap: true,
            maxLines: 3
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: `ขายแล้ว: ${product.sales || 0} ชิ้น`,
                size: 'xs',
                color: '#666666'
              },
              {
                type: 'text',
                text: `⭐ ${product.rating || 0}/5`,
                size: 'xs',
                color: '#FFD700',
                align: 'end'
              }
            ]
          }
        ]
      }
    }));

    const flexMessage = {
      type: 'carousel',
      contents: bubbles
    };

    // ส่ง Flex Message
    await axios.post(
      LINE_MESSAGING_API,
      {
        to: userId,
        messages: [
          {
            type: 'flex',
            altText: `🔥 สินค้าขายดี TOP ${limit}`,
            contents: flexMessage
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
        }
      }
    );

    res.json({
      success: true,
      message: 'ส่ง Flex Message สินค้าที่ขายดีสำเร็จ',
      productsCount: bestSellingProducts.length
    });
  } catch (error) {
    console.error('Error sending best selling flex:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการส่ง Flex Message',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
