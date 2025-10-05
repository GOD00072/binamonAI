import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, Row, Col, Spinner } from 'react-bootstrap';
import { knowledgeApi, Stats } from '../services/api';

const KnowledgeHomePage: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await knowledgeApi.getStats();
        if (response.success) {
          setStats(response.data.statistics);
        } else {
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

  const cardStyle = {
    borderColor: '#312783',
    color: '#312783',
    height: '100%',
  };
  
  const headerStyle = {
    backgroundColor: '#312783',
    color: '#FFFFFF',
    padding: '1rem',
  };

  const linkStyle = {
    textDecoration: 'none',
  };

  const renderStats = () => {
    if (loading) return <Spinner animation="border" />;
    if (error) return <p className="text-danger">{error}</p>;
    if (!stats) return <p>ไม่มีข้อมูลสถิติ</p>;

    return (
      <Row>
        <Col md={4}>
          <Card className="text-center">
            <Card.Body>
              <h1 style={{ color: '#EF7D00' }}>{stats.total_knowledge}</h1>
              <Card.Text>เอกสารทั้งหมด</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="text-center">
            <Card.Body>
              <h1 style={{ color: '#EF7D00' }}>{stats.total_chunks.toLocaleString()}</h1>
              <Card.Text>ส่วนข้อมูลทั้งหมด (Chunks)</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="text-center">
             <Card.Body>
              <h1 style={{ color: '#EF7D00' }}>{Object.keys(stats.by_language).length}</h1>
              <Card.Text>ภาษาที่ใช้งาน</Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    );
  };
  
  return (
    <div>
      <div style={headerStyle} className="mb-4 rounded">
        <h2 className="mb-0"><i className="fas fa-book-open me-3"></i>การจัดการฐานข้อมูลองค์ความรู้</h2>
        <p className="mb-0 lead" style={{color: '#E0E0E0'}}>ศูนย์กลางสำหรับจัดการองค์ความรู้ของ AI ของคุณ</p>
      </div>

      <Card className="mb-4">
        <Card.Header as="h5" style={{backgroundColor: '#F8F9FA'}}>ภาพรวมของระบบ</Card.Header>
        <Card.Body>{renderStats()}</Card.Body>
      </Card>
      
      <Row>
        <Col md={6} className="mb-4">
          <Link to="/knowledge/upload" style={linkStyle}>
            <Card style={cardStyle} className="h-100 text-center shadow-sm">
              <Card.Body className="d-flex flex-column justify-content-center">
                <i className="fas fa-upload fa-3x mb-3" style={{ color: '#EF7D00' }}></i>
                <Card.Title as="h4">อัปโหลดและเพิ่มข้อมูล</Card.Title>
                <Card.Text>เพิ่มองค์ความรู้ใหม่โดยการอัปโหลดไฟล์หรือวางข้อความ</Card.Text>
              </Card.Body>
            </Card>
          </Link>
        </Col>
        <Col md={6} className="mb-4">
          <Link to="/knowledge/search" style={linkStyle}>
            <Card style={cardStyle} className="h-100 text-center shadow-sm">
              <Card.Body className="d-flex flex-column justify-content-center">
                <i className="fas fa-search fa-3x mb-3" style={{ color: '#EF7D00' }}></i>
                <Card.Title as="h4">ทดสอบการค้นหา</Card.Title>
                <Card.Text>สืบค้นฐานข้อมูลและทดสอบประสิทธิภาพของ RAG</Card.Text>
              </Card.Body>
            </Card>
          </Link>
        </Col>
        <Col md={6} className="mb-4">
          <Link to="/knowledge/namespace" style={linkStyle}>
            <Card style={cardStyle} className="h-100 text-center shadow-sm">
              <Card.Body className="d-flex flex-column justify-content-center">
                <i className="fas fa-globe-americas fa-3x mb-3" style={{ color: '#EF7D00' }}></i>
                <Card.Title as="h4">จัดการเนมสเปซ (Namespace)</Card.Title>
                <Card.Text>ดู จัดการ และลบเอกสารตามภาษา</Card.Text>
              </Card.Body>
            </Card>
          </Link>
        </Col>
        <Col md={6} className="mb-4">
          <Link to="/knowledge/stats" style={linkStyle}>
            <Card style={cardStyle} className="h-100 text-center shadow-sm">
              <Card.Body className="d-flex flex-column justify-content-center">
                <i className="fas fa-chart-bar fa-3x mb-3" style={{ color: '#EF7D00' }}></i>
                <Card.Title as="h4">ดูสถิติ</Card.Title>
                <Card.Text>ดูสถิติโดยละเอียดเกี่ยวกับฐานข้อมูลองค์ความรู้</Card.Text>
              </Card.Body>
            </Card>
          </Link>
        </Col>
      </Row>
    </div>
  );
};

export default KnowledgeHomePage;