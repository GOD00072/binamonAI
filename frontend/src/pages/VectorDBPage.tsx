import React, { useEffect, useState } from 'react';
import {
  SaveIcon,
  RefreshIcon,
  DeleteIcon,
  SyncIcon
} from '../components/Icons';
import Plot from 'react-plotly.js/factory';
import Plotly from 'plotly.js-dist-min';
import '../styles/theme.css';
import openaiIcon from '../media/llmprovider/openai.png';
import lancedbIcon from '../media/vectordbs/lancedb.png';
import { vectorDbApi, productSearchConfigApi } from '../services/api';

const PlotComponent = Plot(Plotly);

interface VectorDBConfig {
  enabled: boolean;
  dbPath: string;
  embeddingModel: string;
  embeddingDimension: number;
  maxRetries: number;
  timeout: number;
  apiKey?: string;
  productVectorEnabled: boolean;
  knowledgeVectorEnabled: boolean;
  productMaxResults: number;
  productSimilarityThreshold: number;
  knowledgeMaxResults: number;
  knowledgeSimilarityThreshold: number;
}

interface ProductSearchConfig {
  topResults: number;
  contextWindow: number;
  relevanceThreshold: number;
  embeddingBoostFactor: number;
  scoreThresholds: {
    minimum: number;
    followup: number;
    dimension: number;
    material: number;
    type: number;
    sharedNumbers: number;
    stockAvailable: number;
    stockUnavailable: number;
    historicalInterest: number;
  };
  searchMethods: {
    vectorSearchEnabled: boolean;
    keywordSearchEnabled: boolean;
    directoryFallbackEnabled: boolean;
    crossLanguageSearch: boolean;
  };
  caching: {
    contextCacheTTL: number;
    userStateCacheTTL: number;
    productCacheTTL: number;
  };
  cleanup: {
    expiredContextInterval: number;
    contextExpirationTime: number;
  };
}

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category?: string;
  tags?: string;
  enabled: boolean;
  created_at: string;
  last_updated: string;
}

interface VectorDBStats {
  totalVectors: number;
  totalProducts: number;
  dbSizeMB: number;
  lastSync?: string;
  productVectors?: number;
  knowledgeVectors?: number;
}

interface SearchResult {
  id: string;
  score: number;
  metadata: {
    product_name?: string;
    category?: string;
    price?: string;
    sku?: string;
    url?: string;
    title?: string;
    content?: string;
  };
}

const VectorDBPage: React.FC = () => {
  const [config, setConfig] = useState<VectorDBConfig>({
    enabled: true,
    dbPath: 'data/lancedb',
    embeddingModel: 'text-embedding-3-large',
    embeddingDimension: 3072,
    maxRetries: 3,
    timeout: 30000,
    apiKey: '',
    productVectorEnabled: true,
    knowledgeVectorEnabled: false,
    productMaxResults: 5,
    productSimilarityThreshold: 0.7,
    knowledgeMaxResults: 5,
    knowledgeSimilarityThreshold: 0.7
  });

  const [knowledgeEntries, setKnowledgeEntries] = useState<KnowledgeEntry[]>([]);
  const [showKnowledgeForm, setShowKnowledgeForm] = useState(false);
  const [editingKnowledge, setEditingKnowledge] = useState<KnowledgeEntry | null>(null);
  const [knowledgeForm, setKnowledgeForm] = useState({
    title: '',
    content: '',
    category: '',
    tags: ''
  });

  // Test search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'both' | 'product' | 'knowledge'>('both');
  const [testProductMaxResults, setTestProductMaxResults] = useState(5);
  const [testProductSimilarity, setTestProductSimilarity] = useState(0.7);
  const [testKnowledgeMaxResults, setTestKnowledgeMaxResults] = useState(5);
  const [testKnowledgeSimilarity, setTestKnowledgeSimilarity] = useState(0.7);
  const [searchResults, setSearchResults] = useState<{
    productResults?: SearchResult[];
    knowledgeResults?: SearchResult[];
  }>({});
  const [searching, setSearching] = useState(false);

  const [stats, setStats] = useState<VectorDBStats>({
    totalVectors: 0,
    totalProducts: 0,
    dbSizeMB: 0
  });

  const [vectorData, setVectorData] = useState<{
    productVectors: any[];
    knowledgeVectors: any[];
  }>({
    productVectors: [],
    knowledgeVectors: []
  });

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'config' | 'product' | 'knowledge' | 'test'>('config');
  const [showSidebar, setShowSidebar] = useState(true);
  const [fullscreen3D, setFullscreen3D] = useState(false);
  const [selectedVector, setSelectedVector] = useState<any>(null);
  const [showVectorModal, setShowVectorModal] = useState(false);

  const [productSearchConfig, setProductSearchConfig] = useState<ProductSearchConfig>({
    topResults: 7,
    contextWindow: 15,
    relevanceThreshold: 0.03,
    embeddingBoostFactor: 2.0,
    scoreThresholds: {
      minimum: 0,
      followup: 20,
      dimension: 15,
      material: 12,
      type: 15,
      sharedNumbers: 15,
      stockAvailable: 10,
      stockUnavailable: -10,
      historicalInterest: 50
    },
    searchMethods: {
      vectorSearchEnabled: true,
      keywordSearchEnabled: true,
      directoryFallbackEnabled: true,
      crossLanguageSearch: false
    },
    caching: {
      contextCacheTTL: 1800,
      userStateCacheTTL: 3600,
      productCacheTTL: 3600
    },
    cleanup: {
      expiredContextInterval: 3600000,
      contextExpirationTime: 1800000
    }
  });

  // Collapse states for Product Search Config sections
  const [showScoreThresholds, setShowScoreThresholds] = useState(false);
  const [showSearchMethods, setShowSearchMethods] = useState(false);
  const [showCaching, setShowCaching] = useState(false);
  const [showCleanup, setShowCleanup] = useState(false);

  useEffect(() => {
    loadConfig();
    loadStats();
    loadVisualizationData();
    loadProductSearchConfig();
  }, []);

  const loadVisualizationData = async () => {
    try {
      const response = await vectorDbApi.getVisualizationData();
      if (response.success && response.data) {
        setVectorData({
          productVectors: response.data.productVectors || [],
          knowledgeVectors: response.data.knowledgeVectors || []
        });
      }
    } catch (err: any) {
      console.error('Error loading visualization data:', err);
    }
  };

  useEffect(() => {
    if (config.knowledgeVectorEnabled) {
      loadKnowledgeEntries();
    }
  }, [config.knowledgeVectorEnabled]);

  const loadConfig = async () => {
    try {
      const response = await vectorDbApi.getConfig();
      if (response.success && response.data) {
        setConfig(response.data.config);
        setTestProductMaxResults(response.data.config.productMaxResults || 5);
        setTestProductSimilarity(response.data.config.productSimilarityThreshold || 0.7);
        setTestKnowledgeMaxResults(response.data.config.knowledgeMaxResults || 5);
        setTestKnowledgeSimilarity(response.data.config.knowledgeSimilarityThreshold || 0.7);
      }
    } catch (err: any) {
      console.error('Error loading config:', err);
      setError('ไม่สามารถโหลดการตั้งค่าได้');
    }
  };

  const loadStats = async () => {
    try {
      const response = await vectorDbApi.getStats();
      if (response.success && response.data) {
        setStats(response.data.stats);
      }
    } catch (err: any) {
      console.error('Error loading stats:', err);
    }
  };

  const loadKnowledgeEntries = async () => {
    try {
      const response = await vectorDbApi.getKnowledgeEntries();
      if (response.success && response.data) {
        setKnowledgeEntries(response.data.entries);
      }
    } catch (err: any) {
      console.error('Error loading knowledge entries:', err);
    }
  };

  const loadProductSearchConfig = async () => {
    try {
      const response = await productSearchConfigApi.getConfig();
      if (response.success && response.data) {
        setProductSearchConfig(response.data.config);
      }
    } catch (err: any) {
      console.error('Error loading product search config:', err);
    }
  };


  const handleSaveConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await vectorDbApi.saveConfig(config);

      if (response.success) {
        setSuccess('บันทึกการตั้งค่าเรียบร้อยแล้ว');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        throw new Error(response.error || 'ไม่สามารถบันทึกการตั้งค่าได้');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveKnowledgeEntry = async () => {
    try {
      setLoading(true);
      setError(null);

      const payload = {
        ...knowledgeForm,
        enabled: true
      };

      const response = editingKnowledge
        ? await vectorDbApi.updateKnowledgeEntry(editingKnowledge.id, payload)
        : await vectorDbApi.createKnowledgeEntry(payload);

      if (response.success) {
        setSuccess(editingKnowledge ? 'อัปเดตข้อมูลเรียบร้อย' : 'เพิ่มข้อมูลเรียบร้อย');
        setTimeout(() => setSuccess(null), 3000);
        setShowKnowledgeForm(false);
        setEditingKnowledge(null);
        setKnowledgeForm({ title: '', content: '', category: '', tags: '' });
        loadKnowledgeEntries();
      } else {
        throw new Error(response.error || 'ไม่สามารถบันทึกข้อมูลได้');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteKnowledgeEntry = async (id: string) => {
    if (!window.confirm('ต้องการลบข้อมูลนี้หรือไม่?')) {
      return;
    }

    try {
      const response = await vectorDbApi.deleteKnowledgeEntry(id);

      if (response.success) {
        setSuccess('ลบข้อมูลเรียบร้อยแล้ว');
        setTimeout(() => setSuccess(null), 3000);
        loadKnowledgeEntries();
      } else {
        throw new Error(response.error || 'ไม่สามารถลบข้อมูลได้');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveProductSearchConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await productSearchConfigApi.saveConfig(productSearchConfig);

      if (response.success) {
        setSuccess('บันทึกการตั้งค่า Product Search เรียบร้อยแล้ว');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        throw new Error(response.error || 'ไม่สามารถบันทึกการตั้งค่าได้');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetProductSearchConfig = async () => {
    if (!window.confirm('ต้องการรีเซ็ตการตั้งค่าเป็นค่าเริ่มต้นหรือไม่?')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await productSearchConfigApi.resetConfig();

      if (response.success && response.data) {
        setProductSearchConfig(response.data.config);
        setSuccess('รีเซ็ตการตั้งค่าเป็นค่าเริ่มต้นเรียบร้อยแล้ว');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        throw new Error(response.error || 'ไม่สามารถรีเซ็ตการตั้งค่าได้');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTestSearch = async () => {
    if (!searchQuery.trim()) {
      setError('กรุณาใส่คำค้นหา');
      return;
    }

    try {
      setSearching(true);
      setError(null);
      setSearchResults({});

      const response = await vectorDbApi.testSearch({
        query: searchQuery,
        searchType: searchType,
        productMaxResults: testProductMaxResults,
        productSimilarityThreshold: testProductSimilarity,
        knowledgeMaxResults: testKnowledgeMaxResults,
        knowledgeSimilarityThreshold: testKnowledgeSimilarity
      });

      if (response.success && response.data) {
        setSearchResults({
          productResults: response.data.productResults,
          knowledgeResults: response.data.knowledgeResults
        });
      } else {
        throw new Error(response.error || 'ไม่สามารถค้นหาได้');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleSyncVectors = async () => {
    if (!window.confirm('ต้องการซิงค์ข้อมูลสินค้าทั้งหมดเข้า Vector DB หรือไม่?')) {
      return;
    }

    try {
      setSyncing(true);
      setError(null);

      const response = await vectorDbApi.syncVectors();

      if (response.success && response.data) {
        setSuccess(`ซิงค์ข้อมูลเรียบร้อยแล้ว: ${response.data.syncedCount} รายการ`);
        setTimeout(() => setSuccess(null), 5000);
        await loadStats();
      } else {
        throw new Error(response.error || 'ไม่สามารถซิงค์ข้อมูลได้');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const embeddingModels = [
    { value: 'text-embedding-3-large', label: 'text-embedding-3-large (3072)', dimensions: 3072 },
    { value: 'text-embedding-3-small', label: 'text-embedding-3-small (1536)', dimensions: 1536 },
    { value: 'text-embedding-ada-002', label: 'text-embedding-ada-002 (1536)', dimensions: 1536 }
  ];

  const similarityOptions = [
    { value: 0, label: 'ไม่จำกัด' },
    { value: 0.25, label: '0.25' },
    { value: 0.50, label: '0.50' },
    { value: 0.70, label: '0.70' }
  ];

  return (
    <section className="vector-db-page">
      <div className="container-fluid px-4 py-4 vector-db-container" style={{ maxWidth: fullscreen3D ? '100%' : '1400px', margin: '0 auto' }}>
        <div className="vector-db-toolbar">
          <div className="vector-db-toolbar-info">
            <img src={lancedbIcon} alt="LanceDB" className="vector-db-logo" />
            <div>
              <h2>Vector Database</h2>
              <p>จัดการระบบค้นหาด้วย AI</p>
            </div>
          </div>
          <div className="vector-db-toolbar-actions">
            <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowSidebar(!showSidebar)}>
              <i className={`fas fa-${showSidebar ? 'angle-right' : 'angle-left'} me-1`}></i>
              {showSidebar ? 'ซ่อน' : 'แสดง'} ข้อมูล
            </button>
            <button
              className="btn btn-outline-primary btn-sm"
              onClick={() => { loadConfig(); loadStats(); loadVisualizationData(); }}
              disabled={loading || syncing}
            >
              <RefreshIcon className="me-1" style={{ width: '14px', height: '14px' }} />
              รีเฟรช
            </button>
          </div>
        </div>

      {error && <div className="alert alert-danger alert-dismissible fade show" role="alert">{error}<button type="button" className="btn-close" onClick={() => setError(null)}></button></div>}
      {success && <div className="alert alert-success alert-dismissible fade show" role="alert">{success}<button type="button" className="btn-close" onClick={() => setSuccess(null)}></button></div>}

      {/* 3D Vector Distribution with Sidebar Layout */}
      <div className={`vector-visual-row mb-4 ${(!showSidebar || fullscreen3D) ? 'vector-visual-row--single' : ''}`}>
        {/* 3D Visualization */}
        <div className={`vector-visual-main ${fullscreen3D ? 'vector-visual-main--fullscreen' : ''}`}>
          <div className="card border-0 shadow-sm" style={{ height: fullscreen3D ? 'calc(100vh - 180px)' : 'auto' }}>
            <div className="card-body p-0">
              <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
                <h5 className="mb-0" style={{ fontWeight: '600' }}>
                  <i className="fas fa-cube me-2"></i>
                  Vector Distribution (3D)
                </h5>
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setFullscreen3D(!fullscreen3D)}
                  >
                    <i className={`fas fa-${fullscreen3D ? 'compress' : 'expand'} me-1`}></i>
                    {fullscreen3D ? 'ย่อ' : 'ขยาย'}
                  </button>
                  <button
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => { loadStats(); loadVisualizationData(); }}
                    disabled={loading}
                  >
                    <RefreshIcon className="me-1" style={{ width: '14px', height: '14px' }} />
                    รีเฟรช
                  </button>
                </div>
              </div>

              <div className="p-3">
                <PlotComponent
                  data={[
                    // Product Vectors
                    {
                      type: 'scatter3d',
                      mode: 'markers',
                      name: 'Product Vectors',
                      x: vectorData.productVectors.map(v => v.x),
                      y: vectorData.productVectors.map(v => v.y),
                      z: vectorData.productVectors.map(v => v.z),
                      marker: {
                        size: vectorData.productVectors.map(v => v.size || 8),
                        color: '#28a745',
                        opacity: 0.8,
                        line: {
                          color: '#1e7e34',
                          width: 0.5
                        }
                      },
                      text: vectorData.productVectors.map(v => v.name),
                      hoverinfo: 'text',
                      visible: config.productVectorEnabled ? true : 'legendonly',
                      customdata: vectorData.productVectors.map(v => ({ ...v, type: 'product' }))
                    },
                    // Knowledge Vectors
                    {
                      type: 'scatter3d',
                      mode: 'markers',
                      name: 'Knowledge Vectors',
                      x: vectorData.knowledgeVectors.map(v => v.x),
                      y: vectorData.knowledgeVectors.map(v => v.y),
                      z: vectorData.knowledgeVectors.map(v => v.z),
                      marker: {
                        size: vectorData.knowledgeVectors.map(v => v.size || 8),
                        color: '#17a2b8',
                        opacity: 0.8,
                        line: {
                          color: '#117a8b',
                          width: 0.5
                        }
                      },
                      text: vectorData.knowledgeVectors.map(v => v.name),
                      hoverinfo: 'text',
                      visible: config.knowledgeVectorEnabled ? true : 'legendonly',
                      customdata: vectorData.knowledgeVectors.map(v => ({ ...v, type: 'knowledge' }))
                    }
                  ]}
                  layout={{
                    autosize: true,
                    height: fullscreen3D ? window.innerHeight - 260 : 500,
                    margin: { l: 0, r: 0, b: 0, t: 0 },
                    scene: {
                      xaxis: {
                        title: 'X Dimension',
                        gridcolor: '#e0e0e0',
                        showbackground: true,
                        backgroundcolor: '#f8f9fa'
                      },
                      yaxis: {
                        title: 'Y Dimension',
                        gridcolor: '#e0e0e0',
                        showbackground: true,
                        backgroundcolor: '#f8f9fa'
                      },
                      zaxis: {
                        title: 'Z Dimension',
                        gridcolor: '#e0e0e0',
                        showbackground: true,
                        backgroundcolor: '#f8f9fa'
                      },
                      camera: {
                        eye: { x: 1.5, y: 1.5, z: 1.5 }
                      }
                    },
                    showlegend: true,
                    legend: {
                      x: 0,
                      y: 1,
                      bgcolor: 'rgba(255, 255, 255, 0.9)',
                      bordercolor: '#dee2e6',
                      borderwidth: 1
                    },
                    paper_bgcolor: '#ffffff',
                    plot_bgcolor: '#ffffff'
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: true,
                    displaylogo: false,
                    modeBarButtonsToRemove: ['toImage', 'sendDataToCloud']
                  }}
                  onClick={(data: any) => {
                    if (data.points && data.points.length > 0) {
                      const point = data.points[0];
                      const vectorInfo = point.customdata;
                      setSelectedVector(vectorInfo);
                      setShowVectorModal(true);
                    }
                  }}
                  style={{ width: '100%' }}
                />

                <div className="text-center mt-3">
                  <small className="text-muted">
                    <i className="fas fa-info-circle me-1"></i>
                    Interactive 3D visualization - Drag to rotate, scroll to zoom, <strong>click point to edit</strong>
                  </small>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar - Model Information */}
        {showSidebar && (
          <aside className="vector-visual-sidebar">
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-gradient" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
                <h6 className="mb-0" style={{ fontWeight: '600' }}>
                  <i className="fas fa-brain me-2"></i>
                  Model Information
                </h6>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="text-muted small">Embedding Model</label>
                  <div className="d-flex align-items-center gap-2">
                    <img src={openaiIcon} alt="OpenAI" style={{ width: '20px', height: '20px' }} />
                    <div>
                      <div className="fw-semibold">{config.embeddingModel}</div>
                      <small className="text-muted">{config.embeddingDimension} dimensions</small>
                    </div>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="text-muted small">Database Status</label>
                  <div className="d-flex align-items-center gap-2">
                    <div className={`badge ${config.enabled ? 'bg-success' : 'bg-secondary'}`}>
                      {config.enabled ? 'Active' : 'Disabled'}
                    </div>
                    <small className="text-muted">LanceDB</small>
                  </div>
                </div>

                <hr />

                <div className="mb-2">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <small className="text-muted">Total Vectors</small>
                    <strong>{stats.totalVectors.toLocaleString()}</strong>
                  </div>
                  <div className="progress" style={{ height: '4px' }}>
                    <div className="progress-bar bg-primary" style={{ width: '100%' }}></div>
                  </div>
                </div>

                <div className="mb-2">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <small className="text-muted">Product Vectors</small>
                    <strong className="text-success">{(stats.productVectors || 0).toLocaleString()}</strong>
                  </div>
                  <div className="progress" style={{ height: '4px' }}>
                    <div className="progress-bar bg-success" style={{ width: `${stats.totalVectors > 0 ? (stats.productVectors || 0) / stats.totalVectors * 100 : 0}%` }}></div>
                  </div>
                </div>

                <div className="mb-2">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <small className="text-muted">Knowledge Vectors</small>
                    <strong className="text-info">{(stats.knowledgeVectors || 0).toLocaleString()}</strong>
                  </div>
                  <div className="progress" style={{ height: '4px' }}>
                    <div className="progress-bar bg-info" style={{ width: `${stats.totalVectors > 0 ? (stats.knowledgeVectors || 0) / stats.totalVectors * 100 : 0}%` }}></div>
                  </div>
                </div>

                <hr />

                <div className="d-flex justify-content-between align-items-center">
                  <small className="text-muted">Database Size</small>
                  <strong>{stats.dbSizeMB.toFixed(2)} MB</strong>
                </div>
              </div>
            </div>

            {/* Vector Type Legend */}
            <div className="card border-0 shadow-sm">
              <div className="card-body">
                <h6 className="mb-3" style={{ fontWeight: '600' }}>
                  <i className="fas fa-layer-group me-2"></i>
                  Vector Types
                </h6>

                <div className="d-flex align-items-center gap-3 mb-3 p-2 rounded" style={{ background: 'rgba(40, 167, 69, 0.1)' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#28a745' }}></div>
                  <div className="flex-grow-1">
                    <div className="fw-semibold small">Product Vectors</div>
                    <small className="text-muted">สินค้าและข้อมูลผลิตภัณฑ์</small>
                  </div>
                  <div className={`badge ${config.productVectorEnabled ? 'bg-success' : 'bg-secondary'}`}>
                    {config.productVectorEnabled ? 'ON' : 'OFF'}
                  </div>
                </div>

                <div className="d-flex align-items-center gap-3 p-2 rounded" style={{ background: 'rgba(23, 162, 184, 0.1)' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#17a2b8' }}></div>
                  <div className="flex-grow-1">
                    <div className="fw-semibold small">Knowledge Vectors</div>
                    <small className="text-muted">ฐานความรู้และ RAG</small>
                  </div>
                  <div className={`badge ${config.knowledgeVectorEnabled ? 'bg-info' : 'bg-secondary'}`}>
                    {config.knowledgeVectorEnabled ? 'ON' : 'OFF'}
                  </div>
                </div>

                <div className="mt-3 p-2 bg-light rounded">
                  <small className="text-muted">
                    <i className="fas fa-lightbulb me-1 text-warning"></i>
                    <strong>Tips:</strong> Click legend items in 3D view to toggle visibility
                  </small>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Stats Cards */}
      <div className="row g-3 mb-4">
        {/* Product Vector Card */}
        <div className="col-md-6">
          <div className={`card border-0 shadow-sm h-100 ${config.productVectorEnabled ? 'border-start border-5 border-success' : ''}`}>
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <i className="fas fa-box text-primary"></i>
                    <h5 className="mb-0" style={{ fontWeight: '600' }}>Product Vector</h5>
                  </div>
                  <p className="text-muted mb-0 small">Vector search สำหรับสินค้า</p>
                </div>
                <div>
                  <span className={`badge ${config.productVectorEnabled ? 'bg-success' : 'bg-secondary'}`}>
                    {config.productVectorEnabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                  </span>
                </div>
              </div>
              <hr className="my-2" />
              <div className="row g-2">
                <div className="col-6">
                  <div className="text-center p-2 bg-light rounded">
                    <div className="text-muted small">Vectors</div>
                    <div className="h4 mb-0" style={{ fontWeight: '700' }}>{(stats.productVectors || stats.totalProducts || 0).toLocaleString()}</div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="text-center p-2 bg-light rounded">
                    <div className="text-muted small">Max Results</div>
                    <div className="h4 mb-0" style={{ fontWeight: '700' }}>{config.productMaxResults}</div>
                  </div>
                </div>
              </div>
              <div className="mt-2">
                <small className="text-muted">
                  <i className="fas fa-chart-line me-1"></i>
                  Similarity: {config.productSimilarityThreshold === 0 ? 'ไม่จำกัด' : config.productSimilarityThreshold}
                </small>
              </div>
            </div>
          </div>
        </div>

        {/* Knowledge RAG Card */}
        <div className="col-md-6">
          <div className={`card border-0 shadow-sm h-100 ${config.knowledgeVectorEnabled ? 'border-start border-5 border-info' : ''}`}>
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <i className="fas fa-book text-info"></i>
                    <h5 className="mb-0" style={{ fontWeight: '600' }}>Knowledge RAG</h5>
                  </div>
                  <p className="text-muted mb-0 small">Vector search สำหรับความรู้</p>
                </div>
                <div>
                  <span className={`badge ${config.knowledgeVectorEnabled ? 'bg-info' : 'bg-secondary'}`}>
                    {config.knowledgeVectorEnabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                  </span>
                </div>
              </div>
              <hr className="my-2" />
              <div className="row g-2">
                <div className="col-6">
                  <div className="text-center p-2 bg-light rounded">
                    <div className="text-muted small">Vectors</div>
                    <div className="h4 mb-0" style={{ fontWeight: '700' }}>{(stats.knowledgeVectors || 0).toLocaleString()}</div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="text-center p-2 bg-light rounded">
                    <div className="text-muted small">Max Results</div>
                    <div className="h4 mb-0" style={{ fontWeight: '700' }}>{config.knowledgeMaxResults}</div>
                  </div>
                </div>
              </div>
              <div className="mt-2">
                <small className="text-muted">
                  <i className="fas fa-chart-line me-1"></i>
                  Similarity: {config.knowledgeSimilarityThreshold === 0 ? 'ไม่จำกัด' : config.knowledgeSimilarityThreshold}
                </small>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Stats */}
      <div className="vector-summary-grid mb-4">
        <div className="card border-0 shadow-sm h-100">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-start">
              <div>
                <p className="text-muted mb-1" style={{ fontSize: '0.875rem' }}>Total Vectors</p>
                <h3 className="mb-0" style={{ fontWeight: '700' }}>{stats.totalVectors.toLocaleString()}</h3>
              </div>
              <div className="vector-summary-icon">
                <i className="fas fa-vector-square"></i>
              </div>
            </div>
          </div>
        </div>
        <div className="card border-0 shadow-sm h-100">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-start">
              <div>
                <p className="text-muted mb-1" style={{ fontSize: '0.875rem' }}>Database Size</p>
                <h3 className="mb-0" style={{ fontWeight: '700' }}>{stats.dbSizeMB.toFixed(2)} MB</h3>
              </div>
              <div className="vector-summary-icon">
                <i className="fas fa-database"></i>
              </div>
            </div>
          </div>
        </div>
        <div className="card border-0 shadow-sm h-100">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-start">
              <div>
                <p className="text-muted mb-1" style={{ fontSize: '0.875rem' }}>Embedding Model</p>
                <div className="small mb-0" style={{ fontWeight: '600' }}>{config.embeddingModel}</div>
                <small className="text-muted">{config.embeddingDimension} dimensions</small>
              </div>
              <div className="vector-summary-icon">
                <i className="fas fa-brain"></i>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <ul className="nav nav-pills mb-4 gap-2">
        {['config', 'product', 'knowledge', 'test'].map(tab => (
          <li className="nav-item" key={tab}>
            <button
              className={`nav-link ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab as any)}
              style={{
                borderRadius: '8px',
                fontWeight: '500',
                fontSize: '0.9rem',
                padding: '0.5rem 1rem'
              }}
            >
              {tab === 'config' && 'การตั้งค่า'}
              {tab === 'product' && 'Product Vector Configuration'}
              {tab === 'knowledge' && 'Knowledge RAG'}
              {tab === 'test' && 'ทดสอบค้นหา'}
            </button>
          </li>
        ))}
      </ul>

      {/* Config Tab */}
      {activeTab === 'config' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <h5 className="mb-4" style={{ fontWeight: '600' }}>การตั้งค่าทั่วไป</h5>

            <div className="form-check form-switch mb-4">
              <input className="form-check-input" type="checkbox" id="enableVectorDB" checked={config.enabled} onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} />
              <label className="form-check-label" htmlFor="enableVectorDB">
                <strong>เปิดใช้งาน Vector Database</strong>
              </label>
            </div>

            <div className="mb-3">
              <label className="form-label"><strong>OpenAI API Key</strong></label>
              <div className="input-group">
                <span className="input-group-text bg-white"><img src={openaiIcon} alt="OpenAI" style={{ width: '20px', height: '20px' }} /></span>
                <input type="password" className="form-control" value={config.apiKey || ''} onChange={(e) => setConfig({ ...config, apiKey: e.target.value })} placeholder="sk-..." disabled={!config.enabled} />
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label"><strong>Embedding Model</strong></label>
              <select className="form-select" value={config.embeddingModel} onChange={(e) => {
                const model = embeddingModels.find(m => m.value === e.target.value);
                setConfig({ ...config, embeddingModel: e.target.value, embeddingDimension: model?.dimensions || 3072 });
              }} disabled={!config.enabled}>
                {embeddingModels.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            <div className="d-flex gap-2">
              <button className="btn btn-primary" onClick={handleSaveConfig} disabled={loading || syncing}>
                <SaveIcon className="me-2" />
                บันทึก
              </button>
              <button className="btn btn-success" onClick={handleSyncVectors} disabled={loading || syncing || !config.enabled || !config.productVectorEnabled}>
                {syncing ? <><SyncIcon className="me-2 fa-spin" />ซิงค์...</> : <><SyncIcon className="me-2" />ซิงค์สินค้า</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Tab */}
      {activeTab === 'product' && (
        <>
          {/* Vector DB Config */}
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body p-4">
              <h5 className="mb-4" style={{ fontWeight: '600' }}>
                <i className="fas fa-database me-2"></i>
                Vector Database Settings
              </h5>

              <div className="form-check form-switch mb-4">
                <input className="form-check-input" type="checkbox" id="enableProductVector" checked={config.productVectorEnabled} onChange={(e) => setConfig({ ...config, productVectorEnabled: e.target.checked })} />
                <label className="form-check-label" htmlFor="enableProductVector">
                  <strong>เปิดใช้งาน Product Vector</strong>
                  <div className="text-muted small">ซิงค์อัตโนมัติเมื่อเพิ่ม/แก้ไข/ลบสินค้า</div>
                </label>
              </div>

              <div className="mb-3">
                <label className="form-label"><strong>จำนวนผลลัพธ์สูงสุด: {config.productMaxResults}</strong></label>
                <input type="range" className="form-range" min="1" max="20" value={config.productMaxResults} onChange={(e) => setConfig({ ...config, productMaxResults: parseInt(e.target.value) })} disabled={!config.productVectorEnabled} />
              </div>

              <div className="mb-3">
                <label className="form-label"><strong>Similarity Threshold</strong></label>
                <select className="form-select" value={config.productSimilarityThreshold} onChange={(e) => setConfig({ ...config, productSimilarityThreshold: parseFloat(e.target.value) })} disabled={!config.productVectorEnabled}>
                  {similarityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <button className="btn btn-primary" onClick={handleSaveConfig} disabled={loading}>
                <SaveIcon className="me-2" />
                บันทึกการตั้งค่า Vector DB
              </button>
            </div>
          </div>

          {/* Product Search Config */}
          <div className="card border-0 shadow-sm">
            <div className="card-body p-4">
              <div className="d-flex justify-content-between align-items-center mb-4">
                <h5 className="mb-0" style={{ fontWeight: '600' }}>
                  <i className="fas fa-search me-2"></i>
                  Product Search Configuration
                </h5>
                <button className="btn btn-outline-secondary btn-sm" onClick={handleResetProductSearchConfig} disabled={loading}>
                  <RefreshIcon className="me-1" style={{ width: '14px', height: '14px' }} />
                  รีเซ็ตค่าเริ่มต้น
                </button>
              </div>

              {/* Basic Settings */}
              <div className="card mb-3">
                <div className="card-header bg-light">
                  <h6 className="mb-0"><i className="fas fa-cog me-2"></i>การตั้งค่าพื้นฐาน</h6>
                </div>
                <div className="card-body">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label"><strong>Top Results</strong></label>
                      <input type="number" className="form-control" value={productSearchConfig.topResults} onChange={(e) => setProductSearchConfig({...productSearchConfig, topResults: parseInt(e.target.value)})} min="1" max="50" />
                      <small className="text-muted">จำนวนผลลัพธ์สูงสุดที่จะแสดง</small>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label"><strong>Context Window</strong></label>
                      <input type="number" className="form-control" value={productSearchConfig.contextWindow} onChange={(e) => setProductSearchConfig({...productSearchConfig, contextWindow: parseInt(e.target.value)})} min="1" max="100" />
                      <small className="text-muted">จำนวนข้อความย้อนหลังที่จะพิจารณา</small>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label"><strong>Relevance Threshold</strong></label>
                      <input type="number" className="form-control" value={productSearchConfig.relevanceThreshold} onChange={(e) => setProductSearchConfig({...productSearchConfig, relevanceThreshold: parseFloat(e.target.value)})} step="0.01" min="0" max="1" />
                      <small className="text-muted">ค่าต่ำสุดของความเกี่ยวข้อง</small>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label"><strong>Embedding Boost Factor</strong></label>
                      <input type="number" className="form-control" value={productSearchConfig.embeddingBoostFactor} onChange={(e) => setProductSearchConfig({...productSearchConfig, embeddingBoostFactor: parseFloat(e.target.value)})} step="0.1" min="0" max="10" />
                      <small className="text-muted">ตัวคูณสำหรับคะแนน embedding</small>
                    </div>
                  </div>
                </div>
              </div>

              {/* Score Thresholds */}
              <div className="card mb-3 border-start border-3 border-primary">
                <div className="card-header bg-white d-flex justify-content-between align-items-center" style={{ cursor: 'pointer' }} onClick={() => setShowScoreThresholds(!showScoreThresholds)}>
                  <div>
                    <h6 className="mb-1">
                      <i className="fas fa-sliders-h me-2 text-primary"></i>
                      Score Thresholds
                    </h6>
                    <small className="text-muted">คะแนนสำหรับการจัดอันดับสินค้า</small>
                  </div>
                  <button className="btn btn-sm btn-link text-decoration-none" type="button">
                    <i className={`fas fa-chevron-${showScoreThresholds ? 'up' : 'down'}`}></i>
                  </button>
                </div>
                {showScoreThresholds && (
                  <div className="card-body">
                    <div className="alert alert-light border mb-3">
                      <div className="row g-2 small">
                        <div className="col-md-6">
                          <strong className="text-primary">📊 การทำงาน:</strong>
                          <p className="mb-1 mt-1">ระบบจะคำนวณคะแนนสินค้าแต่ละชิ้น โดยเริ่มจากคะแนน Vector (0-10) แล้วบวกโบนัสตามเงื่อนไขต่างๆ</p>
                        </div>
                        <div className="col-md-6">
                          <strong className="text-success">✅ ตัวอย่าง:</strong>
                          <p className="mb-1 mt-1">"แก้วกระดาษ 16 oz" → ได้โบนัสจาก Dimension + Material + Type รวม 42 คะแนน</p>
                        </div>
                      </div>
                    </div>
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label fw-semibold small">Minimum <span className="badge bg-secondary">{productSearchConfig.scoreThresholds.minimum}</span></label>
                        <input type="number" className="form-control form-control-sm" value={productSearchConfig.scoreThresholds.minimum} onChange={(e) => setProductSearchConfig({...productSearchConfig, scoreThresholds: {...productSearchConfig.scoreThresholds, minimum: parseInt(e.target.value)}})} />
                        <small className="text-muted">คะแนนขั้นต่ำที่ต้องผ่านเพื่อแสดงผล</small>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label fw-semibold small">Follow-up <span className="badge bg-info">{productSearchConfig.scoreThresholds.followup}</span></label>
                        <input type="number" className="form-control form-control-sm" value={productSearchConfig.scoreThresholds.followup} onChange={(e) => setProductSearchConfig({...productSearchConfig, scoreThresholds: {...productSearchConfig.scoreThresholds, followup: parseInt(e.target.value)}})} />
                        <small className="text-muted">ถามต่อเนื่องเกี่ยวกับสินค้าเดิม</small>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label fw-semibold small">Dimension <span className="badge bg-primary">{productSearchConfig.scoreThresholds.dimension}</span></label>
                        <input type="number" className="form-control form-control-sm" value={productSearchConfig.scoreThresholds.dimension} onChange={(e) => setProductSearchConfig({...productSearchConfig, scoreThresholds: {...productSearchConfig.scoreThresholds, dimension: parseInt(e.target.value)}})} />
                        <small className="text-muted">ขนาดตรงกับที่ถาม (16oz, 5นิ้ว)</small>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label fw-semibold small">Material <span className="badge bg-success">{productSearchConfig.scoreThresholds.material}</span></label>
                        <input type="number" className="form-control form-control-sm" value={productSearchConfig.scoreThresholds.material} onChange={(e) => setProductSearchConfig({...productSearchConfig, scoreThresholds: {...productSearchConfig.scoreThresholds, material: parseInt(e.target.value)}})} />
                        <small className="text-muted">วัสดุตรงกับที่ถาม (กระดาษ, พลาสติก)</small>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label fw-semibold small">Type <span className="badge bg-warning">{productSearchConfig.scoreThresholds.type}</span></label>
                        <input type="number" className="form-control form-control-sm" value={productSearchConfig.scoreThresholds.type} onChange={(e) => setProductSearchConfig({...productSearchConfig, scoreThresholds: {...productSearchConfig.scoreThresholds, type: parseInt(e.target.value)}})} />
                        <small className="text-muted">ประเภทตรงกับที่ถาม (แก้ว, กล่อง)</small>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label fw-semibold small">Shared Numbers <span className="badge bg-dark">{productSearchConfig.scoreThresholds.sharedNumbers}</span></label>
                        <input type="number" className="form-control form-control-sm" value={productSearchConfig.scoreThresholds.sharedNumbers} onChange={(e) => setProductSearchConfig({...productSearchConfig, scoreThresholds: {...productSearchConfig.scoreThresholds, sharedNumbers: parseInt(e.target.value)}})} />
                        <small className="text-muted">ตัวเลขในชื่อสินค้าตรงกับคำถาม</small>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label fw-semibold small">Stock Available <span className="badge bg-success">+{productSearchConfig.scoreThresholds.stockAvailable}</span></label>
                        <input type="number" className="form-control form-control-sm" value={productSearchConfig.scoreThresholds.stockAvailable} onChange={(e) => setProductSearchConfig({...productSearchConfig, scoreThresholds: {...productSearchConfig.scoreThresholds, stockAvailable: parseInt(e.target.value)}})} />
                        <small className="text-muted">โบนัสเมื่อมีสต๊อก</small>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label fw-semibold small">Stock Unavailable <span className="badge bg-danger">{productSearchConfig.scoreThresholds.stockUnavailable}</span></label>
                        <input type="number" className="form-control form-control-sm" value={productSearchConfig.scoreThresholds.stockUnavailable} onChange={(e) => setProductSearchConfig({...productSearchConfig, scoreThresholds: {...productSearchConfig.scoreThresholds, stockUnavailable: parseInt(e.target.value)}})} />
                        <small className="text-muted">ลดคะแนนเมื่อหมดสต๊อก</small>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label fw-semibold small">Historical Interest <span className="badge bg-purple" style={{backgroundColor: '#6f42c1'}}>{productSearchConfig.scoreThresholds.historicalInterest}</span></label>
                        <input type="number" className="form-control form-control-sm" value={productSearchConfig.scoreThresholds.historicalInterest} onChange={(e) => setProductSearchConfig({...productSearchConfig, scoreThresholds: {...productSearchConfig.scoreThresholds, historicalInterest: parseInt(e.target.value)}})} />
                        <small className="text-muted">สินค้าที่เคยดูหรือสนใจ</small>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Search Methods */}
              <div className="card mb-3 border-start border-3 border-success">
                <div className="card-header bg-white d-flex justify-content-between align-items-center" style={{ cursor: 'pointer' }} onClick={() => setShowSearchMethods(!showSearchMethods)}>
                  <div>
                    <h6 className="mb-1">
                      <i className="fas fa-search me-2 text-success"></i>
                      Search Methods
                    </h6>
                    <small className="text-muted">วิธีการค้นหาสินค้า (ใช้ร่วมกันได้)</small>
                  </div>
                  <button className="btn btn-sm btn-link text-decoration-none" type="button">
                    <i className={`fas fa-chevron-${showSearchMethods ? 'up' : 'down'}`}></i>
                  </button>
                </div>
                {showSearchMethods && (
                  <div className="card-body">
                    <div className="alert alert-light border mb-3">
                      <div className="small">
                        <strong className="text-success">🔍 ลำดับการค้นหา:</strong>
                        <p className="mb-0 mt-1">Vector Search → Keyword Search → Directory Fallback (ถ้าไม่พบผลลัพธ์)</p>
                      </div>
                    </div>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <div className="card border">
                          <div className="card-body p-3">
                            <div className="form-check form-switch">
                              <input className="form-check-input" type="checkbox" id="vectorSearchEnabled" checked={productSearchConfig.searchMethods.vectorSearchEnabled} onChange={(e) => setProductSearchConfig({...productSearchConfig, searchMethods: {...productSearchConfig.searchMethods, vectorSearchEnabled: e.target.checked}})} />
                              <label className="form-check-label" htmlFor="vectorSearchEnabled">
                                <strong className="d-block">🤖 Vector Search</strong>
                                <small className="text-muted">ค้นหาด้วย AI เข้าใจความหมาย</small>
                                <div className="mt-1"><small className="text-success">✓ "แก้วน้ำ" หา "แก้วกระดาษ" ได้</small></div>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="card border">
                          <div className="card-body p-3">
                            <div className="form-check form-switch">
                              <input className="form-check-input" type="checkbox" id="keywordSearchEnabled" checked={productSearchConfig.searchMethods.keywordSearchEnabled} onChange={(e) => setProductSearchConfig({...productSearchConfig, searchMethods: {...productSearchConfig.searchMethods, keywordSearchEnabled: e.target.checked}})} />
                              <label className="form-check-label" htmlFor="keywordSearchEnabled">
                                <strong className="d-block">🔎 Keyword Search</strong>
                                <small className="text-muted">ค้นหาแบบตรงตัว (เร็วกว่า)</small>
                                <div className="mt-1"><small className="text-warning">⚠ ต้องมีคำตรงกัน</small></div>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="card border">
                          <div className="card-body p-3">
                            <div className="form-check form-switch">
                              <input className="form-check-input" type="checkbox" id="directoryFallbackEnabled" checked={productSearchConfig.searchMethods.directoryFallbackEnabled} onChange={(e) => setProductSearchConfig({...productSearchConfig, searchMethods: {...productSearchConfig.searchMethods, directoryFallbackEnabled: e.target.checked}})} />
                              <label className="form-check-label" htmlFor="directoryFallbackEnabled">
                                <strong className="d-block">📂 Directory Fallback</strong>
                                <small className="text-muted">ค้นหาทั้งหมดถ้าไม่พบ</small>
                                <div className="mt-1"><small className="text-info">ℹ เป็น backup method</small></div>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="card border border-secondary opacity-50">
                          <div className="card-body p-3">
                            <div className="form-check form-switch">
                              <input className="form-check-input" type="checkbox" id="crossLanguageSearch" checked={productSearchConfig.searchMethods.crossLanguageSearch} onChange={(e) => setProductSearchConfig({...productSearchConfig, searchMethods: {...productSearchConfig.searchMethods, crossLanguageSearch: e.target.checked}})} disabled />
                              <label className="form-check-label" htmlFor="crossLanguageSearch">
                                <strong className="d-block">🌐 Cross-Language</strong>
                                <small className="text-muted">ค้นหาข้ามภาษา</small>
                                <div className="mt-1"><small className="text-secondary">🔒 Coming Soon</small></div>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Caching Configuration */}
              <div className="card mb-3 border-start border-3 border-info">
                <div className="card-header bg-white d-flex justify-content-between align-items-center" style={{ cursor: 'pointer' }} onClick={() => setShowCaching(!showCaching)}>
                  <div>
                    <h6 className="mb-1">
                      <i className="fas fa-rocket me-2 text-info"></i>
                      Caching Configuration
                    </h6>
                    <small className="text-muted">แคชข้อมูลเพื่อเพิ่มความเร็ว (Time-To-Live)</small>
                  </div>
                  <button className="btn btn-sm btn-link text-decoration-none" type="button">
                    <i className={`fas fa-chevron-${showCaching ? 'up' : 'down'}`}></i>
                  </button>
                </div>
                {showCaching && (
                  <div className="card-body">
                    <div className="alert alert-light border mb-3">
                      <div className="small">
                        <strong className="text-info">⚡ ประโยชน์:</strong>
                        <p className="mb-0 mt-1">ลดเวลาการค้นหาและประมวลผล โดยเก็บผลลัพธ์ไว้ชั่วคราว ไม่ต้องคำนวณใหม่ทุกครั้ง</p>
                      </div>
                    </div>
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label"><strong>Context Cache TTL</strong></label>
                        <input type="number" className="form-control" value={productSearchConfig.caching.contextCacheTTL} onChange={(e) => setProductSearchConfig({...productSearchConfig, caching: {...productSearchConfig.caching, contextCacheTTL: parseInt(e.target.value)}})} />
                        <small className="text-muted">วินาที (1800 = 30 นาที)</small>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label"><strong>User State Cache TTL</strong></label>
                        <input type="number" className="form-control" value={productSearchConfig.caching.userStateCacheTTL} onChange={(e) => setProductSearchConfig({...productSearchConfig, caching: {...productSearchConfig.caching, userStateCacheTTL: parseInt(e.target.value)}})} />
                        <small className="text-muted">วินาที (3600 = 1 ชั่วโมง)</small>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label"><strong>Product Cache TTL</strong></label>
                        <input type="number" className="form-control" value={productSearchConfig.caching.productCacheTTL} onChange={(e) => setProductSearchConfig({...productSearchConfig, caching: {...productSearchConfig.caching, productCacheTTL: parseInt(e.target.value)}})} />
                        <small className="text-muted">วินาที (3600 = 1 ชั่วโมง)</small>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Cleanup Configuration */}
              <div className="card mb-3">
                <div className="card-header bg-light d-flex justify-content-between align-items-center" style={{ cursor: 'pointer' }} onClick={() => setShowCleanup(!showCleanup)}>
                  <h6 className="mb-0">
                    <i className="fas fa-broom me-2"></i>
                    Cleanup Configuration (การทำความสะอาด)
                  </h6>
                  <div className="d-flex align-items-center gap-3">
                    <small className="text-muted">
                      ช่วงเวลาทำความสะอาด: {productSearchConfig.cleanup.expiredContextInterval}ms,
                      หมดอายุ: {productSearchConfig.cleanup.contextExpirationTime}ms
                    </small>
                    <i className={`fas fa-chevron-${showCleanup ? 'up' : 'down'}`}></i>
                  </div>
                </div>
                {showCleanup && (
                  <div className="card-body">
                    <div className="alert alert-info mb-3">
                      <strong><i className="fas fa-info-circle me-2"></i>คำอธิบาย:</strong> กำหนดการลบข้อมูลเก่าอัตโนมัติเพื่อประหยัดหน่วยความจำ
                      <ul className="mb-0 mt-2">
                        <li><strong>Expired Context Interval:</strong> ระยะเวลาการตรวจสอบข้อมูลหมดอายุ (3600000ms = 1 ชั่วโมง)</li>
                        <li><strong>Context Expiration Time:</strong> ข้อมูลหมดอายุเมื่อไม่ใช้เกินเวลานี้ (1800000ms = 30 นาที)</li>
                      </ul>
                      <small className="text-muted mt-2 d-block">💡 <strong>ตัวอย่าง:</strong> ถ้าผู้ใช้ไม่คุยต่อเกิน 30 นาที ข้อมูลการสนทนาจะถูกลบทิ้ง</small>
                    </div>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label"><strong>Expired Context Interval</strong></label>
                        <input type="number" className="form-control" value={productSearchConfig.cleanup.expiredContextInterval} onChange={(e) => setProductSearchConfig({...productSearchConfig, cleanup: {...productSearchConfig.cleanup, expiredContextInterval: parseInt(e.target.value)}})} />
                        <small className="text-muted">มิลลิวินาที (3600000 = 1 ชั่วโมง)</small>
                      </div>
                      <div className="col-md-6">
                        <label className="form-label"><strong>Context Expiration Time</strong></label>
                        <input type="number" className="form-control" value={productSearchConfig.cleanup.contextExpirationTime} onChange={(e) => setProductSearchConfig({...productSearchConfig, cleanup: {...productSearchConfig.cleanup, contextExpirationTime: parseInt(e.target.value)}})} />
                        <small className="text-muted">มิลลิวินาที (1800000 = 30 นาที)</small>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Save Button */}
              <div className="d-flex gap-2">
                <button className="btn btn-primary" onClick={handleSaveProductSearchConfig} disabled={loading}>
                  <SaveIcon className="me-2" />
                  บันทึกการตั้งค่า Search
                </button>
                <button className="btn btn-outline-secondary" onClick={loadProductSearchConfig} disabled={loading}>
                  <RefreshIcon className="me-2" style={{ width: '14px', height: '14px' }} />
                  โหลดค่าใหม่
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Knowledge Tab */}
      {activeTab === 'knowledge' && (
        <>
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body p-4">
              <h5 className="mb-4" style={{ fontWeight: '600' }}>Knowledge RAG Configuration</h5>

              <div className="form-check form-switch mb-4">
                <input className="form-check-input" type="checkbox" id="enableKnowledgeVector" checked={config.knowledgeVectorEnabled} onChange={(e) => setConfig({ ...config, knowledgeVectorEnabled: e.target.checked })} />
                <label className="form-check-label" htmlFor="enableKnowledgeVector">
                  <strong>เปิดใช้งาน Knowledge Vector</strong>
                </label>
              </div>

              {config.knowledgeVectorEnabled && (
                <>
                  <div className="mb-3">
                    <label className="form-label"><strong>จำนวนผลลัพธ์สูงสุด: {config.knowledgeMaxResults}</strong></label>
                    <input type="range" className="form-range" min="1" max="20" value={config.knowledgeMaxResults} onChange={(e) => setConfig({ ...config, knowledgeMaxResults: parseInt(e.target.value) })} />
                  </div>

                  <div className="mb-3">
                    <label className="form-label"><strong>Similarity Threshold</strong></label>
                    <select className="form-select" value={config.knowledgeSimilarityThreshold} onChange={(e) => setConfig({ ...config, knowledgeSimilarityThreshold: parseFloat(e.target.value) })}>
                      {similarityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </>
              )}

              <button className="btn btn-primary" onClick={handleSaveConfig} disabled={loading}>
                <SaveIcon className="me-2" />
                บันทึกการตั้งค่า
              </button>
            </div>
          </div>

          {config.knowledgeVectorEnabled && (
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white border-bottom d-flex justify-content-between align-items-center py-3">
                <h5 className="mb-0" style={{ fontWeight: '600' }}>จัดการเนื้อหาความรู้</h5>
                <button className="btn btn-sm btn-primary" onClick={() => {
                  setShowKnowledgeForm(true);
                  setEditingKnowledge(null);
                  setKnowledgeForm({ title: '', content: '', category: '', tags: '' });
                }}>
                  <i className="fas fa-plus me-1"></i>
                  เพิ่มเนื้อหา
                </button>
              </div>
              <div className="card-body p-4">
                {showKnowledgeForm && (
                  <div className="bg-light rounded p-3 mb-3">
                    <h6 className="mb-3">{editingKnowledge ? 'แก้ไขเนื้อหา' : 'เพิ่มเนื้อหาใหม่'}</h6>
                    <input type="text" className="form-control mb-2" value={knowledgeForm.title} onChange={(e) => setKnowledgeForm({ ...knowledgeForm, title: e.target.value })} placeholder="หัวข้อ" />
                    <textarea className="form-control mb-2" rows={4} value={knowledgeForm.content} onChange={(e) => setKnowledgeForm({ ...knowledgeForm, content: e.target.value })} placeholder="เนื้อหา" />
                    <div className="row g-2 mb-2">
                      <div className="col-md-6">
                        <input type="text" className="form-control" value={knowledgeForm.category} onChange={(e) => setKnowledgeForm({ ...knowledgeForm, category: e.target.value })} placeholder="หมวดหมู่" />
                      </div>
                      <div className="col-md-6">
                        <input type="text" className="form-control" value={knowledgeForm.tags} onChange={(e) => setKnowledgeForm({ ...knowledgeForm, tags: e.target.value })} placeholder="แท็ก (คั่นด้วยจุลภาค)" />
                      </div>
                    </div>
                    <div className="d-flex gap-2">
                      <button className="btn btn-primary btn-sm" onClick={handleSaveKnowledgeEntry} disabled={loading || !knowledgeForm.title || !knowledgeForm.content}>
                        <SaveIcon className="me-1" />
                        {editingKnowledge ? 'อัปเดต' : 'บันทึก'}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => {
                        setShowKnowledgeForm(false);
                        setEditingKnowledge(null);
                        setKnowledgeForm({ title: '', content: '', category: '', tags: '' });
                      }}>ยกเลิก</button>
                    </div>
                  </div>
                )}

                <div className="table-responsive">
                  <table className="table table-hover align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>หัวข้อ</th>
                        <th>หมวดหมู่</th>
                        <th>อัปเดต</th>
                        <th style={{ width: '120px' }}>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {knowledgeEntries.length === 0 ? (
                        <tr><td colSpan={4} className="text-center text-muted py-4">ยังไม่มีเนื้อหา</td></tr>
                      ) : (
                        knowledgeEntries.map(entry => (
                          <tr key={entry.id}>
                            <td>
                              <strong>{entry.title}</strong>
                              <div className="text-muted small">{entry.content.substring(0, 80)}...</div>
                            </td>
                            <td>{entry.category || '-'}</td>
                            <td><small>{new Date(entry.last_updated).toLocaleDateString('th-TH')}</small></td>
                            <td>
                              <button className="btn btn-sm btn-outline-primary me-1" onClick={() => {
                                setEditingKnowledge(entry);
                                setKnowledgeForm({ title: entry.title, content: entry.content, category: entry.category || '', tags: entry.tags || '' });
                                setShowKnowledgeForm(true);
                              }}>
                                <i className="fas fa-edit"></i>
                              </button>
                              <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteKnowledgeEntry(entry.id)}>
                                <DeleteIcon />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Test Search Tab */}
      {activeTab === 'test' && (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <h5 className="mb-4" style={{ fontWeight: '600' }}>ทดสอบการค้นหา</h5>

            <div className="mb-3">
              <label className="form-label"><strong>คำค้นหา</strong></label>
              <input type="text" className="form-control" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="ใส่คำค้นหา..." onKeyDown={(e) => e.key === 'Enter' && handleTestSearch()} />
            </div>

            <div className="mb-3">
              <label className="form-label"><strong>ประเภทการค้นหา</strong></label>
              <select className="form-select" value={searchType} onChange={(e) => setSearchType(e.target.value as any)}>
                <option value="both">ค้นหาทั้งสินค้าและความรู้</option>
                <option value="product" disabled={!config.productVectorEnabled}>ค้นหาเฉพาะสินค้า</option>
                <option value="knowledge" disabled={!config.knowledgeVectorEnabled}>ค้นหาเฉพาะความรู้</option>
              </select>
            </div>

            {/* Search Config */}
            <div className="row g-3 mb-3">
              {(searchType === 'both' || searchType === 'product') && config.productVectorEnabled && (
                <>
                  <div className="col-md-6">
                    <label className="form-label small text-muted">Product: จำนวนผลลัพธ์ ({testProductMaxResults})</label>
                    <input type="range" className="form-range" min="1" max="20" value={testProductMaxResults} onChange={(e) => setTestProductMaxResults(parseInt(e.target.value))} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small text-muted">Product: Similarity Threshold</label>
                    <select className="form-select form-select-sm" value={testProductSimilarity} onChange={(e) => setTestProductSimilarity(parseFloat(e.target.value))}>
                      {similarityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </>
              )}

              {(searchType === 'both' || searchType === 'knowledge') && config.knowledgeVectorEnabled && (
                <>
                  <div className="col-md-6">
                    <label className="form-label small text-muted">Knowledge: จำนวนผลลัพธ์ ({testKnowledgeMaxResults})</label>
                    <input type="range" className="form-range" min="1" max="20" value={testKnowledgeMaxResults} onChange={(e) => setTestKnowledgeMaxResults(parseInt(e.target.value))} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small text-muted">Knowledge: Similarity Threshold</label>
                    <select className="form-select form-select-sm" value={testKnowledgeSimilarity} onChange={(e) => setTestKnowledgeSimilarity(parseFloat(e.target.value))}>
                      {similarityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>

            <button className="btn btn-primary mb-4" onClick={handleTestSearch} disabled={searching || !searchQuery.trim()}>
              {searching ? <><i className="fas fa-spinner fa-spin me-2"></i>กำลังค้นหา...</> : <><i className="fas fa-search me-2"></i>ค้นหา</>}
            </button>

            {/* Results */}
            {searchResults.productResults && searchResults.productResults.length > 0 && (
              <div className="mb-4">
                <h6 className="mb-3"><i className="fas fa-box me-2 text-primary"></i>ผลลัพธ์สินค้า ({searchResults.productResults.length})</h6>
                <div className="list-group">
                  {searchResults.productResults.map((r, i) => (
                    <div key={i} className="list-group-item">
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <h6 className="mb-1">{r.metadata.product_name}</h6>
                          <small className="text-muted">{r.metadata.category} • {r.metadata.price}</small>
                        </div>
                        <span className="badge bg-primary">{(r.score * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {searchResults.knowledgeResults && searchResults.knowledgeResults.length > 0 && (
              <div className="mb-4">
                <h6 className="mb-3"><i className="fas fa-book me-2 text-success"></i>ผลลัพธ์ความรู้ ({searchResults.knowledgeResults.length})</h6>
                <div className="list-group">
                  {searchResults.knowledgeResults.map((r, i) => (
                    <div key={i} className="list-group-item">
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="flex-grow-1">
                          <h6 className="mb-1">{r.metadata.title}</h6>
                          <p className="text-muted small mb-0">{r.metadata.content?.substring(0, 150)}...</p>
                        </div>
                        <span className="badge bg-success ms-2">{(r.score * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {searchResults.productResults?.length === 0 && searchResults.knowledgeResults?.length === 0 && (
              <div className="alert alert-warning">
                <i className="fas fa-exclamation-triangle me-2"></i>
                ไม่พบผลลัพธ์ที่ตรงกับคำค้นหา
              </div>
            )}
          </div>
        </div>
      )}

      </div>

      {/* Vector Detail Modal */}
      {showVectorModal && selectedVector && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setShowVectorModal(false)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header" style={{ background: selectedVector.type === 'product' ? 'linear-gradient(135deg, #28a745 0%, #20c997 100%)' : 'linear-gradient(135deg, #17a2b8 0%, #138496 100%)', color: 'white' }}>
                <h5 className="modal-title">
                  <i className={`fas fa-${selectedVector.type === 'product' ? 'box' : 'book'} me-2`}></i>
                  {selectedVector.type === 'product' ? 'Product Vector' : 'Knowledge Vector'}
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowVectorModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="text-muted small">Name</label>
                  <h6 className="mb-0">{selectedVector.name}</h6>
                </div>

                {selectedVector.category && (
                  <div className="mb-3">
                    <label className="text-muted small">Category</label>
                    <div>
                      <span className="badge bg-secondary">{selectedVector.category}</span>
                    </div>
                  </div>
                )}

                <div className="mb-3">
                  <label className="text-muted small">Vector ID</label>
                  <div className="font-monospace small text-muted">{selectedVector.id}</div>
                </div>

                <div className="mb-3">
                  <label className="text-muted small">3D Coordinates</label>
                  <div className="d-flex gap-2">
                    <span className="badge bg-light text-dark">X: {selectedVector.x?.toFixed(2)}</span>
                    <span className="badge bg-light text-dark">Y: {selectedVector.y?.toFixed(2)}</span>
                    <span className="badge bg-light text-dark">Z: {selectedVector.z?.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowVectorModal(false)}>
                  ปิด
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default VectorDBPage;
