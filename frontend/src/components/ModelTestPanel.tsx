// src/components/ModelTestPanel.tsx
import React, { useState } from 'react';
import { Card, Form, Button, Alert, Badge, Spinner, ProgressBar } from 'react-bootstrap';

interface TestResult {
    success: boolean;
    response?: string;
    modelName?: string;
    duration?: number;
    tokens?: { input: number; output: number };
    error?: string;
    timestamp?: number;
}

interface ModelTestPanelProps {
    selectedModel: string;
    modelDisplayName?: string;
    onTest: (query: string) => Promise<TestResult>;
    disabled?: boolean;
}

const ModelTestPanel: React.FC<ModelTestPanelProps> = ({
    selectedModel,
    modelDisplayName,
    onTest,
    disabled = false
}) => {
    const [testQuery, setTestQuery] = useState('สวัสดีครับ คุณเป็นอย่างไรบ้าง?');
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [testHistory, setTestHistory] = useState<TestResult[]>([]);

    const predefinedQueries = [
        {
            label: 'การทักทาย (ไทย)',
            query: 'สวัสดีครับ คุณเป็นอย่างไรบ้าง?',
            icon: 'fa-hand-wave'
        },
        {
            label: 'สอบถามข้อมูลสินค้า',
            query: 'ฉันต้องการข้อมูลเกี่ยวกับบรรจุภัณฑ์กระดาษสำหรับอาหาร',
            icon: 'fa-box'
        },
        {
            label: 'การทักทาย (English)',
            query: 'Hello, how are you today?',
            icon: 'fa-globe'
        },
        {
            label: 'คำถามซับซ้อน',
            query: 'อธิบายความแตกต่างระหว่างบรรจุภัณฑ์กระดาษที่ใช้สำหรับอาหารร้อนและอาหารเย็น พร้อมแนะนำสินค้าที่เหมาะสม',
            icon: 'fa-brain'
        }
    ];

    const handleTest = async () => {
        if (!testQuery.trim() || !selectedModel) {
            return;
        }

        setTesting(true);
        setTestResult(null);

        try {
            const result = await onTest(testQuery.trim());
            setTestResult(result);
            
            // Add to history
            setTestHistory(prev => [
                {
                    ...result,
                    timestamp: Date.now()
                },
                ...prev.slice(0, 4) // Keep only last 5 results
            ]);
        } catch (error) {
            const errorResult: TestResult = {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
            };
            setTestResult(errorResult);
        } finally {
            setTesting(false);
        }
    };

    const selectPredefinedQuery = (query: string) => {
        setTestQuery(query);
    };

    const formatDuration = (duration?: number): string => {
        if (!duration) return 'ไม่ทราบ';
        
        if (duration < 1000) {
            return `${duration}ms`;
        } else if (duration < 60000) {
            return `${(duration / 1000).toFixed(1)}s`;
        } else {
            return `${(duration / 60000).toFixed(1)}m`;
        }
    };

    const getPerformanceLevel = (duration?: number): { level: string; variant: string } => {
        if (!duration) return { level: 'ไม่ทราบ', variant: 'secondary' };
        
        if (duration < 2000) return { level: 'เร็วมาก', variant: 'success' };
        if (duration < 5000) return { level: 'เร็ว', variant: 'info' };
        if (duration < 10000) return { level: 'ปานกลาง', variant: 'warning' };
        return { level: 'ช้า', variant: 'danger' };
    };

    return (
        <Card>
            <Card.Header>
                <div className="d-flex justify-content-between align-items-center">
                    <h5 className="mb-0">
                        <i className="fas fa-flask me-2"></i>
                        ทดสอบโมเดล
                    </h5>
                    <Badge bg="primary">
                        {modelDisplayName || selectedModel}
                    </Badge>
                </div>
            </Card.Header>
            <Card.Body>
                {/* Predefined Queries */}
                <div className="mb-3">
                    <Form.Label className="fw-bold">
                        <i className="fas fa-bookmark me-2"></i>
                        คำถามตัวอย่าง
                    </Form.Label>
                    <div className="d-flex flex-wrap gap-2">
                        {predefinedQueries.map((item, index) => (
                            <Button
                                key={index}
                                variant="outline-secondary"
                                size="sm"
                                onClick={() => selectPredefinedQuery(item.query)}
                                disabled={disabled || testing}
                            >
                                <i className={`fas ${item.icon} me-1`}></i>
                                {item.label}
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Test Query Input */}
                <Form.Group className="mb-3">
                    <Form.Label className="fw-bold">
                        <i className="fas fa-edit me-2"></i>
                        ข้อความทดสอบ
                    </Form.Label>
                    <Form.Control
                        as="textarea"
                        rows={4}
                        value={testQuery}
                        onChange={(e) => setTestQuery(e.target.value)}
                        placeholder="กรอกข้อความที่ต้องการทดสอบ..."
                        disabled={disabled || testing}
                    />
                    <Form.Text className="text-muted">
                        ความยาว: {testQuery.length} ตัวอักษร
                    </Form.Text>
                </Form.Group>

                {/* Test Button */}
                <div className="d-flex align-items-center gap-3 mb-3">
                    <Button 
                        variant="primary" 
                        onClick={handleTest}
                        disabled={disabled || testing || !testQuery.trim() || !selectedModel}
                        style={{ minWidth: '120px' }}
                    >
                        {testing ? (
                            <>
                                <Spinner animation="border" size="sm" className="me-2" />
                                กำลังทดสอบ...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-play me-2"></i>
                                เริ่มทดสอบ
                            </>
                        )}
                    </Button>
                    
                    {testing && (
                        <div className="flex-grow-1">
                            <div className="small text-muted mb-1">กำลังประมวลผล...</div>
                            <ProgressBar animated now={100} style={{ height: '4px' }} />
                        </div>
                    )}
                </div>

                {/* Test Result */}
                {testResult && (
                    <Card className="mb-3">
                        <Card.Header className="d-flex justify-content-between align-items-center">
                            <h6 className="mb-0">
                                <i className={`fas fa-${testResult.success ? 'check-circle text-success' : 'exclamation-circle text-danger'} me-2`}></i>
                                ผลการทดสอบ
                            </h6>
                            {testResult.success && testResult.duration && (
                                <Badge bg={getPerformanceLevel(testResult.duration).variant}>
                                    {formatDuration(testResult.duration)} ({getPerformanceLevel(testResult.duration).level})
                                </Badge>
                            )}
                        </Card.Header>
                        <Card.Body>
                            {testResult.success ? (
                                <>
                                    <div 
                                        className="bg-light p-3 rounded mb-3" 
                                        style={{ 
                                            maxHeight: '300px', 
                                            overflowY: 'auto',
                                            border: '1px solid #dee2e6'
                                        }}
                                    >
                                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                            {testResult.response}
                                        </div>
                                    </div>
                                    
                                    {/* Metadata */}
                                    <div className="row small text-muted">
                                        <div className="col-md-3">
                                            <strong>โมเดล:</strong><br />
                                            {testResult.modelName}
                                        </div>
                                        <div className="col-md-3">
                                            <strong>เวลาที่ใช้:</strong><br />
                                            {formatDuration(testResult.duration)}
                                        </div>
                                        {testResult.tokens && (
                                            <>
                                                <div className="col-md-3">
                                                    <strong>Input Tokens:</strong><br />
                                                    {testResult.tokens.input.toLocaleString()}
                                                </div>
                                                <div className="col-md-3">
                                                    <strong>Output Tokens:</strong><br />
                                                    {testResult.tokens.output.toLocaleString()}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <Alert variant="danger" className="mb-0">
                                    <Alert.Heading className="h6">
                                        <i className="fas fa-exclamation-triangle me-2"></i>
                                        เกิดข้อผิดพลาด
                                    </Alert.Heading>
                                    {testResult.error}
                                </Alert>
                            )}
                        </Card.Body>
                    </Card>
                )}

                {/* Test History */}
                {testHistory.length > 0 && (
                    <Card>
                        <Card.Header>
                            <h6 className="mb-0">
                                <i className="fas fa-history me-2"></i>
                                ประวัติการทดสอบ ({testHistory.length})
                            </h6>
                        </Card.Header>
                        <Card.Body>
                            <div className="d-flex flex-column gap-2">
                                {testHistory.map((result, index) => (
                                    <div 
                                        key={index}
                                        className="d-flex justify-content-between align-items-center p-2 border rounded"
                                    >
                                        <div className="d-flex align-items-center">
                                            <i className={`fas fa-${result.success ? 'check-circle text-success' : 'times-circle text-danger'} me-2`}></i>
                                            <span className="small">
                                                {result.timestamp && new Date(result.timestamp).toLocaleTimeString('th-TH')}
                                            </span>
                                        </div>
                                        <div className="d-flex gap-2">
                                            {result.success && result.duration && (
                                                <Badge bg={getPerformanceLevel(result.duration).variant} className="small">
                                                    {formatDuration(result.duration)}
                                                </Badge>
                                            )}
                                            <Badge bg={result.success ? 'success' : 'danger'} className="small">
                                                {result.success ? 'สำเร็จ' : 'ล้มเหลว'}
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card.Body>
                    </Card>
                )}
            </Card.Body>
        </Card>
    );
};

export default ModelTestPanel;