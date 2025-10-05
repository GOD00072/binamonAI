// src/pages/ModelConfigurationPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { Row, Col, Card, Form, Button, Alert, Badge, Modal, Container } from 'react-bootstrap';
import { authorizedFetch } from '../services/apiCore';
import {
  ConversationConfig,
  GenerationConfig,
  AISettings
} from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import AIModelConfigModal from '../components/AIModelConfigModal';

// Define knowledge categories in Thai (updated with 12 categories)
const knowledgeCategories = [
    {id: "cat1", title: "1. บุคลิกและสไตล์การสื่อสาร", icon: "fas fa-user-tie", color: "#e74c3c"},
    {id: "cat2", title: "2. ความรู้และข้อมูลสินค้า", icon: "fas fa-book-open", color: "#3498db"},
    {id: "cat3", title: "3. การขาย การสั่งผลิต และราคา", icon: "fas fa-shopping-cart", color: "#2ecc71"},
    {id: "cat4", title: "4. งานสั่งผลิต/สั่งพิมพ์ (Custom Order)", icon: "fas fa-edit", color: "#f39c12"},
    {id: "cat5", title: "5. การจัดส่ง", icon: "fas fa-truck", color: "#9b59b6"},
    {id: "cat6", title: "6. ความรู้ เงื่อนไข (สำหรับลูกค้าธุรกิจ)", icon: "fas fa-file-contract", color: "#1abc9c"},
    {id: "cat7", title: "7. ข้อมูลบริษัทและนโยบาย", icon: "fas fa-building", color: "#34495e"},
    {id: "cat8", title: "8. การจัดการข้อซักถามและปัญหา", icon: "fas fa-question-circle", color: "#e67e22"},
    {id: "cat9", title: "9. การสิ้นสุดการสนทนา และ การประเมิน", icon: "fas fa-check-circle", color: "#27ae60"},
    {id: "cat10", title: "10. ข้อควรระวังและขอบเขตทางกฎหมาย", icon: "fas fa-exclamation-triangle", color: "#c0392b"},
    {id: "cat11", title: "11. ช่องทางการติดต่อ", icon: "fas fa-phone-alt", color: "#8e44ad"},
    {id: "cat12", title: "12. หมวดหมู่สินค้า", icon: "fas fa-tags", color: "#d35400"}
];

interface KnowledgeCategory {
    id: string;
    title: string;
    icon: string;
    color?: string;
}

interface Language {
    code: string;
    name: string;
    flag: string;
}

interface ModelInfo {
    name: string;
    displayName: string;
    description: string;
    version: string;
    inputTokenLimit: number;
    outputTokenLimit: number;
    supportedMethods: string[];
    apiVersion: string;
    useDirectUrl: boolean;
    category: string;
    recommended: boolean;
}

// Supported languages
const supportedLanguages: Language[] = [
    { code: 'TH', name: 'ไทย', flag: '🇹🇭' },
    { code: 'EN', name: 'English', flag: '🇺🇸' },
    { code: 'JP', name: '日本語', flag: '🇯🇵' },
    { code: 'CN', name: '中文', flag: '🇨🇳' },
    { code: 'KR', name: '한국어', flag: '🇰🇷' }
];

// Helper function to create a default AISettings
const createDefaultAISettings = (): AISettings => ({
    modelConfig: {
        modelName: 'gemini-2.5-pro', // Updated default model
        apiVersion: 'v1',
        modelUrl: 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro',
        useDirectUrl: true,
    },
    generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 1999,
        topK: 40,
    },
    templateConfig: {
        conversation: {
            personality: 'คุณคือเจ๊หงส์ ผู้เชี่ยวชาญด้านบรรจุภัณฑ์กระดาษที่มีประสบการณ์มากกว่า 30 ปี จากบริษัท binamon จำกัด',
            greeting: 'สวัสดีค่ะ เจ๊หงส์ยินดีให้คำปรึกษาเกี่ยวกับบรรจุภัณฑ์นะคะ 🙂',
            closing: 'หากมีข้อสงสัยเพิ่มเติม สามารถสอบถามได้เลยนะคะ 😊',
            guidelines: []
        }
    },
});

// Helper to make authenticated requests
const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    const response = await authorizedFetch(url, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        console.warn('Authentication expired. Please login again.');
        throw new Error('Authentication required');
    }

    return response;
};

const ModelConfigurationPage: React.FC = () => {
    const [aiSettings, setAiSettings] = useState<AISettings | null>(null);
    const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
    const [currentModel, setCurrentModel] = useState<string>(''); // This will be derived from aiSettings
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    
    const [selectedLanguage, setSelectedLanguage] = useState<string>('TH');
    const [languageSettings, setLanguageSettings] = useState<Record<string, AISettings>>({});
    const [knowledgeData, setKnowledgeData] = useState<Record<string, string>>({});
    const [showKnowledgeModal, setShowKnowledgeModal] = useState(false);
    const [showModelConfigModal, setShowModelConfigModal] = useState(false);
    const [currentKnowledgeCategory, setCurrentKnowledgeCategory] = useState<KnowledgeCategory | null>(null);
    const [editingKnowledgeContent, setEditingKnowledgeContent] = useState('');
    const [charCount, setCharCount] = useState(0);
    const [lastUpdated, setLastUpdated] = useState<string>('-');
    
    const MAX_CHARS_KNOWLEDGE = 1500;
    const MAX_CHARS_CATEGORY_12 = 5500; // Special limit for category 12
    const WARNING_THRESHOLD = 1400;
    const WARNING_THRESHOLD_CATEGORY_12 = 5200; // Special warning threshold for category 12

    // Helper function to get character limits based on category
    const getCharacterLimits = (categoryId: string) => {
        if (categoryId === 'cat12') {
            return {
                maxChars: MAX_CHARS_CATEGORY_12,
                warningThreshold: WARNING_THRESHOLD_CATEGORY_12
            };
        }
        return {
            maxChars: MAX_CHARS_KNOWLEDGE,
            warningThreshold: WARNING_THRESHOLD
        };
    };

    const parseGuidelinesToKnowledgeData = useCallback((guidelines: string[] = []): Record<string, string> => {
        const newKnowledgeData: Record<string, string> = {};
        knowledgeCategories.forEach(category => {
            const foundGuideline = guidelines.find(g => g.startsWith(category.title + ":"));
            if (foundGuideline) {
                newKnowledgeData[category.id] = foundGuideline.substring(category.title.length + 2).trim();
            } else {
                const looselyMatchedGuideline = guidelines.find(g => g.includes(category.title));
                if (looselyMatchedGuideline) {
                    const contentPart = looselyMatchedGuideline.split(category.title)[1];
                    newKnowledgeData[category.id] = contentPart ? contentPart.replace(/^[:\s]+/, '').trim() : looselyMatchedGuideline.trim();
                } else {
                    newKnowledgeData[category.id] = "";
                }
            }
        });
        return newKnowledgeData;
    }, []);

    const checkAuth = useCallback(() => {
        const token = localStorage.getItem('auth_token');
        const userData = localStorage.getItem('user_data');
        
        if (!token || !userData) {
            setError('กรุณาเข้าสู่ระบบก่อนเข้าใช้งานหน้านี้');
            setLoading(false);
            return false;
        }
        
        return true;
    }, []);

    const loadAvailableModels = useCallback(async () => {
        try {
            const response = await fetchWithAuth('/api/config/ai/models');
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            const data = await response.json();
            if (data.success) {
                setAvailableModels(data.models || []);
            }
        } catch (error: any) {
            console.error('Error loading available models:', error);
            throw error;
        }
    }, []);

    const loadLanguageSettings = useCallback(async (language: string): Promise<AISettings> => {
        if (!checkAuth()) return createDefaultAISettings();
        try {
            const response = await fetchWithAuth(`/api/config/language/${language}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            const data = await response.json();
            if (data.success && data.settings) {
                const defaults = createDefaultAISettings();
                return {
                    modelConfig: {
                        ...defaults.modelConfig,
                        ...(data.settings.modelConfig || {}),
                        modelName: data.settings.modelConfig?.modelName || defaults.modelConfig.modelName,
                    },
                    generationConfig: data.settings.generationConfig || defaults.generationConfig,
                    templateConfig: data.settings.templateConfig || defaults.templateConfig,
                };
            } else {
                console.warn(`Failed to load settings for ${language}, using defaults.`);
                return createDefaultAISettings();
            }
        } catch (error: any) {
            console.error(`Error loading settings for ${language}:`, error);
            return createDefaultAISettings();
        }
    }, [checkAuth]);

    const loadAllLanguageSettings = useCallback(async () => {
        if (!checkAuth()) return;
        setLoading(true);
        setError(null);
        try {
            await loadAvailableModels();
            const settings: Record<string, AISettings> = {};
            for (const lang of supportedLanguages) {
                settings[lang.code] = await loadLanguageSettings(lang.code);
            }
            setLanguageSettings(settings);

            const currentLangSettings = settings[selectedLanguage] || createDefaultAISettings();
            setAiSettings(currentLangSettings);
            setCurrentModel(currentLangSettings.modelConfig?.modelName || '');
            setKnowledgeData(parseGuidelinesToKnowledgeData(currentLangSettings.templateConfig.conversation.guidelines));

        } catch (error: any) {
            console.error('Error loading language settings:', error);
            setError('ไม่สามารถโหลดการตั้งค่าได้ กรุณาลองใหม่ในภายหลัง');
            const defaults = createDefaultAISettings();
            setAiSettings(defaults);
            setCurrentModel(defaults.modelConfig?.modelName || '');
            setKnowledgeData(parseGuidelinesToKnowledgeData(defaults.templateConfig.conversation.guidelines));
        } finally {
            setLoading(false);
        }
    }, [checkAuth, selectedLanguage, loadLanguageSettings, parseGuidelinesToKnowledgeData, loadAvailableModels]);

    useEffect(() => {
        loadAllLanguageSettings();
    }, [loadAllLanguageSettings]);

    const handleLanguageChange = useCallback((languageCode: string) => {
        setSelectedLanguage(languageCode);
        const newLangSettings = languageSettings[languageCode] || createDefaultAISettings();
        setAiSettings(newLangSettings);
        setCurrentModel(newLangSettings.modelConfig?.modelName || '');
        setKnowledgeData(parseGuidelinesToKnowledgeData(newLangSettings.templateConfig.conversation.guidelines));
    }, [languageSettings, parseGuidelinesToKnowledgeData]);

    const handleModelChange = async (modelName: string) => {
        if (!aiSettings) return;
        const modelInfo = availableModels.find(m => m.name === modelName);
        if (!modelInfo) {
            console.warn(`Model info not found for ${modelName}`);
            return;
        }
        
        setAiSettings(prev => {
            if (!prev) return createDefaultAISettings();
            return {
                ...prev,
                modelConfig: {
                    modelName: modelName,
                    apiVersion: modelInfo.apiVersion,
                    modelUrl: modelInfo.useDirectUrl ? 
                        `https://generativelanguage.googleapis.com/${modelInfo.apiVersion}/models/${modelName}` : '',
                    useDirectUrl: modelInfo.useDirectUrl,
                }
            };
        });
        setCurrentModel(modelName);
    };

    const handleGenerationConfigChange = (param: keyof GenerationConfig, value: string | number) => {
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        setAiSettings((prev) => {
            if (!prev) return null;
            return {
                ...prev,
                generationConfig: {
                    ...prev.generationConfig,
                    [param]: numValue,
                }
            };
        });
    };

    const handlePersonalityChange = (field: keyof ConversationConfig, value: string) => {
        setAiSettings((prev) => {
            if (!prev) return null;
            return {
                ...prev,
                templateConfig: {
                    ...prev.templateConfig,
                    conversation: {
                        ...prev.templateConfig.conversation,
                        [field]: value,
                    }
                }
            };
        });
    };

    const handleOpenKnowledgeModal = (category: KnowledgeCategory) => {
        setCurrentKnowledgeCategory(category);
        const currentContent = knowledgeData[category.id] || '';
        setEditingKnowledgeContent(currentContent);
        setCharCount(currentContent.length);
        setShowKnowledgeModal(true);
    };

    const handleKnowledgeContentChange = (content: string) => {
        setEditingKnowledgeContent(content);
        setCharCount(content.length);
    };

    const handleSaveKnowledge = () => {
        if (currentKnowledgeCategory) {
            setKnowledgeData(prev => ({
                ...prev,
                [currentKnowledgeCategory.id]: editingKnowledgeContent.trim()
            }));
        }
        setShowKnowledgeModal(false);
        setCurrentKnowledgeCategory(null);
        setEditingKnowledgeContent('');
    };

    const handleCloseKnowledgeModal = () => {
        setShowKnowledgeModal(false);
        setCurrentKnowledgeCategory(null);
        setEditingKnowledgeContent('');
    };

    const handleSaveLanguageSettings = async () => {
        if (!aiSettings || !checkAuth()) return;
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const guidelines: string[] = knowledgeCategories
                .filter(category => knowledgeData[category.id]?.trim())
                .map(category => `${category.title}: ${knowledgeData[category.id].trim()}`);

            const settingsToSave: AISettings = {
                ...aiSettings,
                modelConfig: {
                    ...aiSettings.modelConfig,
                    modelName: currentModel || aiSettings.modelConfig.modelName,
                },
                templateConfig: {
                    conversation: {
                        ...aiSettings.templateConfig.conversation,
                        guidelines
                    }
                },
            };

            const response = await fetchWithAuth(`/api/config/language/${selectedLanguage}`, {
                method: 'POST',
                body: JSON.stringify(settingsToSave)
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Error updating language settings');
            }

            setLanguageSettings(prev => ({ ...prev, [selectedLanguage]: settingsToSave }));
            setAiSettings(settingsToSave);
            setCurrentModel(settingsToSave.modelConfig.modelName);

            setSuccess(`บันทึกการตั้งค่าสำหรับภาษา ${supportedLanguages.find(l => l.code === selectedLanguage)?.name} เรียบร้อยแล้ว`);
            setLastUpdated(new Date().toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
        } catch (error: any) {
            console.error('Error saving language settings:', error);
            setError(error.message.includes('Authentication required') ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' : `เกิดข้อผิดพลาดในการบันทึก: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleResetSettings = () => {
        const defaults = createDefaultAISettings();
        setAiSettings(defaults);
        setCurrentModel(defaults.modelConfig.modelName);
        setKnowledgeData(parseGuidelinesToKnowledgeData(defaults.templateConfig.conversation.guidelines));
        setSuccess(`รีเซ็ตการตั้งค่าสำหรับภาษา ${supportedLanguages.find(l => l.code === selectedLanguage)?.name} เรียบร้อยแล้ว`);
    };
    
    // Authentication check early return
    if (!loading && !checkAuth() && !aiSettings) {
        return (
            <Container fluid>
                <div className="d-flex justify-content-center align-items-center" style={{ height: '400px' }}>
                    <Alert variant="warning" className="text-center">
                        <i className="fas fa-lock me-2"></i>
                        <h5>จำเป็นต้องเข้าสู่ระบบ</h5>
                        <p>กรุณาเข้าสู่ระบบก่อนเข้าใช้งานหน้านี้</p>
                        <Button variant="primary" onClick={() => window.location.href = '/login'}>
                            ไปยังหน้าเข้าสู่ระบบ
                        </Button>
                    </Alert>
                </div>
            </Container>
        );
    }

    if (loading || !aiSettings) {
        return (
            <Container fluid>
                <div className="d-flex justify-content-center align-items-center" style={{ height: '400px' }}>
                    <LoadingSpinner size="lg" message="กำลังโหลดการตั้งค่า AI..." />
                </div>
            </Container>
        );
    }

    const knowledgeCount = Object.values(knowledgeData).filter(content => content?.trim()).length;
    const currentLanguageInfo = supportedLanguages.find(l => l.code === selectedLanguage);
    const displayedModelName = currentModel || aiSettings.modelConfig.modelName;

    // Get current character limits for the modal
    const currentLimits = currentKnowledgeCategory ? getCharacterLimits(currentKnowledgeCategory.id) : { maxChars: MAX_CHARS_KNOWLEDGE, warningThreshold: WARNING_THRESHOLD };

    return (
        <Container fluid className="py-4 fade-in">
            {/* Header */}
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div className="d-flex align-items-center">
                    <i className="fas fa-robot text-primary me-2" style={{fontSize: '1.5rem'}}></i>
                    <h2 className="mb-0">ตั้งค่า AI และโมเดลตามภาษา</h2>
                </div>
                <div className="text-muted small d-flex align-items-center">
                    <i className="fas fa-clock me-1"></i>
                    อัปเดตล่าสุด: <span className="ms-1 fw-medium">{lastUpdated}</span>
                </div>
            </div>

            {/* Language Selector */}
            <Card className="card-custom mb-4 shadow-sm">
                <Card.Header className="card-header-custom bg-gradient-primary">
                    <div className="d-flex justify-content-between align-items-center">
                        <h5 className="mb-0 text-white">
                            <i className="fas fa-globe me-2"></i>เลือกภาษาสำหรับตั้งค่า
                        </h5>
                        <Badge bg="light" text="dark" className="d-flex align-items-center px-3 py-2">
                            <span style={{fontSize: '1.2rem'}} className="me-2">{currentLanguageInfo?.flag}</span>
                            <strong>{currentLanguageInfo?.name}</strong>
                        </Badge>
                    </div>
                </Card.Header>
                <Card.Body className="bg-light">
                    <p className="text-muted mb-3">
                        <i className="fas fa-info-circle me-1"></i>
                        เลือกภาษาที่ต้องการตั้งค่าบุคลิกภาพและความรู้ของ AI
                    </p>
                    <Row xs={2} md={3} lg={5} className="g-3">
                        {supportedLanguages.map(lang => (
                            <Col key={lang.code}>
                                <Button
                                    variant={selectedLanguage === lang.code ? "primary" : "outline-primary"}
                                    className={`w-100 d-flex flex-column align-items-center py-3 position-relative ${
                                        selectedLanguage === lang.code ? 'shadow-lg' : 'shadow-sm'
                                    }`}
                                    onClick={() => handleLanguageChange(lang.code)}
                                    style={{
                                        height: '90px',
                                        transform: selectedLanguage === lang.code ? 'scale(1.05)' : 'scale(1)',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <div style={{fontSize: '1.8rem'}} className="mb-1">
                                        {lang.flag}
                                    </div>
                                    <div style={{fontSize: '0.9rem', fontWeight: '600'}}>
                                        {lang.name}
                                    </div>
                                    {selectedLanguage === lang.code && (
                                        <div className="position-absolute top-0 end-0 mt-1 me-1">
                                            <i className="fas fa-check-circle text-success"></i>
                                        </div>
                                    )}
                                </Button>
                            </Col>
                        ))}
                    </Row>
                </Card.Body>
            </Card>

            <Alert variant="warning" className="mb-4 border-0 shadow-sm" style={{borderLeft: '4px solid #ffc107'}}>
                <div className="d-flex">
                    <i className="fas fa-exclamation-triangle text-warning me-3 mt-1"></i>
                    <div>
                        <h6 className="fw-bold mb-2">ข้อควรระวังในการใช้งาน AI</h6>
                        <p className="mb-0 small">
                            AI อาจแสดงข้อมูลที่ผิดพลาดได้ โปรดใช้วิจารณญาณในการนำข้อมูลไปใช้ การตั้งค่าแต่ละภาษาจะแยกอิสระจากกัน
                        </p>
                    </div>
                </div>
            </Alert>

            {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}
            {success && <Alert variant="success" dismissible onClose={() => setSuccess(null)}>{success}</Alert>}

            <Row className="g-4">
                <Col xl={6}>
                    {/* Model Selection */}
                    <Card className="card-custom mb-4 shadow-sm">
                        <Card.Header className="card-header-custom">
                            <div className="d-flex justify-content-between align-items-center">
                                <h5 className="mb-0">
                                    <i className="fas fa-brain me-2"></i>โมเดล AI
                                </h5>
                                <Button variant="outline-light" size="sm" onClick={() => setShowModelConfigModal(true)}>
                                    <i className="fas fa-cog me-1"></i>จัดการโมเดล
                                </Button>
                            </div>
                        </Card.Header>
                        <Card.Body>
                            <div className="mb-3">
                                <Form.Label>โมเดลปัจจุบันสำหรับภาษา {currentLanguageInfo?.name}</Form.Label>
                                <div className="p-3 border rounded bg-light">
                                    <div className="d-flex justify-content-between align-items-center">
                                        <div>
                                            <div className="fw-bold">{displayedModelName}</div>
                                            <small className="text-muted">
                                                API Version: {aiSettings.modelConfig.apiVersion}
                                                {aiSettings.modelConfig.useDirectUrl && ' • Direct URL'}
                                            </small>
                                        </div>
                                        {displayedModelName && (
                                            <Badge bg="success">
                                                <i className="fas fa-check me-1"></i>
                                                ใช้งานอยู่
                                            </Badge>
                                        )}
                                    </div>
                                    {!displayedModelName && <p className="text-muted small mt-1">ยังไม่ได้เลือกโมเดลสำหรับภาษานี้</p>}
                                </div>
                            </div>

                            <div className="mb-3">
                                <Form.Label>เปลี่ยนโมเดลด่วน</Form.Label>
                                <Row className="g-2">
                                    {availableModels.slice(0, 3).map(model => (
                                        <Col key={model.name}>
                                            <Button
                                                variant={displayedModelName === model.name ? "primary" : "outline-secondary"}
                                                size="sm"
                                                className="w-100"
                                                onClick={() => handleModelChange(model.name)}
                                                disabled={displayedModelName === model.name}
                                            >
                                                {model.displayName}
                                                {model.recommended && <i className="fas fa-star ms-1 text-warning"></i>}
                                            </Button>
                                        </Col>
                                    ))}
                                </Row>
                            </div>
                            <Button variant="primary" className="w-100" onClick={() => setShowModelConfigModal(true)}>
                                <i className="fas fa-cog me-2"></i>เปิดการตั้งค่าโมเดลขั้นสูง
                            </Button>
                        </Card.Body>
                    </Card>

                    <Card className="card-custom mb-4 shadow-sm">
                        <Card.Header className="card-header-custom">
                            <h5 className="mb-0"><i className="fas fa-sliders-h me-2"></i>พารามิเตอร์การสร้างข้อความ</h5>
                        </Card.Header>
                        <Card.Body>
                            {[
                                { label: 'Temperature (0.0 - 1.0)', param: 'temperature', min: 0, max: 1, step: 0.1, help: "ควบคุมความสร้างสรรค์" },
                                { label: 'Top P (0.0 - 1.0)', param: 'topP', min: 0, max: 1, step: 0.1, help: "ควบคุมความหลากหลาย" },
                                { label: 'จำนวนโทเค็นสูงสุด (1 - 64000)', param: 'maxOutputTokens', min: 1, max: 64000, step: 1, help: "จำกัดความยาวข้อความ" },
                                { label: 'Top K (1 - 100)', param: 'topK', min: 1, max: 100, step: 1, help: "จำนวนตัวเลือกคำตอบ" },
                            ].map(item => (
                               <Form.Group className="mb-3" key={item.param}>
                                   <Form.Label>{item.label} <small className="text-muted ms-2">({item.help})</small></Form.Label>
                                   <div className="d-flex align-items-center">
                                       <Form.Range
                                           min={item.min} max={item.max} step={item.step}
                                           value={aiSettings.generationConfig[item.param as keyof GenerationConfig] || 0}
                                           onChange={(e) => handleGenerationConfigChange(item.param as keyof GenerationConfig, e.target.value)}
                                           className="flex-grow-1 me-3"
                                       />
                                       <Badge bg="secondary" style={{ minWidth: '60px', textAlign: 'center' }}>
                                           {aiSettings.generationConfig[item.param as keyof GenerationConfig]}
                                       </Badge>
                                   </div>
                               </Form.Group>
                           ))}
                       </Card.Body>
                   </Card>
               </Col>

               <Col xl={6}>
                   {/* AI Personality & Messages Cards */}
                   <Card className="card-custom mb-4 shadow-sm">
                      <Card.Header className="card-header-custom">
                          <h5 className="mb-0">
                              <i className="fas fa-user-tie me-2"></i>บุคลิกภาพของ AI 
                              <span className="ms-2">
                                  {currentLanguageInfo?.flag} {currentLanguageInfo?.name}
                              </span>
                          </h5>
                      </Card.Header>
                      <Card.Body>
                          <Form.Group className="mb-3">
                              <Form.Label>
                                  <i className="fas fa-user me-1 text-muted"></i>
                                  คำอธิบายบุคลิกภาพ
                              </Form.Label>
                              <Form.Control 
                                  as="textarea" 
                                  rows={4} 
                                  value={aiSettings.templateConfig.conversation.personality || ''} 
                                  onChange={(e) => handlePersonalityChange('personality', e.target.value)} 
                                  placeholder="กรอกคำอธิบายบุคลิกภาพของ AI"
                              />
                          </Form.Group>
                      </Card.Body>
                  </Card>

                  <Card className="card-custom mb-4 shadow-sm">
                      <Card.Header className="card-header-custom">
                          <h5 className="mb-0">
                              <i className="fas fa-comments me-2"></i>ข้อความทักทายและจบการสนทนา 
                              <span className="ms-2">
                                  {currentLanguageInfo?.flag} {currentLanguageInfo?.name}
                              </span>
                          </h5>
                      </Card.Header>
                      <Card.Body>
                          <Form.Group className="mb-3">
                              <Form.Label>
                                  <i className="fas fa-hand-wave me-1 text-muted"></i>
                                  ข้อความทักทาย
                              </Form.Label>
                              <Form.Control 
                                  as="textarea"
                                  rows={2}
                                  value={aiSettings.templateConfig.conversation.greeting || ''} 
                                  onChange={(e) => handlePersonalityChange('greeting', e.target.value)} 
                                  placeholder="กรอกข้อความทักทาย"
                              />
                          </Form.Group>
                          <Form.Group className="mb-3">
                              <Form.Label>
                                  <i className="fas fa-sign-out-alt me-1 text-muted"></i>
                                  ข้อความจบการสนทนา
                              </Form.Label>
                              <Form.Control 
                                  as="textarea"
                                  rows={2}
                                  value={aiSettings.templateConfig.conversation.closing || ''} 
                                  onChange={(e) => handlePersonalityChange('closing', e.target.value)} 
                                  placeholder="กรอกข้อความจบการสนทนา"
                              />
                          </Form.Group>
                      </Card.Body>
                  </Card>

                   {/* Knowledge Base Card - Updated to show 12 categories */}
                   <Card className="card-custom mb-4 shadow-lg border-0" style={{background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}>
                      <Card.Header className="border-0" style={{background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)'}}>
                          <div className="d-flex justify-content-between align-items-center">
                              <h5 className="mb-0 text-white fw-bold">
                                  <i className="fas fa-brain me-2" style={{color: '#ffd700'}}></i>
                                  คลังความรู้ AI ตามหมวดหมู่
                              </h5>
                              <div className="d-flex align-items-center text-white">
                                  <span className="me-2">
                                      {currentLanguageInfo?.flag} {currentLanguageInfo?.name}
                                  </span>
                                  <Badge 
                                      bg="light" 
                                      text="dark" 
                                      className="d-flex align-items-center px-3 py-2 shadow-sm"
                                      style={{borderRadius: '20px'}}
                                  >
                                      <i className="fas fa-database me-1"></i>
                                      <strong>{knowledgeCount}/12</strong>
                                  </Badge>
                              </div>
                          </div>
                      </Card.Header>
                      <Card.Body className="p-4" style={{background: 'rgba(255,255,255,0.95)'}}>
                          <div className="mb-4 p-3 rounded-3" style={{background: 'linear-gradient(45deg, #f093fb 0%, #f5576c 100%)', color: 'white'}}>
                              <div className="d-flex align-items-center">
                                  <i className="fas fa-lightbulb me-2" style={{fontSize: '1.5rem'}}></i>
                                  <div>
                                      <h6 className="mb-1 fw-bold">🚀 พลังของ AI ที่ปรับแต่งได้</h6>
                                      <p className="mb-0 small opacity-90">
                                          แต่ละหมวดหมู่จะช่วยให้ AI เข้าใจและตอบคำถามได้แม่นยำยิ่งขึ้น
                                      </p>
                                  </div>
                              </div>
                          </div>

                          <Row xs={1} className="g-3">
                              {knowledgeCategories.map((category, index) => {
                                  const hasContent = knowledgeData[category.id] && knowledgeData[category.id].trim() !== '';
                                  const categoryLimits = getCharacterLimits(category.id);
                                  const isSpecialCategory = category.id === 'cat12';
                                  
                                  return (
                                      <Col key={category.id}>
                                          <div
                                              className={`knowledge-category-card ${hasContent ? 'has-content' : 'empty-content'}`}
                                              onClick={() => handleOpenKnowledgeModal(category)}
                                              style={{
                                                  background: hasContent 
                                                      ? `linear-gradient(135deg, ${category.color}15 0%, ${category.color}25 100%)` 
                                                      : 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
                                                  border: hasContent 
                                                      ? `2px solid ${category.color}40` 
                                                      : '2px dashed #dee2e6',
                                                  borderRadius: '15px',
                                                  padding: '16px',
                                                  cursor: 'pointer',
                                                  transition: 'all 0.3s ease',
                                                  position: 'relative',
                                                  overflow: 'hidden'
                                              }}
                                              onMouseEnter={(e) => {
                                                  e.currentTarget.style.transform = 'translateY(-2px)';
                                                  e.currentTarget.style.boxShadow = `0 8px 25px ${category.color}30`;
                                              }}
                                              onMouseLeave={(e) => {
                                                  e.currentTarget.style.transform = 'translateY(0)';
                                                  e.currentTarget.style.boxShadow = 'none';
                                              }}
                                          >
                                              {/* Special indicator for category 12 */}
                                              {isSpecialCategory && (
                                                  <div className="position-absolute top-0 start-0 m-2">
                                                      <Badge bg="warning" className="small">
                                                          <i className="fas fa-star me-1"></i>5.5K
                                                      </Badge>
                                                  </div>
                                              )}
                                              
                                              <div 
                                                  className="position-absolute top-0 end-0 opacity-10"
                                                  style={{ fontSize: '3rem', transform: 'rotate(15deg) translate(10px, -10px)'}}
                                              >
                                                  <i className={category.icon}></i>
                                              </div>
                                              <div className="d-flex align-items-center">
                                                  <div 
                                                      className="me-3 d-flex align-items-center justify-content-center rounded-circle"
                                                      style={{
                                                          width: '50px', height: '50px',
                                                          background: `linear-gradient(135deg, ${category.color} 0%, ${category.color}80 100%)`,
                                                          color: 'white', boxShadow: `0 4px 15px ${category.color}40`
                                                      }}
                                                  >
                                                      <i className={`${category.icon} fa-lg`}></i>
                                                  </div>
                                                  <div className="flex-grow-1">
                                                      <h6 className="mb-1 fw-bold" style={{color: hasContent ? category.color : '#6c757d'}}>
                                                          {category.title}
                                                          {isSpecialCategory && (
                                                              <span className="ms-2 small text-warning">
                                                                  <i className="fas fa-crown"></i>
                                                              </span>
                                                          )}
                                                      </h6>
                                                      {hasContent ? (
                                                          <p className="mb-0 small text-muted">{knowledgeData[category.id].substring(0, 50)}...</p>
                                                      ) : (
                                                          <p className="mb-0 small text-muted">
                                                              คลิกเพื่อเพิ่มความรู้ {isSpecialCategory && '(สูงสุด 5,500 ตัวอักษร)'}
                                                          </p>
                                                      )}
                                                  </div>
                                                  <div className="ms-2">
                                                      {hasContent ? (
                                                          <div className="d-flex flex-column align-items-center">
                                                              <Badge style={{ background: `linear-gradient(135deg, ${category.color} 0%, ${category.color}80 100%)`, border: 'none', borderRadius: '12px', padding: '6px 12px' }} className="mb-1">
                                                                  <i className="fas fa-check me-1"></i>ครบถ้วน
                                                              </Badge>
                                                              <small className="text-muted">
                                                                  {knowledgeData[category.id].length.toLocaleString()} / {categoryLimits.maxChars.toLocaleString()} ตัวอักษร
                                                              </small>
                                                          </div>
                                                      ) : (
                                                          <div className="d-flex flex-column align-items-center">
                                                              <Badge bg="light" text="dark" className="mb-1" style={{borderRadius: '12px', padding: '6px 12px'}}>
                                                                  <i className="fas fa-plus me-1"></i>เพิ่มข้อมูล
                                                              </Badge>
                                                              <small className="text-muted">ว่าง</small>
                                                          </div>
                                                      )}
                                                  </div>
                                              </div>
                                              <div className="mt-3">
                                                  <div className="progress" style={{height: '4px', borderRadius: '2px'}}>
                                                      <div className="progress-bar" style={{ 
                                                          width: hasContent ? `${Math.min((knowledgeData[category.id].length / categoryLimits.maxChars) * 100, 100)}%` : '0%', 
                                                          background: `linear-gradient(90deg, ${category.color} 0%, ${category.color}80 100%)`, 
                                                          transition: 'width 0.3s ease' 
                                                      }}></div>
                                                  </div>
                                              </div>
                                          </div>
                                      </Col>
                                  );
                              })}
                          </Row>
                          <div className="mt-4 p-3 rounded-3" style={{background: 'linear-gradient(45deg, #a8edea 0%, #fed6e3 100%)'}}>
                              <Row className="text-center">
                                  <Col xs={4}><div className="fw-bold fs-4" style={{color: '#2d3436'}}>{knowledgeCount}</div><small className="text-muted">หมวดมีข้อมูล</small></Col>
                                  <Col xs={4}><div className="fw-bold fs-4" style={{color: '#2d3436'}}>{12 - knowledgeCount}</div><small className="text-muted">หมวดที่ว่าง</small></Col>
                                  <Col xs={4}><div className="fw-bold fs-4" style={{color: '#2d3436'}}>{Math.round((knowledgeCount / 12) * 100)}%</div><small className="text-muted">ความสมบูรณ์</small></Col>
                              </Row>
                          </div>
                      </Card.Body>
                  </Card>
               </Col>
           </Row>

           {/* Action Buttons */}
          <div className="d-flex gap-3 mt-4 pt-3 border-top">
              <Button 
                  variant="success" size="lg" onClick={handleSaveLanguageSettings} disabled={saving}
                  className="flex-fill d-flex justify-content-center align-items-center shadow-sm"
                  style={{padding: '12px 24px', borderRadius: '12px'}}
              >
                  {saving ? <><div className="spinner-border spinner-border-sm me-2"></div>กำลังบันทึก...</> : <><i className="fas fa-save me-2"></i>บันทึก ({currentLanguageInfo?.flag} {currentLanguageInfo?.name})</>}
              </Button>
              <Button 
                  variant="secondary" size="lg" onClick={handleResetSettings} disabled={saving}
                  className="flex-fill d-flex justify-content-center align-items-center shadow-sm"
                  style={{padding: '12px 24px', borderRadius: '12px'}}
              >
                  <i className="fas fa-undo me-2"></i>รีเซ็ตการตั้งค่า
              </Button>
          </div>

          {/* Initialize All Languages Button */}
          <div className="d-flex justify-content-center mt-3">
              <Button 
                  variant="outline-info" 
                  onClick={async () => {
                      setSaving(true);
                      try {
                          const response = await fetchWithAuth('/api/config/languages/initialize', { method: 'POST' });
                          const data = await response.json();
                          if (data.success) {
                              setSuccess('เริ่มต้นการตั้งค่าสำหรับทุกภาษาเรียบร้อยแล้ว กำลังโหลดข้อมูลใหม่...');
                              await loadAllLanguageSettings();
                          } else {
                              setError(data.error || 'ไม่สามารถเริ่มต้นการตั้งค่าได้');
                          }
                      } catch (error: any) {
                          setError('เกิดข้อผิดพลาด: ' + error.message);
                      } finally {
                          setSaving(false);
                      }
                  }}
                  disabled={saving}
                  className="shadow-sm" style={{borderRadius: '12px'}}
              >
                  <i className="fas fa-globe me-2"></i>เริ่มต้นการตั้งค่าสำหรับทุกภาษา
              </Button>
          </div>

           {/* Knowledge Editor Modal - Updated with dynamic limits */}
           <Modal show={showKnowledgeModal} onHide={handleCloseKnowledgeModal} size="lg" centered backdrop="static">
              <Modal.Header closeButton style={{ background: `linear-gradient(135deg, ${currentKnowledgeCategory?.color || '#6c757d'} 0%, ${currentKnowledgeCategory?.color || '#6c757d'}80 100%)`, color: 'white', border: 'none' }}>
                  <Modal.Title>
                      <div className="d-flex align-items-center">
                          <div className="me-3 d-flex align-items-center justify-content-center rounded-circle bg-white" style={{ width: '40px', height: '40px', color: currentKnowledgeCategory?.color || '#6c757d' }}>
                              <i className={`${currentKnowledgeCategory?.icon || 'fas fa-edit'}`}></i>
                          </div>
                          <div>
                              <div className="fw-bold">
                                  {currentKnowledgeCategory?.title}
                                  {currentKnowledgeCategory?.id === 'cat12' && (
                                      <span className="ms-2">
                                          <i className="fas fa-crown text-warning"></i>
                                      </span>
                                  )}
                              </div>
                              <div className="small opacity-90">
                                  ภาษา: {currentLanguageInfo?.flag} {currentLanguageInfo?.name}
                                  {currentKnowledgeCategory?.id === 'cat12' && (
                                      <span className="ms-2 text-warning">• ขีดจำกัดพิเศษ 5,500 ตัวอักษร</span>
                                  )}
                              </div>
                          </div>
                      </div>
                  </Modal.Title>
              </Modal.Header>
              <Modal.Body className="p-4">
                  <Form.Group>
                      <Form.Label className="fw-bold mb-3">
                          <i className="fas fa-edit me-2 text-primary"></i>
                          ข้อมูลความรู้ (สูงสุด {currentLimits.maxChars.toLocaleString()} ตัวอักษร)
                          {currentKnowledgeCategory?.id === 'cat12' && (
                              <Badge bg="warning" className="ms-2">
                                  <i className="fas fa-star me-1"></i>หมวดพิเศษ
                              </Badge>
                          )}
                      </Form.Label>
                      <Form.Control
                          as="textarea" rows={12} value={editingKnowledgeContent}
                          onChange={(e) => handleKnowledgeContentChange(e.target.value)}
                          placeholder={`กรอกข้อมูลความรู้สำหรับ "${currentKnowledgeCategory?.title}" ในภาษา ${currentLanguageInfo?.name}${currentKnowledgeCategory?.id === 'cat12' ? ' (สามารถใส่ข้อมูลได้มากถึง 5,500 ตัวอักษร)' : ''}`}
                          style={{ 
                              resize: 'vertical', 
                              borderRadius: '8px', 
                              border: charCount >= currentLimits.maxChars ? '2px solid #dc3545' : 
                                     charCount >= currentLimits.warningThreshold ? '2px solid #ffc107' : 
                                     '1px solid #ced4da' 
                          }}
                      />
                      <div className="d-flex justify-content-between align-items-center mt-2">
                          <small className="text-muted">
                              <i className="fas fa-lightbulb me-1"></i>
                              AI จะใช้ข้อมูลนี้ในการตอบคำถาม
                              {currentKnowledgeCategory?.id === 'cat12' && (
                                  <span className="text-warning ms-2">
                                      <i className="fas fa-crown me-1"></i>หมวดสินค้ามีพื้นที่เก็บข้อมูลมากกว่าหมวดอื่น
                                  </span>
                              )}
                          </small>
                          <div className="d-flex align-items-center">
                              <small className={`fw-bold text-${charCount >= currentLimits.maxChars ? 'danger' : charCount >= currentLimits.warningThreshold ? 'warning' : 'success'}`}>
                                  {charCount.toLocaleString()}/{currentLimits.maxChars.toLocaleString()}
                              </small>
                              {charCount >= currentLimits.warningThreshold && (
                                  <i className={`fas fa-exclamation-triangle ms-2 text-${charCount >= currentLimits.maxChars ? 'danger' : 'warning'}`} title="ใกล้ถึงขีดจำกัด"></i>
                              )}
                          </div>
                      </div>
                      <div className="mt-2">
                          <div className="progress" style={{height: '6px', borderRadius: '3px'}}>
                              <div className={`progress-bar ${charCount >= currentLimits.maxChars ? 'bg-danger' : charCount >= currentLimits.warningThreshold ? 'bg-warning' : 'bg-success'}`} 
                                   style={{ 
                                       width: `${Math.min((charCount / currentLimits.maxChars) * 100, 100)}%`, 
                                       transition: 'all 0.3s ease' 
                                   }}>
                              </div>
                          </div>
                      </div>
                      {charCount >= currentLimits.maxChars && (
                          <Alert variant="danger" className="mt-3 mb-0">
                              <div className="d-flex align-items-center">
                                  <i className="fas fa-exclamation-circle me-2"></i>
                                  <strong>ถึงขีดจำกัดแล้ว!</strong>
                              </div>
                              <small>ลดจำนวนตัวอักษรก่อนบันทึก</small>
                          </Alert>
                      )}
                  </Form.Group>
              </Modal.Body>
              <Modal.Footer className="border-0 bg-light">
                  <Button variant="outline-secondary" onClick={handleCloseKnowledgeModal}>
                      <i className="fas fa-times me-1"></i>ยกเลิก
                  </Button>
                  <Button 
                      variant="primary" 
                      onClick={handleSaveKnowledge} 
                      disabled={charCount > currentLimits.maxChars} 
                      style={{ 
                          background: `linear-gradient(135deg, ${currentKnowledgeCategory?.color || '#007bff'} 0%, ${currentKnowledgeCategory?.color || '#007bff'}80 100%)`, 
                          border: 'none' 
                      }}
                  >
                      <i className="fas fa-save me-1"></i>บันทึกความรู้
                  </Button>
              </Modal.Footer>
          </Modal>

           {/* AI Model Configuration Modal */}
           <AIModelConfigModal
               show={showModelConfigModal}
               onHide={() => setShowModelConfigModal(false)}
               language={selectedLanguage}
               languageLabel={currentLanguageInfo?.name || selectedLanguage}
               onModelChanged={(modelName) => {
                   handleModelChange(modelName);
                   const updatedSettings = {
                       ...aiSettings!,
                       modelConfig: { ...aiSettings!.modelConfig, modelName: modelName }
                   };
                   setLanguageSettings(prev => ({
                       ...prev,
                       [selectedLanguage]: updatedSettings
                   }));
                   setSuccess(`เปลี่ยนโมเดลสำหรับภาษา ${currentLanguageInfo?.name} เป็น ${modelName} เรียบร้อยแล้ว`);
               }}
               onConfigSaved={(savedSettings: AISettings) => {
                   setAiSettings(savedSettings);
                   setCurrentModel(savedSettings.modelConfig.modelName);
                   setLanguageSettings(prev => ({
                       ...prev,
                       [selectedLanguage]: savedSettings
                   }));
                   setSuccess(`บันทึกการตั้งค่าโมเดลสำหรับภาษา ${currentLanguageInfo?.name} เรียบร้อยแล้ว`);
               }}
           />

           {/* Styles */}
           <style>{`
              .knowledge-category-card { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
              .knowledge-category-card:hover { transform: translateY(-2px) scale(1.02); }
              .bg-gradient-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important; }
              .fade-in { animation: fadeIn 0.5s ease-in; }
              @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
              .card-custom { border: none; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); transition: box-shadow 0.3s ease; }
              .card-custom:hover { box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15); }
              .card-header-custom { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-bottom: none; }
          `}</style>
       </Container>
   );
};

export default ModelConfigurationPage;
