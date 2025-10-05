import React, { useState } from 'react';
import { Form, Button, Card, Row, Col, Spinner, Alert, Badge } from 'react-bootstrap';
import { knowledgeApi, SearchResult } from '../services/api';

const KnowledgeSearchPage: React.FC = () => {
  const [params, setParams] = useState({
    query: '',
    topK: 5,
    scoreThreshold: 0.5,
    language: 'auto',
    category: '',
  });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!params.query) {
      setError('กรุณาใส่คำค้นหา');
      return;
    }
    
    setLoading(true);
    setError('');
    setResults(null);
    
    try {
      const payload: any = { 
        query: params.query, 
        topK: params.topK, 
        scoreThreshold: params.scoreThreshold 
      };
      if (params.category) payload.category = params.category;
      if (params.language && params.language !== 'auto' && params.language !== 'all') {
        payload.language = params.language;
      }
      if (params.language === 'all') payload.crossLanguage = true;

      const response = await knowledgeApi.search(payload);
      if (response.success) {
                 setResults(response.data.results);      } else {
        setError('การค้นหาไม่พบผลลัพธ์');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดระหว่างการค้นหา');
    } finally {
      setLoading(false);
    }
  };

  const getScoreBadge = (score: number) => {
    if (score > 0.8) return 'success';
    if (score > 0.6) return 'info';
    if (score > 0.4) return 'warning';
    return 'danger';
  };
  
  const headerStyle = {
    backgroundColor: '#312783',
    color: '#FFFFFF'
  };
  
  const buttonStyle = {
    backgroundColor: '#EF7D00',
    borderColor: '#EF7D00',
  };

  return (
    <div>
      <h2 style={{color: '#312783'}} className="mb-4"><i className="fas fa-search me-2"></i>ทดสอบการค้นหาองค์ความรู้</h2>
      <Row>
        <Col lg={4}>
          <Card>
            <Card.Header as="h5" style={headerStyle}>พารามิเตอร์การค้นหา</Card.Header>
            <Card.Body>
              <Form onSubmit={handleSearch}>
                <Form.Group className="mb-3">
                  <Form.Label>คำค้นหา</Form.Label>
                  <Form.Control as="textarea" rows={3} value={params.query} onChange={e => setParams({...params, query: e.target.value})} required />
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Label>ภาษา</Form.Label>
                    <Form.Select value={params.language} onChange={e => setParams({...params, language: e.target.value})}>
                        <option value="auto">ตรวจจับอัตโนมัติ</option>
                        <option value="all">ทุกภาษา</option>
                        <option value="TH">🇹🇭 เฉพาะภาษาไทย</option>
                        <option value="EN">🇬🇧 เฉพาะภาษาอังกฤษ</option>
                    </Form.Select>
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Label>หมวดหมู่ (ไม่บังคับ)</Form.Label>
                    <Form.Control type="text" value={params.category} onChange={e => setParams({...params, category: e.target.value})} />
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Label>จำนวนผลลัพธ์ (Top K): {params.topK}</Form.Label>
                    <Form.Range min="1" max="20" value={params.topK} onChange={e => setParams({...params, topK: parseInt(e.target.value)})} />
                </Form.Group>
                 <Form.Group className="mb-3">
                    <Form.Label>เกณฑ์คะแนนขั้นต่ำ: {params.scoreThreshold}</Form.Label>
                    <Form.Range min="0.1" max="1.0" step="0.05" value={params.scoreThreshold} onChange={e => setParams({...params, scoreThreshold: parseFloat(e.target.value)})} />
                </Form.Group>
                <Button type="submit" disabled={loading} style={buttonStyle}>
                  {loading ? <Spinner size="sm"/> : <i className="fas fa-search me-2"></i>} ค้นหา
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={8}>
          <Card>
            <Card.Header as="h5" style={headerStyle}>ผลลัพธ์</Card.Header>
            <Card.Body style={{ minHeight: '400px', maxHeight: '70vh', overflowY: 'auto'}}>
              {loading && <div className="text-center"><Spinner animation="border" style={{ color: '#EF7D00' }} /></div>}
              {error && <Alert variant="danger">{error}</Alert>}
              {results && results.length === 0 && <Alert variant="info">ไม่พบผลลัพธ์ที่ตรงกับเกณฑ์ของคุณ</Alert>}
              {results && results.length > 0 && (
                <div>
                  <h5 className="mb-3">พบส่วนข้อมูลที่เกี่ยวข้อง {results.length} ส่วน:</h5>
                  {results.map((result, index) => (
                    <Card key={result.id + index} className="mb-3">
                      <Card.Header>
                        <strong>{result.file_name}</strong>
                        <Badge bg="secondary" className="ms-2">{result.category}</Badge>
                        <Badge bg="primary" className="ms-2">{result.language}</Badge>
                      </Card.Header>
                      <Card.Body>
                        <p style={{whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto', backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '5px' }}>{result.text}</p>
                      </Card.Body>
                      <Card.Footer className="text-muted">
                        คะแนนความเกี่ยวข้อง: <Badge bg={getScoreBadge(result.relevance_score)}>{result.relevance_score.toFixed(4)}</Badge>
                      </Card.Footer>
                    </Card>
                  ))}
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default KnowledgeSearchPage;