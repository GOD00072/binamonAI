// src/pages/ModelConfigurationPage.tsx
import React, { useState } from 'react';
import { Container, Row, Col, Card, Alert } from 'react-bootstrap';
import LanguageModelManager from '../components/LanguageModelManager';
import { AISettings } from '../types';

const ModelConfigurationPage: React.FC = () => {
    const [selectedLanguage, setSelectedLanguage] = useState<string>('TH');
    const [alert, setAlert] = useState<{ message: string; type: 'success' | 'danger' | 'warning' | 'info' } | null>(null);

    const handleLanguageChange = (language: string) => {
        setSelectedLanguage(language);
        console.log(`Language changed to: ${language}`);
    };

    const handleConfigUpdate = (language: string, config: AISettings) => {
        console.log(`Configuration updated for ${language}:`, config);
        setAlert({
            message: `การตั้งค่าสำหรับภาษา ${language} ได้รับการบันทึกเรียบร้อยแล้ว`,
            type: 'success'
        });

        // Auto-hide alert after 5 seconds
        setTimeout(() => setAlert(null), 5000);
    };

    return (
        <Container fluid className="py-4">
            <Row>
                <Col>
                    {/* Page Header */}
                    <div className="d-flex justify-content-between align-items-center mb-4">
                        <div>
                            <h2 className="mb-1">
                                <i className="fas fa-robot me-2 text-primary"></i>
                                การจัดการโมเดล AI
                            </h2>
                            <p className="text-muted mb-0">
                                ตั้งค่าโมเดลและพารามิเตอร์ AI สำหรับแต่ละภาษา
                            </p>
                        </div>
                    </div>

                    {/* Alert */}
                    {alert && (
                        <Alert 
                            variant={alert.type} 
                            dismissible 
                            onClose={() => setAlert(null)}
                            className="mb-4"
                        >
                            {alert.message}
                        </Alert>
                    )}

                    {/* Main Content */}
                    <LanguageModelManager
                        onLanguageChange={handleLanguageChange}
                        onConfigUpdate={handleConfigUpdate}
                    />

                    {/* Additional Information */}
                    <Card className="mt-4">
                        <Card.Header>
                            <h5 className="mb-0">
                                <i className="fas fa-info-circle me-2"></i>
                                ข้อมูลเพิ่มเติม
                            </h5>
                        </Card.Header>
                        <Card.Body>
                            <Row>
                                <Col md={6}>
                                    <h6>
                                        <i className="fas fa-lightbulb me-2 text-warning"></i>
                                        เคล็ดลับการตั้งค่า
                                    </h6>
                                    <ul className="small">
                                        <li>ใช้ Temperature ต่ำ (0.1-0.3) สำหรับคำตอบที่ต้องการความแม่นยำ</li>
                                        <li>ใช้ Temperature สูง (0.7-1.0) สำหรับการสร้างสรรค์เนื้อหา</li>
                                        <li>Top P และ Top K ช่วยควบคุมความหลากหลายของคำตอบ</li>
                                        <li>Max Output Tokens ควรตั้งตามความต้องการความยาวคำตอบ</li>
                                    </ul>
                                </Col>
                                <Col md={6}>
                                    <h6>
                                        <i className="fas fa-shield-alt me-2 text-success"></i>
                                        ข้อควรระวัง
                                    </h6>
                                    <ul className="small">
                                        <li>การเปลี่ยนโมเดลจะส่งผลต่อการตอบของ AI ทันที</li>
                                        <li>พารามิเตอร์สูงเกินไปอาจทำให้ประสิทธิภาพลดลง</li>
                                        <li>ควรทดสอบการตั้งค่าก่อนนำไปใช้งานจริง</li>
                                        <li>แต่ละภาษาสามารถมีการตั้งค่าที่แตกต่างกันได้</li>
                                    </ul>
                                </Col>
                            </Row>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </Container>
    );
};

export default ModelConfigurationPage;