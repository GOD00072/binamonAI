// src/components/GenerationConfigPanel.tsx
import React from 'react';
import { Card, Form, Row, Col, Alert, Badge, ProgressBar } from 'react-bootstrap';
import { GenerationConfig } from '../types';


interface GenerationConfigPanelProps {
    config: GenerationConfig;
    onChange: (field: keyof GenerationConfig, value: number) => void;
    disabled?: boolean;
}

interface ConfigField {
    key: keyof GenerationConfig;
    label: string;
    description: string;
    min: number;
    max: number;
    step: number;
    icon: string;
    getProgressVariant: (value: number) => string;
    formatValue: (value: number) => string;
}

const GenerationConfigPanel: React.FC<GenerationConfigPanelProps> = ({
    config,
    onChange,
    disabled = false
}) => {
    const configFields: ConfigField[] = [
        {
            key: 'temperature',
            label: 'Temperature',
            description: 'ควบคุมความสร้างสรรค์ในการตอบ (0 = เป็นระเบียบ, 1 = สร้างสรรค์)',
            min: 0,
            max: 1,
            step: 0.1,
            icon: 'fa-thermometer-half',
            getProgressVariant: (value) => value <= 0.3 ? 'info' : value <= 0.7 ? 'success' : 'warning',
            formatValue: (value) => value.toFixed(1)
        },
        {
            key: 'topP',
            label: 'Top P (Nucleus Sampling)',
            description: 'ควบคุมความหลากหลายของคำตอบ (0.1 = จำกัด, 1.0 = หลากหลาย)',
            min: 0,
            max: 1,
            step: 0.1,
            icon: 'fa-layer-group',
            getProgressVariant: (value) => value <= 0.3 ? 'warning' : value <= 0.9 ? 'success' : 'info',
            formatValue: (value) => value.toFixed(1)
        },
        {
            key: 'topK',
            label: 'Top K',
            description: 'จำนวนตัวเลือกในการสร้างคำตอบ (ต่ำ = จำกัด, สูง = หลากหลาย)',
            min: 1,
            max: 100,
            step: 1,
            icon: 'fa-list-ol',
            getProgressVariant: (value) => value <= 20 ? 'info' : value <= 60 ? 'success' : 'warning',
            formatValue: (value) => value.toString()
        },
        {
            key: 'maxOutputTokens',
            label: 'Max Output Tokens',
            description: 'จำกัดความยาวของข้อความตอบ (ต่ำ = สั้น, สูง = ยาว)',
            min: 1,
            max: 64000,
            step: 1,
            icon: 'fa-text-width',
            getProgressVariant: (value) => value <= 1000 ? 'info' : value <= 4000 ? 'success' : 'warning',
            formatValue: (value) => value.toLocaleString()
        }
    ];

    const getRecommendation = (field: ConfigField, value: number): string => {
        switch (field.key) {
            case 'temperature':
                if (value <= 0.3) return 'เหมาะสำหรับคำตอบที่ต้องการความแม่นยำ';
                if (value <= 0.7) return 'เหมาะสำหรับการใช้งานทั่วไป';
                return 'เหมาะสำหรับการสร้างสรรค์เนื้อหา';
            case 'topP':
                if (value <= 0.3) return 'คำตอบมีความสอดคล้องสูง';
                if (value <= 0.9) return 'สมดุลระหว่างความสอดคล้องและความหลากหลาย';
                return 'คำตอบมีความหลากหลายสูง';
            case 'topK':
                if (value <= 20) return 'คำตอบมีความแน่นอนสูง';
                if (value <= 60) return 'ความสมดุลที่ดี';
                return 'คำตอบมีตัวเลือกหลากหลาย';
            case 'maxOutputTokens':
                if (value <= 1000) return 'เหมาะสำหรับคำตอบสั้น';
                if (value <= 4000) return 'เหมาะสำหรับคำตอบปานกลาง';
                return 'เหมาะสำหรับคำตอบยาว';
            default:
                return '';
        }
    };

    const getUsageLevel = (field: ConfigField, value: number): { level: string; percentage: number } => {
        const percentage = ((value - field.min) / (field.max - field.min)) * 100;
        let level = 'ต่ำ';
        
        if (percentage > 75) level = 'สูงมาก';
        else if (percentage > 50) level = 'สูง';
        else if (percentage > 25) level = 'ปานกลาง';
        
        return { level, percentage };
    };

    return (
        <Card>
            <Card.Header>
                <div className="d-flex justify-content-between align-items-center">
                    <h5 className="mb-0">
                        <i className="fas fa-sliders-h me-2"></i>
                        พารามิเตอร์การสร้างข้อความ
                    </h5>
                    <Badge bg="info">
                        <i className="fas fa-info-circle me-1"></i>
                        การตั้งค่าขั้นสูง
                    </Badge>
                </div>
            </Card.Header>
            <Card.Body>
                <Row>
                    {configFields.map((field, index) => {
                        const value = config[field.key];
                        const usage = getUsageLevel(field, value);
                        
                        return (
                            <Col md={6} key={field.key} className="mb-4">
                                <div className="parameter-card p-3 border rounded">
                                    {/* Header */}
                                    <div className="d-flex justify-content-between align-items-center mb-2">
                                        <Form.Label className="mb-0 fw-bold">
                                            <i className={`fas ${field.icon} me-2 text-primary`}></i>
                                            {field.label}
                                        </Form.Label>
                                        <div className="d-flex align-items-center gap-2">
                                            <Badge bg={field.getProgressVariant(value)}>
                                                {field.formatValue(value)}
                                            </Badge>
                                            <Badge bg="light" text="dark" className="small">
                                                {usage.level}
                                            </Badge>
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <ProgressBar 
                                        variant={field.getProgressVariant(value)}
                                        now={usage.percentage}
                                        className="mb-2"
                                        style={{ height: '6px' }}
                                    />

                                    {/* Slider */}
                                    <Form.Range
                                        min={field.min}
                                        max={field.max}
                                        step={field.step}
                                        value={value}
                                        onChange={(e) => onChange(field.key, parseFloat(e.target.value))}
                                        disabled={disabled}
                                        className="mb-2"
                                    />

                                    {/* Min/Max Labels */}
                                    <div className="d-flex justify-content-between small text-muted mb-2">
                                        <span>{field.formatValue(field.min)}</span>
                                        <span>{field.formatValue(field.max)}</span>
                                    </div>

                                    {/* Description */}
                                    <div className="small text-muted mb-2">
                                        {field.description}
                                    </div>

                                    {/* Recommendation */}
                                    <div className="small">
                                        <div className={`alert alert-${field.getProgressVariant(value)} py-2 px-3 mb-0`}>
                                            <i className="fas fa-lightbulb me-1"></i>
                                            {getRecommendation(field, value)}
                                        </div>
                                    </div>
                                </div>
                            </Col>
                        );
                    })}
                </Row>

                {/* Configuration Summary */}
                <Card className="mt-4 bg-light">
                    <Card.Header className="bg-transparent">
                        <h6 className="mb-0">
                            <i className="fas fa-chart-line me-2"></i>
                            สรุปการตั้งค่า
                        </h6>
                    </Card.Header>
                    <Card.Body>
                        <Row>
                            <Col md={6}>
                                <div className="mb-2">
                                    <strong>ระดับความสร้างสรรค์:</strong>
                                    <span className="ms-2">
                                        {config.temperature <= 0.3 ? (
                                            <Badge bg="info">เป็นระเบียบ</Badge>
                                        ) : config.temperature <= 0.7 ? (
                                            <Badge bg="success">สมดุล</Badge>
                                        ) : (
                                            <Badge bg="warning">สร้างสรรค์</Badge>
                                        )}
                                    </span>
                                </div>
                                <div className="mb-2">
                                    <strong>ความหลากหลายของคำตอบ:</strong>
                                    <span className="ms-2">
                                        {(config.topP <= 0.5 && config.topK <= 20) ? (
                                            <Badge bg="info">จำกัด</Badge>
                                        ) : (config.topP >= 0.8 && config.topK >= 40) ? (
                                            <Badge bg="warning">หลากหลาย</Badge>
                                        ) : (
                                            <Badge bg="success">ปานกลาง</Badge>
                                        )}
                                    </span>
                                </div>
                            </Col>
                            <Col md={6}>
                                <div className="mb-2">
                                    <strong>ความยาวคำตอบ:</strong>
                                    <span className="ms-2">
                                        {config.maxOutputTokens <= 1000 ? (
                                            <Badge bg="info">สั้น</Badge>
                                        ) : config.maxOutputTokens <= 4000 ? (
                                            <Badge bg="success">ปานกลาง</Badge>
                                        ) : (
                                            <Badge bg="warning">ยาว</Badge>
                                        )}
                                    </span>
                                </div>
                                <div className="mb-2">
                                    <strong>เหมาะสำหรับ:</strong>
                                    <span className="ms-2">
                                        {(config.temperature <= 0.3 && config.topP <= 0.5) ? (
                                            <Badge bg="primary">งานที่ต้องการความแม่นยำ</Badge>
                                        ) : (config.temperature >= 0.7 && config.topP >= 0.8) ? (
                                            <Badge bg="secondary">งานสร้างสรรค์</Badge>
                                        ) : (
                                            <Badge bg="success">งานทั่วไป</Badge>
                                        )}
                                    </span>
                                </div>
                            </Col>
                        </Row>
                    </Card.Body>
                </Card>

                {/* Performance Impact Warning */}
                {(config.maxOutputTokens > 4000 || config.topK > 80) && (
                    <Alert variant="warning" className="mt-3">
                        <Alert.Heading className="h6">
                            <i className="fas fa-exclamation-triangle me-2"></i>
                            ข้อควรระวัง
                        </Alert.Heading>
                        <p className="mb-0">
                            การตั้งค่าปัจจุบันอาจส่งผลต่อประสิทธิภาพ:
                        </p>
                        <ul className="mb-0 mt-2">
                            {config.maxOutputTokens > 4000 && (
                                <li>จำนวน tokens สูงอาจทำให้การตอบช้าลง</li>
                            )}
                            {config.topK > 80 && (
                                <li>Top K สูงอาจทำให้ใช้เวลาประมวลผลนานขึ้น</li>
                            )}
                        </ul>
                    </Alert>
                )}
            </Card.Body>
        </Card>
    );
};

export default GenerationConfigPanel;