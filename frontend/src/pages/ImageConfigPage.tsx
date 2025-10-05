// src/pages/ImageConfigPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Card, Form, Button, Alert, Badge, Spinner, Tab, Tabs, Table, Modal } from 'react-bootstrap';
import LoadingSpinner from '../components/LoadingSpinner';
import ImageAIModelModal from '../components/ImageAIModelModal';
import { imageApi } from '../services/api';

// --- Interfaces (No changes) ---
interface ImageConfig {
 promptTemplate: string;
 maxBatchSize: number;
 batchTimeout: number;
 minImageGap: number;
 commentLookbackWindow: number;
 maxCommentLength: number;
 activeBatches?: number;
 currentModel?: string;
 modelInfo?: {
   name: string;
   displayName:string;
   description: string;
   version: string;
   inputTokenLimit: number;
   outputTokenLimit: number;
   isVisionCapable?: boolean;
 };
}

interface SystemHealth {
 status: 'healthy' | 'degraded' | 'error';
 model?: string;
 maxImageSize?: string;
 activeBatches?: number;
 initialized?: boolean;
 availableModels?: number;
 supportedFormats?: string[];
 promptTemplate?: string;
 batchingConfig?: {
   batchTimeout: number;
   maxBatchSize: number;
   minImageGap: number;
 };
 commentConfig?: {
   lookbackWindow: string;
   maxCommentLength: number;
 };
}

interface ImageStats {
 uploadedCount: number;
 processedCount: number;
 storageUsage: number;
 totalFiles?: number;
}

interface CleanupResult {
 uploadsCleaned: number;
 processedCleaned: number;
 totalCleaned: number;
 message: string;
}
const ImageConfigPage: React.FC = () => {
 const [activeTab, setActiveTab] = useState<string>('overview');
 
 // States (No changes)
 const [config, setConfig] = useState<ImageConfig>({
   promptTemplate: 'ช่วยอธิบายรูปภาพนี้อย่างละเอียด โดยระบุว่าเป็นบรรจุภัณฑ์ประเภทไหน มีลักษณะอย่างไร มีขนาดและรูปทรงใด หากเป็นกล่อง ให้อธิบายว่าเป็นกล่องประเภทไหน ทำจากวัสดุอะไร และเหมาะกับใส่สินค้าประเภทใด',
   maxBatchSize: 5,
   batchTimeout: 20000,
   minImageGap: 5000,
   commentLookbackWindow: 15000,
   maxCommentLength: 500
 });

 const [health, setHealth] = useState<SystemHealth>({
   status: 'error',
   model: '-',
   maxImageSize: '10MB',
   activeBatches: 0
 });

 const [stats, setStats] = useState<ImageStats>({
   uploadedCount: 0,
   processedCount: 0,
   storageUsage: 0
 });

 const [isLoading, setIsLoading] = useState(false);
 const [isSaving, setIsSaving] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [success, setSuccess] = useState<string | null>(null);
 
 const [showModelModal, setShowModelModal] = useState(false);
 const [showCleanupModal, setShowCleanupModal] = useState(false);
 const [showStatsModal, setShowStatsModal] = useState(false);
 
 const [cleanupDays, setCleanupDays] = useState(7);
 const [cleanupType, setCleanupType] = useState<'all' | 'uploads' | 'processed'>('all');
 const [isCleaningUp, setIsCleaningUp] = useState(false);

 // Helper Functions (No changes)
 const formatFileSize = (bytes: number): string => {
   if (bytes === 0) return '0 ไบต์';
   const k = 1024;
   const sizes = ['ไบต์', 'KB', 'MB', 'GB'];
   const i = Math.floor(Math.log(bytes) / Math.log(k));
   return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
 };

 const formatDuration = (ms: number): string => {
   const seconds = Math.floor(ms / 1000);
   const minutes = Math.floor(seconds / 60);
   
   if (minutes > 0) {
     return `${minutes} นาที ${seconds % 60} วินาที`;
   }
   return `${seconds} วินาที`;
 };

 const showToast = (message: string, type: 'success' | 'error') => {
   if (type === 'success') {
     setSuccess(message);
     setError(null);
   } else {
     setError(message);
     setSuccess(null);
   }
   
   setTimeout(() => {
     setSuccess(null);
     setError(null);
   }, 5000);
 };

 // API Functions (No changes)
 const loadConfig = useCallback(async () => {
   try {
     setIsLoading(true);
     const response = await imageApi.getConfig();
     
     if (response.success && response.data) {
       const configData = response.data.config || response.data;
       
const safeConfigData = configData as any; // Cast to any for flexible property access

setConfig(prevConfig => ({
  ...prevConfig,
  promptTemplate: configData.promptTemplate || prevConfig.promptTemplate,
  maxBatchSize: configData.maxBatchSize || safeConfigData.batchSize || prevConfig.maxBatchSize,
  batchTimeout: configData.batchTimeout || prevConfig.batchTimeout,
  minImageGap: configData.minImageGap || safeConfigData.imageGap || prevConfig.minImageGap,
  commentLookbackWindow: configData.commentLookbackWindow || prevConfig.commentLookbackWindow,
  maxCommentLength: configData.maxCommentLength || prevConfig.maxCommentLength,
  activeBatches: configData.activeBatches || 0,
  currentModel: configData.currentModel,
  modelInfo: configData.modelInfo
}));
     }
     
   } catch (err: any) {
     console.error('Error loading config:', err);
     showToast('ไม่สามารถโหลดการตั้งค่าได้', 'error');
   } finally {
     setIsLoading(false);
   }
 }, []);

 const checkStatus = useCallback(async () => {
   try {
     try {
       const healthResponse = await imageApi.getHealth();
       if (healthResponse.success && healthResponse.data) {
         setHealth(healthResponse.data);
       }
     } catch (healthError) {
       console.warn('Health check failed:', healthError);
       setHealth({ status: 'error', model: '-', maxImageSize: '10MB', activeBatches: 0 });
     }
     
     const newStats = { uploadedCount: 0, processedCount: 0, storageUsage: 0 };
     
     try {
       const uploadsResponse = await imageApi.getUploads();
       if (uploadsResponse.success && uploadsResponse.data) {
         newStats.uploadedCount = uploadsResponse.data.count || 0;
         if (uploadsResponse.data.files) {
           newStats.storageUsage += uploadsResponse.data.files.reduce((sum: number, file: any) => sum + (file.size || 0), 0);
         }
       }
     } catch (uploadsError) {
       console.warn('Failed to fetch uploads:', uploadsError);
     }
     
     try {
       const processedResponse = await imageApi.getProcessed();
       if (processedResponse.success && processedResponse.data) {
         newStats.processedCount = processedResponse.data.count || 0;
         if (processedResponse.data.files) {
           newStats.storageUsage += processedResponse.data.files.reduce((sum: number, file: any) => sum + (file.size || 0), 0);
         }
       }
     } catch (processedError) {
       console.warn('Failed to fetch processed:', processedError);
     }
     
     setStats(newStats);
     
   } catch (err: any) {
     console.error('Error checking status:', err);
     showToast('เกิดข้อผิดพลาดในการตรวจสอบสถานะ', 'error');
   }
 }, []);

 const saveConfig = async (e: React.FormEvent) => {
   e.preventDefault();
   try {
     setIsSaving(true);
     if (!config.promptTemplate.trim()) {
       throw new Error('แม่แบบคำสั่งต้องไม่ว่างเปล่า');
     }
     const response = await imageApi.updateConfig({
       promptTemplate: config.promptTemplate,
       batchSize: config.maxBatchSize,
       batchTimeout: config.batchTimeout,
       imageGap: config.minImageGap,
       commentLookbackWindow: config.commentLookbackWindow,
       maxCommentLength: config.maxCommentLength
     });
     
     if (response.success) {
       showToast('บันทึกการตั้งค่าเรียบร้อยแล้ว', 'success');
       setTimeout(() => {
         loadConfig();
         checkStatus();
       }, 500);
     } else {
       throw new Error(response.error || 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
     }
   } catch (err: any) {
     console.error('Error saving config:', err);
     showToast(err.message || 'ไม่สามารถบันทึกการตั้งค่าได้', 'error');
   } finally {
     setIsSaving(false);
   }
 };

 const resetToDefault = () => {
   setConfig({
     promptTemplate: 'ช่วยอธิบายรูปภาพนี้อย่างละเอียด โดยระบุว่าเป็นบรรจุภัณฑ์ประเภทไหน มีลักษณะอย่างไร มีขนาดและรูปทรงใด หากเป็นกล่อง ให้อธิบายว่าเป็นกล่องประเภทไหน ทำจากวัสดุอะไร และเหมาะกับใส่สินค้าประเภทใด',
     maxBatchSize: 5,
     batchTimeout: 20000,
     minImageGap: 5000,
     commentLookbackWindow: 15000,
     maxCommentLength: 500
   });
 };

 const runCleanup = async () => {
   try {
     if (cleanupDays < 1 || cleanupDays > 365) {
       throw new Error('จำนวนวันต้องเป็นตัวเลขระหว่าง 1 ถึง 365');
     }
     setIsCleaningUp(true);
     const response = await imageApi.cleanup(cleanupDays, cleanupType);
     if (response.success && response.data) {
       const result: CleanupResult = response.data;
       setShowCleanupModal(false);
       showToast(`ทำความสะอาดเสร็จสิ้น: ${result.message}`, 'success');
       setTimeout(() => {
         checkStatus();
       }, 500);
     } else {
       throw new Error(response.error || 'เกิดข้อผิดพลาดในการทำความสะอาด');
     }
   } catch (err: any) {
     console.error('Error during cleanup:', err);
     showToast(err.message || 'ไม่สามารถทำความสะอาดได้', 'error');
   } finally {
     setIsCleaningUp(false);
   }
 };

 const refreshData = () => {
   loadConfig();
   checkStatus();
 };

 // Effects (No changes)
 useEffect(() => {
   loadConfig();
   checkStatus();
 }, [loadConfig, checkStatus]);

 useEffect(() => {
   const interval = setInterval(() => {
     checkStatus();
   }, 30000);
   return () => clearInterval(interval);
 }, [checkStatus]);

 // UI Component Functions (Minor adjustments for new theme)
 const getStatusBadge = () => {
   const statusMap = {
     healthy: { text: 'ปกติ', variant: 'success' },
     degraded: { text: 'เสื่อมสภาพ', variant: 'warning' },
     error: { text: 'ผิดพลาด', variant: 'danger' }
   };
   const status = statusMap[health.status] || statusMap.error;
   return <Badge bg={status.variant}>{status.text}</Badge>;
 };

 const getModelBadge = () => {
   if (!config.currentModel) {
     return <Badge bg="secondary">ไม่ทราบ</Badge>;
   }
   const isVision = config.modelInfo?.isVisionCapable;
   return (
     <Badge bg={isVision ? 'success' : 'primary'}>
       {isVision && <i className="fas fa-eye me-1"></i>}
       {config.currentModel}
     </Badge>
   );
 };

return (
  <section className="image-config-page">
    <div className="image-config-container">
       <div className="image-config-toolbar">
        <div className="image-config-toolbar-info">
          <i className="fas fa-camera-retro me-3 text-accent"></i>
          <div>
            <h1 className="mb-0 h3">การตั้งค่าการวิเคราะห์ภาพ</h1>
            <p className="text-muted mb-0">จัดการการวิเคราะห์ภาพอัตโนมัติ</p>
          </div>
        </div>
        <div className="image-config-toolbar-actions">
          <Button variant="secondary" size="sm" onClick={refreshData} disabled={isLoading}>
            <i className="fas fa-sync-alt me-1"></i>รีเฟรช
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowModelModal(true)}>
            <i className="fas fa-cog me-1"></i>ตั้งค่าโมเดล AI
          </Button>
        </div>
      </div>

      {success && (
        <Alert variant="success" dismissible onClose={() => setSuccess(null)} className="mb-3">
          <i className="fas fa-check-circle"></i>
          <div>{success}</div>
        </Alert>
      )}
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)} className="mb-3">
          <i className="fas fa-exclamation-triangle"></i>
          <div>{error}</div>
        </Alert>
      )}

      {isLoading && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center"
          style={{ backgroundColor: 'rgba(20, 24, 28, 0.72)', zIndex: 9999 }}
        >
          <LoadingSpinner size="lg" />
        </div>
      )}

      <Tabs activeKey={activeTab} onSelect={(k) => setActiveTab(k || 'overview')} className="mb-4" fill>
             <Tab eventKey="overview" title={<span><i className="fas fa-tachometer-alt me-2"></i>ภาพรวม</span>}>
                <Row>
                  <Col md={6} className="mb-4">
                    <Card className="h-100">
                      <Card.Header className="d-flex justify-content-between align-items-center">
                        <h5 className="mb-0"><i className="fas fa-heartbeat me-2 text-danger"></i>สถานะระบบ</h5>
                        {getStatusBadge()}
                      </Card.Header>
                      <Card.Body>
                        <Table borderless size="sm" className="mb-0">
                          <tbody>
                            <tr><td><strong>โมเดลปัจจุบัน:</strong></td><td>{getModelBadge()}</td></tr>
                            <tr><td><strong>ชุดงานที่กำลังทำงาน:</strong></td><td><Badge bg="info">{health.activeBatches || config.activeBatches || 0}</Badge></td></tr>
                            <tr><td><strong>ขนาดภาพสูงสุด:</strong></td><td>{health.maxImageSize || '10MB'}</td></tr>
                            <tr><td><strong>โมเดลที่ใช้ได้:</strong></td><td><Badge bg="secondary">{health.availableModels || 0}</Badge></td></tr>
                            <tr><td><strong>รูปแบบที่รองรับ:</strong></td><td><small className="text-muted">{health.supportedFormats?.join(', ') || 'JPEG, PNG, GIF, WebP'}</small></td></tr>
                          </tbody>
                        </Table>
                      </Card.Body>
                    </Card>
                  </Col>
                  <Col md={6} className="mb-4">
                    <Card className="h-100">
                      <Card.Header>
                        <h5 className="mb-0"><i className="fas fa-database me-2 text-accent"></i>สถิติการเก็บข้อมูล</h5>
                      </Card.Header>
                      <Card.Body>
                        <Table borderless size="sm" className="mb-0">
                          <tbody>
                            <tr><td><strong>ภาพที่อัพโหลด:</strong></td><td><Badge bg="primary">{stats.uploadedCount.toLocaleString()}</Badge></td></tr>
                            <tr><td><strong>ภาพที่ประมวลผลแล้ว:</strong></td><td><Badge bg="success">{stats.processedCount.toLocaleString()}</Badge></td></tr>
                            <tr><td><strong>ภาพทั้งหมด:</strong></td><td><Badge bg="info">{(stats.uploadedCount + stats.processedCount).toLocaleString()}</Badge></td></tr>
                            <tr>
                                <td><strong>พื้นที่ใช้งาน:</strong></td>
                                <td><span className="fw-bold">{formatFileSize(stats.storageUsage)}</span></td>
                            </tr>
                          </tbody>
                        </Table>
                         <div className="d-flex gap-2 mt-3">
                            <Button variant="outline-secondary" size="sm" onClick={() => setShowStatsModal(true)} className="w-100"><i className="fas fa-chart-bar me-1"></i>รายละเอียด</Button>
                            <Button variant="outline-danger" size="sm" onClick={() => setShowCleanupModal(true)} className="w-100"><i className="fas fa-broom me-1"></i>ทำความสะอาด</Button>
                         </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
                {config.modelInfo && (
                  <Row><Col md={12} className="mb-4"><Card>
                    <Card.Header><h5 className="mb-0"><i className="fas fa-brain me-2 text-accent"></i>ข้อมูลโมเดล AI ปัจจุบัน</h5></Card.Header>
                    <Card.Body>
                      <Row>
                        <Col md={6}><Table borderless size="sm" className="mb-0"><tbody>
                            <tr><td><strong>ชื่อโมเดل:</strong></td><td>{config.modelInfo.name}</td></tr>
                            <tr><td><strong>ชื่อแสดง:</strong></td><td>{config.modelInfo.displayName}</td></tr>
                            <tr><td><strong>เวอร์ชัน:</strong></td><td>{config.modelInfo.version}</td></tr>
                            <tr><td><strong>รองรับภาพ:</strong></td><td>{config.modelInfo.isVisionCapable ? <Badge bg="success"><i className="fas fa-check me-1"></i>ใช่</Badge> : <Badge bg="secondary"><i className="fas fa-times me-1"></i>ไม่</Badge>}</td></tr>
                        </tbody></Table></Col>
                        <Col md={6}><Table borderless size="sm" className="mb-0"><tbody>
                            <tr><td><strong>Input Tokens:</strong></td><td>{config.modelInfo.inputTokenLimit.toLocaleString()}</td></tr>
                            <tr><td><strong>Output Tokens:</strong></td><td>{config.modelInfo.outputTokenLimit.toLocaleString()}</td></tr>
                            <tr><td className="align-top"><strong>คำอธิบาย:</strong></td><td><small className="text-muted">{config.modelInfo.description || 'ไม่มีคำอธิบาย'}</small></td></tr>
                        </tbody></Table></Col>
                      </Row>
                    </Card.Body>
                  </Card></Col></Row>
                )}
             </Tab>

             <Tab eventKey="config" title={<span><i className="fas fa-cogs me-2"></i>การตั้งค่า</span>}>
                <Form onSubmit={saveConfig}>
                  <Row>
                    <Col md={12} className="mb-4"><Card>
                      <Card.Header><h5 className="mb-0"><i className="fas fa-edit me-2"></i>คำสั่งวิเคราะห์ภาพ</h5></Card.Header>
                      <Card.Body>
                        <Form.Group className="mb-3">
                          <Form.Label className="fw-semibold">แม่แบบคำสั่ง</Form.Label>
                          <Form.Control as="textarea" rows={6} value={config.promptTemplate} onChange={(e) => setConfig({ ...config, promptTemplate: e.target.value })} required style={{ fontFamily: 'monospace' }}/>
                          <Form.Text className="text-muted">คำสั่งนี้จะถูกส่งไปยังโมเดล AI พร้อมกับแต่ละภาพ <br/><small>ความยาวปัจจุบัน: {config.promptTemplate.length} ตัวอักษร</small></Form.Text>
                        </Form.Group>
                      </Card.Body>
                    </Card></Col>
                  </Row>
                  <Row>
                    <Col md={6} className="mb-4"><Card className="h-100">
                      <Card.Header><h5 className="mb-0"><i className="fas fa-layer-group me-2"></i>การประมวลผลแบบชุด</h5></Card.Header>
                      <Card.Body>
                        <Form.Group className="mb-3">
                          <Form.Label className="fw-semibold">ขนาดชุดสูงสุด</Form.Label>
                          <Form.Control type="number" min="1" max="10" value={config.maxBatchSize} onChange={(e) => setConfig({ ...config, maxBatchSize: parseInt(e.target.value) || 1 })} required/>
                          <Form.Text className="text-muted">จำนวนภาพสูงสุดที่จะประมวลผลในชุดเดียว (1-10)</Form.Text>
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label className="fw-semibold">เวลาหมดเขตของชุด ({formatDuration(config.batchTimeout)})</Form.Label>
                          <Form.Range min="5000" max="60000" step="1000" value={config.batchTimeout} onChange={(e) => setConfig({ ...config, batchTimeout: parseInt(e.target.value) })}/>
                        </Form.Group>
                        <Form.Group className="mb-0">
                          <Form.Label className="fw-semibold">ช่องว่างระหว่างภาพ ({formatDuration(config.minImageGap)})</Form.Label>
                          <Form.Range min="500" max="30000" step="500" value={config.minImageGap} onChange={(e) => setConfig({ ...config, minImageGap: parseInt(e.target.value) })}/>
                        </Form.Group>
                      </Card.Body>
                    </Card></Col>
                    <Col md={6} className="mb-4"><Card className="h-100">
                      <Card.Header><h5 className="mb-0"><i className="fas fa-comments me-2"></i>การประมวลผลความคิดเห็น</h5></Card.Header>
                      <Card.Body>
                        <Form.Group className="mb-3">
                          <Form.Label className="fw-semibold">ระยะเวลาย้อนหลัง ({formatDuration(config.commentLookbackWindow)})</Form.Label>
                          <Form.Range min="5000" max="60000" step="1000" value={config.commentLookbackWindow} onChange={(e) => setConfig({ ...config, commentLookbackWindow: parseInt(e.target.value) })}/>
                        </Form.Group>
                        <Form.Group className="mb-0">
                          <Form.Label className="fw-semibold">ความยาวความคิดเห็นสูงสุด</Form.Label>
                          <Form.Control type="number" min="100" max="2000" step="100" value={config.maxCommentLength} onChange={(e) => setConfig({ ...config, maxCommentLength: parseInt(e.target.value) || 100 })} required/>
                        </Form.Group>
                      </Card.Body>
                    </Card></Col>
                  </Row>
                  <Row><Col md={12}><Card><Card.Body className="text-end">
                      <Button variant="outline-secondary" onClick={resetToDefault} disabled={isSaving} className="me-2"><i className="fas fa-undo me-1"></i>คืนค่าเริ่มต้น</Button>
                      <Button type="submit" variant="primary" disabled={isSaving} style={{ minWidth: '150px' }}>
                        {isSaving ? <><Spinner animation="border" size="sm" className="me-2" />กำลังบันทึก...</> : <><i className="fas fa-save me-1"></i>บันทึกการตั้งค่า</>}
                      </Button>
                  </Card.Body></Card></Col></Row>
                </Form>
             </Tab>
             
             <Tab eventKey="statistics" title={<span><i className="fas fa-chart-line me-2"></i>สถิติ</span>}>
                <Row>
                    <Col md={4} className="mb-4">
                        <div className="stat-card h-100">
                            <div className="stat-icon"><i className="fas fa-check-circle"></i></div>
                            <div className="stat-value">{health.initialized ? 'Yes' : 'No'}</div>
                            <div className="stat-label">ระบบเริ่มต้นแล้ว</div>
                        </div>
                    </Col>
                    <Col md={4} className="mb-4">
                        <div className="stat-card h-100">
                            <div className="stat-icon"><i className="fas fa-layer-group"></i></div>
                            <div className="stat-value">{health.activeBatches || 0}</div>
                            <div className="stat-label">ชุดงานที่กำลังทำงาน</div>
                        </div>
                    </Col>
                    <Col md={4} className="mb-4">
                        <div className="stat-card h-100">
                            <div className="stat-icon"><i className="fas fa-brain"></i></div>
                            <div className="stat-value">{health.availableModels || 0}</div>
                            <div className="stat-label">โมเดลที่ใช้ได้</div>
                        </div>
                    </Col>
                </Row>
                <Row>
                    <Col md={12} className="mb-4">
                        <Card>
                            <Card.Header><h5 className="mb-0"><i className="fas fa-cog me-2"></i>สรุปการตั้งค่าปัจจุบัน</h5></Card.Header>
                            <Card.Body>
                                <Table striped hover size="sm">
                                    <tbody>
                                        <tr><td><strong>ความยาวคำสั่ง:</strong></td><td>{config.promptTemplate.length} ตัวอักษร</td></tr>
                                        <tr><td><strong>ขนาดชุดสูงสุด:</strong></td><td>{config.maxBatchSize} ภาพ</td></tr>
                                        <tr><td><strong>เวลาหมดเขตชุด:</strong></td><td>{formatDuration(config.batchTimeout)}</td></tr>
                                        <tr><td><strong>ช่องว่างระหว่างภาพ:</strong></td><td>{formatDuration(config.minImageGap)}</td></tr>
                                        <tr><td><strong>ย้อนหลังความคิดเห็น:</strong></td><td>{formatDuration(config.commentLookbackWindow)}</td></tr>
                                        <tr><td><strong>ความยาวความคิดเห็นสูงสุด:</strong></td><td>{config.maxCommentLength} ตัวอักษร</td></tr>
                                    </tbody>
                                </Table>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
             </Tab>

             <Tab eventKey="help" title={<span><i className="fas fa-question-circle me-2"></i>ความช่วยเหลือ</span>}>
                <Row>
                    <Col md={6}>
                        <div className="help-card">
                            <h6><i className="fas fa-cogs me-2"></i>การตั้งค่าพื้นฐาน</h6>
                            <ul>
                                <li><strong>คำสั่งวิเคราะห์ภาพ:</strong> กำหนดวิธีการที่ AI จะวิเคราะห์ภาพ</li>
                                <li><strong>ขนาดชุดสูงสุด:</strong> จำนวนภาพที่จะประมวลผลพร้อมกัน</li>
                                <li><strong>เวลาหมดเขตของชุด:</strong> เวลาที่รอก่อนประมวลผลภาพที่ค้างอยู่</li>
                                <li><strong>ช่องว่างระหว่างภาพ:</strong> เวลาระหว่างการรับภาพเพื่อจัดกลุ่ม</li>
                            </ul>
                        </div>
                        <div className="help-card">
                            <h6><i className="fas fa-comments me-2"></i>การจัดการความคิดเห็น</h6>
                            <ul>
                                <li><strong>ระยะเวลาย้อนหลัง:</strong> ระยะเวลาที่จะค้นหาความคิดเห็นของผู้ใช้</li>
                                <li><strong>ความยาวสูงสุด:</strong> จำกัดความยาวของความคิดเห็นที่นำมาใช้</li>
                            </ul>
                        </div>
                    </Col>
                    <Col md={6}>
                        <div className="help-card">
                            <h6><i className="fas fa-brain me-2"></i>การจัดการโมเดล AI</h6>
                            <ul>
                                <li><strong>เลือกโมเดล:</strong> เลือกโมเดล AI ที่เหมาะสมกับงาน</li>
                                <li><strong>ทดสอบโมเดล:</strong> ทดสอบการทำงานของโมเดลก่อนใช้งาน</li>
                                <li><strong>รีเฟรชรายการ:</strong> อัพเดทรายการโมเดลใหม่จาก API</li>
                            </ul>
                        </div>
                        <div className="help-card">
                            <h6><i className="fas fa-database me-2"></i>การจัดการข้อมูล</h6>
                            <ul>
                                <li><strong>ทำความสะอาด:</strong> ลบไฟล์ภาพเก่าที่ไม่ใช้แล้ว</li>
                                <li><strong>ดูสถิติ:</strong> ตรวจสอบการใช้งานและประสิทธิภาพ</li>
                            </ul>
                        </div>
                    </Col>
                </Row>
                <Row>
                    <Col>
                        <Alert variant="info">
                            <i className="fas fa-info-circle"></i>
                            <div><strong>หมายเหตุ:</strong> การเปลี่ยนแปลงการตั้งค่าจะมีผลทันทีหลังจากการบันทึก กรุณาทดสอบการทำงานหลังจากการเปลี่ยนแปลงเสมอ</div>
                        </Alert>
                    </Col>
                </Row>
             </Tab>
           </Tabs>

    </div>

    {showModelModal && (
      <ImageAIModelModal
        show={showModelModal}
        onHide={() => setShowModelModal(false)}
        onModelChanged={(modelName) => {
          loadConfig();
          checkStatus();
          showToast(`เปลี่ยนโมเดลเป็น ${modelName} เรียบร้อยแล้ว`, 'success');
        }}
        onConfigSaved={() => {
          loadConfig();
          checkStatus();
          showToast('บันทึกการตั้งค่าโมเดลเรียบร้อยแล้ว', 'success');
        }}
      />
    )}

    <Modal
      show={showCleanupModal}
      onHide={() => setShowCleanupModal(false)}
      centered
      backdrop="static"
      contentClassName="image-config-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="fas fa-broom me-2 text-accent"></i>
          ทำความสะอาดพื้นที่เก็บภาพ
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>ลบไฟล์ภาพที่เก่ากว่าจำนวนวันที่ระบุ</p>
        <Form.Group className="mb-3">
          <Form.Label>จำนวนวันที่ต้องการเก็บ</Form.Label>
          <Form.Control
            type="number"
            min="1"
            max="365"
            value={cleanupDays}
            onChange={(e) => setCleanupDays(parseInt(e.target.value, 10) || 1)}
          />
          <Form.Text className="text-muted">
            ภาพที่เก่ากว่าจำนวนวันนี้จะถูกลบ (1-365 วัน)
          </Form.Text>
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>ประเภทไฟล์ที่ต้องการทำความสะอาด</Form.Label>
          <div className="ms-2">
            <Form.Check
              type="radio"
              id="cleanup-all"
              name="cleanupType"
              value="all"
              checked={cleanupType === 'all'}
              onChange={(e) => setCleanupType(e.target.value as any)}
              label="ไฟล์ภาพทั้งหมด"
            />
            <Form.Check
              type="radio"
              id="cleanup-uploads"
              name="cleanupType"
              value="uploads"
              checked={cleanupType === 'uploads'}
              onChange={(e) => setCleanupType(e.target.value as any)}
              label="เฉพาะภาพที่อัพโหลด"
            />
            <Form.Check
              type="radio"
              id="cleanup-processed"
              name="cleanupType"
              value="processed"
              checked={cleanupType === 'processed'}
              onChange={(e) => setCleanupType(e.target.value as any)}
              label="เฉพาะภาพที่ประมวลผลแล้ว"
            />
          </div>
        </Form.Group>
        <Alert variant="warning">
          <i className="fas fa-exclamation-triangle me-2"></i>
          <strong>คำเตือน:</strong> การกระทำนี้ไม่สามารถยกเลิกได้
        </Alert>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={() => setShowCleanupModal(false)} disabled={isCleaningUp}>
          ยกเลิก
        </Button>
        <Button variant="danger" onClick={runCleanup} disabled={isCleaningUp}>
          {isCleaningUp ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />กำลังลบ...
            </>
          ) : (
            <>
              <i className="fas fa-trash me-1"></i>ลบภาพเก่า
            </>
          )}
        </Button>
      </Modal.Footer>
    </Modal>

    <Modal
      show={showStatsModal}
      onHide={() => setShowStatsModal(false)}
      size="lg"
      centered
      contentClassName="image-config-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="fas fa-chart-bar me-2 text-accent"></i>
          รายละเอียดสถิติ
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Row>
          <Col md={6}>
            <Card className="mb-3 text-center">
              <Card.Header>
                <h6 className="mb-0">
                  <i className="fas fa-upload me-2 text-accent"></i>
                  ภาพที่อัพโหลด
                </h6>
              </Card.Header>
              <Card.Body>
                <div className="display-6 text-accent">{stats.uploadedCount.toLocaleString()}</div>
                <small className="text-muted">ไฟล์</small>
              </Card.Body>
            </Card>
          </Col>
          <Col md={6}>
            <Card className="mb-3 text-center">
              <Card.Header>
                <h6 className="mb-0">
                  <i className="fas fa-check-circle me-2 text-success"></i>
                  ภาพที่ประมวลผลแล้ว
                </h6>
              </Card.Header>
              <Card.Body>
                <div className="display-6 text-success">{stats.processedCount.toLocaleString()}</div>
                <small className="text-muted">ไฟล์</small>
              </Card.Body>
            </Card>
          </Col>
        </Row>
        <Card className="mb-3">
          <Card.Header>
            <h6 className="mb-0">
              <i className="fas fa-hdd me-2 text-accent"></i>
              การใช้พื้นที่จัดเก็บ
            </h6>
          </Card.Header>
          <Card.Body>
            <div className="text-center mb-3">
              <div className="display-6 text-accent">{formatFileSize(stats.storageUsage)}</div>
              <small className="text-muted">พื้นที่ใช้งานทั้งหมด</small>
            </div>
            <Table borderless size="sm">
              <tbody>
                <tr>
                  <td><strong>ไฟล์ทั้งหมด:</strong></td>
                  <td>{(stats.uploadedCount + stats.processedCount).toLocaleString()} ไฟล์</td>
                </tr>
                <tr>
                  <td><strong>อัตราส่วนการประมวลผล:</strong></td>
                  <td>{stats.uploadedCount > 0 ? ((stats.processedCount / stats.uploadedCount) * 100).toFixed(1) : '0'}%</td>
                </tr>
                <tr>
                  <td><strong>ขนาดเฉลี่ยต่อไฟล์:</strong></td>
                  <td>
                    {stats.uploadedCount + stats.processedCount > 0
                      ? formatFileSize(stats.storageUsage / (stats.uploadedCount + stats.processedCount))
                      : '0 ไบต์'}
                  </td>
                </tr>
              </tbody>
            </Table>
          </Card.Body>
        </Card>
        <Alert variant="info">
          <i className="fas fa-info-circle me-2"></i>
          สถิติเหล่านี้อัพเดททุก 30 วินาที
        </Alert>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={() => setShowStatsModal(false)}>
          ปิด
        </Button>
        <Button variant="primary" onClick={checkStatus}>
          <i className="fas fa-sync-alt me-1"></i>รีเฟรช
        </Button>
      </Modal.Footer>
    </Modal>
  </section>
);
};

export default ImageConfigPage;
