// src/pages/FlexMessagePage.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiCall } from '../services/apiCore';
import { socketService } from '../services/socket';
import type { ApiResponse } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';

// Interfaces
interface FlexMessage {
  type: 'bubble' | 'carousel';
  size?: 'nano' | 'micro' | 'kilo' | 'mega' | 'giga';
  header?: FlexBox;
  hero?: FlexBox;
  body?: FlexBox;
  footer?: FlexBox;
  styles?: {
    header?: { backgroundColor?: string; separator?: boolean };
    hero?: { backgroundColor?: string; separator?: boolean };
    body?: { backgroundColor?: string; separator?: boolean };
    footer?: { backgroundColor?: string; separator?: boolean };
  };
}

interface FlexBox {
  type: 'box';
  layout: 'vertical' | 'horizontal' | 'baseline';
  contents: FlexComponent[];
  backgroundColor?: string;
  paddingTop?: string;
  paddingBottom?: string;
  paddingStart?: string;
  paddingEnd?: string;
  paddingAll?: string;
  cornerRadius?: string;
  spacing?: string;
  margin?: string;
  height?: string;
  alignItems?: string;
  justifyContent?: string;
}

interface FlexComponent {
  type: 'text' | 'button' | 'image' | 'icon' | 'separator' | 'spacer' | 'filler' | 'box';
  text?: string;
  color?: string;
  size?: string;
  weight?: string;
  align?: string;
  wrap?: boolean;
  style?: string;
  action?: FlexAction;
  url?: string;
  aspectRatio?: string;
  aspectMode?: string;
  contents?: FlexComponent[];
  layout?: string;
  backgroundColor?: string;
  cornerRadius?: string;
  paddingAll?: string;
  margin?: string;
  height?: string;
  flex?: number;
  offsetStart?: string;
}

interface FlexAction {
  type: 'uri' | 'postback' | 'message';
  label?: string;
  uri?: string;
  data?: string;
  displayText?: string;
}

interface KeywordSettings {
  keywords: string[];
  debugMode: boolean;
  sendTimeout: number; // in milliseconds
}

interface KeywordStats {
  keywordsFoundCount: number;
  flexSentCount: number;
  usersTrackedCount: number;
  lastUpdated: number;
}

interface Alert {
  id: string;
  type: 'success' | 'danger' | 'warning' | 'info';
  message: string;
}

const FlexMessagePage: React.FC = () => {
  // State
  const [activeTab, setActiveTab] = useState<'keyword' | 'flex'>('keyword');
  const [flexEditorTab, setFlexEditorTab] = useState<'visual' | 'json'>('visual');
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  
  // Flex Message State
  const [flexMessage, setFlexMessage] = useState<FlexMessage>({
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "ตัวเลือกการติดต่อ",
          weight: "bold",
          size: "xl",
          color: "#ffffff"
        }
      ],
      backgroundColor: "#27ACB2",
      paddingTop: "lg",
      paddingBottom: "lg",
      paddingStart: "lg",
      paddingEnd: "lg"
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "เลือกตัวเลือกด้านล่างเพื่อดำเนินการต่อ",
          wrap: true,
          color: "#8C8C8C",
          size: "md",
          margin: "md"
        }
      ],
      paddingBottom: "lg"
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          action: {
            type: "postback",
            label: "ปิดใช้งาน AI",
            data: "action=disable_ai",
            displayText: "ต้องการปิดใช้งาน AI"
          },
          color: "#E03C31"
        },
        {
          type: "button",
          style: "secondary",
          action: {
            type: "uri",
            label: "อีเมลติดต่อ",
            uri: "mailto:contact@example.com"
          }
        },
        {
          type: "button",
          action: {
            type: "uri",
            label: "ติดต่อเจ้าหน้าที่",
            uri: "https://lin.ee/PYGV4ZG"
          },
          style: "link"
        }
      ],
      paddingTop: "md"
    },
    styles: {
      footer: {
        separator: true
      }
    }
  });

  const [altText, setAltText] = useState("ข้อมูลการติดต่อและตัวเลือก");
  
  // Keyword State
  const [keywords, setKeywords] = useState<string[]>([
    "คลิกที่ปุ่มด้านล่าง", 
    "กดปุ่มด้านล่าง", 
    "คุยกับแอดมิน", 
    "ปุ่ม"
  ]);
  const [newKeyword, setNewKeyword] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [sendTimeout, setSendTimeout] = useState(12); // hours
  const [keywordStats, setKeywordStats] = useState<KeywordStats>({
    keywordsFoundCount: 0,
    flexSentCount: 0,
    usersTrackedCount: 0,
    lastUpdated: Date.now()
  });

  // Test State
  const [testUserId, setTestUserId] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);

  // JSON Editor
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Refs
  const jsonEditorRef = useRef<HTMLTextAreaElement>(null);

  // Alert management
  const showAlert = useCallback((type: Alert['type'], message: string) => {
    const newAlert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      message
    };
    
    setAlerts(prev => [...prev, newAlert]);
    
    setTimeout(() => {
      setAlerts(prev => prev.filter(alert => alert.id !== newAlert.id));
    }, 5000);
  }, []);

  const dismissAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
  }, []);

  // Load settings from server
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      
      // Load keyword settings
      const keywordResponse: ApiResponse<{ settings: KeywordSettings; stats?: KeywordStats }> = 
        await apiCall('/api/keyword-settings');
      
      if (keywordResponse.success && keywordResponse.data) {
        const { settings, stats } = keywordResponse.data;
        setKeywords(settings.keywords || []);
        setDebugMode(settings.debugMode || false);
        setSendTimeout(Math.floor(settings.sendTimeout / (60 * 60 * 1000))); // Convert ms to hours
        
        if (stats) {
          setKeywordStats(stats);
        }
      }

      // Load flex message
      const flexResponse: ApiResponse<{ flexMessage: FlexMessage; altText?: string }> = 
        await apiCall('/api/custom-flex');
      
      if (flexResponse.success && flexResponse.data) {
        setFlexMessage(flexResponse.data.flexMessage);
        setAltText(flexResponse.data.altText || "ข้อมูลการติดต่อและตัวเลือก");
        updateJsonEditor(flexResponse.data.flexMessage);
      }
    } catch (error: any) {
      console.error('Error loading settings:', error);
      showAlert('danger', `เกิดข้อผิดพลาดในการโหลดข้อมูล: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  // Update JSON editor
  const updateJsonEditor = useCallback((message: FlexMessage) => {
    setJsonText(JSON.stringify(message, null, 2));
    setJsonError(null);
  }, []);

  // Handle JSON change
  const handleJsonChange = useCallback((value: string) => {
    setJsonText(value);
    
    try {
      const parsed = JSON.parse(value);
      setFlexMessage(parsed);
      setJsonError(null);
    } catch (error: any) {
      setJsonError(error.message);
    }
  }, []);

  // Format JSON
  const formatJson = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch (error: any) {
      showAlert('danger', `Invalid JSON format: ${error.message}`);
    }
  }, [jsonText, showAlert]);

  // Save flex message
  const saveFlexMessage = useCallback(async () => {
    try {
      // If in JSON tab, ensure JSON is valid
      if (flexEditorTab === 'json' && jsonError) {
        showAlert('danger', 'กรุณาแก้ไข JSON ให้ถูกต้องก่อนบันทึก');
        return;
      }

      const response: ApiResponse = await apiCall('/api/custom-flex', {
        method: 'POST',
        body: JSON.stringify({
          flexMessage,
          altText
        })
      });

      if (response.success) {
        showAlert('success', 'บันทึก Flex message เรียบร้อยแล้ว!');
      } else {
        throw new Error(response.error || 'Failed to save flex message');
      }
    } catch (error: any) {
      showAlert('danger', `เกิดข้อผิดพลาดในการบันทึก: ${error.message}`);
    }
  }, [flexMessage, altText, flexEditorTab, jsonError, showAlert]);

  // Save keywords
  const saveKeywords = useCallback(async () => {
    try {
      const settings: KeywordSettings = {
        keywords,
        debugMode,
        sendTimeout: sendTimeout * 60 * 60 * 1000 // Convert hours to ms
      };

      // Save keywords
      const keywordResponse: ApiResponse = await apiCall('/api/keywords', {
        method: 'POST',
        body: JSON.stringify({ keywords })
      });

      if (!keywordResponse.success) {
        throw new Error(keywordResponse.error || 'Failed to save keywords');
      }

      // Save debug mode
      const debugResponse: ApiResponse = await apiCall(`/api/keyword-debug/${debugMode}`);

      if (debugResponse.success) {
        showAlert('success', 'การตั้งค่าคำสำคัญถูกบันทึกเรียบร้อยแล้ว!');
      } else {
        throw new Error(debugResponse.error || 'Failed to save debug mode');
      }
    } catch (error: any) {
      showAlert('danger', `เกิดข้อผิดพลาดในการบันทึก: ${error.message}`);
    }
  }, [keywords, debugMode, sendTimeout, showAlert]);

  // Add keyword
  const addKeyword = useCallback(() => {
    const trimmedKeyword = newKeyword.trim();
    if (trimmedKeyword && !keywords.includes(trimmedKeyword)) {
      setKeywords(prev => [...prev, trimmedKeyword]);
      setNewKeyword("");
    }
  }, [newKeyword, keywords]);

  // Remove keyword
  const removeKeyword = useCallback((keywordToRemove: string) => {
    setKeywords(prev => prev.filter(k => k !== keywordToRemove));
  }, []);

  // Reset keywords
  const resetKeywords = useCallback(() => {
    if (window.confirm('คุณแน่ใจหรือไม่ที่จะรีเซ็ตคำสำคัญเป็นค่าเริ่มต้น?')) {
      setKeywords(["คลิกที่ปุ่มด้านล่าง", "กดปุ่มด้านล่าง", "คุยกับแอดมิน", "ปุ่ม"]);
      setDebugMode(false);
      setSendTimeout(12);
    }
  }, []);

  // Test send message
  const testSendMessage = useCallback(async () => {
    if (!testUserId.trim()) {
      showAlert('warning', 'กรุณาระบุ User ID ที่ต้องการทดสอบ');
      return;
    }

    try {
      setTestResult('กำลังส่งข้อความทดสอบ...');
      
      const response: ApiResponse = await apiCall(`/api/keyword-test/${testUserId}`);
      
      if (response.success) {
        setTestResult('ส่งข้อความทดสอบสำเร็จ!');
        showAlert('success', 'ส่งข้อความทดสอบสำเร็จ!');
      } else {
        throw new Error(response.error || 'Failed to send test message');
      }
    } catch (error: any) {
      const errorMessage = `การส่งข้อความล้มเหลว: ${error.message}`;
      setTestResult(errorMessage);
      showAlert('danger', errorMessage);
    }
  }, [testUserId, showAlert]);

  // Socket events
  useEffect(() => {
    const handleKeywordStatus = (data: { status: any; timestamp: number }) => {
      if (data.status) {
        setDebugMode(data.status.debugMode || false);
        setKeywordStats({
          keywordsFoundCount: data.status.keywordsFoundStats || 0,
          flexSentCount: data.status.recentSends || 0,
          usersTrackedCount: data.status.usersTracked || 0,
          lastUpdated: data.timestamp
        });
      }
    };

    const handleTestResult = (data: { success: boolean; message?: string }) => {
      if (data.success) {
        setTestResult('ส่งข้อความทดสอบสำเร็จ!');
        showAlert('success', 'ส่งข้อความทดสอบสำเร็จ!');
      } else {
        const errorMessage = 'การส่งข้อความล้มเหลว';
        setTestResult(errorMessage);
        showAlert('danger', errorMessage);
      }
    };

    socketService.on('keyword_detector_status_response', handleKeywordStatus);
    socketService.on('keyword_test_result', handleTestResult);

    // Request initial status
    socketService.emit('keyword_detector_status');

    return () => {
      socketService.off('keyword_detector_status_response', handleKeywordStatus);
      socketService.off('keyword_test_result', handleTestResult);
    };
  }, [showAlert]);

  // Initial load
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Update JSON when flex message changes
  useEffect(() => {
    if (flexEditorTab === 'visual') {
      updateJsonEditor(flexMessage);
    }
  }, [flexMessage, flexEditorTab, updateJsonEditor]);

  // Render flex preview (simplified version)
  const renderFlexPreview = () => {
    let previewHTML = '';
    
    // Header
    if (flexMessage.header) {
      const headerStyle = `background-color: ${flexMessage.header.backgroundColor || '#ffffff'}; padding: 15px; border-radius: 12px 12px 0 0;`;
      previewHTML += `<div style="${headerStyle}">`;
      
      const headerText = flexMessage.header.contents.find(c => c.type === 'text');
      if (headerText) {
        const textStyle = `color: ${headerText.color || '#000000'}; font-weight: ${headerText.weight || 'normal'}; font-size: ${headerText.size === 'xl' ? '20px' : '16px'}; text-align: center;`;
        previewHTML += `<div style="${textStyle}">${headerText.text}</div>`;
      }
      
      previewHTML += '</div>';
    }
    
    // Body
    if (flexMessage.body) {
      const bodyStyle = `padding: 15px; background-color: ${flexMessage.body.backgroundColor || '#ffffff'};`;
      previewHTML += `<div style="${bodyStyle}">`;
      
      if (flexMessage.body.contents) {
        flexMessage.body.contents.forEach(content => {
          if (content.type === 'text') {
            const textStyle = `color: ${content.color || '#000000'}; font-weight: ${content.weight || 'normal'}; margin-bottom: 10px;`;
            previewHTML += `<div style="${textStyle}">${content.text}</div>`;
          }
        });
      }
      
      previewHTML += '</div>';
    }
    
    // Footer
    if (flexMessage.footer) {
      const separatorStyle = flexMessage.styles?.footer?.separator ? 'border-top: 1px solid #EEEEEE;' : '';
      const footerStyle = `padding: 15px; background-color: ${flexMessage.footer.backgroundColor || '#ffffff'}; ${separatorStyle} border-radius: 0 0 12px 12px;`;
      previewHTML += `<div style="${footerStyle}">`;
      
      if (flexMessage.footer.contents) {
        flexMessage.footer.contents.forEach(content => {
          if (content.type === 'button') {
            let btnStyle = '';
            
            if (content.style === 'primary') {
              btnStyle = `background-color: ${content.color || '#27ACB2'}; color: white; padding: 10px; border-radius: 4px; text-align: center; margin-bottom: 10px; font-weight: bold;`;
            } else if (content.style === 'secondary') {
              btnStyle = `background-color: #F2F2F2; color: #000000; padding: 10px; border-radius: 4px; text-align: center; margin-bottom: 10px; border: 1px solid #DDDDDD;`;
            } else if (content.style === 'link') {
              btnStyle = `background-color: transparent; color: #27ACB2; padding: 10px; text-align: center; margin-bottom: 10px;`;
            }
            
            previewHTML += `<div style="${btnStyle}">${content.action?.label}</div>`;
          }
        });
      }
      
      previewHTML += '</div>';
    }
    
    return { __html: previewHTML };
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-3">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      {/* Header */}
      <div className="row mb-4">
        <div className="col-12">
          <h2 className="mb-4">
            <i className="fas fa-cog me-2"></i>
            LINE รองรับ
          </h2>
          
          {/* Main Tabs */}
          <ul className="nav nav-tabs">
            <li className="nav-item">
              <button 
                className={`nav-link ${activeTab === 'keyword' ? 'active' : ''}`}
                onClick={() => setActiveTab('keyword')}
              >
                <i className="fas fa-key me-2"></i>
                การตั้งค่าคำสำคัญ
              </button>
            </li>
            <li className="nav-item">
              <button 
                className={`nav-link ${activeTab === 'flex' ? 'active' : ''}`}
                onClick={() => setActiveTab('flex')}
              >
                <i className="fas fa-comment-dots me-2"></i>
                Flex Message Editor
              </button>
            </li>
          </ul>
        </div>
      </div>

      {/* Alerts */}
      {alerts.map(alert => (
        <div key={alert.id} className={`alert alert-${alert.type} alert-dismissible fade show mb-3`}>
          {alert.message}
          <button 
            type="button" 
            className="btn-close" 
            onClick={() => dismissAlert(alert.id)}
          ></button>
        </div>
      ))}

      {/* Tab Content */}
      <div className="tab-content">
        {/* Keyword Settings Panel */}
        {activeTab === 'keyword' && (
          <div className="row">
            {/* Keyword Configuration */}
            <div className="col-lg-8">
              <div className="card">
                <div className="card-header d-flex justify-content-between align-items-center" style={{ backgroundColor: '#27ACB2', color: 'white' }}>
                  <span>
                    <i className="fas fa-key me-2"></i>
                    การตั้งค่าคำสำคัญ
                  </span>
                  <div>
                    <button 
                      className="btn btn-sm btn-outline-light me-2"
                      onClick={resetKeywords}
                    >
                      รีเซ็ตค่าเริ่มต้น
                    </button>
                    <button 
                      className="btn btn-sm btn-outline-light"
                      onClick={saveKeywords}
                    >
                      บันทึกการตั้งค่า
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  <div className="mb-4">
                    <h5>คำสำคัญที่จะตรวจจับใน AI</h5>
                    <p className="text-muted">
                      เมื่อ AI ส่งข้อความที่มีคำสำคัญเหล่านี้ ระบบจะส่ง Flex Message ให้ผู้ใช้โดยอัตโนมัติ
                    </p>
                    
                    <div 
                      className="border rounded p-3 mb-3"
                      style={{ minHeight: '100px', backgroundColor: '#f8f9fa' }}
                    >
                      {keywords.map(keyword => (
                        <span key={keyword} className="badge bg-secondary me-2 mb-2">
                          {keyword}
                          <button 
                            type="button"
                            className="btn-close btn-close-white ms-2"
                            style={{ fontSize: '0.7em' }}
                            onClick={() => removeKeyword(keyword)}
                          ></button>
                        </span>
                      ))}
                    </div>
                    
                    <div className="input-group">
                      <input 
                        type="text" 
                        className="form-control"
                        placeholder="เพิ่มคำสำคัญใหม่"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
                      />
                      <button 
                        className="btn"
                        style={{ backgroundColor: '#27ACB2', color: 'white' }}
                        onClick={addKeyword}
                      >
                        <i className="fas fa-plus"></i> เพิ่ม
                      </button>
                    </div>
                  </div>
                  
                  <hr />
                  
                  <div className="mb-4">
                    <h5>ตั้งค่าการตรวจจับ</h5>
                    
                    <div className="form-check form-switch mb-3">
                      <input 
                        className="form-check-input" 
                        type="checkbox"
                        checked={debugMode}
                        onChange={(e) => setDebugMode(e.target.checked)}
                      />
                      <label className="form-check-label">
                        เปิดโหมดดีบัก
                      </label>
                      <small className="text-muted d-block">
                        เมื่อเปิดใช้งาน จะมีการบันทึกข้อมูลการตรวจจับคำสำคัญอย่างละเอียด
                      </small>
                    </div>
                    
                    <div className="mb-3">
                      <label className="form-label">ระยะเวลาห้ามส่งซ้ำ (ชั่วโมง)</label>
                      <input 
                        type="number" 
                        className="form-control"
                        min="1" 
                        max="48"
                        value={sendTimeout}
                        onChange={(e) => setSendTimeout(parseInt(e.target.value) || 1)}
                      />
                      <small className="text-muted">
                        ระยะเวลาที่ระบบจะไม่ส่ง Flex Message ซ้ำให้กับผู้ใช้คนเดิม
                      </small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Statistics and Testing */}
            <div className="col-lg-4">
              <div className="card mb-4">
                <div className="card-header" style={{ backgroundColor: '#27ACB2', color: 'white' }}>
                  <i className="fas fa-chart-bar me-2"></i>
                  สถิติการใช้งาน
                </div>
                <div className="card-body">
                  <div className="row">
                    <div className="col-6 mb-3">
                      <div className="card" style={{ borderLeft: '5px solid #27ACB2' }}>
                        <div className="card-body">
                          <h6 className="card-title text-muted">คำสำคัญที่พบ</h6>
                          <h2>{keywordStats.keywordsFoundCount}</h2>
                        </div>
                      </div>
                    </div>
                    <div className="col-6 mb-3">
                      <div className="card" style={{ borderLeft: '5px solid #27ACB2' }}>
                        <div className="card-body">
                          <h6 className="card-title text-muted">Flex ที่ส่งแล้ว</h6>
                          <h2>{keywordStats.flexSentCount}</h2>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="card mb-3" style={{ borderLeft: '5px solid #27ACB2' }}>
                    <div className="card-body">
                      <h6 className="card-title text-muted">ผู้ใช้ที่กำลังติดตาม</h6>
                      <h2>{keywordStats.usersTrackedCount}</h2>
                      <small className="text-muted">จำนวนผู้ใช้ที่อยู่ในระยะเวลาห้ามส่งซ้ำ</small>
                    </div>
                  </div>
                  <div className="text-muted small">
                    อัปเดตล่าสุด: {new Date(keywordStats.lastUpdated).toLocaleString('th-TH')}
                  </div>
                </div>
              </div>
              
              <div className="card">
                <div className="card-header" style={{ backgroundColor: '#27ACB2', color: 'white' }}>
                  <i className="fas fa-paper-plane me-2"></i>
                  ทดสอบการส่ง Flex Message
                </div>
                <div className="card-body">
                  <div className="mb-3">
                    <label className="form-label">LINE User ID</label>
                    <input 
                      type="text" 
                      className="form-control"
                      placeholder="ระบุ User ID ที่ต้องการทดสอบ"
                      value={testUserId}
                      onChange={(e) => setTestUserId(e.target.value)}
                    />
                  </div>
                  <button 
                    className="btn w-100"
                    style={{ backgroundColor: '#27ACB2', color: 'white' }}
                    onClick={testSendMessage}
                  >
                    <i className="fas fa-paper-plane me-2"></i>
                    ทดสอบส่ง Flex Message
                  </button>
                  {testResult && (
                    <div className={`alert mt-3 ${testResult.includes('สำเร็จ') ? 'alert-success' : 'alert-info'}`}>
                      {testResult}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Flex Message Editor Panel */}
        {activeTab === 'flex' && (
          <div>
            <div className="row mb-3">
              <div className="col-12">
                <div className="d-flex justify-content-end">
                  <button 
                    className="btn btn-outline-primary me-2"
                    onClick={() => setShowTestModal(true)}
                  >
                    <i className="fas fa-paper-plane"></i> ทดสอบส่งข้อความ
                 </button>
                 <button 
                   className="btn"
                   style={{ backgroundColor: '#27ACB2', color: 'white' }}
                   onClick={saveFlexMessage}
                 >
                   <i className="fas fa-save me-2"></i>
                   บันทึกข้อความ
                 </button>
               </div>
             </div>
           </div>

           <div className="row">
             <div className="col-12">
               {/* Flex Editor Tabs */}
               <ul className="nav nav-tabs">
                 <li className="nav-item">
                   <button 
                     className={`nav-link ${flexEditorTab === 'visual' ? 'active' : ''}`}
                     onClick={() => setFlexEditorTab('visual')}
                   >
                     Visual Editor
                   </button>
                 </li>
                 <li className="nav-item">
                   <button 
                     className={`nav-link ${flexEditorTab === 'json' ? 'active' : ''}`}
                     onClick={() => setFlexEditorTab('json')}
                   >
                     JSON Editor
                   </button>
                 </li>
               </ul>
             </div>
           </div>

           <div className="tab-content mt-3">
             {/* Visual Editor Tab */}
             {flexEditorTab === 'visual' && (
               <div className="row">
                 <div className="col-md-8">
                   {/* Phone Preview */}
                   <div 
                     className="d-flex justify-content-center align-items-center"
                     style={{ 
                       backgroundColor: '#ffffff',
                       borderRadius: '8px',
                       border: '1px solid #dee2e6',
                       padding: '20px',
                       minHeight: '400px'
                     }}
                   >
                     <div 
                       style={{
                         width: '320px',
                         height: '580px',
                         backgroundColor: '#f1f1f1',
                         borderRadius: '30px',
                         border: '10px solid #333',
                         position: 'relative',
                         overflow: 'hidden'
                       }}
                     >
                       {/* Phone notch */}
                       <div 
                         style={{
                           position: 'absolute',
                           top: 0,
                           left: '50%',
                           transform: 'translateX(-50%)',
                           width: '150px',
                           height: '25px',
                           backgroundColor: '#333',
                           borderBottomLeftRadius: '10px',
                           borderBottomRightRadius: '10px',
                           zIndex: 1
                         }}
                       ></div>
                       
                       {/* Phone screen */}
                       <div 
                         style={{
                           width: '100%',
                           height: '100%',
                           backgroundColor: '#fff',
                           position: 'relative',
                           overflowY: 'auto'
                         }}
                       >
                         {/* LINE header */}
                         <div 
                           style={{
                             backgroundColor: '#06C755',
                             color: 'white',
                             padding: '10px',
                             textAlign: 'center',
                             fontWeight: 'bold',
                             position: 'sticky',
                             top: 0,
                             zIndex: 1
                           }}
                         >
                           LINE
                         </div>
                         
                         {/* Flex message preview */}
                         <div 
                           style={{
                             margin: '15px',
                             borderRadius: '12px',
                             overflow: 'hidden',
                             boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                           }}
                           dangerouslySetInnerHTML={renderFlexPreview()}
                         ></div>
                       </div>
                     </div>
                   </div>
                 </div>
                 
                 <div className="col-md-4">
                   {/* Properties Panel */}
                   <div className="card">
                     <div className="card-header" style={{ backgroundColor: '#27ACB2', color: 'white' }}>
                       Properties
                     </div>
                     <div className="card-body">
                       <div className="mb-3">
                         <label className="form-label">Bubble Style</label>
                         <select 
                           className="form-select"
                           value={flexMessage.size || 'normal'}
                           onChange={(e) => setFlexMessage(prev => ({ 
                             ...prev, 
                             size: e.target.value as any 
                           }))}
                         >
                           <option value="nano">Nano</option>
                           <option value="micro">Micro</option>
                           <option value="normal">Normal</option>
                           <option value="kilo">Kilo</option>
                           <option value="mega">Mega</option>
                           <option value="giga">Giga</option>
                         </select>
                       </div>
                       
                       <div className="mb-3">
                         <label className="form-label">Alt Text (for notifications)</label>
                         <input 
                           type="text" 
                           className="form-control"
                           value={altText}
                           onChange={(e) => setAltText(e.target.value)}
                         />
                       </div>
                       
                       <hr />
                       
                       <h6>Sections</h6>
                       
                       <div className="form-check form-switch mb-2">
                         <input 
                           className="form-check-input" 
                           type="checkbox"
                           checked={!!flexMessage.header}
                           onChange={(e) => {
                             if (e.target.checked) {
                               setFlexMessage(prev => ({
                                 ...prev,
                                 header: {
                                   type: "box",
                                   layout: "vertical",
                                   contents: [
                                     {
                                       type: "text",
                                       text: "Header",
                                       weight: "bold",
                                       color: "#ffffff"
                                     }
                                   ],
                                   backgroundColor: "#27ACB2",
                                   paddingAll: "lg"
                                 }
                               }));
                             } else {
                               setFlexMessage(prev => {
                                 const { header, ...rest } = prev;
                                 return rest;
                               });
                             }
                           }}
                         />
                         <label className="form-check-label">Header</label>
                       </div>
                       
                       <div className="form-check form-switch mb-2">
                         <input 
                           className="form-check-input" 
                           type="checkbox"
                           checked={!!flexMessage.hero}
                           onChange={(e) => {
                             if (e.target.checked) {
                               setFlexMessage(prev => ({
                                 ...prev,
                                 hero: {
                                   type: "box",
                                   layout: "vertical",
                                   contents: [
                                     {
                                       type: "image",
                                       url: "https://via.placeholder.com/300x150",
                                       size: "full",
                                       aspectRatio: "20:13",
                                       aspectMode: "cover"
                                     }
                                   ]
                                 }
                               }));
                             } else {
                               setFlexMessage(prev => {
                                 const { hero, ...rest } = prev;
                                 return rest;
                               });
                             }
                           }}
                         />
                         <label className="form-check-label">Hero</label>
                       </div>
                       
                       <div className="form-check form-switch mb-2">
                         <input 
                           className="form-check-input" 
                           type="checkbox"
                           checked={!!flexMessage.body}
                           onChange={(e) => {
                             if (e.target.checked) {
                               setFlexMessage(prev => ({
                                 ...prev,
                                 body: {
                                   type: "box",
                                   layout: "vertical",
                                   contents: [
                                     {
                                       type: "text",
                                       text: "Body content here",
                                       wrap: true
                                     }
                                   ],
                                   paddingAll: "lg"
                                 }
                               }));
                             } else {
                               setFlexMessage(prev => {
                                 const { body, ...rest } = prev;
                                 return rest;
                               });
                             }
                           }}
                         />
                         <label className="form-check-label">Body</label>
                       </div>
                       
                       <div className="form-check form-switch mb-2">
                         <input 
                           className="form-check-input" 
                           type="checkbox"
                           checked={!!flexMessage.footer}
                           onChange={(e) => {
                             if (e.target.checked) {
                               setFlexMessage(prev => ({
                                 ...prev,
                                 footer: {
                                   type: "box",
                                   layout: "vertical",
                                   contents: [
                                     {
                                       type: "button",
                                       style: "primary",
                                       action: {
                                         type: "uri",
                                         label: "Action",
                                         uri: "https://example.com"
                                       }
                                     }
                                   ],
                                   paddingAll: "lg"
                                 }
                               }));
                             } else {
                               setFlexMessage(prev => {
                                 const { footer, ...rest } = prev;
                                 return rest;
                               });
                             }
                           }}
                         />
                         <label className="form-check-label">Footer</label>
                       </div>
                     </div>
                   </div>
                 </div>
               </div>
             )}

             {/* JSON Editor Tab */}
             {flexEditorTab === 'json' && (
               <div className="row">
                 <div className="col-md-8">
                   <div className="card">
                     <div className="card-header d-flex justify-content-between align-items-center">
                       <span>JSON Editor</span>
                       <button 
                         className="btn btn-sm btn-outline-primary"
                         onClick={formatJson}
                       >
                         Format JSON
                       </button>
                     </div>
                     <div className="card-body p-0">
                       <textarea 
                         ref={jsonEditorRef}
                         className="form-control border-0"
                         style={{
                           fontFamily: 'monospace',
                           minHeight: '500px',
                           fontSize: '14px',
                           lineHeight: '1.5',
                           resize: 'vertical'
                         }}
                         value={jsonText}
                         onChange={(e) => handleJsonChange(e.target.value)}
                       />
                     </div>
                     {jsonError && (
                       <div className="card-footer">
                         <div className="alert alert-danger mb-0">
                           <small>JSON Error: {jsonError}</small>
                         </div>
                       </div>
                     )}
                   </div>
                 </div>
                 
                 <div className="col-md-4">
                   {/* Help Panel */}
                   <div className="card">
                     <div className="card-header">Help & Tips</div>
                     <div className="card-body">
                       <h6>LINE Flex Message Format</h6>
                       <p className="small">
                         Flex messages use JSON to define their structure and appearance. 
                         Here are some key points:
                       </p>
                       <ul className="small">
                         <li>The root element must be a <code>bubble</code> or <code>carousel</code></li>
                         <li>Each section (header, hero, body, footer) is optional</li>
                         <li>Use <code>box</code> components to group other components</li>
                         <li>Supported components: text, button, image, icon, separator, etc.</li>
                       </ul>
                       
                       <h6>Required Properties</h6>
                       <ul className="small">
                         <li>All components must have a <code>type</code> property</li>
                         <li>Box components must have a <code>layout</code> property</li>
                         <li>Actions require a <code>type</code> and other required fields</li>
                       </ul>
                       
                       <h6>Common Actions</h6>
                       <ul className="small">
                         <li><code>uri</code>: Opens a URL</li>
                         <li><code>postback</code>: Sends data to your server</li>
                         <li><code>message</code>: Sends a text message</li>
                       </ul>
                       
                       <a 
                         href="https://developers.line.biz/en/docs/messaging-api/flex-message-elements/" 
                         target="_blank" 
                         rel="noopener noreferrer"
                         className="btn btn-sm btn-outline-secondary mt-2"
                       >
                         <i className="fas fa-external-link-alt me-1"></i>
                         LINE Flex Documentation
                       </a>
                     </div>
                   </div>
                 </div>
               </div>
             )}
           </div>
         </div>
       )}
     </div>

     {/* Test Message Modal */}
     {showTestModal && (
       <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
         <div className="modal-dialog">
           <div className="modal-content">
             <div className="modal-header">
               <h5 className="modal-title">Test Flex Message</h5>
               <button 
                 type="button" 
                 className="btn-close"
                 onClick={() => setShowTestModal(false)}
               ></button>
             </div>
             <div className="modal-body">
               <div className="mb-3">
                 <label className="form-label">LINE User ID</label>
                 <input 
                   type="text" 
                   className="form-control"
                   placeholder="Enter LINE user ID"
                   value={testUserId}
                   onChange={(e) => setTestUserId(e.target.value)}
                 />
               </div>
               <div className="alert alert-info">
                 <i className="fas fa-info-circle me-2"></i>
                 The flex message will be sent to this user for testing.
               </div>
             </div>
             <div className="modal-footer">
               <button 
                 type="button" 
                 className="btn btn-secondary"
                 onClick={() => setShowTestModal(false)}
               >
                 Cancel
               </button>
               <button 
                 type="button" 
                 className="btn"
                 style={{ backgroundColor: '#27ACB2', color: 'white' }}
                 onClick={() => {
                   testSendMessage();
                   setShowTestModal(false);
                 }}
               >
                 Send Test Message
               </button>
             </div>
           </div>
         </div>
       </div>
     )}
   </div>
 );
};

export default FlexMessagePage;