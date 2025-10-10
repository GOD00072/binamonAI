// src/components/Login.tsx
import React, { useState } from 'react';
import { Card, Form, Button, Alert } from 'react-bootstrap';
import LoadingSpinner from './LoadingSpinner';
import { authApi } from '../services/api';
import './Login.css';

interface LoginProps {
  onLoginSuccess: (token: string, user: any) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await authApi.login(username, password);

      if (response.success && response.data?.token && response.data?.user) {
        localStorage.setItem('auth_token', response.data.token);
        localStorage.setItem('user_data', JSON.stringify(response.data.user));
        onLoginSuccess(response.data.token, response.data.user);
      } else {
        throw new Error(response.message || 'Invalid response from server');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      
      let errorMessage = 'เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์';
      
      if (err.message.includes('Invalid credentials')) {
        errorMessage = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
      } else if (err.message.includes('Network')) {
        errorMessage = 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-shell">
      <div className="login-overlay" aria-hidden="true" />
      <div className="login-orb" aria-hidden="true" />

      <div className="login-grid">
        <section className="login-brand-panel">
          <div className="brand-glow" aria-hidden="true"></div>

          <div className="brand-emblem">
            <i className="fas fa-robot"></i>
          </div>
          <h1>ระบบจัดการ LINE AI</h1>
          <p className="brand-lead">
            ศูนย์กลางควบคุม AI สำหรับทีมงาน binamon เชื่อมต่อข้อมูล บริหารเวิร์กโฟลว์
            และติดตามสถานะได้ในหน้าจอเดียว
          </p>

          <ul className="brand-highlights">
            <li>
              <i className="fas fa-shield-alt"></i>
              <span>ความปลอดภัยระดับองค์กร พร้อมระบบยืนยันตัวตน</span>
            </li>
            <li>
              <i className="fas fa-network-wired"></i>
              <span>เชื่อมต่อ Line OA และบริการภายในแบบไร้รอยต่อ</span>
            </li>
            <li>
              <i className="fas fa-chart-line"></i>
              <span>แดชบอร์ดภาพรวมพร้อมตัวชี้วัดเรียลไทม์</span>
            </li>
          </ul>
        </section>

        <Card className="login-card glass-effect shadow-lg">
          <Card.Body className="login-card-body">
            <div className="login-card-header text-center">
              <div className="logo-container">
                <img
                  src="https://img5.pic.in.th/file/secure-sv1/893559878e90e124e54bf.md.jpg"
                  alt="binamon logo"
                  className="logo-image"
                  draggable={false}
                />
              </div>
              <h2>เข้าสู่ระบบบัญชีผู้ดูแล</h2>
              <p>ยินดีต้อนรับกลับ กรุณากรอกข้อมูลเพื่อเริ่มใช้งานระบบ</p>
            </div>

            {error && (
              <Alert variant="danger" className="animated-alert">
                <i className="fas fa-exclamation-triangle me-2"></i>
                {error}
              </Alert>
            )}

            <Form onSubmit={handleSubmit} className="login-form">
              <Form.Group className="mb-4">
                <Form.Label className="form-label-custom">
                  <i className="fas fa-user-circle me-2"></i>
                  ชื่อผู้ใช้งาน
                </Form.Label>
                <Form.Control
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="กรุณากรอกชื่อผู้ใช้งาน"
                  required
                  disabled={loading}
                  className="form-input-custom"
                  autoComplete="username"
                />
              </Form.Group>

              <Form.Group className="mb-4">
                <Form.Label className="form-label-custom">
                  <i className="fas fa-lock me-2"></i>
                  รหัสผ่าน
                </Form.Label>
                <Form.Control
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="กรุณากรอกรหัสผ่าน"
                  required
                  disabled={loading}
                  className="form-input-custom"
                  autoComplete="current-password"
                />
              </Form.Group>

              <Button
                type="submit"
                size="lg"
                disabled={loading}
                className="login-button"
              >
                {loading ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span className="ms-2">กำลังเข้าสู่ระบบ...</span>
                  </>
                ) : (
                  <>
                    <i className="fas fa-arrow-right-to-bracket me-2"></i>
                    เข้าสู่ระบบ
                  </>
                )}
              </Button>
            </Form>

            <div className="login-meta">
              <div className="meta-item">
                <i className="fas fa-shield-virus"></i>
                <span>การเชื่อมต่อเข้ารหัสเพื่อความปลอดภัย</span>
              </div>
              <div className="meta-item">
                <i className="fas fa-headset"></i>
                <span>มีปัญหา? ติดต่อผู้ดูแลระบบภายในองค์กร</span>
              </div>
            </div>
          </Card.Body>
        </Card>
      </div>
    </main>
  );
};

export default Login;
