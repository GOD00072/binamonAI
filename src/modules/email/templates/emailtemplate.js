// ใช้ไลบรารี marked เพื่อแปลง Markdown เป็น HTML
// ในโปรเจกต์จริง ต้องติดตั้งก่อนด้วย: npm install marked
const { marked } = require('marked');

const convertToThaiTime = (date) => {
    if (!(date instanceof Date)) {
        date = new Date(date);
    }
    return new Date(date.getTime() + (7 * 60 * 60 * 1000));
};

const formatDate = (date) => {
    const thaiTime = convertToThaiTime(date);
    return thaiTime.toLocaleString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'UTC'
    });
};

class EmailTemplateGenerator {
    constructor() {
        marked.setOptions({
            gfm: true,
            breaks: true,
            sanitize: true
        });

        // --- SVG Icons ---
        this.icons = {
            userAnalysis: `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>`,
            productInterest: `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <path d="M16 10a4 4 0 0 1-8 0"></path>
                </svg>`,
            overallSummary: `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="9" x2="15" y2="9"></line>
                    <line x1="9" y1="13" x2="15" y2="13"></line>
                    <line x1="9" y1="17" x2="11" y2="17"></line>
                </svg>`,
            conversation: `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>`,
            package: `
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16.5 9.4l-9-5.19"></path>
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>`
        };
    }

    generateEmailSubject(timestamp) {
        return `📊 รายงานการสนทนาลูกค้า | หงษ์ไทยบรรจุภัณฑ์ - ${formatDate(timestamp)}`;
    }

    generateHeader() {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Sarabun', sans-serif;
            line-height: 1.7;
            color: #2c3e50;
            width: 100%;
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        
        .email-container {
            padding: 40px 20px;
        }
        
        .email-wrapper {
            max-width: 900px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.15);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }
        
        .header::before {
            content: '';
            position: absolute;
            top: -50%;
            right: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
            animation: pulse 3s ease-in-out infinite;
        }
        
        @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 0.5; }
            50% { transform: scale(1.1); opacity: 0.8; }
        }
        
        .company-logo {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 20px;
            position: relative;
            z-index: 1;
        }
        
        .company-logo svg {
            margin-right: 15px;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
        }
        
        .company-name {
            font-family: 'Kanit', sans-serif;
            font-size: 32px;
            font-weight: 700;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
            letter-spacing: 1px;
        }
        
        .header h2 { 
            margin: 0 0 10px 0; 
            font-size: 22px; 
            font-weight: 500;
            opacity: 0.95;
            position: relative;
            z-index: 1;
        }
        
        .header .date-time { 
            font-size: 16px;
            opacity: 0.9;
            position: relative;
            z-index: 1;
        }
        
        .content-body { 
            padding: 35px 30px;
            background: #fafbfc;
        }
        
        .stats-overview {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 20px;
            margin-bottom: 35px;
        }
        
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .stat-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        
        .stat-number {
            font-size: 28px;
            font-weight: 700;
            color: #667eea;
            font-family: 'Kanit', sans-serif;
        }
        
        .stat-label {
            font-size: 14px;
            color: #7f8c8d;
            margin-top: 5px;
        }
        
        .user-summary {
            border-radius: 15px;
            margin-bottom: 30px;
            background: white;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0,0,0,0.08);
            transition: transform 0.2s;
        }
        
        .user-summary:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.12);
        }
        
        .user-header {
            display: flex;
            align-items: center;
            padding: 25px;
            background: linear-gradient(135deg, #f5f7fa 0%, #e9ecef 100%);
            border-bottom: 2px solid #e8ecf1;
        }
        
        .user-avatar {
            width: 70px; 
            height: 70px; 
            border-radius: 50%;
            margin-right: 20px; 
            object-fit: cover;
            border: 4px solid #ffffff; 
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        
        .user-info {
            flex: 1;
        }
        
        .user-info .user-name { 
            font-size: 22px; 
            font-weight: 700; 
            color: #2c3e50; 
            margin: 0 0 8px 0;
            font-family: 'Kanit', sans-serif;
        }
        
        .user-info .user-status { 
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        
        .tag {
            display: inline-block; 
            padding: 5px 14px; 
            border-radius: 20px;
            font-size: 13px; 
            font-weight: 600; 
            color: white;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            box-shadow: 0 2px 6px rgba(102, 126, 234, 0.3);
        }
        
        .tag.secondary {
            background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
        }
        
        .tag.success {
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
        }
        
        .analysis-section { 
            padding: 25px;
            background: white;
        }
        
        .analysis-header {
            display: flex; 
            align-items: center;
            font-size: 18px; 
            font-weight: 700; 
            margin-bottom: 20px;
            color: #2c3e50; 
            padding-bottom: 12px; 
            border-bottom: 3px solid #667eea;
            font-family: 'Kanit', sans-serif;
        }
        
        .analysis-header svg { 
            margin-right: 12px; 
            stroke: #667eea; 
        }
        
        .markdown-content { 
            color: #495057; 
            font-size: 16px;
            line-height: 1.8;
        }
        
        .markdown-content h3 { 
            color: #2c3e50; 
            margin-top: 20px; 
            font-size: 17px;
            font-family: 'Kanit', sans-serif;
            font-weight: 600;
        }
        
        .markdown-content ul, .markdown-content ol { 
            padding-left: 25px;
            margin: 15px 0;
        }
        
        .markdown-content li { 
            margin-bottom: 10px;
            line-height: 1.8;
        }
        
        .markdown-content p { 
            margin: 0 0 15px 0; 
        }
        
        .markdown-content strong { 
            color: #667eea; 
            font-weight: 600; 
        }
        
        /* --- Product Table Styles --- */
        .product-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            margin-top: 20px;
            font-size: 15px;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        
        .product-table th, .product-table td {
            text-align: left;
            padding: 14px 16px;
        }
        
        .product-table th {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-weight: 600;
            color: white;
            font-family: 'Kanit', sans-serif;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .product-table tr {
            background: white;
            transition: background 0.2s;
        }
        
        .product-table tbody tr:hover {
            background: #f8f9fa;
        }
        
        .product-table tbody tr:not(:last-child) td {
            border-bottom: 1px solid #e8ecf1;
        }
        
        .product-table td { 
            color: #495057; 
        }
        
        .product-table .product-name-cell { 
            font-weight: 600;
            color: #2c3e50;
        }
        
        .product-table .product-link {
            display: inline-block;
            padding: 6px 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 20px;
            font-weight: 600;
            font-size: 13px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .product-table .product-link:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }
        
        .interactions-cell { 
            text-align: center;
            font-weight: 600;
            color: #667eea;
        }

        .aggregate-summary {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.08);
            margin-top: 30px;
        }
        
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #7f8c8d;
        }
        
        .empty-state svg {
            stroke: #cbd5e0;
            margin-bottom: 20px;
        }
        
        .empty-state h3 {
            font-size: 20px;
            color: #495057;
            margin-bottom: 10px;
            font-family: 'Kanit', sans-serif;
        }
        
        .footer {
            padding: 30px;
            text-align: center;
            color: #7f8c8d;
            font-size: 13px;
            background: linear-gradient(135deg, #f5f7fa 0%, #e9ecef 100%);
            border-top: 1px solid #dee2e6;
        }
        
        .footer-logo {
            margin-bottom: 15px;
        }
        
        .footer-company {
            font-family: 'Kanit', sans-serif;
            font-size: 18px;
            font-weight: 600;
            color: #667eea;
            margin-bottom: 10px;
        }
        
        .footer-tagline {
            font-style: italic;
            color: #95a5a6;
            margin-bottom: 15px;
        }
        
        @media (max-width: 600px) {
            .stats-overview {
                grid-template-columns: 1fr 1fr;
            }
            
            .company-name {
                font-size: 24px;
            }
            
            .user-header {
                flex-direction: column;
                text-align: center;
            }
            
            .user-avatar {
                margin-right: 0;
                margin-bottom: 15px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-wrapper">`;
    }

    generateFooter(timestamp) {
        const thaiYear = convertToThaiTime(new Date()).getFullYear() + 543;
        return `
            <div class="footer">
                <div class="footer-logo">
                    ${this.icons.package}
                </div>
                <div class="footer-company">หงษ์ไทยบรรจุภัณฑ์</div>
                <div class="footer-tagline">"ผู้นำด้านบรรจุภัณฑ์คุณภาพสูง"</div>
                <p>รายงานสร้างขึ้นเมื่อ: ${formatDate(timestamp)}<br>
                &copy; ${thaiYear} บริษัท หงษ์ไทยบรรจุภัณฑ์ จำกัด | ระบบวิเคราะห์การสนทนา</p>
            </div>
        </div>
    </div>
</body>
</html>`;
    }

    formatProductHistory(productHistory) {
        if (!productHistory || productHistory.length === 0) {
            return '';
        }

        const sortedProducts = productHistory.sort((a, b) => (b.total_interactions || 0) - (a.total_interactions || 0));

        const tableRows = sortedProducts.map(product => {
            const productUrl = product.interactions?.[0]?.context?.url || '#';
            return `
                <tr>
                    <td class="product-name-cell">${product.product_name}</td>
                    <td>${product.category}</td>
                    <td class="interactions-cell">${product.total_interactions}</td>
                    <td><a href="${productUrl}" target="_blank" class="product-link">ดูรายละเอียด</a></td>
                </tr>
            `;
        }).join('');

        return `
            <div class="analysis-section">
                <h4 class="analysis-header">${this.icons.productInterest} สินค้าที่ลูกค้าสนใจ</h4>
                <table class="product-table">
                    <thead>
                        <tr>
                            <th>ชื่อสินค้า</th>
                            <th>หมวดหมู่</th>
                            <th style="text-align: center;">จำนวนครั้งที่สนใจ</th>
                            <th>การดำเนินการ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;
    }

    formatIndividualSummary(summary) {
        const defaultAvatar = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(summary.displayName || 'User') + '&background=667eea&color=fff&font-size=0.4&bold=true';
        const avatar = summary.pictureUrl || defaultAvatar;

        const summaryHtml = marked(summary.summary || 'ไม่มีบทสรุป');

        const currentAnalysis = `
        <div class="analysis-section">
            <h4 class="analysis-header">${this.icons.conversation} บทวิเคราะห์การสนทนา</h4>
            <div class="markdown-content">
                ${summaryHtml}
            </div>
        </div>`;

        const productHistoryHtml = this.formatProductHistory(summary.productHistory);

        return `
    <div class="user-summary">
        <div class="user-header">
            <img src="${avatar}" alt="${summary.displayName}" class="user-avatar">
            <div class="user-info">
                <div class="user-name">${summary.displayName}</div>
                <div class="user-status">
                    ${summary.status ? `<span class="tag">${summary.status}</span>` : ''}
                    ${summary.userType ? `<span class="tag success">${summary.userType}</span>` : ''}
                    <span class="tag secondary">${summary.messageCount} ข้อความ</span>
                </div>
            </div>
        </div>
        ${currentAnalysis}
        ${productHistoryHtml}
    </div>`;
    }

    formatAggregateSummary(aggregateSummary) {
        if (!aggregateSummary) return '';

        const summaryHtml = marked(aggregateSummary.summary || 'ไม่มีบทสรุปภาพรวม');

        return `
        <div class="aggregate-summary">
            <h3 class="analysis-header">${this.icons.overallSummary} สรุปภาพรวมการวิเคราะห์</h3>
            <div class="markdown-content">
                ${summaryHtml}
            </div>
        </div>`;
    }

    generateNoActivityTemplate() {
        const timestamp = new Date().toISOString();
        const emailContent = `${this.generateHeader()}
        <div class="header">
            <div class="company-logo">
                ${this.icons.package}
                <div class="company-name">หงษ์ไทยบรรจุภัณฑ์</div>
            </div>
            <h2>📊 รายงานสรุปการสนทนาลูกค้า</h2>
            <p class="date-time">ประจำวันที่: ${formatDate(timestamp)}</p>
        </div>
        <div class="content-body">
            <div class="empty-state">
                ${this.icons.conversation}
                <h3>ไม่มีกิจกรรมใหม่</h3>
                <p>ไม่พบการสนทนาใหม่ในช่วงเวลานี้</p>
            </div>
        </div>
        ${this.generateFooter(timestamp)}`;

        return {
            subject: this.generateEmailSubject(timestamp),
            html: emailContent
        };
    }

    generateComprehensiveEmailTemplate(summaryResults) {
        const timestamp = new Date().toISOString();
        
        // คำนวณสถิติ
        const totalUsers = summaryResults.individual?.length || 0;
        const totalMessages = summaryResults.individual?.reduce((sum, user) => sum + (user.messageCount || 0), 0) || 0;
        const totalProducts = summaryResults.individual?.reduce((sum, user) => {
            return sum + (user.productHistory?.length || 0);
        }, 0) || 0;

        const emailContent = `${this.generateHeader()}
        <div class="header">
            <div class="company-logo">
                ${this.icons.package}
                <div class="company-name">หงษ์ไทยบรรจุภัณฑ์</div>
            </div>
            <h2>📊 รายงานสรุปการสนทนาลูกค้า</h2>
            <p class="date-time">ประจำวันที่: ${formatDate(timestamp)}</p>
        </div>
        <div class="content-body">
            ${totalUsers > 0 ? `
            <div class="stats-overview">
                <div class="stat-card">
                    <div class="stat-number">${totalUsers}</div>
                    <div class="stat-label">ลูกค้าที่สนทนา</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${totalMessages}</div>
                    <div class="stat-label">ข้อความทั้งหมด</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${totalProducts}</div>
                    <div class="stat-label">สินค้าที่สนใจ</div>
                </div>
            </div>` : ''}
            
            ${summaryResults.individual?.length > 0
                ? summaryResults.individual.map(summary => this.formatIndividualSummary(summary)).join('')
                : `<div class="empty-state">
                    ${this.icons.conversation}
                    <h3>ไม่มีการสนทนาใหม่</h3>
                    <p>ไม่พบการสนทนาใหม่ในช่วงเวลานี้</p>
                </div>`}
            
            ${summaryResults.aggregate
                ? this.formatAggregateSummary(summaryResults.aggregate)
                : ''}
        </div>
        ${this.generateFooter(timestamp)}`;

        return {
            subject: this.generateEmailSubject(timestamp),
            html: emailContent
        };
    }
}

module.exports = EmailTemplateGenerator;