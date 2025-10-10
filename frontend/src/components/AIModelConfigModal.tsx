// src/components/AIModelConfigModal.tsx (Updated version with per-language saving)
import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Form, Button, Alert, Card, Badge, Row, Col, Spinner, Tabs, Tab } from 'react-bootstrap';
import { AISettings, GenerationConfig, ModelConfig, TemplateConfig } from '../types'; // Added ModelConfig, TemplateConfig
import ModelSelectionCard from './ModelSelectionCard';
import GenerationConfigPanel from './GenerationConfigPanel';
import ModelTestPanel from './ModelTestPanel';
import { aiModelApi, aiTestApi, languageApi } from '../services/api';

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

interface AIModelConfigModalProps {
    show: boolean;
    onHide: () => void;
    language: string;
    languageLabel: string;
    // initialSettings: AISettings; // Consider passing full initial settings if available from parent
    onModelChanged?: (modelName: string) => void; // Called when model choice is successfully persisted for the language
    onConfigSaved?: (config: AISettings) => void; // Called when any configuration is successfully persisted
}

interface TestResult {
    success: boolean;
    response?: string;
    modelName?: string;
    duration?: number;
    tokens?: { input: number; output: number };
    error?: string;
}

// Helper function to create default AISettings (can be moved to a shared utils file)
const createDefaultAISettings = (): AISettings => ({
    modelConfig: {
        modelName: '', // Default model, or perhaps the first available one
        apiVersion: 'v1',
        modelUrl: '',
        useDirectUrl: false,
    },
    generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 1999, // Consistent with original state
        topK: 40,
    },
    templateConfig: { // Basic template config
        conversation: {
            personality: '',
            greeting: '',
            closing: '',
            guidelines: [],
        },
    },
});


const AIModelConfigModal: React.FC<AIModelConfigModalProps> = ({
    show,
    onHide,
    language,
    languageLabel,
    onModelChanged,
    onConfigSaved
}) => {
    const [activeTab, setActiveTab] = useState('models');
    const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
    
    // Renamed currentModel to modelForLanguage to reflect it's the saved model for the current language context
    const [modelForLanguage, setModelForLanguage] = useState<string>('');
    // selectedModelInUI is what the user clicks on, might not be saved yet
    const [selectedModelInUI, setSelectedModelInUI] = useState<string>('');

    const [generationConfig, setGenerationConfig] = useState<GenerationConfig>(createDefaultAISettings().generationConfig);
    
    // Stores the full AISettings for the current language, loaded initially and updated on save
    const [currentLanguageSettings, setCurrentLanguageSettings] = useState<AISettings>(createDefaultAISettings());

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [alert, setAlert] = useState<{ message: string; type: 'success' | 'danger' | 'warning' | 'info' } | null>(null);

    const loadInitialData = useCallback(async () => {
        setLoading(true);
        setAlert(null);
        let fetchedModels: ModelInfo[] = [];
        let initialSettings = createDefaultAISettings();

        try {
            // 1. Fetch available models (global list)
            const modelsResponse = await aiModelApi.getAllModels();
            if (modelsResponse.success && modelsResponse.data) {
                fetchedModels = modelsResponse.data.models;
                setAvailableModels(fetchedModels);
            } else {
                throw new Error(modelsResponse.error || 'ไม่สามารถแยกแยะรายการโมเดลได้');
            }

            // 2. Fetch current configuration for the specific language
            const configResponse = await languageApi.getLanguageConfig(language);

            if (configResponse.success && configResponse.data) {
                initialSettings = { // Ensure all parts of AISettings are present
                    modelConfig: configResponse.data.settings.modelConfig || createDefaultAISettings().modelConfig,
                    generationConfig: configResponse.data.settings.generationConfig || createDefaultAISettings().generationConfig,
                    templateConfig: configResponse.data.settings.templateConfig || createDefaultAISettings().templateConfig,
                };
            } else {
                 console.warn(`ไม่สามารถโหลดการตั้งค่าสำหรับภาษา ${language} (สถานะ: ${configResponse.status}), ใช้ค่าเริ่มต้น`);
            }
            
            setCurrentLanguageSettings(initialSettings);
            setGenerationConfig(initialSettings.generationConfig);
            setModelForLanguage(initialSettings.modelConfig.modelName);
            setSelectedModelInUI(initialSettings.modelConfig.modelName || (fetchedModels.length > 0 ? fetchedModels[0].name : ''));


        } catch (error) {
            console.error('Error loading initial data:', error);
            setAlert({
                message: `ไม่สามารถโหลดข้อมูลเริ่มต้นได้: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'danger'
            });
            // Fallback to complete defaults on major error
            const defaults = createDefaultAISettings();
            setCurrentLanguageSettings(defaults);
            setGenerationConfig(defaults.generationConfig);
            setModelForLanguage(defaults.modelConfig.modelName);
            setSelectedModelInUI(defaults.modelConfig.modelName);
            if (!fetchedModels.length) setAvailableModels([]); // Clear models if not fetched
        } finally {
            setLoading(false);
        }
    }, [language]);

    useEffect(() => {
        if (show) {
            loadInitialData();
        }
    }, [show, loadInitialData]); // loadInitialData is stable due to useCallback with 'language'

    const refreshModels = async () => {
       setRefreshing(true);
       setAlert(null);
       try {
           const response = await aiModelApi.refreshModels();
           if (response.success) {
               // Re-load available models, language config might still be relevant or could be re-fetched too
               // For now, just reloading model list and current selection based on it.
                const modelsResponse = await aiModelApi.getAllModels();
                if (modelsResponse.success && modelsResponse.data) {
                    setAvailableModels(modelsResponse.data.models || []);
                }

               setAlert({ message: 'รีเฟรชรายการโมเดลสำเร็จ', type: 'success' });
           } else {
               throw new Error(response.error || 'ไม่สามารถรีเฟรชได้');
           }
       } catch (error) {
           console.error('Error refreshing models:', error);
           setAlert({ message: `ไม่สามารถรีเฟรชรายการโมเดลได้: ${error instanceof Error ? error.message : 'Error'}`, type: 'danger' });
       } finally {
           setRefreshing(false);
       }
   };

   const handleModelSelect = (modelName: string) => {
       setSelectedModelInUI(modelName);
   };

   // "เปลี่ยนเป็นโมเดลนี้" button action
   const switchToModel = async () => {
       if (!selectedModelInUI || selectedModelInUI === modelForLanguage) {
           return;
       }
       setSaving(true);
       setAlert(null);
       try {
           const modelInfo = availableModels.find(m => m.name === selectedModelInUI);
           if (!modelInfo) throw new Error('ไม่พบรายละเอียดโมเดลที่เลือก');

           const newModelConfig: ModelConfig = {
               modelName: selectedModelInUI,
               apiVersion: modelInfo.apiVersion,
               modelUrl: modelInfo.useDirectUrl ? `https://generativelanguage.googleapis.com/${modelInfo.apiVersion}/models/${selectedModelInUI}` : '',
               useDirectUrl: modelInfo.useDirectUrl,
           };

           const settingsToSave: AISettings = {
               ...currentLanguageSettings, // Base settings for the language
               modelConfig: newModelConfig,
               generationConfig: generationConfig, // Persist current generation config as well
           };

           const response = await languageApi.saveLanguageConfig(language, settingsToSave);

           if (response.success) {
               setModelForLanguage(selectedModelInUI); // Update the persisted model for the language
               setCurrentLanguageSettings(settingsToSave); // Update the full settings state

               setAlert({
                   message: `เปลี่ยนโมเดลสำหรับภาษา ${languageLabel} เป็น ${selectedModelInUI} เรียบร้อยแล้ว`,
                   type: 'success'
               });
               
               if (onModelChanged) onModelChanged(selectedModelInUI);
               if (onConfigSaved) onConfigSaved(settingsToSave);
               
           } else {
               throw new Error(response.error || 'ไม่สามารถเปลี่ยนโมเดลได้');
           }
       } catch (error) {
           console.error('Error switching model:', error);
           setAlert({
               message: `ไม่สามารถเปลี่ยนโมเดลได้: ${error instanceof Error ? error.message : 'Unknown error'}`,
               type: 'danger'
           });
       } finally {
           setSaving(false);
       }
   };

   const testModel = async (query: string): Promise<TestResult> => {
       try {
           const response = await aiTestApi.testModel({ // This API likely uses the globally active model or one specified
               modelName: selectedModelInUI, // Test with the UI selected model
               testQuery: query,
               // If your test API can accept generationConfig, pass it:
               // generationConfig: generationConfig 
           });

           if (response.success && response.data) {
               return {
                   success: true,
                   response: response.data.result?.response || response.data.response,
                   modelName: selectedModelInUI,
                   tokens: response.data.result?.tokens,
                   duration: response.data.result?.duration
               };
           } else {
               throw new Error(response.error || 'ทดสอบล้มเหลว');
           }
       } catch (error) {
           throw new Error(error instanceof Error ? error.message : 'Unknown error');
       }
   };

   // "บันทึกพารามิเตอร์" button action
   const saveGenerationConfig = async () => {
       setSaving(true);
       setAlert(null);

       try {
           const modelInfo = availableModels.find(m => m.name === selectedModelInUI);
           // If selectedModelInUI is somehow invalid, use modelForLanguage as fallback for modelConfig
           const effectiveModelName = modelInfo ? selectedModelInUI : modelForLanguage;
           const effectiveModelDetails = modelInfo || availableModels.find(m => m.name === modelForLanguage);
           
           if (!effectiveModelDetails && effectiveModelName) {
                console.warn(`Model info for ${effectiveModelName} not found. Model config might be incomplete.`);
           }

           const updatedModelConfig: ModelConfig = effectiveModelDetails ? {
               modelName: effectiveModelDetails.name,
               apiVersion: effectiveModelDetails.apiVersion,
               modelUrl: effectiveModelDetails.useDirectUrl ? `https://generativelanguage.googleapis.com/${effectiveModelDetails.apiVersion}/models/${effectiveModelDetails.name}` : '',
               useDirectUrl: effectiveModelDetails.useDirectUrl,
           } : currentLanguageSettings.modelConfig; // Fallback to existing if no details found

           const settingsToSave: AISettings = {
               ...currentLanguageSettings,
               modelConfig: updatedModelConfig, // Ensure model config reflects current UI choice if valid, or existing
               generationConfig: generationConfig, // The generationConfig being edited
           };

           const response = await languageApi.saveLanguageConfig(language, settingsToSave);

           if (response.success) {
               setCurrentLanguageSettings(settingsToSave); // Update the full settings state
               // If selectedModelInUI was different and now saved, modelForLanguage might need update if this save implies model change too
               setModelForLanguage(settingsToSave.modelConfig.modelName);


               setAlert({
                   message: `บันทึกการตั้งค่าสำหรับภาษา ${languageLabel} เรียบร้อยแล้ว`,
                   type: 'success'
               });
               
               if (onConfigSaved) {
                   onConfigSaved(settingsToSave);
               }
           } else {
               throw new Error(response.error || 'ไม่สามารถบันทึกได้');
           }
       } catch (error) {
           console.error('Error saving config:', error);
           setAlert({
               message: `ไม่สามารถบันทึกการตั้งค่าได้: ${error instanceof Error ? error.message : 'Unknown error'}`,
               type: 'danger'
           });
       } finally {
           setSaving(false);
       }
   };

   const handleGenerationConfigChange = (field: keyof GenerationConfig, value: number) => {
       setGenerationConfig(prev => ({
           ...prev,
           [field]: value
       }));
   };

   const handleClose = () => {
       setAlert(null);
       setActiveTab('models');
       onHide();
   };

   const getUISselectedModelInfo = () => { // For "Info" tab, shows details of model selected in UI
       return availableModels.find(model => model.name === selectedModelInUI);
   };
   
   const getLanguageModelInfo = () => { // For "โมเดลปัจจุบัน" card
        return availableModels.find(model => model.name === modelForLanguage);
   }

   return (
       <Modal 
           show={show} 
           onHide={handleClose} 
           size="xl" 
           centered
           backdrop="static"
           className="ai-model-config-modal"
       >
           <Modal.Header closeButton>
               <Modal.Title>
                   <i className="fas fa-robot me-2"></i>
                   ตั้งค่าโมเดล AI สำหรับภาษา {languageLabel}
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
                       <div className="d-flex align-items-center">
                           <i className={`fas fa-${alert.type === 'success' ? 'check-circle' : 
                               alert.type === 'danger' ? 'exclamation-circle' : 
                               alert.type === 'warning' ? 'exclamation-triangle' : 'info-circle'} me-2`}></i>
                           {alert.message}
                       </div>
                   </Alert>
               )}

               {loading ? (
                   <div className="text-center py-5">
                       <Spinner animation="border" variant="primary" // Changed size to default from lg
                       /> 
                       <p className="mt-3">กำลังโหลดข้อมูล...</p>
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
                                   {availableModels.length > 0 && (
                                       <Badge bg="primary" className="ms-2">{availableModels.length}</Badge>
                                   )}
                               </span>
                           }
                       >
                           <div className="mb-4">
                               <div className="d-flex justify-content-between align-items-center mb-3">
                                   <h5 className="mb-0">
                                       <i className="fas fa-list me-2"></i>
                                       โมเดลที่ใช้ได้
                                   </h5>
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

                               {/* Current Model Info - This is the model saved for the language */}
                               {modelForLanguage && (
                                   <Card className="mb-3 border-success">
                                       <Card.Header className="bg-success text-white">
                                           <h6 className="mb-0">
                                               <i className="fas fa-check-circle me-2"></i>
                                               โมเดลปัจจุบันสำหรับภาษานี้
                                           </h6>
                                       </Card.Header>
                                       <Card.Body>
                                           <div className="d-flex justify-content-between align-items-center">
                                               <div>
                                                   <div className="fw-bold">{modelForLanguage}</div>
                                                   <small className="text-muted">
                                                       {getLanguageModelInfo()?.displayName}
                                                   </small>
                                               </div>
                                               <Badge bg="success">ใช้งานอยู่สำหรับ {languageLabel}</Badge>
                                           </div>
                                       </Card.Body>
                                   </Card>
                               )}

                               {/* Models Grid */}
                               <Row>
                                   {availableModels.map(model => (
                                       <Col md={6} lg={4} key={model.name} className="mb-3">
                                           <ModelSelectionCard
                                               model={model}
                                               isActive={modelForLanguage === model.name} // Active is the one saved for the language
                                               isSelected={selectedModelInUI === model.name} // Selected is what's picked in UI
                                               onSelect={handleModelSelect}
                                               onTest={() => { setSelectedModelInUI(model.name); setActiveTab('test');}} // Ensure model is selected before testing
                                               onSwitch={switchToModel} // This button will only be enabled if selectedModelInUI !== modelForLanguage
                                           />
                                       </Col>
                                   ))}
                               </Row>

                               {availableModels.length === 0 && !loading && (
                                   <Alert variant="warning">
                                       <i className="fas fa-exclamation-triangle me-2"></i>
                                       ไม่พบโมเดลที่ใช้ได้ กรุณารีเฟรชรายการ
                                   </Alert>
                               )}
                           </div>
                       </Tab>

                       <Tab 
                           eventKey="config" 
                           title={
                               <span>
                                   <i className="fas fa-sliders-h me-2"></i>
                                   พารามิเตอร์
                               </span>
                           }
                       >
                           <GenerationConfigPanel
                               config={generationConfig}
                               onChange={handleGenerationConfigChange}
                               disabled={saving}
                           />
                       </Tab>

                       <Tab 
                           eventKey="test" 
                           title={
                               <span>
                                   <i className="fas fa-flask me-2"></i>
                                   ทดสอบ
                               </span>
                           }
                       >
                           <ModelTestPanel
                               selectedModel={selectedModelInUI} // Test panel uses the UI selected model
                               modelDisplayName={availableModels.find(m => m.name === selectedModelInUI)?.displayName}
                               onTest={testModel}
                               disabled={!selectedModelInUI}
                           />
                       </Tab>

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
                                           <table className="table table-sm">
                                               <tbody>
                                                   <tr>
                                                       <td><strong>โมเดลที่เลือกใน UI:</strong></td>
                                                       <td>{selectedModelInUI || 'ยังไม่ได้เลือก'}</td>
                                                   </tr>
                                                   <tr>
                                                       <td><strong>โมเดลปัจจุบัน ({languageLabel}):</strong></td>
                                                       <td>{modelForLanguage || 'ไม่ทราบ'}</td>
                                                   </tr>
                                                   <tr>
                                                       <td><strong>ภาษา:</strong></td>
                                                       <td>{languageLabel}</td>
                                                   </tr>
                                                   <tr>
                                                       <td><strong>จำนวนโมเดลทั้งหมด:</strong></td>
                                                       <td>{availableModels.length}</td>
                                                   </tr>
                                               </tbody>
                                           </table>
                                       </Col>
                                       <Col md={6}>
                                           <h6>พารามิเตอร์ (ที่กำลังแก้ไข)</h6>
                                           <table className="table table-sm">
                                               <tbody>
                                                   <tr>
                                                       <td><strong>Temperature:</strong></td>
                                                       <td>{generationConfig.temperature}</td>
                                                   </tr>
                                                   <tr>
                                                       <td><strong>Top P:</strong></td>
                                                       <td>{generationConfig.topP}</td>
                                                   </tr>
                                                   <tr>
                                                       <td><strong>Top K:</strong></td>
                                                       <td>{generationConfig.topK}</td>
                                                   </tr>
                                                   <tr>
                                                       <td><strong>Max Tokens:</strong></td>
                                                       <td>{generationConfig.maxOutputTokens.toLocaleString()}</td>
                                                   </tr>
                                               </tbody>
                                           </table>
                                       </Col>
                                   </Row>

                                   {/* Model Details for UI Selected Model */}
                                   {selectedModelInUI && (
                                       <div className="mt-4">
                                           <h6>รายละเอียดโมเดล ({getUISselectedModelInfo()?.displayName})</h6>
                                           {(() => {
                                               const modelInfo = getUISselectedModelInfo();
                                               if (!modelInfo) return <p className="text-muted">ไม่พบข้อมูลโมเดล</p>;
                                               
                                               return (
                                                   <Card className="border-primary">
                                                       <Card.Body>
                                                           <h6 className="card-title">{modelInfo.displayName}</h6>
                                                           <p className="card-text">{modelInfo.description}</p>
                                                           <Row className="small">
                                                               <Col md={6}>
                                                                   <strong>Input Limit:</strong> {modelInfo.inputTokenLimit.toLocaleString()} tokens<br />
                                                                   <strong>Output Limit:</strong> {modelInfo.outputTokenLimit.toLocaleString()} tokens<br />
                                                                   <strong>API Version:</strong> {modelInfo.apiVersion}
                                                               </Col>
                                                               <Col md={6}>
                                                                   <strong>Category:</strong> {modelInfo.category}<br />
                                                                   <strong>Direct URL:</strong> {modelInfo.useDirectUrl ? 'Yes' : 'No'}<br />
                                                                   <strong>Methods:</strong> {modelInfo.supportedMethods.join(', ')}
                                                               </Col>
                                                           </Row>
                                                           {modelInfo.recommended && (
                                                               <Badge bg="success" className="mt-2">
                                                                   <i className="fas fa-star me-1"></i>
                                                                   แนะนำ
                                                               </Badge>
                                                           )}
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
           </Modal.Body>

           <Modal.Footer className="border-top">
               <div className="d-flex w-100 justify-content-between align-items-center">
                   <div className="text-muted small">
                       {selectedModelInUI && selectedModelInUI !== modelForLanguage && (
                           <span>
                               <i className="fas fa-info-circle me-1"></i>
                               โมเดลที่เลือก ({selectedModelInUI}) แตกต่างจากที่บันทึกไว้ ({modelForLanguage})
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
                           onClick={saveGenerationConfig} // Saves current genConfig and selectedModelInUI for the language
                           disabled={saving}
                       >
                           {saving ? (
                               <Spinner animation="border" size="sm" className="me-1" />
                           ) : (
                               <i className="fas fa-save me-1"></i>
                           )}
                           บันทึกพารามิเตอร์
                       </Button>
                       
                       {selectedModelInUI && selectedModelInUI !== modelForLanguage && ( // Enable only if different
                           <Button 
                               variant="primary" 
                               onClick={switchToModel} // Makes selectedModelInUI the modelForLanguage and saves
                               disabled={saving || !selectedModelInUI}
                           >
                               {saving ? (
                                   <Spinner animation="border" size="sm" className="me-1" />
                               ) : (
                                   <i className="fas fa-exchange-alt me-1"></i>
                               )}
                               เปลี่ยนเป็นโมเดลนี้ ({selectedModelInUI})
                           </Button>
                       )}
                   </div>
               </div>
           </Modal.Footer>
            {/* CSS styles remain the same */}
           <style>{`
               .ai-model-config-modal .modal-dialog { max-width: 90vw; }
               .ai-model-config-modal .modal-body { padding: 1.5rem; }
               .ai-model-config-modal .nav-tabs { border-bottom: 2px solid #dee2e6; }
               .ai-model-config-modal .nav-tabs .nav-link { border: none; border-bottom: 3px solid transparent; background: none; color: #6c757d; font-weight: 500; padding: 0.75rem 1rem; }
               .ai-model-config-modal .nav-tabs .nav-link:hover { border-color: transparent; color: #495057; background-color: #f8f9fa; }
               .ai-model-config-modal .nav-tabs .nav-link.active { color: #007bff; border-bottom-color: #007bff; background: none; }
               @media (max-width: 768px) {
                   .ai-model-config-modal .modal-dialog { max-width: 95vw; margin: 0.5rem; }
                   .ai-model-config-modal .modal-body { padding: 1rem; }
               }
           `}</style>
       </Modal>
   );
};

export default AIModelConfigModal;