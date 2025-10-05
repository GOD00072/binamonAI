import React, { useState, useEffect, useCallback } from 'react';

interface ContextWindowConfig {
  id: string;
  key: string;
  system_prompt: string;
  use_product_rag: boolean;
  use_knowledge_rag: boolean;
  max_context_messages: number;
  include_user_history: boolean;
  temperature: number;
  model_name: string;
  max_tokens: number;
  created_at: string;
  last_updated: string;
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

const ContextWindowPage: React.FC = () => {
  const [config, setConfig] = useState<ContextWindowConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);

  // Form state
  const [systemPrompt, setSystemPrompt] = useState('');
  const [useProductRAG, setUseProductRAG] = useState(true);
  const [useKnowledgeRAG, setUseKnowledgeRAG] = useState(true);
  const [maxContextMessages, setMaxContextMessages] = useState(10);
  const [includeUserHistory, setIncludeUserHistory] = useState(true);
  const [temperature, setTemperature] = useState(0.7);
  const [modelName, setModelName] = useState('');
  const [maxTokens, setMaxTokens] = useState(2000);

  const updateFormFields = useCallback((cfg: ContextWindowConfig) => {
    setSystemPrompt(cfg.system_prompt);
    setUseProductRAG(cfg.use_product_rag);
    setUseKnowledgeRAG(cfg.use_knowledge_rag);
    setMaxContextMessages(cfg.max_context_messages);
    setIncludeUserHistory(cfg.include_user_history);
    setTemperature(cfg.temperature);
    setModelName(cfg.model_name);
    setMaxTokens(cfg.max_tokens);
  }, []);

  const fetchAvailableModels = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/config/ai/models', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      });
      const data = await response.json();

      if (data.success && data.models) {
        setAvailableModels(data.models);
      }
    } catch (err) {
      console.error('Error fetching models:', err);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:3001/api/context-window');
      const data = await response.json();

      if (data.success) {
        setConfig(data.config);
        updateFormFields(data.config);
      } else {
        setError('ไม่สามารถโหลดการตั้งค่าได้');
      }
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  }, [updateFormFields]);

  useEffect(() => {
    fetchConfig();
    fetchAvailableModels();
  }, [fetchConfig, fetchAvailableModels]);

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const response = await fetch('http://localhost:3001/api/context-window', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          system_prompt: systemPrompt,
          use_product_rag: useProductRAG,
          use_knowledge_rag: useKnowledgeRAG,
          max_context_messages: maxContextMessages,
          include_user_history: includeUserHistory,
          temperature: temperature,
          model_name: modelName,
          max_tokens: maxTokens,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setConfig(data.config);
        setSuccess(data.message || 'บันทึกการตั้งค่าสำเร็จ');
      } else {
        setError(data.error || 'ไม่สามารถบันทึกได้');
      }
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('คุณต้องการรีเซ็ตการตั้งค่าเป็นค่าเริ่มต้นหรือไม่?')) return;

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const response = await fetch('http://localhost:3001/api/context-window/reset', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        setConfig(data.config);
        updateFormFields(data.config);
        setSuccess(data.message || 'รีเซ็ตการตั้งค่าสำเร็จ');
      } else {
        setError(data.error || 'ไม่สามารถรีเซ็ตได้');
      }
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการรีเซ็ต');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-fluid mt-4">
      <div className="row">
        <div className="col-12">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h2>
              <i className="fas fa-window-restore me-2"></i>
              Context Window & Prompt Settings
            </h2>
            <div>
              <button className="btn btn-warning me-2" onClick={handleReset} disabled={loading}>
                <i className="fas fa-undo me-2"></i>
                รีเซ็ตค่าเริ่มต้น
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                <i className="fas fa-save me-2"></i>
                บันทึก
              </button>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger alert-dismissible fade show" role="alert">
              {error}
              <button type="button" className="btn-close" onClick={() => setError(null)}></button>
            </div>
          )}

          {success && (
            <div className="alert alert-success alert-dismissible fade show" role="alert">
              {success}
              <button type="button" className="btn-close" onClick={() => setSuccess(null)}></button>
            </div>
          )}

          <div className="row">
            {/* System Prompt Section */}
            <div className="col-12 mb-4">
              <div className="card">
                <div className="card-header bg-primary text-white">
                  <h5 className="mb-0">
                    <i className="fas fa-robot me-2"></i>
                    System Prompt
                  </h5>
                </div>
                <div className="card-body">
                  <div className="mb-3">
                    <label className="form-label">Prompt เริ่มต้นของระบบ</label>
                    <textarea
                      className="form-control"
                      rows={6}
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="พิมพ์ system prompt ที่ต้องการ..."
                    />
                    <small className="text-muted">
                      กำหนดบทบาทและวิธีการตอบของ AI ผู้ช่วย
                    </small>
                  </div>
                </div>
              </div>
            </div>

            {/* RAG Settings */}
            <div className="col-md-6 mb-4">
              <div className="card h-100">
                <div className="card-header bg-info text-white">
                  <h5 className="mb-0">
                    <i className="fas fa-database me-2"></i>
                    RAG Settings
                  </h5>
                </div>
                <div className="card-body">
                  <div className="form-check form-switch mb-3">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="useProductRAG"
                      checked={useProductRAG}
                      onChange={(e) => setUseProductRAG(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="useProductRAG">
                      <i className="fas fa-box me-2"></i>
                      ใช้ Product RAG
                    </label>
                  </div>

                  <div className="form-check form-switch mb-3">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="useKnowledgeRAG"
                      checked={useKnowledgeRAG}
                      onChange={(e) => setUseKnowledgeRAG(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="useKnowledgeRAG">
                      <i className="fas fa-brain me-2"></i>
                      ใช้ Knowledge RAG
                    </label>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">
                      จำนวนข้อความย้อนหลัง (Context Messages)
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      value={maxContextMessages}
                      onChange={(e) => setMaxContextMessages(parseInt(e.target.value))}
                      min="1"
                      max="50"
                    />
                  </div>

                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="includeUserHistory"
                      checked={includeUserHistory}
                      onChange={(e) => setIncludeUserHistory(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="includeUserHistory">
                      <i className="fas fa-history me-2"></i>
                      รวมประวัติผู้ใช้
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Model Settings */}
            <div className="col-md-6 mb-4">
              <div className="card h-100">
                <div className="card-header bg-success text-white">
                  <h5 className="mb-0">
                    <i className="fas fa-cog me-2"></i>
                    Model Settings
                  </h5>
                </div>
                <div className="card-body">
                  <div className="mb-3">
                    <label className="form-label">Model Name</label>
                    <select
                      className="form-select"
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                    >
                      {availableModels.length === 0 ? (
                        <option value="">กำลังโหลดรายการโมเดล...</option>
                      ) : (
                        availableModels.map((model) => (
                          <option key={model.name} value={model.name}>
                            {model.displayName} {model.recommended && '⭐'}
                          </option>
                        ))
                      )}
                    </select>
                    <small className="text-muted">
                      เลือกโมเดล AI จากรายการที่โหลดจาก Google AI
                    </small>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">
                      Temperature: {temperature}
                    </label>
                    <input
                      type="range"
                      className="form-range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    />
                    <small className="text-muted">
                      ควบคุมความสร้างสรรค์ของคำตอบ (0 = เข้มงวด, 2 = สร้างสรรค์)
                    </small>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Max Tokens (maxOutputTokens)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                      min="100"
                      max="35000"
                      step="100"
                    />
                    <small className="text-muted">
                      จำนวน tokens สูงสุดในการตอบ (อ้างอิงจาก generationConfig.maxOutputTokens)
                    </small>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Current Config Info */}
          {config && (
            <div className="card">
              <div className="card-header">
                <h5 className="mb-0">
                  <i className="fas fa-info-circle me-2"></i>
                  ข้อมูลการตั้งค่าปัจจุบัน
                </h5>
              </div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-6">
                    <p><strong>สร้างเมื่อ:</strong> {new Date(config.created_at).toLocaleString('th-TH')}</p>
                  </div>
                  <div className="col-md-6">
                    <p><strong>แก้ไขล่าสุด:</strong> {new Date(config.last_updated).toLocaleString('th-TH')}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContextWindowPage;
