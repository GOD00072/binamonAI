// src/components/ImageAIModelModal.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Form, Button, Alert, Card, Badge, Row, Col, Spinner, Tabs, Tab, Table } from 'react-bootstrap';
import LoadingSpinner from './LoadingSpinner';
import { imageApi, ImageModel, ImageAIConfig, ModelTestResult } from '../services/api';

interface ImageAIModelModalProps {
    show: boolean;
    onHide: () => void;
    onModelChanged?: (modelName: string) => void;
    onConfigSaved?: (config: ImageAIConfig) => void;
}

const ImageAIModelModal: React.FC<ImageAIModelModalProps> = ({
    show,
    onHide,
    onModelChanged,
    onConfigSaved
}) => {
    const [activeTab, setActiveTab] = useState('models');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [testing, setTesting] = useState(false);
    
    const [config, setConfig] = useState<ImageAIConfig>({
        currentModel: '',
        promptTemplate: '',
        availableModels: []
    });
    
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [testResult, setTestResult] = useState<ModelTestResult | null>(null);
    const [alert, setAlert] = useState<{ message: string; type: 'success' | 'danger' | 'warning' | 'info' } | null>(null);

    // โหลดข้อมูลเริ่มต้น - ใช้ imageApi แทน fetch
    const loadImageAIConfig = useCallback(async () => {
        setLoading(true);
        setAlert(null);
        
        try {
            console.log('🔄 Loading Image AI Config using imageApi...');
            
            // โหลดการตั้งค่าปัจจุบัน
            const configResponse = await imageApi.getConfig();
            console.log('📋 Config Response:', configResponse);
            
            if (!configResponse.success) {
                throw new Error(configResponse.error || 'ไม่สามารถโหลดการตั้งค่าได้');
            }
            
            // โหลดรายการโมเดลที่ใช้ได้
            const modelsResponse = await imageApi.getModels();
            console.log('🧠 Models Response:', modelsResponse);
            
            if (!modelsResponse.success) {
                throw new Error(modelsResponse.error || 'ไม่สามารถโหลดรายการโมเดลได้');
            }
            
           
           const configData = configResponse.data?.config || configResponse.data;
           const modelsData = modelsResponse.data;

const newConfig: ImageAIConfig = {
    currentModel: (configData as any)?.currentModel || (modelsData as any)?.currentModel || '',
    promptTemplate: (configData as any)?.promptTemplate || '',
    availableModels: modelsData?.models || [],
    modelInfo: (modelsData as any)?.modelInfo || (configData as any)?.modelInfo,
    lastUpdate: (modelsData as any)?.lastUpdate || (configData as any)?.lastUpdate
};
            
            console.log('✅ Final Config:', newConfig);
            
            setConfig(newConfig);
            setSelectedModel(newConfig.currentModel);
            
        } catch (error) {
            console.error('❌ Error loading image AI config:', error);
            setAlert({
                message: `ไม่สามารถโหลดการตั้งค่าได้: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'danger'
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (show) {
            console.log('🚀 Modal opened, loading config...');
            loadImageAIConfig();
        }
    }, [show, loadImageAIConfig]);

    // รีเฟรชรายการโมเดล - ใช้ imageApi
    const refreshModels = async () => {
        setRefreshing(true);
        setAlert(null);
        
        try {
            console.log('🔄 Refreshing models using imageApi...');
            
            const response = await imageApi.refreshModels();
            console.log('📡 Refresh Response:', response);
            
            if (!response.success) {
                throw new Error(response.error || 'ไม่สามารถรีเฟรชได้');
            }
            
            setConfig(prev => ({
                ...prev,
                availableModels: response.data?.models || [],
                lastUpdate: response.data?.lastUpdate
            }));
            
            setAlert({
                message: `รีเฟรชรายการโมเดลสำเร็จ (${response.data?.models?.length || 0} โมเดล)`,
                type: 'success'
            });
        } catch (error) {
            console.error('❌ Error refreshing models:', error);
            setAlert({
                message: `ไม่สามารถรีเฟรชรายการโมเดลได้: ${error instanceof Error ? error.message : 'Error'}`,
                type: 'danger'
            });
        } finally {
            setRefreshing(false);
        }
    };

    // เปลี่ยนโมเดล - ใช้ imageApi
    const switchToModel = async () => {
        if (!selectedModel || selectedModel === config.currentModel) {
            return;
        }
        
        setSaving(true);
        setAlert(null);
        
        try {
            console.log('⚙️ Switching to model using imageApi:', selectedModel);
            
            const response = await imageApi.setModel(selectedModel);
            console.log('📡 Switch Response:', response);
            
            if (!response.success) {
                throw new Error(response.error || 'ไม่สามารถเปลี่ยนโมเดลได้');
            }
            
            const updatedConfig = {
                ...config,
                currentModel: response.data?.currentModel || selectedModel,
                modelInfo: response.data?.modelInfo
            };
            
            setConfig(updatedConfig);
            
            setAlert({
                message: `เปลี่ยนโมเดลเป็น ${selectedModel} เรียบร้อยแล้ว`,
                type: 'success'
            });
            
            if (onModelChanged) onModelChanged(selectedModel);
            if (onConfigSaved) onConfigSaved(updatedConfig);
            
        } catch (error) {
            console.error('❌ Error switching model:', error);
            setAlert({
                message: `ไม่สามารถเปลี่ยนโมเดลได้: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'danger'
            });
        } finally {
            setSaving(false);
        }
    };

    // ทดสอบโมเดล - ใช้ imageApi
    const testModel = async () => {
        if (!selectedModel) return;
        
        setTesting(true);
        setTestResult(null);
        
        try {
            console.log('🧪 Testing model using imageApi:', selectedModel);
            
            const response = await imageApi.testModel(selectedModel);
            console.log('📡 Test Response:', response);
            
            if (response.success && response.data) {
                setTestResult(response.data);
            } else {
                setTestResult({
                    success: false,
                    error: response.error || 'การทดสอบล้มเหลว',
                    connectionStatus: 'failed'
                });
            }
            
        } catch (error) {
            console.error('❌ Error testing model:', error);
            setTestResult({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                connectionStatus: 'failed'
            });
        } finally {
            setTesting(false);
        }
    };

    // บันทึกการตั้งค่า - ใช้ imageApi
    const saveConfig = async () => {
        setSaving(true);
        setAlert(null);
        
        try {
            console.log('💾 Saving config using imageApi...');
            
            const response = await imageApi.updateConfig({
                promptTemplate: config.promptTemplate,
                modelName: selectedModel
            });
            
            console.log('📡 Save Response:', response);
            
            if (!response.success) {
                throw new Error(response.error || 'ไม่สามารถบันทึกได้');
            }
            
            const updatedConfig = {
                ...config,
                currentModel: selectedModel
            };
            
            setConfig(updatedConfig);
            
            setAlert({
                message: 'บันทึกการตั้งค่าเรียบร้อยแล้ว',
                type: 'success'
            });
            
            if (onConfigSaved) onConfigSaved(updatedConfig);
            
        } catch (error) {
            console.error('❌ Error saving config:', error);
            setAlert({
                message: `ไม่สามารถบันทึกการตั้งค่าได้: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'danger'
            });
        } finally {
            setSaving(false);
        }
    };

    const handleClose = () => {
        setAlert(null);
        setActiveTab('models');
        setTestResult(null);
        onHide();
    };

    const getSelectedModelInfo = () => {
        return config.availableModels.find(model => model.name === selectedModel);
    };

    const getCurrentModelInfo = () => {
        return config.availableModels.find(model => model.name === config.currentModel);
    };

    // ฟังก์ชันเพิ่มเติมสำหรับการจัดการข้อผิดพลาด timeout
    const handleTimeoutError = (error: any) => {
        if (error.message?.includes('timeout') || error.message?.includes('504')) {
            return 'เซิร์ฟเวอร์ใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง';
        }
        return error.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
    };

    // ฟังก์ชันทดสอบการเชื่อมต่อ
    const testConnection = async () => {
        try {
            setAlert({ message: 'กำลังทดสอบการเชื่อมต่อ...', type: 'info' });
            
            const response = await imageApi.getHealth();
            
            if (response.success) {
                setAlert({ 
                    message: 'การเชื่อมต่อปกติ! เซิร์ฟเวอร์ทำงานได้', 
                    type: 'success' 
                });
            } else {
                setAlert({ 
                    message: 'การเชื่อมต่อมีปัญหา: ' + handleTimeoutError(response), 
                    type: 'warning' 
                });
            }
        } catch (error) {
            setAlert({ 
                message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้: ' + handleTimeoutError(error), 
                type: 'danger' 
            });
        }
    };

    return (
        <Modal 
            show={show} 
            onHide={handleClose} 
            size="xl" 
            centered
            backdrop="static"
            className="image-ai-model-modal"
        >
            <Modal.Header closeButton>
                <Modal.Title>
                    <i className="fas fa-camera me-2"></i>
                    ตั้งค่าโมเดล AI สำหรับการวิเคราะห์ภาพ
                </Modal.Title>
            </Modal.Header>

            <Modal.Body style={{ maxHeight: '80vh', overflowY: 'auto' }}>
                {alert && (
                    <Alert 
                        variant={alert.type} 
                        dismissible 
                        onClose={() => setAlert(null)}
                        className="mb-3"
                    >
                        <div className="d-flex align-items-center justify-content-between">
                            <div className="d-flex align-items-center">
                                <i className={`fas fa-${alert.type === 'success' ? 'check-circle' : 
                                    alert.type === 'danger' ? 'exclamation-circle' : 
                                    alert.type === 'warning' ? 'exclamation-triangle' : 'info-circle'} me-2`}></i>
                                {alert.message}
                            </div>
                            {alert.type === 'danger' && (
                                <Button
                                    variant="outline-primary"
                                    size="sm"
                                    onClick={testConnection}
                                >
                                    <i className="fas fa-network-wired me-1"></i>
                                    ทดสอบการเชื่อมต่อ
                                </Button>
                            )}
                        </div>
                    </Alert>
                )}

                {loading ? (
                    <div className="text-center py-5">
                        <LoadingSpinner size="lg" />
                        <p className="mt-3">กำลังโหลดข้อมูล...</p>
                        <Button 
                            variant="outline-primary" 
                            size="sm"
                            onClick={testConnection}
                            className="mt-2"
                        >
                            <i className="fas fa-network-wired me-1"></i>
                            ทดสอบการเชื่อมต่อ
                        </Button>
                    </div>
                ) : (
                    <Tabs 
                        activeKey={activeTab} 
                        onSelect={(k) => setActiveTab(k || 'models')}
                        className="mb-3"
                        fill
                    >
                        <Tab 
                            eventKey="models" 
                            title={
                                <span>
                                    <i className="fas fa-brain me-2"></i>
                                    โมเดล AI
                                    {config.availableModels.length > 0 && (
                                        <Badge bg="primary" className="ms-2">{config.availableModels.length}</Badge>
                                    )}
                                </span>
                            }
                        >
                            <div className="mb-4">
                                <div className="d-flex justify-content-between align-items-center mb-3">
                                    <h5 className="mb-0">
                                        <i className="fas fa-list me-2"></i>
                                        โมเดลที่ใช้ได้สำหรับการวิเคราะห์ภาพ
                                    </h5>
                                    <div className="d-flex gap-2">
                                        <Button 
                                            variant="outline-secondary" 
                                            size="sm"
                                            onClick={testConnection}
                                        >
                                            <i className="fas fa-network-wired me-1"></i>
                                            ทดสอบการเชื่อมต่อ
                                        </Button>
                                        <Button 
                                            variant="outline-primary" 
                                            size="sm"
                                            onClick={refreshModels}
                                            disabled={refreshing}
                                        >
                                            {refreshing ? (
                                                <Spinner animation="border" size="sm" className="me-1" />
                                            ) : (
                                                <i className="fas fa-sync-alt me-1"></i>
                                            )}
                                            รีเฟรช
                                        </Button>
                                    </div>
                                </div>

                                {/* Current Model Info */}
                                {config.currentModel && (
                                    <Card className="mb-3 border-success">
                                        <Card.Header className="bg-success text-white">
                                            <h6 className="mb-0">
                                                <i className="fas fa-check-circle me-2"></i>
                                                โมเดลปัจจุบัน
                                            </h6>
                                        </Card.Header>
                                        <Card.Body>
                                            <div className="d-flex justify-content-between align-items-center">
                                                <div>
                                                    <div className="fw-bold">{config.currentModel}</div>
                                                    <small className="text-muted">
                                                        {getCurrentModelInfo()?.displayName}
                                                    </small>
                                                </div>
                                                <Badge bg="success">ใช้งานอยู่</Badge>
                                            </div>
                                        </Card.Body>
                                    </Card>
                                )}

                                {/* Models List */}
                                <Row>
                                    {config.availableModels.map(model => (
                                        <Col md={6} lg={4} key={model.name} className="mb-3">
                                            <Card 
                                                className={`h-100 ${config.currentModel === model.name ? 'border-success' : 
                                                    selectedModel === model.name ? 'border-primary' : ''}`}
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => setSelectedModel(model.name)}
                                            >
                                                <Card.Body>
                                                    <div className="d-flex justify-content-between align-items-start mb-2">
                                                        <h6 className="card-title mb-0">{model.displayName}</h6>
                                                        <div className="d-flex flex-column align-items-end">
                                                            {config.currentModel === model.name && (
                                                                <Badge bg="success" className="mb-1">ใช้งานอยู่</Badge>
                                                            )}
                                                            {selectedModel === model.name && config.currentModel !== model.name && (
                                                                <Badge bg="primary" className="mb-1">เลือกอยู่</Badge>
                                                            )}
                                                            {model.isVisionCapable && (
                                                                <Badge bg="info">Vision</Badge>
                                                            )}
                                                        </div>
                                                    </div>
                                                    
                                                    <p className="card-text small text-muted">{model.description}</p>
                                                    
                                                    <div className="small">
                                                        <div><strong>รุ่น:</strong> {model.version}</div>
                                                        <div><strong>Input:</strong> {model.inputTokenLimit.toLocaleString()} tokens</div>
                                                        <div><strong>Output:</strong> {model.outputTokenLimit.toLocaleString()} tokens</div>
                                                    </div>
                                                    
                                                    <div className="mt-2">
                                                        <Form.Check
                                                            type="radio"
                                                            id={`model-${model.name}`}
                                                            label="เลือกโมเดลนี้"
                                                            checked={selectedModel === model.name}
                                                            onChange={() => setSelectedModel(model.name)}
                                                        />
                                                    </div>
                                                </Card.Body>
                                            </Card>
                                        </Col>
                                    ))}
                                </Row>

                                {config.availableModels.length === 0 && !loading && (
                                    <Alert variant="warning">
                                        <i className="fas fa-exclamation-triangle me-2"></i>
                                        ไม่พบโมเดลที่ใช้ได้ กรุณารีเฟรชรายการ
                                        <Button 
                                            variant="outline-primary" 
                                            size="sm"
                                            onClick={refreshModels}
                                            className="ms-2"
                                        >
                                            <i className="fas fa-sync-alt me-1"></i>
                                            รีเฟรชเลย
                                        </Button>
                                    </Alert>
                                )}
                            </div>
                        </Tab>

                        {/* อีก tabs อื่นๆ ยังเหมือนเดิม แต่ต้องเพิ่ม error handling สำหรับ timeout */}
                        <Tab 
                            eventKey="prompt" 
                            title={
                                <span>
                                    <i className="fas fa-edit me-2"></i>
                                    คำสั่งวิเคราะห์
                                </span>
                            }
                        >
                            {/* Content เหมือนเดิม */}
                            <Card>
                                <Card.Header>
                                    <h5 className="mb-0">
                                        <i className="fas fa-code me-2"></i>
                                        แม่แบบคำสั่งสำหรับการวิเคราะห์ภาพ
                                    </h5>
                                </Card.Header>
                                <Card.Body>
                                    <Form.Group className="mb-3">
                                        <Form.Label className="fw-semibold">คำสั่งวิเคราะห์ภาพ</Form.Label>
                                        <Form.Control
                                            as="textarea"
                                            rows={8}
                                            value={config.promptTemplate}
                                            onChange={(e) => setConfig(prev => ({ ...prev, promptTemplate: e.target.value }))}
                                            placeholder="ป้อนคำสั่งที่ต้องการใช้ในการวิเคราะห์ภาพ..."
                                            style={{ fontFamily: 'monospace' }}
                                        />
                                        <Form.Text className="text-muted">
                                            คำสั่งนี้จะถูกส่งไปยังโมเดล AI พร้อมกับภาพที่ต้องการวิเคราะห์
                                            <br />
                                            ความยาวปัจจุบัน: {config.promptTemplate.length} ตัวอักษร
                                        </Form.Text>
                                    </Form.Group>

                                    <div className="d-flex justify-content-end">
                                        <Button 
                                            variant="outline-secondary" 
                                            className="me-2"
                                            onClick={() => setConfig(prev => ({ 
                                                ...prev, 
                                                promptTemplate: 'ช่วยอธิบายรูปภาพนี้อย่างละเอียด โดยระบุว่าเป็นบรรจุภัณฑ์ประเภทไหน มีลักษณะอย่างไร มีขนาดและรูปทรงใด หากเป็นกล่อง ให้อธิบายว่าเป็นกล่องประเภทไหน ทำจากวัสดุอะไร และเหมาะกับใส่สินค้าประเภทใด'
                                            }))}
                                        >
                                            คืนค่าเริ่มต้น
                                        </Button>
                                    </div>
                                </Card.Body>
                            </Card>
                        </Tab>

                        {/* Test tab และ Info tab เหมือนเดิม */}
                        <Tab 
                            eventKey="test" 
                            title={
                                <span>
                                    <i className="fas fa-flask me-2"></i>
                                    ทดสอบ
                                </span>
                            }
                        >
                            <Card>
                                <Card.Header>
                                    <h5 className="mb-0">
                                        <i className="fas fa-vial me-2"></i>
                                        ทดสอบการเชื่อมต่อโมเดล
                                    </h5>
                                </Card.Header>
                                <Card.Body>
                                    <div className="mb-3">
                                        <Form.Label className="fw-semibold">โมเดลที่จะทดสอบ</Form.Label>
                                        <Form.Control
                                            type="text"
                                            value={selectedModel || 'ยังไม่ได้เลือกโมเดล'}
                                            readOnly
                                            className="bg-light"
                                        />
                                    </div>

                                    <div className="d-flex justify-content-center mb-3">
                                        <Button 
                                            variant="primary" 
                                            onClick={testModel}
                                            disabled={!selectedModel || testing}
                                            style={{ minWidth: '150px' }}
                                        >
                                            {testing ? (
                                                <>
                                                    <Spinner animation="border" size="sm" className="me-1" />
                                                    กำลังทดสอบ...
                                                </>
                                            ) : (
                                                <>
                                                    <i className="fas fa-play me-1"></i>
                                                    ทดสอบการเชื่อมต่อ
                                                </>
                                            )}
                                        </Button>
                                    </div>

                                    {testResult && (
                                        <Alert variant={testResult.success ? 'success' : 'danger'}>
                                            <div className="d-flex align-items-center mb-2">
                                                <i className={`fas fa-${testResult.success ? 'check-circle' : 'exclamation-circle'} me-2`}></i>
                                                <strong>
                                                    {testResult.success ? 'การทดสอบสำเร็จ' : 'การทดสอบล้มเหลว'}
                                                </strong>
                                            </div>
                                            
                                            {testResult.success ? (
                                                <div>
                                                    <p className="mb-2">
                                                        <strong>โมเดล:</strong> {testResult.model}
                                                    </p>
                                                    <p className="mb-2">
                                                        <strong>สถานะ:</strong> {testResult.connectionStatus}
                                                    </p>
                                                    {testResult.response && (
                                                        <div>
                                                            <strong>การตอบกลับ:</strong>
                                                            <div className="bg-light p-2 rounded mt-1" style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>
                                                                {testResult.response}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div>
                                                    <p className="mb-0">
                                                        <strong>ข้อผิดพลาด:</strong> {handleTimeoutError(testResult)}
                                                    </p>
                                                </div>
                                            )}
                                        </Alert>
                                    )}
                                </Card.Body>
                            </Card>
                        </Tab>

                        {/* Info tab เหมือนเดิม */}
                        <Tab 
                            eventKey="info" 
                            title={
                                <span>
                                    <i className="fas fa-info-circle me-2"></i>
                                    ข้อมูล
                                </span>
                            }
                        >
                            <Card>
                                <Card.Header>
                                    <h5 className="mb-0">
                                        <i className="fas fa-chart-bar me-2"></i>
                                        สรุปการตั้งค่า
                                    </h5>
                                </Card.Header>
                                <Card.Body>
                                    <Row>
                                        <Col md={6}>
                                            <h6>ข้อมูลโมเดล</h6>
                                            <Table size="sm" striped>
                                                <tbody>
                                                    <tr>
                                                        <td><strong>โมเดลปัจจุบัน:</strong></td>
                                                        <td>{config.currentModel || 'ไม่ทราบ'}</td>
                                                    </tr>
                                                    <tr>
                                                        <td><strong>โมเดลที่เลือก:</strong></td>
                                                        <td>{selectedModel || 'ยังไม่ได้เลือก'}</td>
                                                    </tr>
                                                    <tr>
                                                        <td><strong>จำนวนโมเดลทั้งหมด:</strong></td>
                                                        <td>{config.availableModels.length}</td>
                                                    </tr>
                                                    <tr>
                                                        <td><strong>อัพเดทล่าสุด:</strong></td>
                                                        <td>{config.lastUpdate ? new Date(config.lastUpdate).toLocaleString('th-TH') : 'ไม่ทราบ'}</td>
                                                    </tr>
                                                </tbody>
                                            </Table>
                                        </Col>
                                        <Col md={6}>
                                            <h6>การตั้งค่า</h6>
                                            <Table size="sm" striped>
                                                <tbody>
                                                    <tr>
                                                        <td><strong>ความยาวคำสั่ง:</strong></td>
                                                        <td>{config.promptTemplate.length} ตัวอักษร</td>
                                                    </tr>
                                                    <tr>
                                                       <td><strong>โมเดล Vision:</strong></td>
                                                       <td>{config.availableModels.filter(m => m.isVisionCapable).length}</td>
                                                   </tr>
                                                   <tr>
                                                       <td><strong>สถานะ:</strong></td>
                                                       <td>
                                                           <Badge bg={config.currentModel ? 'success' : 'warning'}>
                                                               {config.currentModel ? 'พร้อมใช้งาน' : 'ยังไม่พร้อม'}
                                                           </Badge>
                                                       </td>
                                                   </tr>
                                               </tbody>
                                           </Table>
                                       </Col>
                                   </Row>

                                   {/* Model Details */}
                                   {selectedModel && (
                                       <div className="mt-4">
                                           <h6>รายละเอียดโมเดลที่เลือก</h6>
                                           {(() => {
                                               const modelInfo = getSelectedModelInfo();
                                               if (!modelInfo) return <p className="text-muted">ไม่พบข้อมูลโมเดล</p>;
                                               
                                               return (
                                                   <Card className="border-primary">
                                                       <Card.Body>
                                                           <h6 className="card-title d-flex justify-content-between align-items-center">
                                                               {modelInfo.displayName}
                                                               <div>
                                                                   {modelInfo.isVisionCapable && (
                                                                       <Badge bg="info" className="me-1">Vision</Badge>
                                                                   )}
                                                                   {config.currentModel === modelInfo.name && (
                                                                       <Badge bg="success">ใช้งานอยู่</Badge>
                                                                   )}
                                                               </div>
                                                           </h6>
                                                           <p className="card-text">{modelInfo.description}</p>
                                                           <Row className="small">
                                                               <Col md={6}>
                                                                   <strong>รุ่น:</strong> {modelInfo.version}<br />
                                                                   <strong>Input Limit:</strong> {modelInfo.inputTokenLimit.toLocaleString()} tokens<br />
                                                                   <strong>Output Limit:</strong> {modelInfo.outputTokenLimit.toLocaleString()} tokens
                                                               </Col>
                                                               <Col md={6}>
                                                                   <strong>Temperature:</strong> {modelInfo.temperature}<br />
                                                                   <strong>Top P:</strong> {modelInfo.topP}<br />
                                                                   <strong>Top K:</strong> {modelInfo.topK}
                                                               </Col>
                                                           </Row>
                                                       </Card.Body>
                                                   </Card>
                                               );
                                           })()}
                                       </div>
                                   )}
                               </Card.Body>
                           </Card>
                       </Tab>
                   </Tabs>
               )}

               {/* Connection Status Display */}
               <div className="mt-3 p-2 bg-light rounded">
                   <small className="text-muted">
                       <i className="fas fa-info-circle me-1"></i>
                       หากเกิดข้อผิดพลาด 504 Gateway Timeout แสดงว่าเซิร์ฟเวอร์ใช้เวลานานเกินไป
                       กรุณารอสักครู่แล้วลองใหม่ หรือคลิก "ทดสอบการเชื่อมต่อ"
                   </small>
               </div>
           </Modal.Body>

           <Modal.Footer className="border-top">
               <div className="d-flex w-100 justify-content-between align-items-center">
                   <div className="text-muted small">
                      {selectedModel && selectedModel !== config.currentModel && (
                          <span>
                              <i className="fas fa-info-circle me-1"></i>
                              โมเดลที่เลือก ({selectedModel}) แตกต่างจากที่ใช้งานอยู่ ({config.currentModel})
                          </span>
                      )}
                  </div>
                  <div className="d-flex gap-2">
                      <Button variant="secondary" onClick={handleClose}>
                          <i className="fas fa-times me-1"></i>
                          ปิด
                      </Button>
                      
                      <Button 
                          variant="warning" 
                          onClick={saveConfig}
                          disabled={saving || !config.currentModel}
                      >
                          {saving ? (
                              <Spinner animation="border" size="sm" className="me-1" />
                          ) : (
                              <i className="fas fa-save me-1"></i>
                          )}
                          บันทึกการตั้งค่า
                      </Button>
                      
                      {selectedModel && selectedModel !== config.currentModel && (
                          <Button 
                              variant="primary" 
                              onClick={switchToModel}
                              disabled={saving || !selectedModel}
                          >
                              {saving ? (
                                  <Spinner animation="border" size="sm" className="me-1" />
                              ) : (
                                  <i className="fas fa-exchange-alt me-1"></i>
                              )}
                              เปลี่ยนเป็นโมเดลนี้
                          </Button>
                      )}
                  </div>
              </div>
          </Modal.Footer>

          <style>{`
              .image-ai-model-modal .modal-dialog { max-width: 90vw; }
              .image-ai-model-modal .modal-body { padding: 1.5rem; }
              .image-ai-model-modal .nav-tabs { border-bottom: 2px solid #dee2e6; }
              .image-ai-model-modal .nav-tabs .nav-link { 
                  border: none; 
                  border-bottom: 3px solid transparent; 
                  background: none; 
                  color: #6c757d; 
                  font-weight: 500; 
                  padding: 0.75rem 1rem; 
              }
              .image-ai-model-modal .nav-tabs .nav-link:hover { 
                  border-color: transparent; 
                  color: #495057; 
                  background-color: #f8f9fa; 
              }
              .image-ai-model-modal .nav-tabs .nav-link.active { 
                  color: #007bff; 
                  border-bottom-color: #007bff; 
                  background: none; 
              }
              .image-ai-model-modal .alert {
                  border-left: 4px solid;
              }
              .image-ai-model-modal .alert-success {
                  border-left-color: #28a745;
              }
              .image-ai-model-modal .alert-danger {
                  border-left-color: #dc3545;
              }
              .image-ai-model-modal .alert-warning {
                  border-left-color: #ffc107;
              }
              .image-ai-model-modal .alert-info {
                  border-left-color: #17a2b8;
              }
              @media (max-width: 768px) {
                  .image-ai-model-modal .modal-dialog { max-width: 95vw; margin: 0.5rem; }
                  .image-ai-model-modal .modal-body { padding: 1rem; }
              }
          `}</style>
      </Modal>
  );
};

export default ImageAIModelModal;