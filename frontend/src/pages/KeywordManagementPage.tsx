import React, { useEffect, useState } from 'react';
import { Card, Button, Modal, Form, Table, Badge, Alert, Row, Col, InputGroup, Spinner, Image } from 'react-bootstrap';
// Using Font Awesome classes instead of react-icons
import axios from 'axios';

interface KeywordMapping {
  keyword: string;
  imageUrls?: string[];
  imageUrl?: string; // For backward compatibility
  imageType: 'url' | 'file';
  description: string;
  enabled: boolean;
  caseSensitive: boolean;
  exactMatch: boolean;
  introMessage?: string;
  createdAt: string;
  lastUpdated: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  keywords?: T[];
  error?: string;
  message?: string;
}

const KeywordManagementPage: React.FC = () => {
  const [keywords, setKeywords] = useState<KeywordMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingKeyword, setEditingKeyword] = useState<KeywordMapping | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);

  // Form state
  const [formData, setFormData] = useState({
    keyword: '',
    imageUrls: '',
    description: '',
    enabled: true,
    caseSensitive: false,
    exactMatch: false,
    introMessage: ''
  });

  const API_BASE = 'http://localhost:3001/api';

  useEffect(() => {
    loadKeywords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadKeywords = async () => {
    try {
      setLoading(true);
      const response = await axios.get<ApiResponse<KeywordMapping>>(`${API_BASE}/keyword-images/keywords`);

      if (response.data.success && response.data.keywords) {
        // Convert legacy format to new format
        const convertedKeywords = response.data.keywords.map(keyword => ({
          ...keyword,
          imageUrls: keyword.imageUrls || (keyword.imageUrl ? [keyword.imageUrl] : [])
        }));
        setKeywords(convertedKeywords);
      } else {
        throw new Error(response.data.error || 'Failed to load keywords');
      }
    } catch (err: any) {
      console.error('Error loading keywords:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load keywords');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Parse multiple URLs
      const imageUrls = formData.imageUrls
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0);

      if (imageUrls.length === 0) {
        throw new Error('กรุณาใส่ URL รูปภาพอย่างน้อย 1 รูป');
      }

      const requestData = {
        keyword: formData.keyword,
        imageUrls: imageUrls,
        imageType: 'url' as const,
        description: formData.description,
        enabled: formData.enabled,
        caseSensitive: formData.caseSensitive,
        exactMatch: formData.exactMatch,
        introMessage: formData.introMessage || null
      };

      let response;
      if (editingKeyword) {
        // Update existing keyword
        response = await axios.put<ApiResponse<KeywordMapping>>(
          `${API_BASE}/keyword-images/keywords/${encodeURIComponent(editingKeyword.keyword)}`,
          requestData
        );
      } else {
        // Create new keyword
        response = await axios.post<ApiResponse<KeywordMapping>>(
          `${API_BASE}/keyword-images/keywords`,
          requestData
        );
      }

      if (response.data.success) {
        await loadKeywords();
        handleCloseModal();
        setError(null);
      } else {
        throw new Error(response.data.error || 'Operation failed');
      }
    } catch (err: any) {
      console.error('Error saving keyword:', err);
      setError(err.response?.data?.error || err.message || 'Failed to save keyword');
    }
  };

  const handleDelete = async (keyword: string) => {
    if (!window.confirm(`คุณต้องการลบ keyword "${keyword}" หรือไม่?`)) {
      return;
    }

    try {
      const response = await axios.delete<ApiResponse<any>>(
        `${API_BASE}/keyword-images/keywords/${encodeURIComponent(keyword)}`
      );

      if (response.data.success) {
        await loadKeywords();
        setError(null);
      } else {
        throw new Error(response.data.error || 'Failed to delete keyword');
      }
    } catch (err: any) {
      console.error('Error deleting keyword:', err);
      setError(err.response?.data?.error || err.message || 'Failed to delete keyword');
    }
  };

  const handleEdit = (keywordData: KeywordMapping) => {
    setEditingKeyword(keywordData);
    const imageUrls = keywordData.imageUrls || (keywordData.imageUrl ? [keywordData.imageUrl] : []);
    setFormData({
      keyword: keywordData.keyword,
      imageUrls: imageUrls.join('\n'),
      description: keywordData.description,
      enabled: keywordData.enabled,
      caseSensitive: keywordData.caseSensitive,
      exactMatch: keywordData.exactMatch,
      introMessage: keywordData.introMessage || ''
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingKeyword(null);
    setFormData({
      keyword: '',
      imageUrls: '',
      description: '',
      enabled: true,
      caseSensitive: false,
      exactMatch: false,
      introMessage: ''
    });
  };

  const handlePreviewImages = (images: string[]) => {
    setPreviewImages(images);
    setCurrentPreviewIndex(0);
    setShowImagePreview(true);
  };

  const nextImage = () => {
    setCurrentPreviewIndex((prev) =>
      prev < previewImages.length - 1 ? prev + 1 : 0
    );
  };

  const prevImage = () => {
    setCurrentPreviewIndex((prev) =>
      prev > 0 ? prev - 1 : previewImages.length - 1
    );
  };

  const filteredKeywords = keywords.filter(keyword =>
    keyword.keyword.toLowerCase().includes(searchTerm.toLowerCase()) ||
    keyword.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container-fluid py-4">
      <Row className="mb-4">
        <Col>
          <h2 className="text-primary">
            <i className="fas fa-image me-2" />
            จัดการ Keyword และรูปภาพ
          </h2>
          <p className="text-muted">
            จัดการ keywords สำหรับการส่งรูปภาพอัตโนมัติ รองรับหลายรูปต่อ keyword
          </p>
        </Col>
      </Row>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Row className="mb-4">
        <Col md={8}>
          <InputGroup>
            <InputGroup.Text>
              <i className="fas fa-search" />
            </InputGroup.Text>
            <Form.Control
              type="text"
              placeholder="ค้นหา keyword หรือคำอธิบาย..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </InputGroup>
        </Col>
        <Col md={4} className="text-end">
          <Button
            variant="primary"
            onClick={() => setShowModal(true)}
            className="mb-2"
          >
            <i className="fas fa-plus me-2" />
            เพิ่ม Keyword ใหม่
          </Button>
        </Col>
      </Row>

      <Card>
        <Card.Body>
          {loading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
              <p className="mt-2">กำลังโหลดข้อมูล...</p>
            </div>
          ) : (
            <Table responsive hover>
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>รูปภาพ</th>
                  <th>คำอธิบาย</th>
                  <th>สถานะ</th>
                  <th>การตั้งค่า</th>
                  <th>วันที่อัปเดต</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filteredKeywords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-4">
                      <span className="text-muted">ไม่พบข้อมูล keyword</span>
                    </td>
                  </tr>
                ) : (
                  filteredKeywords.map((keyword) => (
                    <tr key={keyword.keyword}>
                      <td>
                        <strong>{keyword.keyword}</strong>
                      </td>
                      <td>
                        <div className="d-flex align-items-center">
                          <Badge bg="info" className="me-2">
                            {keyword.imageUrls?.length || 0} รูป
                          </Badge>
                          {(keyword.imageUrls?.length || 0) > 0 && (
                            <Button
                              size="sm"
                              variant="outline-primary"
                              onClick={() => handlePreviewImages(keyword.imageUrls || [])}
                            >
                              <i className="fas fa-eye me-1" />
                              ดูรูป
                            </Button>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="text-muted">
                          {keyword.description || '-'}
                        </span>
                      </td>
                      <td>
                        <Badge bg={keyword.enabled ? 'success' : 'secondary'}>
                          {keyword.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                        </Badge>
                      </td>
                      <td>
                        <div className="small text-muted">
                          <div>Case: {keyword.caseSensitive ? 'Sensitive' : 'Insensitive'}</div>
                          <div>Match: {keyword.exactMatch ? 'Exact' : 'Partial'}</div>
                        </div>
                      </td>
                      <td className="small text-muted">
                        {new Date(keyword.lastUpdated).toLocaleDateString('th-TH')}
                      </td>
                      <td>
                        <div className="d-flex gap-1">
                          <Button
                            size="sm"
                            variant="outline-primary"
                            onClick={() => handleEdit(keyword)}
                          >
                            <i className="fas fa-edit" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-danger"
                            onClick={() => handleDelete(keyword.keyword)}
                          >
                            <i className="fas fa-trash" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Add/Edit Modal */}
      <Modal show={showModal} onHide={handleCloseModal} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            {editingKeyword ? 'แก้ไข Keyword' : 'เพิ่ม Keyword ใหม่'}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Keyword *</Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.keyword}
                    onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
                    placeholder="เช่น กล่อง, บรรจุภัณฑ์"
                    required
                    disabled={!!editingKeyword}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>คำอธิบาย</Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="คำอธิบายสำหรับ keyword นี้"
                  />
                </Form.Group>
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <Form.Label>URL รูปภาพ (หลายรูป) *</Form.Label>
              <Form.Control
                as="textarea"
                rows={4}
                value={formData.imageUrls}
                onChange={(e) => setFormData({ ...formData, imageUrls: e.target.value })}
                placeholder="ใส่ URL รูปภาพแต่ละรูปในบรรทัดใหม่ เช่น:
https://example.com/image1.jpg
https://example.com/image2.jpg"
                required
              />
              <Form.Text className="text-muted">
                ใส่ URL รูปภาพแต่ละรูปในบรรทัดใหม่ สำหรับหลายรูปจะส่งเป็นอัลบั้ม
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>ข้อความแนะนำ</Form.Label>
              <Form.Control
                type="text"
                value={formData.introMessage}
                onChange={(e) => setFormData({ ...formData, introMessage: e.target.value })}
                placeholder="📷 รูปภาพสำหรับ: {keyword}"
              />
              <Form.Text className="text-muted">
                ใช้ {'{keyword}'} เพื่อแทรก keyword ในข้อความ
              </Form.Text>
            </Form.Group>

            <Row>
              <Col md={4}>
                <Form.Check
                  type="checkbox"
                  label="เปิดใช้งาน"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                />
              </Col>
              <Col md={4}>
                <Form.Check
                  type="checkbox"
                  label="Case Sensitive"
                  checked={formData.caseSensitive}
                  onChange={(e) => setFormData({ ...formData, caseSensitive: e.target.checked })}
                />
              </Col>
              <Col md={4}>
                <Form.Check
                  type="checkbox"
                  label="Exact Match"
                  checked={formData.exactMatch}
                  onChange={(e) => setFormData({ ...formData, exactMatch: e.target.checked })}
                />
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseModal}>
              ยกเลิก
            </Button>
            <Button variant="primary" type="submit">
              {editingKeyword ? 'อัปเดต' : 'เพิ่ม'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Image Preview Modal */}
      <Modal show={showImagePreview} onHide={() => setShowImagePreview(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>
            ดูรูปภาพ ({currentPreviewIndex + 1}/{previewImages.length})
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center">
          {previewImages.length > 0 && (
            <>
              <div className="position-relative">
                <Image
                  src={previewImages[currentPreviewIndex]}
                  alt={`Preview ${currentPreviewIndex + 1}`}
                  fluid
                  style={{ maxHeight: '500px' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBmb3VuZDwvdGV4dD48L3N2Zz4=';
                  }}
                />
                {previewImages.length > 1 && (
                  <>
                    <Button
                      variant="dark"
                      className="position-absolute top-50 start-0 translate-middle-y ms-2"
                      onClick={prevImage}
                    >
                      ‹
                    </Button>
                    <Button
                      variant="dark"
                      className="position-absolute top-50 end-0 translate-middle-y me-2"
                      onClick={nextImage}
                    >
                      ›
                    </Button>
                  </>
                )}
              </div>
              <div className="mt-3">
                <small className="text-muted d-block mb-2">
                  {previewImages[currentPreviewIndex]}
                </small>
                <Button
                  size="sm"
                  variant="outline-primary"
                  href={previewImages[currentPreviewIndex]}
                  target="_blank"
                >
                  <i className="fas fa-external-link-alt me-1" />
                  เปิดในแท็บใหม่
                </Button>
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowImagePreview(false)}>
            ปิด
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default KeywordManagementPage;