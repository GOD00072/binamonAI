// DashboardPage.tsx

import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow, prism } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Import custom SVG icons and theme
import '../styles/theme.css';
import {
  DashboardIcon,
  ProductIcon,
  UserIcon,
  ChatIcon,
  ChartIcon,
  RefreshIcon,
  SearchIcon,
  SettingsIcon,
  WarningIcon,
  CloseIcon,
  ErrorIcon,
  SuccessIcon,
  InfoIcon,
  SendIcon,
  WarningAmberIcon,
  CycloneIcon,
  SmartToyIcon,
  InventoryIcon,
  TrendingUpIcon,
  ReportProblemIcon,
  LocalFireDepartmentIcon,
  SyncIcon
} from '../components/Icons';

// Import modularized components and functions
import { dashboardApi, ragApi, systemApi } from '../services/api';
import { SyncResult, SearchFilters } from './DashboardModels/types';
import { InterestChart, MovementStatusChart, StockLevelChart, StockMovementChart } from './DashboardModels/ChartComponents';
import { ProductTable, SearchForm, SyncProgress } from './DashboardModels/UIComponents';
import { formatHotScore, formatSlowMoveCategory } from './DashboardModels/formatters';

// AI Chat Sidebar Component with AI Mode Selection
const AIChatSidebar: React.FC <{
  show: boolean;
  onHide: () => void;
  initialQuestion?: string;
  productContext?: any;
}> = ({ show, onHide, initialQuestion = '', productContext }) => {
  const [messages, setMessages] = useState<Array<{sender: string, message: string, timestamp: Date}>>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // AI Mode states
  const [currentAIMode, setCurrentAIMode] = useState('QUICK');

  // AI Mode configurations
  const modeConfig = React.useMemo(() => ({
    QUICK: {
      name: 'โหมดตอบเร็ว',
      icon: <ChartIcon size="sm" color="var(--success)" />,
      color: 'var(--success)',
      description: 'เหมาะสำหรับคำถามทั่วไป ตอบเร็วและกระชับ',
      maxProducts: 20
    },
    DEEP: {
      name: 'โหมดคิดลึก',
      icon: <SettingsIcon size="sm" color="var(--primary-blue)" />,
      color: 'var(--primary-blue)',
      description: 'เหมาะสำหรับคำถามซับซ้อน วิเคราะห์รอบด้าน',
      maxProducts: 50
    },
    CREATIVE: {
      name: 'โหมดสร้างสรรค์',
      icon: <DashboardIcon size="sm" color="var(--primary-orange)" />,
      color: 'var(--primary-orange)',
      description: 'เหมาะสำหรับงานสร้างสรรค์ เสนอไอเดียใหม่',
      maxProducts: 30
    }
  }), []);

  // Load current AI mode on component mount
  useEffect(() => {
    if (show) {
      loadCurrentAIMode();
      // Add connection test message
      setMessages([{
        sender: '🔧 System',
        message: 'กำลังทดสอบการเชื่อมต่อกับเซิร์ฟเวอร์ AI...',
        timestamp: new Date()
      }]);

      // Test AI connection
      testAIConnection();
    }
  }, [show]);

  const testAIConnection = async () => {
    try {
      const response = await systemApi.getAIStatus();

      if (response.success) {
        setMessages(prev => prev.slice(0, -1)); // Remove test message
        setMessages(prev => [...prev, {
          sender: '✅ System',
          message: 'เชื่อมต่อเซิร์ฟเวอร์ AI สำเร็จ - พร้อมใช้งาน',
          timestamp: new Date()
        }]);
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error: any) {
      setMessages(prev => prev.slice(0, -1)); // Remove test message
      setMessages(prev => [...prev, {
        sender: '⚠️ System',
        message: `ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ AI ได้\nError: ${error.message}\n\nกรุณาตรวจสอบว่าเซิร์ฟเวอร์ทำงานที่ http://localhost:3001`,
        timestamp: new Date()
      }]);
    }
  };

  const loadCurrentAIMode = async () => {
    try {
      const response = await ragApi.getAIMode();

      if (response.success && response.data) {
        setCurrentAIMode(response.data.currentMode);
      }
    } catch (error) {
      console.warn('Could not load AI mode, using default:', error);
      setCurrentAIMode('QUICK'); // Fallback to default mode
    }
  };


  // Initialize with welcome message and product context
  useEffect(() => {
    if (show && productContext) {
      const welcomeMsg = `🤖 **สวัสดีครับ!** ผมพร้อมตอบคำถามเกี่ยวกับสินค้า **"${productContext.name || productContext.product_name}"** แล้ว

## 📦 ข้อมูลสินค้า
- **SKU:** ${productContext.sku}
- **หมวดหมู่:** ${productContext.category}
- **สต็อก:** ${productContext.stock || productContext.stock_quantity} ชิ้น${productContext.averageRelevance ? `
- **ความสนใจ:** ${(productContext.averageRelevance * 100).toFixed(1)}%` : ''}${productContext.totalInteractions ? `
- **การโต้ตอบ:** ${productContext.totalInteractions} ครั้ง` : ''}

---

💡 **คุณสามารถถามได้เกี่ยวกับ:**
- การจัดการสต็อก
- คำแนะนำการขาย
- การวิเคราะห์ความต้องการ
- กลยุทธ์การตลาด`;
      
      setMessages([{
        sender: '🤖 AI',
        message: welcomeMsg,
        timestamp: new Date()
      }]);

      if (initialQuestion) {
        setCurrentMessage(initialQuestion);
      }
    } else if (show && !productContext) {
      setMessages([{
        sender: '🤖 AI',
        message: `# 👋 สวัสดีครับ! 

ผมพร้อมตอบคำถามเกี่ยวกับสินค้าและสต็อกแล้ว

## 💡 คำแนะนำการใช้งาน:
- **ข้อมูลสินค้า** - ถามเกี่ยวกับรายละเอียดสินค้า
- **สต็อกและการจัดการคลัง** - วิเคราะห์สต็อกและการเคลื่อนไหว  
- **คำแนะนำสินค้า** - แนะนำสินค้าตามความต้องการ
- **การวิเคราะห์ยอดขาย** - วิเคราะห์และพยากรณ์

---

🚀 **เริ่มต้นด้วยการถามคำถาม หรือคลิกปุ่มแนะนำด้านล่าง**

🎯 **โหมดปัจจุบัน:** ${modeConfig[currentAIMode as keyof typeof modeConfig]?.name}`,
        timestamp: new Date()
      }]);
    }
  }, [show, productContext, initialQuestion, currentAIMode, modeConfig]);

  const sendMessage = async () => {
    if (!currentMessage.trim() || isLoading) return;

    const userMessage = currentMessage.trim();
    setCurrentMessage('');
    
    // Add user message
    setMessages(prev => [...prev, {
      sender: '👤 คุณ',
      message: userMessage,
      timestamp: new Date()
    }]);

    // Add loading message with current mode
    setMessages(prev => [...prev, {
      sender: '🤖 AI',
      message: `กำลังคิดในโหมด **${modeConfig[currentAIMode as keyof typeof modeConfig]?.name}**...`,
      timestamp: new Date()
    }]);

    setIsLoading(true);

    try {
      // Add product context to question if available
      let contextualQuestion = userMessage;
      if (productContext) {
        contextualQuestion = `เกี่ยวกับสินค้า "${productContext.name || productContext.product_name}" (SKU: ${productContext.sku}): ${userMessage}`;
      }

      console.log('Sending request with AI mode:', currentAIMode);
      console.log('Question:', contextualQuestion);

      const response = await ragApi.askQuestion({
        question: contextualQuestion,
        aiMode: currentAIMode,
        maxProducts: modeConfig[currentAIMode as keyof typeof modeConfig]?.maxProducts,
        includeContext: true,
        useEnhancedRanking: true,
        filters: {}
      });

      console.log('Response status:', response.status);

      if (!response.success) {
        const errorText = response.error || 'Unknown error';
        console.error('API Error:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = response.data;
      console.log('Response data:', data);

      // Remove loading message
      setMessages(prev => prev.slice(0, -1));

      if (data.success) {
        // Add AI response with mode information
        let aiResponse = data.answer;
        
        // Add mode badge to response
        const modeBadge = `

---
*ตอบโดย: ${modeConfig[data.aiMode as keyof typeof modeConfig]?.name} | โมเดล: ${data.modelUsed || 'Unknown'} | เวลา: ${new Date().toLocaleTimeString('th-TH')}*`;
        
        setMessages(prev => [...prev, {
          sender: '🤖 AI',
          message: aiResponse + modeBadge,
          timestamp: new Date()
        }]);

        // Add relevant products if any
        if (data.relevantProducts && data.relevantProducts.length > 0) {
          let productInfo = `## 📦 สินค้าที่เกี่ยวข้อง (${data.relevantProducts.length} รายการ)

`;
          
          data.relevantProducts.slice(0, currentAIMode === 'QUICK' ? 3 : 5).forEach((product: any, index: number) => {
            productInfo += `### ${index + 1}. ${product.name}
- **SKU:** ${product.sku || 'ไม่ระบุ'}
- **หมวดหมู่:** ${product.category || '-'}
- **สต็อก:** ${product.stock} ชิ้น
- **ความเกี่ยวข้อง:** ${product.relevanceScore}`;
            
            if (product.status) {
              const status = [];
              if (product.status.isHotProduct) status.push('🔥 สินค้าฮิต');
              if (product.status.isLowStock) status.push('⚠️ สต็อกต่ำ');
              if (product.status.isDeadStock) status.push('💀 Dead Stock');
              if (product.status.hasQualityInteractions) status.push('⭐ คุณภาพสูง');
              if (product.status.isFastMoving) status.push('🚀 เคลื่อนไหวเร็ว');
              
              if (status.length > 0) {
                productInfo += `
- **สถานะ:** ${status.join(', ')}`;
              }
            }
            
            productInfo += '\n\n';
          });

          setMessages(prev => [...prev, {
            sender: '🤖 AI',
            message: productInfo,
            timestamp: new Date()
          }]);
        }

        // Add statistics if available
        if (data.statistics) {
          const stats = data.statistics;
          const statsInfo = `## 📊 สถิติการค้นหา

- **หมวดหมู่ที่พบ:** ${stats.byCategory || 'ไม่ระบุ'}
- **สินค้าฮิต:** ${stats.hotProducts || 0} รายการ
- **สต็อกต่ำ:** ${stats.lowStock || 0} รายการ
- **เคลื่อนไหวเร็ว:** ${stats.fastMoving || 0} รายการ
- **คุณภาพโต้ตอบ:** ${stats.qualityInteractions || 0} รายการ
- **คะแนนเฉลี่ย:** ${stats.averageScore || 0}%`;

          setMessages(prev => [...prev, {
            sender: '🤖 AI',
            message: statsInfo,
            timestamp: new Date()
          }]);
        }
      } else {
        const errorMsg = data.answer || data.message || '❌ ขอโทษ ไม่สามารถตอบคำถามได้ในขณะนี้';
        setMessages(prev => [...prev, {
          sender: '🤖 AI',
          message: errorMsg,
          timestamp: new Date()
        }]);

        if (data.suggestion) {
          setMessages(prev => [...prev, {
            sender: '🤖 AI',
            message: `💡 **คำแนะนำ:** ${data.suggestion}`,
            timestamp: new Date()
          }]);
        }
      }

    } catch (error) {
      console.error('Chat error:', error);
      
      // Remove loading message
      setMessages(prev => prev.slice(0, -1));
      
      let errorMessage = `## ⚠️ เกิดข้อผิดพลาด

ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ AI ได้

### 🔧 วิธีแก้ไข:
1. ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต
2. ตรวจสอบว่าเซิร์ฟเวอร์ทำงานที่ 
http://localhost:3001
3. รีเฟรชหน้าเพจและลองใหม่อีกครั้ง

### 📋 รายละเอียดข้อผิดพลาด:`;

      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage += `

- **ปัญหา:** ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้
- **แนะนำ:** ตรวจสอบว่า API Server ทำงานที่ 
localhost:3001
- **CORS:** ตรวจสอบการตั้งค่า Cross-Origin Resource Sharing`;
      } else if (error instanceof Error) {
        errorMessage += `
- **Error:** ${error.message}`;
      }

      setMessages(prev => [...prev, {
        sender: '🤖 AI',
        message: errorMessage,
        timestamp: new Date()
      }]);
    }

    setIsLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const suggestedQuestions = productContext ? [
    'สินค้านี้เหมาะสำหรับอะไร?',
    'มีสินค้าทดแทนไหม?',
    'ควรเติมสต็อกเมื่อไหร่?',
    'ลูกค้าให้ความสนใจมากแค่ไหน?',
    'แนะนำการจัดการสต็อก'
  ] : [
    'มีกล่องเบอร์ G อยู่กี่ชิ้น?',
    'สินค้าไหนที่สต็อกต่ำแต่ขายดี?',
    'แนะนำกล่องสำหรับส่งของเปราะบาง',
    'สินค้าฮิตในเดือนนี้คืออะไร?',
    'มีสินค้า dead stock อะไรบ้าง?'
  ];

  if (!show) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="modal-backdrop"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 1040,
          cursor: 'pointer'
        }}
        onClick={onHide}
      />

      {/* Sidebar */}
      <div
        className="ai-chat-sidebar"
        style={{
          width: '65%',
          minWidth: '600px',
          maxWidth: '900px',
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100%',
          display: 'flex',
          zIndex: 1050,
          flexDirection: 'column',
          background: 'white',
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
          pointerEvents: 'auto',
          transform: show ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease-in-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with AI Mode Selector */}
        <div 
          className="modal-header"
        >
          <div>
            <h5 className="mb-0 d-flex align-items-center gap-2">
              <SettingsIcon size="md" color="white" />
              ผู้ช่วย AI Assistant
            </h5>
            {productContext && (
              <small className="opacity-75 d-flex align-items-center gap-2 mt-1">
                <ChatIcon size="sm" color="white" />
                พูดคุยเกี่ยวกับ: {productContext.name || productContext.product_name}
              </small>
            )}
          </div>
          <button
            className="btn btn-ghost"
            onClick={onHide}
          >
            <CloseIcon size="sm" color="white" />
          </button>
        </div>
          
        {/* Messages */}
        <div 
          className="flex-grow-1 overflow-auto p-3"
          style={{ backgroundColor: '#f8f9fa' }}
        >
          {messages.map((msg, index) => (
            <div 
              key={index} 
              className={`mb-3 d-flex ${msg.sender.includes('User') ? 'justify-content-end' : 'justify-content-start'}`}
            >
              <div 
                className={`p-3 rounded shadow-sm position-relative ${msg.sender.includes('User')
                    ? 'bg-primary-subtle text-dark ms-5'
                    : 'bg-white me-5 border'
                }`}
                style={{ maxWidth: '85%' }}
              >
                {/* Message Header */}
                <div className="fw-bold mb-2 d-flex justify-content-between align-items-center">
                  <span className="d-flex align-items-center">
                    {msg.sender}
                  </span>
                  <small className="opacity-75 text-muted">
                    {msg.timestamp.toLocaleTimeString('th-TH')}
                  </small>
                </div>

                {/* Message Content */}
                <div className="message-content">
                  {msg.message.includes('กำลังคิดในโหมด') ? (
                    <div className="d-flex align-items-center">
                      <div className="loader-3"><div></div><div></div><div></div></div>
                      <ReactMarkdown>{msg.message}</ReactMarkdown>
                    </div>
                  ) : (
                    <div>
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code: ({ node, children, className, ...props }) => {
                            const match = /language-(\w+)/.exec(className || '');
                            const language = match ? match[1] : '';
                            
                            return match ? (
                              <div className="my-3">
                                <SyntaxHighlighter
                                  style={(msg.sender.includes('👤') ? tomorrow : prism) as any}
                                  language={language || 'text'}
                                  PreTag="div"
                                  customStyle={{
                                    margin: 0,
                                    borderRadius: '0.375rem',
                                    fontSize: '0.875rem'
                                  }}
                                >
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              </div>
                            ) : (
                              <code 
                                className={`px-2 py-1 rounded ${msg.sender.includes('👤') 
                                    ? 'bg-primary bg-opacity-25' 
                                    : 'bg-light text-dark'
                                }`}
                                style={{ fontSize: '0.875em' }}
                                {...props}
                              >
                                {children}
                              </code>
                            );
                          },
                          h1: ({ children }) => (
                            <h1 className="h4 mb-3 mt-3 pb-2 border-bottom">{children}</h1>
                          ),
                          h2: ({ children }) => (
                            <h2 className="h5 mb-3 mt-3 text-primary">{children}</h2>
                          ),
                          h3: ({ children }) => (
                            <h3 className="h6 mb-2 mt-2 fw-bold">{children}</h3>
                          ),
                          ul: ({ children }) => (
                            <ul className="mb-3 ps-4">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="mb-3 ps-4">{children}</ol>
                          ),
                          li: ({ children }) => (
                            <li className="mb-1 lh-base">{children}</li>
                          ),
                          p: ({ children }) => (
                            <p className="mb-2 lh-base">{children}</p>
                          ),
                          blockquote: ({ children }) => (
                            <blockquote className={`border-start border-4 ps-3 py-2 my-3 fst-italic ${msg.sender.includes('👤') 
                                ? 'border-primary bg-primary bg-opacity-10' 
                                : 'border-primary bg-light'
                            }`}>
                              {children}
                            </blockquote>
                          ),
                          table: ({ children }) => (
                            <div className="table-responsive my-3">
                              <table className="table table-sm table-striped table-bordered">
                                {children}
                              </table>
                            </div>
                          ),
                          strong: ({ children }) => (
                            <strong className="fw-bold">{children}</strong>
                          ),
                          em: ({ children }) => (
                            <em className="fst-italic">{children}</em>
                          ),
                          hr: () => (
                            <hr className="my-3" />
                          ),
                          a: ({ children, href }) => (
                            <a 
                              href={href} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-primary"
                            >
                              {children}
                            </a>
                          )
                        }}
                      >
                        {msg.message}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Suggested Questions */}
        <div className="p-3 border-top bg-white">
          <small className="text-muted mb-2 d-block fw-bold">
            💡 คำถามแนะนำ:
          </small>
          <div className="d-flex flex-wrap gap-2 mb-3">
            {suggestedQuestions.map((question, index) => (
              <button
                key={index}
                className="btn btn-outline"
                onClick={() => setCurrentMessage(question)}
                disabled={isLoading}
              >
                {question}
              </button>
            ))}
          </div>
        </div>

        {/* Input Section */}
        <div className="p-3 border-top bg-white">
          <div className="d-flex gap-2 align-items-end">
            <div className="flex-grow-1">
              <textarea
                rows={2}
                placeholder={`พิมพ์คำถามของคุณที่นี่... (โหมด: ${modeConfig[currentAIMode as keyof typeof modeConfig]?.name})`}
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
                className="input-field"
                style={{ minHeight: '60px' }}
              />
            </div>
            <div className="d-flex flex-column gap-2">
              <button 
                onClick={sendMessage}
                disabled={!currentMessage.trim() || isLoading}
                className="btn btn-primary btn-icon"
                title={`ส่งใน${modeConfig[currentAIMode as keyof typeof modeConfig]?.name}`}
              >
                {isLoading ? <div className="loader-1"></div> : <SendIcon />}
              </button>
            </div>
          </div>
          <div className="mt-2 d-flex justify-content-between align-items-center">
            <div>
              <small className="text-muted">
                💡 เคล็ดลับ: กด <kbd>Enter</kbd> เพื่อส่ง, <kbd>Shift</kbd>+<kbd>Enter</kbd> เพื่อขึ้นบรรทัดใหม่
              </small>
            </div>
            {currentMessage.length > 0 && (
              <small className="text-muted">
                {currentMessage.length}/1000
              </small>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

const DashboardPage: React.FC = () => {
 const [activeTab, setActiveTab] = useState('dashboard');
 const [loading, setLoading] = useState(false);
 const [data, setData] = useState<any>(null);
 const [error, setError] = useState<string | null>(null);
 
 // Sync states
 const [syncProgress, setSyncProgress] = useState(0);
 const [syncStatus, setSyncStatus] = useState('');
 const [syncLogs, setSyncLogs] = useState<string[]>([]);
 const [showSyncProgress, setShowSyncProgress] = useState(false);
 
 // Search states
 const [searchResults, setSearchResults] = useState<any>(null);
 const [showSearch, setShowSearch] = useState(false);

 // AI Chat states
 const [showAIChat, setShowAIChat] = useState(false);
 const [chatProductContext, setChatProductContext] = useState<any>(null);
 const [chatInitialQuestion, setChatInitialQuestion] = useState('');

 // AI Chat functions
 const openAIChat = (product?: any, initialQuestion?: string) => {
   setChatProductContext(product || null);
   setChatInitialQuestion(initialQuestion || '');
   setShowAIChat(true);
 };

 const closeAIChat = () => {
   setShowAIChat(false);
   setChatProductContext(null);
   setChatInitialQuestion('');
 };

 const loadData = async (endpoint: string, tabKey: string) => {
   setLoading(true);
   setError(null);

   try {
     let result;
     switch (tabKey) {
       case 'dashboard':
         const [dashboardData, slowMoveData] = await Promise.all([
           dashboardApi.getDashboard(),
           dashboardApi.getSlowMoveAnalysis()
         ]);
         result = { ...dashboardData, slowMoveAnalysisData: slowMoveData };
         break;
       case 'products': 
         result = await dashboardApi.getFullAnalysis(); 
         break;
       case 'quality': result = await dashboardApi.getQualityInteractions(); break;
       case 'hot': result = await dashboardApi.getHotProducts(); break;
       case 'slow-move': result = await dashboardApi.getSlowMoveAnalysis(); break;
       case 'movement': result = await dashboardApi.getMovementAnalysis(); break;
       case 'stock-status': result = await dashboardApi.getStockStatus(); break;
       case 'interactions': result = await dashboardApi.getInteractions(); break;
       case 'debug': result = await dashboardApi.getDebugMapping(); break;
       default: result = await dashboardApi.getDashboard();
     }
     setData(result);
     setActiveTab(tabKey);
   } catch (err) {
     setError((err as Error).message);
   } finally {
     setLoading(false);
   }
 };

 const handleSync = async (skus?: string[]) => {
   setShowSyncProgress(true);
   setSyncProgress(0);
   setSyncStatus('กำลังเริ่มต้นการซิงค์...');
   setSyncLogs(['🚀 กำลังเริ่มต้นการซิงโครไนซ์สต็อก...']);
   
   try {
     let result: SyncResult;
     if (skus && skus.length > 0) {
       result = await dashboardApi.syncStock(skus);
     } else {
       result = await dashboardApi.syncAllStock();
     }
     
     setSyncProgress(100);
     setSyncStatus('การซิงค์เสร็จสมบูรณ์!');
     setSyncLogs(prev => [...prev, `✅ ${result.message || 'การซิงค์เสร็จสมบูรณ์'}`]);
     
     if (activeTab) {
       setTimeout(() => loadData('', activeTab), 2000);
     }
   } catch (err) {
     setSyncProgress(0);
     setSyncStatus('การซิงค์ล้มเหลว!');
     setSyncLogs(prev => [...prev, `❌ ข้อผิดพลาด: ${(err as Error).message}`]);
   }
 };

 const handleSearch = async (filters: SearchFilters) => {
   setLoading(true);
   try {
     const result = await dashboardApi.searchProducts(filters);
     setSearchResults(result);
     setActiveTab('search');
   } catch (err) {
     setError((err as Error).message);
   } finally {
     setLoading(false);
   }
 };

 const handleClearSearch = () => {
   setSearchResults(null);
   setShowSearch(false);
   setActiveTab('dashboard');
 };

 useEffect(() => {
   loadData('', 'dashboard');
 }, []);

 // --- RENDER FUNCTIONS FOR EACH TAB ---

 const renderDashboardSummary = () => {
   if (!data || !data.summary) return null;
   
   const { summary, slowMoveAnalysisData } = data;
   const slowMoveProducts = slowMoveAnalysisData?.categories?.slowMove || [];
   const deadStockProducts = slowMoveAnalysisData?.categories?.deadStock || [];
   const slowMoveAlert = (summary.verySlowMove3Count || 0) + (summary.deadStockCount || 0);
   
   return (
     <div>
       {slowMoveAlert > 0 && (
         <div className="alert alert-secondary">
           <WarningAmberIcon />
           <div>
             <h5 style={{ color: 'var(--primary-orange)' }}>แจ้งเตือนสินค้าเคลื่อนไหวช้า</h5>
             <p className="mb-3">มีสินค้า <strong>{slowMoveAlert}</strong> รายการ ที่ไม่มีการขายมาเป็นเวลานาน โปรดตรวจสอบ</p>
             <div className="d-flex gap-2">
               <button 
                 className="btn btn-secondary"
                 onClick={() => loadData('', 'slow-move')}
               >
                 <CycloneIcon size="sm" className="me-2" /> ดูการวิเคราะห์
               </button>
               <button 
                 className="btn btn-outline"
                 onClick={() => openAIChat(null, 'ช่วยวิเคราะห์และแนะนำการจัดการสินค้าเคลื่อนไหวช้า')}
               >
                 <SmartToyIcon size="sm" className="me-2" /> ถาม AI
               </button>
             </div>
           </div>
         </div>
       )}

       {/* Enhanced Statistics Cards */}
       <div className="component-grid mb-4">
         <div className="card text-center">
           <div className="card-body">
             <InventoryIcon style={{ fontSize: '2.5rem', color: 'var(--primary-blue)' }} />
             <h4 style={{ color: 'var(--primary-blue)' }}>{summary.totalProducts?.toLocaleString() || 'N/A'}</h4>
             <div className="text-muted mb-3">สินค้าทั้งหมด</div>
           </div>
         </div>
         <div className="card text-center">
           <div className="card-body">
             <ChatIcon style={{ fontSize: '2.5rem', color: 'var(--primary-orange)' }} />
             <h4 style={{ color: 'var(--primary-orange)' }}>{summary.totalInteractions?.toLocaleString() || 'N/A'}</h4>
             <div className="text-muted mb-3">การโต้ตอบทั้งหมด</div>
           </div>
         </div>
         <div className="card text-center">
           <div className="card-body">
             <TrendingUpIcon style={{ fontSize: '2.5rem', color: 'var(--primary-orange)' }} />
             <h4 style={{ color: 'var(--primary-orange)' }}>{summary.totalSalesVolume?.toLocaleString() || 'N/A'}</h4>
             <div className="text-muted mb-3">ปริมาณการขายทั้งหมด</div>
           </div>
         </div>
       </div>
       
       {/* Enhanced Charts */}
       <div className="component-grid mb-4">
         <div className="card">
           <div className="card-header">
             <h3>การกระจายความสนใจในสินค้า</h3>
           </div>
           <div className="card-body" style={{ height: '350px' }}>
             <InterestChart data={summary} />
           </div>
         </div>
         <div className="card">
           <div className="card-header">
             <h3>สถานะการเคลื่อนไหวของสินค้า</h3>
           </div>
           <div className="card-body" style={{ height: '350px' }}>
             <MovementStatusChart data={summary} />
           </div>
         </div>
         <div className="card">
           <div className="card-header">
             <h3>การกระจายระดับสต็อก</h3>
           </div>
           <div className="card-body" style={{ height: '300px' }}>
             <StockLevelChart data={summary} />
           </div>
         </div>
         <div className="card">
           <div className="card-header">
             <h3>การวิเคราะห์สินค้าเคลื่อนไหวช้า</h3>
           </div>
           <div className="card-body" style={{ height: '300px' }}>
             <StockMovementChart data={summary} />
           </div>
         </div>
       </div>


       <div className="component-grid">
           {slowMoveProducts.length > 0 && (
             <div className="card mb-4">
               <div className="card-header">
                 <h3><CycloneIcon /> สินค้าเคลื่อนไหวช้า (5 อันดับแรก)</h3>
              </div>
              <div className="card-body">
                <ProductTable 
                  data={slowMoveProducts.slice(0, 5)} 
                  loading={false} 
                  showSyncButton={true} 
                  onSync={(sku: string) => handleSync([sku])}
                  showAIButton={true}
                  onAIChat={(product: any) => openAIChat(product, 'ช่วยวิเคราะห์และแนะนำการจัดการสินค้านี้')}
                />
              </div>
            </div>
          )}
          {deadStockProducts.length > 0 && (
            <div className="card mb-4">
              <div className="card-header">
                <h3><ReportProblemIcon /> สินค้าคงคลังตาย (5 อันดับแรก)</h3>
              </div>
              <div className="card-body">
                <ProductTable 
                  data={deadStockProducts.slice(0, 5)} 
                  loading={false} 
                  showSyncButton={true} 
                  onSync={(sku: string) => handleSync([sku])}
                  showAIButton={true}
                  onAIChat={(product: any) => openAIChat(product, 'สินค้านี้เป็น Dead Stock ช่วยแนะนำวิธีการจัดการ')}
                />
              </div>
            </div>
          )}
      </div>

      {data.hotProducts?.length > 0 && (
        <div className="card mb-4">
          <div className="card-header">
            <h3><LocalFireDepartmentIcon /> สินค้าขายดี (10 อันดับแรก)</h3>
          </div>
          <div className="card-body">
            <ProductTable 
              data={Array.isArray(data.hotProducts) ? data.hotProducts.slice(0, 10) : []} 
              loading={false} 
              showSyncButton={true} 
              onSync={(sku: string) => handleSync([sku])}
              showAIButton={true}
              onAIChat={(product: any) => openAIChat(product, 'สินค้านี้เป็นสินค้าฮิต ช่วยแนะนำการจัดการสต็อก')}
            />
          </div>
        </div>
      )}
    </div>
  );
};


const renderAllProductsDetailed = () => {
    if (!data || !data.combinedProducts) {
        return <div className="loader-1"></div>;
    }

    const { combinedProducts, ...summary } = data;

    return (
        <div>
            <div className="card mb-4">
                <div className="card-header">
                    <h3>สรุปผลการวิเคราะห์</h3>
                </div>
                <div className="card-body component-grid">
                    <div><strong>สินค้าทั้งหมด:</strong> {summary.totalProducts?.toLocaleString()}</div>
                    <div><strong>การโต้ตอบทั้งหมด:</strong> {summary.totalInteractions?.toLocaleString()}</div>
                    <div><strong>ปริมาณการขายทั้งหมด:</strong> {summary.totalSalesVolume?.toLocaleString()}</div>
                </div>
            </div>

            {combinedProducts.map((product: any) => (
                <div className="card mb-3" key={product.id}>
                    <div className="card-body">
                        <div className="d-flex justify-content-between align-items-center">
                            <div>
                                <h5>{product.product_name}</h5>
                                <small className="text-muted">SKU: {product.sku}</small>
                            </div>
                            <div>
                                {formatSlowMoveCategory(product.movementAnalysis)}
                                <span className="badge badge-primary ms-2 me-2">สต็อก: {product.stock_quantity}</span>
                                <span className="badge badge-secondary me-2">โต้ตอบ: {product.totalInteractions}</span>
                                {formatHotScore(product.hotScore)}
                                <button 
                                    className="btn btn-primary btn-sm ms-2"
                                    onClick={() => openAIChat(product, 'ช่วยวิเคราะห์สินค้านี้และให้คำแนะนำ')}
                                >
                                    <SmartToyIcon size="sm" className="me-1" /> ถาม AI
                                </button>
                            </div>
                        </div>
                        <hr />
                        <div className="tabs">
                            <button className="tab active">ประวัติการเคลื่อนไหว</button>
                            <button className="tab">{`การโต้ตอบของผู้ใช้ (${product.userCount})`}</button>
                            <button className="tab">สถิติการวิเคราะห์</button>
                        </div>
                        <div>
                            {product.stock_data?.movement_history?.length > 0 ? (
                                <table className="table table-sm table-striped table-bordered">
                                    <thead><tr><th>วันที่</th><th>ประเภท</th><th>เปลี่ยนแปลง</th><th>สต็อกเดิม → ใหม่</th><th>เหตุผล</th></tr></thead>
                                    <tbody>
                                        {product.stock_data.movement_history.slice(0, 10).map((h: any) => (
                                            <tr key={h.id}>
                                                <td>{new Date(h.created_at).toLocaleString()}</td>
                                                <td><span className={`badge ${h.change_type === 'increase' ? 'badge-success' : 'badge-danger'}`}>{h.change_type}</span></td>
                                                <td>{h.change_amount}</td>
                                                <td>{h.old_stock} → {h.new_stock}</td>
                                                <td>{h.reason}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : <p>ไม่มีประวัติการเคลื่อนไหว</p>}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

const renderSlowMoveAnalysis = () => {
  if (!data) return null;
  
  const { summary, categories } = data;
  const criticalCount = (summary.categoryCounts.verySlowMove3 || 0) + (summary.categoryCounts.deadStock || 0);
  
  return (
    <div>
      {criticalCount > 0 && (
        <div className="alert alert-warning">
          <WarningIcon size="md" color="var(--warning)" />
          <div>
            <h5 style={{ color: 'var(--primary-orange)' }}>ต้องการการดูแลอย่างเร่งด่วน</h5>
            <p className="mb-3">มี <strong>{criticalCount}</strong> ผลิตภัณฑ์ที่ต้องการการดูแลอย่างเร่งด่วน</p>
            <ul className="mb-3">
              <li>สินค้าเคลื่อนไหวช้ามาก #3 (151-180 วัน): {summary.categoryCounts.verySlowMove3 || 0} รายการ</li>
              <li>สินค้าคงคลังตาย (&gt;180 วัน): {summary.categoryCounts.deadStock || 0} รายการ</li>
            </ul>
            <button
              className="btn btn-outline"
              onClick={() => openAIChat(null, 'มีสินค้าเคลื่อนไหวช้าจำนวนมาก ช่วยแนะนำกลยุทธ์การจัดการ')}
            >
              <ChatIcon size="sm" /> ถาม AI เกี่ยวกับการจัดการ
            </button>
          </div>
        </div>
      )}
      <div className="component-grid mb-4">
        <div className="card text-center"><div className="card-body"><h4>{summary.totalProducts}</h4><small className="text-muted">สินค้าทั้งหมด</small></div></div>
        <div className="card text-center"><div className="card-body"><h4>{summary.averageDaysSinceRestock}</h4><small className="text-muted">วันเฉลี่ยตั้งแต่เติมสต็อก</small></div></div>
        <div className="card text-center"><div className="card-body"><h4 style={{ color: 'var(--primary-orange)' }}>{summary.categoryCounts.slowMove || 0}</h4><small className="text-muted">เคลื่อนไหวช้า</small></div></div>
        <div className="card text-center"><div className="card-body"><h4 style={{ color: 'var(--primary-orange)' }}>{summary.categoryCounts.deadStock || 0}</h4><small className="text-muted">สินค้าคงคลังตาย</small></div></div>
      </div>
      {Object.entries(categories).map(([categoryKey, products]: [string, any]) => {
        if (!products || products.length === 0) return null;
        const labels: Record<string, string> = { 
          'normal': '✅ ปกติ (≤60 วัน)', 
          'slowMove': '⚠️ สินค้าเคลื่อนไหวช้า (61-90 วัน)', 
          'verySlowMove1': '🔶 ช้ามาก #1 (91-120 วัน)', 
          'verySlowMove2': '🔸 ช้ามาก #2 (121-150 วัน)', 
          'verySlowMove3': '🔺 ช้ามาก #3 (151-180 วัน)', 
          'deadStock': '💀 สินค้าคงคลังตาย (&gt;180 วัน)' 
        };
        return (
          <div className="card mb-3" key={categoryKey}>
            <div className="card-header">
                <h3 className="section-title">{labels[categoryKey] || categoryKey} <span className="badge badge-secondary">{products.length} รายการ</span></h3>
            </div>
            <div className="card-body">
              <ProductTable 
                data={products.slice(0, 20)} 
                loading={false} 
                showSyncButton={true} 
                onSync={(sku: string) => handleSync([sku])}
                showAIButton={true}
                onAIChat={(product: any) => openAIChat(product, `สินค้านี้อยู่ในกลุ่ม ${labels[categoryKey]} ช่วยแนะนำวิธีการจัดการ`)}
              />
              {products.length > 20 && <p className="text-muted">แสดง 20 รายการแรกจากทั้งหมด {products.length} รายการ</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const renderSearchResults = () => {
  if (!searchResults) return null;
  const products = searchResults.data || searchResults;
  const filters = searchResults.filters || {};
  return (
    <div>
      <h2 className="section-title d-flex align-center gap-2">
        <SearchIcon size="md" color="var(--primary-blue)" />
        ผลการค้นหา ({Array.isArray(products) ? products.length : 0} รายการ)
      </h2>
      {Object.keys(filters).length > 0 && (
        <div className="card mb-3">
            <div className="card-header">
                <h3>สรุปผลการกรอง</h3>
            </div>
            <div className="card-body">
                <table className="table table-sm">
                    <tbody>
                        {filters.qualityInteractions !== undefined && (<tr><td>การโต้ตอบคุณภาพ (&gt;0.25)</td><td>{filters.qualityInteractions}</td></tr>)}
                        {filters.highInterest !== undefined && (<><tr><td>ความสนใจสูง</td><td>{filters.highInterest}</td></tr><tr><td>ความสนใจปานกลาง</td><td>{filters.mediumInterest}</td></tr><tr><td>ความสนใจต่ำ</td><td>{filters.lowInterest}</td></tr><tr><td>ไม่มีความสนใจ</td><td>{filters.noInterest}</td></tr></>)}
                    </tbody>
                </table>
            </div>
        </div>
      )}
      <ProductTable 
        data={Array.isArray(products) ? products : []} 
        loading={false} 
        showSyncButton={true} 
        onSync={(sku: string) => handleSync([sku])}
        showAIButton={true}
        onAIChat={(product: any) => openAIChat(product, 'ช่วยวิเคราะห์สินค้านี้และให้คำแนะนำ')}
      />
    </div>
  );
};

const renderInteractions = () => {
  if (!data || !data.users) {
    return <div className="alert alert-primary">ไม่มีข้อมูลการโต้ตอบ</div>;
  }
  
  const users = Object.values(data.users);
  const summary = data.summary;

  return (
    <div>
      {summary && (
        <div className="component-grid mb-4">
          <div className="card text-center"><div className="card-body"><h4>{summary.totalUsers}</h4><small className="text-muted">ผู้ใช้ทั้งหมด</small></div></div>
          <div className="card text-center"><div className="card-body"><h4>{summary.totalInteractions}</h4><small className="text-muted">การโต้ตอบทั้งหมด</small></div></div>
          <div className="card text-center"><div className="card-body"><h4>{summary.uniqueProducts}</h4><small className="text-muted">จำนวนสินค้าที่มีการโต้ตอบ</small></div></div>
        </div>
      )}

      {users.map((user: any, index: number) => (
          <div className="card mb-3" key={user.userId}>
            <div className="card-body">
                <div className="d-flex w-100 justify-content-between align-items-center">
                    <span className="text-monospace">ผู้ใช้: {user.userId}</span>
                    <div>
                        <span className="badge badge-primary me-2">{user.totalProducts} สินค้า</span>
                        <span className="badge badge-secondary">{user.stats?.totalInteractions || 0} การโต้ตอบ</span>
                    </div>
                </div>
                <hr />
                <h6>รายละเอียดการโต้ตอบ</h6>
                <table className="table table-striped table-bordered table-sm">
                    <thead>
                    <tr>
                        <th>ชื่อสินค้า</th>
                        <th>หมวดหมู่</th>
                        <th>การโต้ตอบ</th>
                        <th>ความเกี่ยวข้องเฉลี่ย</th>
                        <th>เห็นล่าสุด</th>
                        <th>จัดการ</th>
                    </tr>
                    </thead>
                    <tbody>
                    {Object.values(user.products).map((product: any) => (
                        <tr key={product.id}>
                        <td>{product.product_name}</td>
                        <td>{product.category}</td>
                        <td>{product.total_interactions}</td>
                        <td>{product.average_relevance.toFixed(3)}</td>
                        <td>{new Date(product.last_seen).toLocaleString()}</td>
                        <td>
                            <button 
                            className="btn btn-primary btn-sm"
                            onClick={() => openAIChat(product, `ช่วยวิเคราะห์การโต้ตอบของผู้ใช้ ${user.userId} กับสินค้านี้`)}
                            >
                                <SmartToyIcon size="sm" className="me-1" /> ถาม AI
                            </button>
                        </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
          </div>
        ))}
    </div>
  );
};

const renderStockStatus = () => {
    if (!data) {
        return <div className="loader-1"></div>;
    }
    
    const { totalProducts, storedStockFiles, missingStockData, outdatedStockData, recentlyUpdated } = data;
    const syncPercentage = totalProducts > 0 ? (storedStockFiles / totalProducts) * 100 : 0;

    return (
        <div>
            <div className="card mb-4">
                <div className="card-header">
                    <h2 className="section-title">ภาพรวมการซิงค์สต็อก</h2>
                </div>
                <div className="card-body">
                    <div className="component-grid text-center mb-3">
                        <div><h5>{totalProducts}</h5><p className="text-muted">สินค้าทั้งหมด</p></div>
                        <div><h5 className="text-success">{storedStockFiles}</h5><p className="text-muted">สินค้าที่ซิงค์แล้ว</p></div>
                        <div><h5 className="text-warning">{missingStockData?.length || 0}</h5><p className="text-muted">ไม่มีข้อมูล</p></div>
                        <div><h5 className="text-info">{outdatedStockData?.length || 0}</h5><p className="text-muted">ข้อมูลล้าสมัย</p></div>
                    </div>
                    <div className="progress mb-3">
                        <div className="progress-bar" style={{ width: `${syncPercentage}%` }}>{`${syncPercentage.toFixed(1)}% ซิงค์แล้ว`}</div>
                    </div>
                    <div className="text-center">
                      <button 
                        className="btn btn-outline" 
                        onClick={() => openAIChat(null, 'ช่วยวิเคราะห์สถานะการซิงค์สต็อกและให้คำแนะนำ')}
                      >
                        <SmartToyIcon size="sm" className="me-1" /> ถาม AI เกี่ยวกับการซิงค์
                      </button>
                    </div>
                </div>
            </div>

            <div className="component-grid">
                <div className="card mb-3">
                    <div className="card-header">
                        <h3 className="section-title">⚠️ ไม่มีข้อมูลสต็อก ({missingStockData?.length || 0})</h3>
                    </div>
                    <div className="card-body">
                        {missingStockData?.length > 0 ? (
                            <table className="table table-striped table-sm">
                                <thead><tr><th>SKU</th><th>ชื่อสินค้า</th><th>จัดการ</th></tr></thead>
                                <tbody>
                                    {missingStockData.map((p: any) => (
                                        <tr key={p.sku}>
                                            <td><code>{p.sku}</code></td>
                                            <td>{p.productName}</td>
                                            <td>
                                                <div className="d-flex gap-1">
                                                    <button className="btn btn-primary btn-sm" onClick={() => handleSync([p.sku])}>
                                                        <SyncIcon size="sm" className="me-1" /> ซิงค์
                                                    </button>
                                                    <button 
                                                      className="btn btn-secondary btn-sm" 
                                                      onClick={() => openAIChat(p, 'สินค้านี้ยังไม่มีข้อมูลสต็อก ช่วยแนะนำวิธีการจัดการ')}
                                                    >
                                                      <SmartToyIcon size="sm" className="me-1" /> AI
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <div className="alert alert-success">✅ สินค้าทั้งหมดมีข้อมูลสต็อกที่ซิงค์แล้ว!</div>}
                    </div>
                </div>
                <div className="card mb-3">
                    <div className="card-header">
                        <h3 className="section-title">🔄 อัปเดตล่าสุด ({recentlyUpdated?.length || 0})</h3>
                    </div>
                    <div className="card-body">
                        {recentlyUpdated?.length > 0 ? (
                            <table className="table table-striped table-sm">
                                <thead><tr><th>SKU</th><th>ชื่อสินค้า</th><th>อัปเดตล่าสุด</th></tr></thead>
                                <tbody>
                                    {recentlyUpdated.map((p: any) => (
                                        <tr key={p.sku}>
                                            <td><code>{p.sku}</code></td>
                                            <td>{p.productName}</td>
                                            <td><span className="badge badge-success">{p.hoursAgo} ชั่วโมงที่แล้ว</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <p>ไม่มีการอัปเดตล่าสุด</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};

const renderContent = () => {
  if (loading) return <div className="loader-1"></div>;
  if (error) return <div className="alert alert-danger">❌ ข้อผิดพลาด: {error}</div>;
  
  const productListData = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);

  switch (activeTab) {
    case 'dashboard': return renderDashboardSummary();
    case 'products': return renderAllProductsDetailed();
    case 'quality': return (
      <div>
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2 className="section-title">🎯 สินค้าที่มีการโต้ตอบคุณภาพสูง</h2>
          <button 
            className="btn btn-primary" 
            onClick={() => openAIChat(null, 'ช่วยวิเคราะห์สินค้าที่มีการโต้ตอบคุณภาพสูงและให้คำแนะนำ')}
          >
            <SmartToyIcon size="sm" className="me-1" /> ถาม AI
          </button>
        </div>
        {data?.summary && <div className="component-grid mb-3">
            <div className="card text-center"><div className="card-body"><h4>{data.summary.totalQualityProducts}</h4><small className="text-muted">สินค้าคุณภาพสูง</small></div></div>
            <div className="card text-center"><div className="card-body"><h4>{data.summary.averageRelevance}</h4><small className="text-muted">ความเกี่ยวข้องโดยเฉลี่ย</small></div></div>
            <div className="card text-center"><div className="card-body"><h4>{data.summary.totalInteractions}</h4><small className="text-muted">การโต้ตอบทั้งหมด</small></div></div>
            <div className="card text-center"><div className="card-body"><h4>{data.summary.averageSalesVelocity}</h4><small className="text-muted">ความเร็วในการขายเฉลี่ย</small></div></div>
          </div>}
        <ProductTable 
          data={productListData} 
          loading={false} 
          showSyncButton={true} 
          onSync={(sku: string) => handleSync([sku])}
          showAIButton={true}
          onAIChat={(product: any) => openAIChat(product, 'สินค้านี้มีการโต้ตอบคุณภาพสูง ช่วยวิเคราะห์และแนะนำ')}
        />
      </div>
    );
    case 'hot': return (
      <div>
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2 className="section-title">🔥 สินค้าขายดี</h2>
          <button 
            className="btn btn-primary" 
            onClick={() => openAIChat(null, 'ช่วยวิเคราะห์สินค้าฮิตและแนะนำกลยุทธ์การจัดการ')}
          >
            <SmartToyIcon size="sm" className="me-1" /> ถาม AI
          </button>
        </div>
        {data?.summary && <div className="component-grid mb-3">
            <div className="card text-center"><div className="card-body"><h4>{data.summary.totalHotProducts}</h4><small className="text-muted">สินค้าขายดีทั้งหมด</small></div></div>
            <div className="card text-center"><div className="card-body"><h4>{data.summary.averageHotScore}</h4><small className="text-muted">คะแนนเฉลี่ย</small></div></div>
            <div className="card text-center"><div className="card-body"><h4>{data.summary.totalSalesVolume}</h4><small className="text-muted">ยอดขายรวม</small></div></div>
            <div className="card text-center"><div className="card-body"><h4>{data.summary.recentActivityCount}</h4><small className="text-muted">กิจกรรมล่าสุด</small></div></div>
          </div>}
        <ProductTable 
          data={productListData} 
          loading={false} 
          showSyncButton={true} 
          onSync={(sku: string) => handleSync([sku])}
          showAIButton={true}
          onAIChat={(product: any) => openAIChat(product, 'สินค้านี้เป็นสินค้าฮิต ช่วยแนะนำการจัดการสต็อกและการขาย')}
        />
      </div>
    );
    case 'slow-move': return renderSlowMoveAnalysis();
    case 'interactions': return renderInteractions();
    case 'stock-status': return renderStockStatus();
    case 'search': return renderSearchResults();
    case 'movement': return (
      <div>
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2 className="section-title">📈 การวิเคราะห์การเคลื่อนไหว</h2>
          <button 
            className="btn btn-primary" 
            onClick={() => openAIChat(null, 'ช่วยวิเคราะห์การเคลื่อนไหวของสินค้าและให้คำแนะนำ')}
          >
            <SmartToyIcon size="sm" className="me-1" /> ถาม AI
          </button>
        </div>
        {data?.totalProducts && <div className="component-grid mb-3">
            <div className="card text-center"><div className="card-body"><h4>{data.totalProducts}</h4><small className="text-muted">สินค้าทั้งหมด</small></div></div>
            <div className="card text-center"><div className="card-body"><h4>{data.productsWithMovement}</h4><small className="text-muted">มีการเคลื่อนไหว</small></div></div>
            <div className="card text-center"><div className="card-body"><h4>{data.totalSalesVolume}</h4><small className="text-muted">ยอดขายรวม</small></div></div>
            <div className="card text-center"><div className="card-body"><h4>{data.averageSalesVelocity}</h4><small className="text-muted">ความเร็วเฉลี่ย</small></div></div>
          </div>}
        {data?.movementLevels && (
          <div className="component-grid mb-4">
            {Object.entries(data.movementLevels).map(([level, stats]: [string, any]) => (
              <div className="card text-center" key={level}>
                <div className="card-body">
                  <h5>{stats.count}</h5>
                  <small className="text-muted">{level} เคลื่อนไหว</small>
                  <div><small>ความเร็วเฉลี่ย: {stats.avgVelocity}</small></div>
                </div>
              </div>
            ))}
          </div>
        )}
        {data?.topMovers && (
          <div className="card">
            <div className="card-header">
                <h3 className="section-title">🏆 สินค้าที่เคลื่อนไหวเร็วที่สุด</h3>
            </div>
            <div className="card-body">
              <ProductTable 
                data={data.topMovers} 
                loading={false} 
                showSyncButton={true} 
                onSync={(sku: string) => handleSync([sku])}
                showAIButton={true}
                onAIChat={(product: any) => openAIChat(product, 'สินค้านี้มีการเคลื่อนไหวสูง ช่วยวิเคราะห์แนวโน้ม')}
              />
            </div>
          </div>
        )}
      </div>
    );
    case 'debug': return (
      <div>
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2 className="section-title d-flex align-center gap-2">
            <SearchIcon size="md" color="var(--primary-blue)" />
            ข้อมูลการดีบักการแมปข้อมูล
          </h2>
          <button
            className="btn btn-primary"
            onClick={() => openAIChat(null, 'ช่วยวิเคราะห์ปัญหาการแมปข้อมูลและให้คำแนะนำ')}
          >
            <ChatIcon size="sm" /> ถาม AI
          </button>
        </div>
        {data?.stats && (
          <div className="component-grid mb-4">
            <div className="card text-center"><div className="card-body"><h4>{data.stats.totalProducts}</h4><small className="text-muted">สินค้าทั้งหมด</small></div></div>
            <div className="card text-center"><div className="card-body"><h4>{data.stats.productsWithUrl}</h4><small className="text-muted">มี URL</small></div></div>
            <div className="card text-center"><div className="card-body"><h4>{data.stats.matchedUrls}</h4><small className="text-muted">URL ตรงกัน</small></div></div>
            <div className="card text-center"><div className="card-body"><h4>{data.stats.matchRate}</h4><small className="text-muted">อัตราการตรงกัน</small></div></div>
          </div>
        )}
        {data?.sampleProducts && (
          <div className="card mb-3">
            <div className="card-header">
                <h3 className="section-title d-flex align-center gap-2">
                  <ProductIcon size="md" color="var(--primary-blue)" />
                  ตัวอย่างสินค้า
                </h3>
            </div>
            <div className="card-body">
              <table className="table table-striped table-sm">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>ชื่อ</th>
                    <th>SKU</th>
                    <th>สต็อก</th>
                    <th>มีข้อมูลสต็อก</th>
                    <th>URL</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sampleProducts.map((product: any) => (
                    <tr key={product.id}>
                      <td>{product.id}</td>
                      <td>{product.name}</td>
                      <td><code>{product.sku}</code></td>
                      <td>{product.stock}</td>
                      <td>
                        {product.hasStoredStock ?
                          <SuccessIcon size="sm" color="var(--success)" /> :
                          <ErrorIcon size="sm" color="var(--danger)" />
                        }
                      </td>
                      <td><small>{product.url}</small></td>
                      <td>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openAIChat(product, 'ช่วยวิเคราะห์การแมปข้อมูลของสินค้านี้')}
                        >
                          <ChatIcon size="sm" /> ถาม AI
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
    default: return <div>เนื้อหาสำหรับ {activeTab}</div>;
  }
};

return (
  <div className="page-container">
    <div className="d-flex align-center gap-3 mb-4">
      <DashboardIcon size="lg" color="var(--primary-blue)" />
      <div>
        <h1>แดชบอร์ดวิเคราะห์ข้อมูลสินค้า</h1>
        <p className="subtitle">ระบบวิเคราะห์และจัดการข้อมูลสินค้าพร้อม AI Assistant</p>
      </div>
    </div>
    
    <div className="section">
        <h2 className="section-title d-flex align-center gap-2">
          <RefreshIcon size="md" color="var(--primary-blue)" />
          การซิงโครไนซ์สต็อกสินค้า
        </h2>
        <p className="mb-3">จัดการข้อมูลสต็อกและบันทึกลงในไฟล์เพื่อลดการเรียก API</p>
        <div className="d-flex gap-2 mb-3 flex-wrap">
          <button className="btn btn-primary" onClick={() => handleSync()}>
            <RefreshIcon size="sm" /> ซิงค์สินค้าทั้งหมด
          </button>
          <button className="btn btn-secondary" onClick={() => loadData('', 'stock-status')}>
            <ChartIcon size="sm" /> ตรวจสอบสถานะสต็อก
          </button>
          <button
            className="btn btn-outline"
            onClick={() => openAIChat()}
          >
            <ChatIcon size="sm" /> เปิดแชท AI (ทั่วไป)
          </button>
        </div>
        {showSyncProgress && <SyncProgress show={showSyncProgress} progress={syncProgress} status={syncStatus} logs={syncLogs} />}
    </div>

    <div className="tabs">
        <button className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => loadData('', 'dashboard')}>
          <DashboardIcon size="sm" className="mr-2" />แดชบอร์ด
        </button>
        <button className={`tab ${activeTab === 'products' ? 'active' : ''}`} onClick={() => loadData('', 'products')}>
          <ProductIcon size="sm" className="mr-2" />สินค้าทั้งหมด
        </button>
        <button className={`tab ${activeTab === 'quality' ? 'active' : ''}`} onClick={() => loadData('', 'quality')}>
          <SuccessIcon size="sm" className="mr-2" />โต้ตอบคุณภาพสูง
        </button>
        <button className={`tab ${activeTab === 'hot' ? 'active' : ''}`} onClick={() => loadData('', 'hot')}>
          <ChartIcon size="sm" className="mr-2" />สินค้าขายดี
        </button>
        <button className={`tab ${activeTab === 'slow-move' ? 'active' : ''}`} onClick={() => loadData('', 'slow-move')}>
          <WarningIcon size="sm" className="mr-2" />วิเคราะห์เคลื่อนไหวช้า
        </button>
        <button className={`tab ${activeTab === 'movement' ? 'active' : ''}`} onClick={() => loadData('', 'movement')}>
          <ChartIcon size="sm" className="mr-2" />วิเคราะห์การเคลื่อนไหว
        </button>
        <button className={`tab ${activeTab === 'interactions' ? 'active' : ''}`} onClick={() => loadData('', 'interactions')}>
          <UserIcon size="sm" className="mr-2" />โต้ตอบผู้ใช้
        </button>
        <button className={`tab ${activeTab === 'stock-status' ? 'active' : ''}`} onClick={() => loadData('', 'stock-status')}>
          <InfoIcon size="sm" className="mr-2" />สถานะสต็อก
        </button>
        <button className={`tab ${activeTab === 'debug' ? 'active' : ''}`} onClick={() => loadData('', 'debug')}>
          <SearchIcon size="sm" className="mr-2" />ดีบักข้อมูล
        </button>
    </div>

    <div className="section">
        <div className="mb-3 d-flex gap-2 flex-wrap">
            <button
                className="btn btn-outline"
                onClick={() => setShowSearch(!showSearch)}
            >
                <SearchIcon size="sm" /> ค้นหาขั้นสูง
            </button>
            <button className="btn btn-ghost" onClick={() => loadData('', activeTab)}>
                <RefreshIcon size="sm" /> รีเฟรช
            </button>
        </div>

        {showSearch && <SearchForm onSearch={handleSearch} onClear={handleClearSearch} />}

        <div>
            {renderContent()}
        </div>
    </div>


    {/* AI Chat Sidebar with AI Mode Selection */}
    <AIChatSidebar 
      show={showAIChat} 
      onHide={closeAIChat}
      initialQuestion={chatInitialQuestion}
      productContext={chatProductContext}
    />
  </div>
);
}; 

export default DashboardPage;
