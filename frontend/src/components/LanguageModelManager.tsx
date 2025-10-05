// src/components/LanguageModelManager.tsx
import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Button, Badge, Alert, Spinner } from 'react-bootstrap';
import AIModelConfigModal from './AIModelConfigModal';
import { AISettings } from '../types';

interface Language {
    code: string;
    name: string;
    flag: string;
}

interface LanguageModelManagerProps {
    onLanguageChange?: (language: string) => void;
    onConfigUpdate?: (language: string, config: AISettings) => void;
}

const LanguageModelManager: React.FC<LanguageModelManagerProps> = ({
    onLanguageChange,
    onConfigUpdate
}) => {
    const [selectedLanguage, setSelectedLanguage] = useState('TH');
    const [showModal, setShowModal] = useState(false);
    const [languageStatuses, setLanguageStatuses] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);

    const supportedLanguages: Language[] = [
        { code: 'TH', name: 'ไทย (Thai)', flag: '🇹🇭' },
        { code: 'EN', name: 'English', flag: '🇺🇸' },
        { code: 'JP', name: '日本語 (Japanese)', flag: '🇯🇵' },
        { code: 'CN', name: '中文 (Chinese)', flag: '🇨🇳' },
        { code: 'KR', name: '한국어 (Korean)', flag: '🇰🇷' }
    ];

    useEffect(() => {
        loadLanguageStatuses();
    }, []);

    const loadLanguageStatuses = async () => {
        setLoading(true);
        // Load status for each language
        // This would typically come from your API
        // For now, simulate loading
        setTimeout(() => {
            setLanguageStatuses({
                'TH': { configured: true, model: 'gemini-1.5-pro' },
                'EN': { configured: true, model: 'gemini-1.5-pro' },
                'JP': { configured: false, model: null },
                'CN': { configured: false, model: null },
                'KR': { configured: false, model: null }
            });
            setLoading(false);
        }, 1000);
    };

    const handleLanguageSelect = (languageCode: string) => {
        setSelectedLanguage(languageCode);
        setShowModal(true);
        if (onLanguageChange) {
            onLanguageChange(languageCode);
        }
    };

    const handleModalHide = () => {
        setShowModal(false);
    };

    const handleConfigSaved = (config: AISettings) => {
        // Update language status
        setLanguageStatuses(prev => ({
            ...prev,
            [selectedLanguage]: {
                configured: true,
                model: config.modelConfig.modelName
            }
        }));

        if (onConfigUpdate) {
            onConfigUpdate(selectedLanguage, config);
        }
    };

    const getLanguageStatus = (languageCode: string) => {
        const status = languageStatuses[languageCode];
        if (!status) return { configured: false, model: null };
        return status;
    };

    const selectedLanguageInfo = supportedLanguages.find(l => l.code === selectedLanguage);

    if (loading) {
        return (
            <div className="text-center py-5">
                <Spinner animation="border" variant="primary" />
                <p className="mt-2">กำลังโหลดข้อมูลภาษา...</p>
            </div>
        );
    }

    return (
        <>
            <Card>
                <Card.Header>
                    <div className="d-flex justify-content-between align-items-center">
                        <h5 className="mb-0">
                            <i className="fas fa-globe me-2"></i>
                            จัดการโมเดล AI ตามภาษา
                        </h5>
                        <Badge bg="info">
                            {Object.values(languageStatuses).filter(s => s.configured).length}/{supportedLanguages.length} ภาษา
                        </Badge>
                    </div>
                </Card.Header>
                <Card.Body>
                   <div className="mb-3">
                       <Alert variant="info" className="mb-3">
                           <div className="d-flex align-items-center">
                               <i className="fas fa-info-circle me-2"></i>
                               <div>
                                   <strong>คำแนะนำ:</strong> คลิกที่ภาษาเพื่อตั้งค่าโมเดล AI และพารามิเตอร์สำหรับภาษานั้น ๆ 
                                   แต่ละภาษาสามารถใช้โมเดลและการตั้งค่าที่แตกต่างกันได้
                               </div>
                           </div>
                       </Alert>
                   </div>

                   <Row>
                       {supportedLanguages.map(language => {
                           const status = getLanguageStatus(language.code);
                           
                           return (
                               <Col md={6} lg={4} key={language.code} className="mb-3">
                                   <Card 
                                       className={`h-100 language-card ${status.configured ? 'border-success' : 'border-warning'}`}
                                       style={{ 
                                           cursor: 'pointer',
                                           transition: 'all 0.3s ease'
                                       }}
                                       onClick={() => handleLanguageSelect(language.code)}
                                   >
                                       <Card.Header className="d-flex justify-content-between align-items-center">
                                           <div className="d-flex align-items-center">
                                               <span className="me-2" style={{ fontSize: '1.5rem' }}>
                                                   {language.flag}
                                               </span>
                                               <h6 className="mb-0">{language.name}</h6>
                                           </div>
                                           {status.configured ? (
                                               <Badge bg="success">
                                                   <i className="fas fa-check me-1"></i>
                                                   ตั้งค่าแล้ว
                                               </Badge>
                                           ) : (
                                               <Badge bg="warning" text="dark">
                                                   <i className="fas fa-exclamation me-1"></i>
                                                   ยังไม่ตั้งค่า
                                               </Badge>
                                           )}
                                       </Card.Header>
                                       <Card.Body>
                                           <div className="mb-2">
                                               <small className="text-muted">โมเดลปัจจุบัน:</small>
                                               <div className="fw-bold">
                                                   {status.model ? (
                                                       <Badge bg="primary">{status.model}</Badge>
                                                   ) : (
                                                       <span className="text-muted">ไม่ได้กำหนด</span>
                                                   )}
                                               </div>
                                           </div>
                                           
                                           <div className="mb-2">
                                               <small className="text-muted">สถานะ:</small>
                                               <div>
                                                   {status.configured ? (
                                                       <span className="text-success">
                                                           <i className="fas fa-check-circle me-1"></i>
                                                           พร้อมใช้งาน
                                                       </span>
                                                   ) : (
                                                       <span className="text-warning">
                                                           <i className="fas fa-clock me-1"></i>
                                                           ต้องตั้งค่า
                                                       </span>
                                                   )}
                                               </div>
                                           </div>

                                           <div className="mt-3">
                                               <Button 
                                                   variant={status.configured ? "outline-primary" : "primary"}
                                                   size="sm" 
                                                   className="w-100"
                                                   onClick={(e) => {
                                                       e.stopPropagation();
                                                       handleLanguageSelect(language.code);
                                                   }}
                                               >
                                                   <i className={`fas fa-${status.configured ? 'edit' : 'plus'} me-1`}></i>
                                                   {status.configured ? 'แก้ไขการตั้งค่า' : 'ตั้งค่าโมเดล'}
                                               </Button>
                                           </div>
                                       </Card.Body>
                                   </Card>
                               </Col>
                           );
                       })}
                   </Row>

                   {/* Statistics */}
                   <Card className="mt-4 bg-light">
                       <Card.Header className="bg-transparent">
                           <h6 className="mb-0">
                               <i className="fas fa-chart-pie me-2"></i>
                               สถิติการตั้งค่า
                           </h6>
                       </Card.Header>
                       <Card.Body>
                           <Row>
                               <Col md={3} className="text-center">
                                   <div className="h4 text-primary mb-1">
                                       {Object.values(languageStatuses).filter(s => s.configured).length}
                                   </div>
                                   <div className="small text-muted">ภาษาที่ตั้งค่าแล้ว</div>
                               </Col>
                               <Col md={3} className="text-center">
                                   <div className="h4 text-warning mb-1">
                                       {Object.values(languageStatuses).filter(s => !s.configured).length}
                                   </div>
                                   <div className="small text-muted">ภาษาที่ยังไม่ตั้งค่า</div>
                               </Col>
                               <Col md={3} className="text-center">
                                   <div className="h4 text-info mb-1">
                                       {new Set(Object.values(languageStatuses).map(s => s.model).filter(Boolean)).size}
                                   </div>
                                   <div className="small text-muted">โมเดลที่ใช้งาน</div>
                               </Col>
                               <Col md={3} className="text-center">
                                   <div className="h4 text-success mb-1">
                                       {Math.round((Object.values(languageStatuses).filter(s => s.configured).length / supportedLanguages.length) * 100)}%
                                   </div>
                                   <div className="small text-muted">ความสมบูรณ์</div>
                               </Col>
                           </Row>
                       </Card.Body>
                   </Card>

                   {/* Quick Actions */}
                   <Card className="mt-4">
                       <Card.Header>
                           <h6 className="mb-0">
                               <i className="fas fa-bolt me-2"></i>
                               การดำเนินการด่วน
                           </h6>
                       </Card.Header>
                       <Card.Body>
                           <div className="d-flex flex-wrap gap-2">
                               <Button 
                                   variant="outline-primary" 
                                   size="sm"
                                   onClick={() => {
                                       // Configure all unconfigured languages with default settings
                                       const unconfigured = supportedLanguages.filter(
                                           lang => !getLanguageStatus(lang.code).configured
                                       );
                                       if (unconfigured.length > 0) {
                                           handleLanguageSelect(unconfigured[0].code);
                                       }
                                   }}
                               >
                                   <i className="fas fa-magic me-1"></i>
                                   ตั้งค่าภาษาต่อไป
                               </Button>
                               
                               <Button 
                                   variant="outline-success" 
                                   size="sm"
                                   onClick={() => loadLanguageStatuses()}
                               >
                                   <i className="fas fa-sync-alt me-1"></i>
                                   รีเฟรชสถานะ
                               </Button>
                               
                               <Button 
                                   variant="outline-info" 
                                   size="sm"
                                   onClick={() => {
                                       // Export configuration
                                       console.log('Export configuration for all languages');
                                   }}
                               >
                                   <i className="fas fa-download me-1"></i>
                                   ส่งออกการตั้งค่า
                               </Button>
                           </div>
                       </Card.Body>
                   </Card>
               </Card.Body>
           </Card>

           {/* AI Model Config Modal */}
           <AIModelConfigModal
               show={showModal}
               onHide={handleModalHide}
               language={selectedLanguage}
               languageLabel={selectedLanguageInfo?.name || selectedLanguage}
               onModelChanged={(modelName) => {
                   console.log(`Model changed to ${modelName} for language ${selectedLanguage}`);
               }}
               onConfigSaved={handleConfigSaved}
           />
       </>
   );
};

export default LanguageModelManager;