// src/pages/DocumentsPage.tsx
import React, { useState, useEffect } from 'react';
import {
  AddIcon,
  DeleteIcon,
  VisibilityIcon,
  SaveIcon,
  RefreshIcon
} from '../components/Icons';
import '../styles/theme.css';

interface Document {
  id: string;
  title: string;
  filename: string;
  file_type: string;
  file_size: number;
  content?: string;
  uploaded_at: string;
  indexed_to_rag?: boolean;
  rag_entry_id?: string | null;
  last_indexed_at?: string | null;
}

const DocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:3001/api/documents');
      const data = await response.json();

      if (data.success) {
        setDocuments(data.documents || []);
      }
    } catch (err: any) {
      setError('ไม่สามารถโหลดเอกสารได้');
      console.error('Error loading documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!uploadTitle) {
        setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('กรุณาเลือกไฟล์');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', uploadTitle || selectedFile.name);

      const response = await fetch('http://localhost:3001/api/documents/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('อัปโหลดเอกสารสำเร็จ');
        setTimeout(() => setSuccess(null), 3000);
        setShowUploadModal(false);
        setSelectedFile(null);
        setUploadTitle('');
        loadDocuments();
      } else {
        throw new Error(data.error || 'ไม่สามารถอัปโหลดได้');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('คุณต้องการลบเอกสารนี้หรือไม่?')) return;

    try {
      setLoading(true);
      const response = await fetch(`http://localhost:3001/api/documents/${id}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('ลบเอกสารสำเร็จ');
        setTimeout(() => setSuccess(null), 3000);
        loadDocuments();
      } else {
        throw new Error(data.error || 'ไม่สามารถลบได้');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (doc: Document) => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:3001/api/documents/${doc.id}/content`);
      const data = await response.json();

      if (data.success) {
        setSelectedDocument({ ...doc, content: data.content });
        setShowViewModal(true);
      }
    } catch (err: any) {
      setError('ไม่สามารถโหลดเนื้อหาได้');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (doc: Document) => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:3001/api/documents/${doc.id}/content`);
      const data = await response.json();

      if (data.success) {
        setEditingDocument({ ...doc, content: data.content });
        setEditTitle(doc.title);
        setEditContent(data.content || '');
        setShowEditModal(true);
      }
    } catch (err: any) {
      setError('ไม่สามารถโหลดเนื้อหาได้');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingDocument) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`http://localhost:3001/api/documents/${editingDocument.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: editTitle,
          content: editContent
        })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('แก้ไขเอกสารสำเร็จ');
        setTimeout(() => setSuccess(null), 3000);
        setShowEditModal(false);
        setEditingDocument(null);
        setEditTitle('');
        setEditContent('');
        loadDocuments();
      } else {
        throw new Error(data.error || 'ไม่สามารถแก้ไขได้');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleIndexToRAG = async (doc: Document) => {
    if (!window.confirm(`คุณต้องการ index "${doc.title}" เข้า Knowledge RAG หรือไม่?`)) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`http://localhost:3001/api/documents/${doc.id}/index-to-rag`, {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Index เข้า Knowledge RAG สำเร็จ');
        setTimeout(() => setSuccess(null), 3000);
        loadDocuments();
      } else {
        throw new Error(data.error || 'ไม่สามารถ index ได้');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromRAG = async (doc: Document) => {
    if (!window.confirm(`คุณต้องการลบ "${doc.title}" ออกจาก Knowledge RAG หรือไม่?`)) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`http://localhost:3001/api/documents/${doc.id}/remove-from-rag`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('ลบออกจาก Knowledge RAG สำเร็จ');
        setTimeout(() => setSuccess(null), 3000);
        loadDocuments();
      } else {
        throw new Error(data.error || 'ไม่สามารถลบได้');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="container-fluid px-4 py-4" style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-0" style={{ fontWeight: '600', fontSize: '1.75rem' }}>
            <i className="fas fa-file-alt me-2"></i>
            จัดการเอกสาร
          </h2>
          <p className="text-muted mb-0" style={{ fontSize: '0.875rem' }}>อัปโหลดและจัดการเอกสาร</p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-primary btn-sm" onClick={loadDocuments} disabled={loading}>
            <RefreshIcon className="me-1" style={{ width: '14px', height: '14px' }} />
            รีเฟรช
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowUploadModal(true)}>
            <AddIcon className="me-1" style={{ width: '14px', height: '14px' }} />
            อัปโหลดเอกสาร
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

      {/* Documents List */}
      <div className="card border-0 shadow-sm">
        <div className="card-body">
          {loading && documents.length === 0 ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="fas fa-inbox fa-3x mb-3"></i>
              <p>ยังไม่มีเอกสาร</p>
              <button className="btn btn-primary btn-sm" onClick={() => setShowUploadModal(true)}>
                <AddIcon className="me-1" style={{ width: '14px', height: '14px' }} />
                อัปโหลดเอกสารแรก
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>ชื่อเอกสาร</th>
                    <th>ไฟล์</th>
                    <th>ประเภท</th>
                    <th>ขนาด</th>
                    <th>อัปโหลดเมื่อ</th>
                    <th style={{ width: '200px' }}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr
                      key={doc.id}
                      className={!doc.indexed_to_rag ? 'table-warning' : ''}
                      style={!doc.indexed_to_rag ? {
                        backgroundColor: 'rgba(255, 193, 7, 0.1)',
                        borderLeft: '3px solid #ffc107'
                      } : {}}
                    >
                      <td>
                        <div className="d-flex align-items-center">
                          <strong>{doc.title}</strong>
                          {!doc.indexed_to_rag && (
                            <span className="badge bg-warning text-dark ms-2" style={{ fontSize: '0.7rem' }}>
                              <i className="fas fa-exclamation-triangle me-1"></i>
                              ยัง Index
                            </span>
                          )}
                          {doc.indexed_to_rag && (
                            <span className="badge bg-success ms-2" style={{ fontSize: '0.7rem' }}>
                              <i className="fas fa-check-circle me-1"></i>
                              Indexed
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-muted small">{doc.filename}</td>
                      <td>
                        <span className="badge bg-info">{doc.file_type.toUpperCase()}</span>
                      </td>
                      <td className="text-muted small">{formatFileSize(doc.file_size)}</td>
                      <td className="text-muted small">{formatDate(doc.uploaded_at)}</td>
                      <td>
                        <div className="d-flex gap-1">
                          <button
                            className="btn btn-outline-primary btn-sm"
                            onClick={() => handleView(doc)}
                            title="ดูเอกสาร"
                          >
                            <VisibilityIcon style={{ width: '14px', height: '14px' }} />
                          </button>
                          <button
                            className="btn btn-outline-warning btn-sm"
                            onClick={() => handleEdit(doc)}
                            title="แก้ไขเอกสาร"
                          >
                            <i className="fas fa-edit" style={{ width: '14px', height: '14px' }}></i>
                          </button>
                          {!doc.indexed_to_rag ? (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => handleIndexToRAG(doc)}
                              title="Index เข้า Knowledge RAG"
                              disabled={!doc.content || doc.content.trim().length === 0}
                            >
                              <i className="fas fa-brain" style={{ width: '14px', height: '14px' }}></i>
                            </button>
                          ) : (
                            <button
                              className="btn btn-outline-secondary btn-sm"
                              onClick={() => handleRemoveFromRAG(doc)}
                              title="ลบออกจาก Knowledge RAG"
                            >
                              <i className="fas fa-unlink" style={{ width: '14px', height: '14px' }}></i>
                            </button>
                          )}
                          <button
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => handleDelete(doc.id)}
                            title="ลบเอกสาร"
                          >
                            <DeleteIcon style={{ width: '14px', height: '14px' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setShowUploadModal(false)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title">
                  <AddIcon className="me-2" style={{ width: '20px', height: '20px' }} />
                  อัปโหลดเอกสาร
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowUploadModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">ชื่อเอกสาร</label>
                  <input
                    type="text"
                    className="form-control"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="ชื่อเอกสาร"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">เลือกไฟล์</label>
                  <input
                    type="file"
                    className="form-control"
                    onChange={handleFileSelect}
                    accept=".pdf,.doc,.docx,.txt,.md"
                  />
                  {selectedFile && (
                    <small className="text-muted">
                      ไฟล์: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                    </small>
                  )}
                </div>
                <div className="alert alert-info mb-0">
                  <small>
                    <i className="fas fa-info-circle me-1"></i>
                    รองรับไฟล์: PDF, DOC, DOCX, TXT, MD
                  </small>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowUploadModal(false)}>
                  ยกเลิก
                </button>
                <button type="button" className="btn btn-primary" onClick={handleUpload} disabled={!selectedFile || loading}>
                  <SaveIcon className="me-2" style={{ width: '16px', height: '16px' }} />
                  {loading ? 'กำลังอัปโหลด...' : 'อัปโหลด'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Document Modal */}
      {showEditModal && editingDocument && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setShowEditModal(false)}>
          <div className="modal-dialog modal-lg modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header bg-warning text-dark">
                <h5 className="modal-title">
                  <i className="fas fa-edit me-2"></i>
                  แก้ไขเอกสาร
                </h5>
                <button type="button" className="btn-close" onClick={() => setShowEditModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">ชื่อเอกสาร</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="ชื่อเอกสาร"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label d-flex justify-content-between">
                    <span>เนื้อหา</span>
                    <small className="text-muted">{editContent.length} ตัวอักษร</small>
                  </label>
                  <textarea
                    className="form-control font-monospace"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={15}
                    style={{ fontSize: '0.875rem' }}
                    placeholder="เนื้อหาเอกสาร"
                  />
                </div>
                <div className="alert alert-info mb-0">
                  <small>
                    <i className="fas fa-info-circle me-1"></i>
                    <strong>หมายเหตุ:</strong> การแก้ไขเนื้อหาจะอัปเดตในฐานข้อมูล แต่ไฟล์ต้นฉบับจะไม่เปลี่ยนแปลง
                  </small>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                  ยกเลิก
                </button>
                <button type="button" className="btn btn-warning" onClick={handleSaveEdit} disabled={loading}>
                  <SaveIcon className="me-2" style={{ width: '16px', height: '16px' }} />
                  {loading ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Document Modal */}
      {showViewModal && selectedDocument && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setShowViewModal(false)}>
          <div className="modal-dialog modal-xl modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header bg-info text-white">
                <h5 className="modal-title">
                  <i className="fas fa-file-alt me-2"></i>
                  {selectedDocument.title}
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowViewModal(false)}></button>
              </div>
              <div className="modal-body">
                {/* Metadata Section */}
                <div className="card mb-3 bg-light">
                  <div className="card-body">
                    <h6 className="card-title mb-3">
                      <i className="fas fa-info-circle me-2"></i>
                      ข้อมูลเอกสาร (Metadata)
                    </h6>
                    <div className="row g-3">
                      <div className="col-md-6">
                        <small className="text-muted d-block">ไฟล์:</small>
                        <strong>{selectedDocument.filename}</strong>
                      </div>
                      <div className="col-md-6">
                        <small className="text-muted d-block">ประเภท:</small>
                        <span className="badge bg-info">{selectedDocument.file_type.toUpperCase()}</span>
                      </div>
                      <div className="col-md-6">
                        <small className="text-muted d-block">ขนาดไฟล์:</small>
                        <strong>{formatFileSize(selectedDocument.file_size)}</strong>
                      </div>
                      <div className="col-md-6">
                        <small className="text-muted d-block">อัปโหลดเมื่อ:</small>
                        <strong>{formatDate(selectedDocument.uploaded_at)}</strong>
                      </div>
                      <div className="col-md-6">
                        <small className="text-muted d-block">จำนวนตัวอักษร:</small>
                        <strong>{selectedDocument.content?.length || 0} ตัวอักษร</strong>
                      </div>
                      <div className="col-md-6">
                        <small className="text-muted d-block">ID:</small>
                        <code className="small">{selectedDocument.id}</code>
                      </div>
                      <div className="col-md-6">
                        <small className="text-muted d-block">สถานะ RAG:</small>
                        {selectedDocument.indexed_to_rag ? (
                          <span className="badge bg-success">
                            <i className="fas fa-check-circle me-1"></i>
                            Indexed แล้ว
                          </span>
                        ) : (
                          <span className="badge bg-warning text-dark">
                            <i className="fas fa-exclamation-triangle me-1"></i>
                            ยังไม่ได้ Index
                          </span>
                        )}
                      </div>
                      {selectedDocument.last_indexed_at && (
                        <div className="col-md-6">
                          <small className="text-muted d-block">Index ล่าสุด:</small>
                          <strong>{formatDate(selectedDocument.last_indexed_at)}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Content Section */}
                <div className="mb-0">
                  <label className="text-muted small mb-2 d-flex align-items-center">
                    <i className="fas fa-file-alt me-2"></i>
                    เนื้อหาที่ดึงได้:
                  </label>
                  <pre className="bg-light p-3 rounded" style={{ maxHeight: '400px', overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>
                    {selectedDocument.content || 'ไม่สามารถแสดงเนื้อหาได้'}
                  </pre>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowViewModal(false)}>
                  ปิด
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentsPage;
