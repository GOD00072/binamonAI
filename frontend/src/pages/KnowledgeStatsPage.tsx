import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Spinner, Alert, ListGroup, Badge, ProgressBar } from 'react-bootstrap';
import { knowledgeApi, Stats } from '../services/api';

const KnowledgeStatsPage: React.FC = () => {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setLoading(true);
                const response = await knowledgeApi.getStats();
                if (response.success) {
                                         setStats(response.data.statistics);                } else {
                    setError('ไม่สามารถดึงข้อมูลสถิติได้');
                }
            } catch (err) {
                setError('เกิดข้อผิดพลาดขณะเชื่อมต่อกับเซิร์ฟเวอร์');
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    const headerStyle = { backgroundColor: '#312783', color: '#FFFFFF' };

    if (loading) return <div className="text-center"><Spinner animation="border" style={{color: '#EF7D00'}} /></div>;
    if (error) return <Alert variant="danger">{error}</Alert>;
    if (!stats) return <Alert variant="info">ไม่มีข้อมูลสถิติ</Alert>;

    const totalDocs = stats.total_knowledge;
    const categoryEntries = Object.entries(stats.categories).sort(([,a],[,b]) => b - a);

    return (
        <div>
            <h2 style={{color: '#312783'}} className="mb-4"><i className="fas fa-chart-pie me-2"></i>สถิติฐานข้อมูลองค์ความรู้</h2>
            
            <Row className="mb-4">
                <Col md={4}><Card className="text-center p-3">
                    <h3 style={{color: '#EF7D00'}}>{totalDocs.toLocaleString()}</h3>
                    <div>เอกสารทั้งหมด</div></Card>
                </Col>
                <Col md={4}><Card className="text-center p-3">
                    <h3 style={{color: '#EF7D00'}}>{stats.total_words.toLocaleString()}</h3>
                    <div>จำนวนคำทั้งหมด</div></Card>
                </Col>
                <Col md={4}><Card className="text-center p-3">
                    <h3 style={{color: '#EF7D00'}}>{stats.total_chunks.toLocaleString()}</h3>
                    <div>ส่วนข้อมูลทั้งหมด</div></Card>
                </Col>
            </Row>

            <Row>
                <Col md={6}>
                    <Card>
                        <Card.Header as="h5" style={headerStyle}>เอกสารตามภาษา</Card.Header>
                        <ListGroup variant="flush">
                            {Object.entries(stats.by_language).map(([lang, data]) => (
                                <ListGroup.Item key={lang} className="d-flex justify-content-between align-items-center">
                                    {lang}
                                    <Badge bg="primary" pill>{data.total} เอกสาร</Badge>
                                </ListGroup.Item>
                            ))}
                        </ListGroup>
                    </Card>
                </Col>
                <Col md={6}>
                    <Card>
                        <Card.Header as="h5" style={headerStyle}>หมวดหมู่ยอดนิยม</Card.Header>
                        <Card.Body>
                            {categoryEntries.map(([category, count]) => (
                                <div key={category} className="mb-2">
                                    <div className="d-flex justify-content-between">
                                        <span>{category}</span>
                                        <span>{count} ({((count / totalDocs) * 100).toFixed(1)}%)</span>
                                    </div>
                                    <ProgressBar 
                                        now={(count / totalDocs) * 100} 
                                        variant="warning"
                                        style={{backgroundColor: '#e9ecef'}}
                                    />
                                </div>
                            ))}
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default KnowledgeStatsPage;