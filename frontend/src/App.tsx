import React, { useEffect, useState, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

// Components
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import LoadingSpinner from './components/LoadingSpinner';
import Login from './components/Login';
import ErrorBoundary from './components/ErrorBoundary';
import PageLayout from './components/PageLayout';
// Pages
import ChatPage from './pages/ChatPage';
import ChatTestPage from './pages/ChatTestPage';
import VectorDBPage from './pages/VectorDBPage';
import DocumentsPage from './pages/DocumentsPage';
import ContextWindowPage from './pages/ContextWindowPage';
import KeywordManagementPage from './pages/KeywordManagementPage';
import ProductsPage from './pages/ProductsPage';
import DashboardPage from './pages/DashboardPage';
import ImageConfigPage from './pages/ImageConfigPage';

import LineOaConfigPage from './pages/LineOaConfigPage';
import UserManagementPage from './pages/UserManagementPage';

// Services
import { socketService } from './services/socket';
import { authApi } from './services/api';

// Utils
import { isDevelopment } from './utils/env';

// Styles
import './App.css';
import './styles/theme.css';

interface User {
  id: string;
  username: string;
  employeeId?: string;
  role: string;
  permissions: string[]; // Add permissions array
  createdAt?: number;
  updatedAt?: number;
}

interface AppState {
  isLoading: boolean;
  error: string | null;
  aiStatus: any;
  apiConnected: boolean;
  isAuthenticated: boolean;
  user: User | null;
  authChecked: boolean;
}

const withLayout = (Component: React.ComponentType, pageId: string) => (
  <PageLayout pageId={pageId}>
    <Component />
  </PageLayout>
);

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    isLoading: true,
    error: null,
    aiStatus: null,
    apiConnected: false,
    isAuthenticated: false,
    user: null,
    authChecked: false
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = useCallback(() => {
    socketService.disconnect();
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    
    setState(prev => ({
      ...prev,
      isAuthenticated: false,
      user: null,
      authChecked: true,
      isLoading: false,
      error: null,
      aiStatus: null,
      apiConnected: false
    }));
    
    console.log('✅ Logged out successfully');
  }, []);

  const initializeAuthenticatedApp = useCallback(async () => {
    try {
      console.log('🚀 Initializing authenticated app...');
      // Ensure global WebSocket connection for realtime updates
      socketService.connect();
      // Authenticate socket with current token for targeted events
      const token = localStorage.getItem('auth_token') || '';
      const u = state.user as any;
      socketService.authenticate(token, { userId: u?.id, username: u?.username, role: u?.role });

    } catch (apiError: any) {
      console.error('❌ API connection failed:', apiError.message);
      
      if (apiError.message === 'Session expired') {
        handleLogout();
        return;
      }
      
      if (apiError.message.includes('ECONNREFUSED') || 
          apiError.message.includes('Network')) {
        setState(prev => ({
          ...prev,
          error: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ API ได้ (localhost:3001)\nกรุณาตรวจสอบว่าเซิร์ฟเวอร์ API กำลังทำงานอยู่',
          apiConnected: false,
          isLoading: false
        }));
      } else {
        setState(prev => ({
          ...prev,
          error: `เกิดข้อผิดพลาดในการเชื่อมต่อ API: ${apiError.message}`,
          apiConnected: false,
          isLoading: false
        }));
      }
    }
    finally {
      // Ensure loading indicator is cleared even if init is a no-op
      setState(prev => ({
        ...prev,
        isLoading: false
      }));
    }
  }, [handleLogout]);

  const checkAuthentication = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const savedUser = localStorage.getItem('user_data');

      if (!token || !savedUser) {
        setState(prev => ({
          ...prev,
          isAuthenticated: false,
          authChecked: true,
          isLoading: false
        }));
        return false;
      }

      const response = await authApi.getProfile();
      
      if (response.success && response.data) {
        // Trust server profile (derived from token) over local cache
        const serverUser = response.data;
        localStorage.setItem('user_data', JSON.stringify(serverUser));
        setState(prev => ({
          ...prev,
          isAuthenticated: true,
          user: serverUser,
          authChecked: true
        }));
        return true;
      } else {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        setState(prev => ({
          ...prev,
          isAuthenticated: false,
          authChecked: true,
          isLoading: false
        }));
        return false;
      }
    } catch (error: any) {
      console.error('Authentication check failed:', error);
      
      if (error.message === 'Session expired' || 
          error.message.includes('401') || 
          error.message.includes('Invalid token')) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
      }
      
      setState(prev => ({
        ...prev,
        isAuthenticated: false,
        authChecked: true,
        isLoading: false
      }));
      return false;
    }
  }, []);

  const refreshAuthFromServer = useCallback(async () => {
    try {
      const response = await authApi.refreshToken();
      if (response.success && response.data) {
        const { token, user } = response.data;
        localStorage.setItem('auth_token', token);
        localStorage.setItem('user_data', JSON.stringify(user));
        setState(prev => ({ ...prev, user, isAuthenticated: true }));
        console.log('🔄 Auth refreshed from server (role/permissions updated)');
      }
    } catch (e: any) {
      console.error('Failed to refresh auth token/profile:', e.message || e);
    }
  }, []);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('🚀 Initializing Hong Thai Management System...');
        
        const isAuth = await checkAuthentication();
        
        if (isAuth) {
          await initializeAuthenticatedApp();
        }
      } catch (error: any) {
        console.error('💥 App initialization error:', error);
        setState(prev => ({
          ...prev,
          error: error.message || 'เกิดข้อผิดพลาดในการเริ่มต้นระบบ',
          isLoading: false,
          authChecked: true
        }));
      }
    };

    initializeApp();

    return () => {
      socketService.disconnect();
    };
  }, [checkAuthentication, initializeAuthenticatedApp]);

  // Listen for backend events to update current user's role/permissions without relogin
  useEffect(() => {
    if (!state.isAuthenticated || !state.user) return;

    // Ensure socket is authenticated with latest token/user
    const token = localStorage.getItem('auth_token') || '';
    const u = state.user as any;
    socketService.authenticate(token, { userId: u?.id, username: u?.username, role: u?.role });

    const handleAuthUserUpdated = (data: any) => {
      if (data?.userId && state.user && data.userId === (state.user as any).id) {
        refreshAuthFromServer();
      }
    };
    const handleAuthUserRoleUpdated = (data: any) => {
      if (data?.userId && state.user && data.userId === (state.user as any).id) {
        refreshAuthFromServer();
      }
    };
    const handleRolePermissionsUpdated = (data: any) => {
      if (!data) return;
      const currentRoleName = (state.user as any).role;
      if (data.roleName && currentRoleName && data.roleName === currentRoleName) {
        refreshAuthFromServer();
      }
    };

    socketService.on('auth_user_updated', handleAuthUserUpdated);
    socketService.on('auth_user_role_updated', handleAuthUserRoleUpdated);
    socketService.on('auth_role_permissions_updated', handleRolePermissionsUpdated);

    return () => {
      socketService.off('auth_user_updated', handleAuthUserUpdated);
      socketService.off('auth_user_role_updated', handleAuthUserRoleUpdated);
      socketService.off('auth_role_permissions_updated', handleRolePermissionsUpdated);
    };
  }, [state.isAuthenticated, state.user, refreshAuthFromServer]);

  const handleLogin = async (token: string, user: User) => {
    try {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('user_data', JSON.stringify(user));
      
      setState(prev => ({
        ...prev,
        isAuthenticated: true,
        user: user,
        authChecked: true,
        isLoading: true,
        error: null
      }));
      
      await initializeAuthenticatedApp();
    } catch (error: any) {
      console.error('Post-login initialization error:', error);
      setState(prev => ({
        ...prev,
        error: 'เกิดข้อผิดพลาดหลังจากเข้าสู่ระบบ',
        isLoading: false
      }));
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const retryConnection = async () => {
    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null
    }));
    
    try {
      if (state.isAuthenticated) {
        await initializeAuthenticatedApp();
      } else {
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } catch (error) {
      console.error('Retry connection failed:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'การเชื่อมต่อใหม่ล้มเหลว'
      }));
    }
  };

  if (state.isLoading || !state.authChecked) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100 bg-light">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <h4 className="mt-3 text-primary">
            {!state.authChecked ? 'กำลังตรวจสอบการเข้าสู่ระบบ...' : 'กำลังเริ่มต้นระบบ...'}
          </h4>
          <p className="text-muted">Hong Thai Food Packaging Management</p>
              <div className="mt-3">
            <small className="text-muted">
              🌐 Frontend: http://localhost:3002<br/>
              🔗 API Server: localhost:3001
            </small>
          </div>
        </div>
      </div>
    );
  }

  if (!state.isAuthenticated) {
    return <Login onLoginSuccess={handleLogin} />;
  }

  if (state.error) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100 bg-light">
        <div className="text-center" style={{ maxWidth: '500px' }}>
          <div className="card shadow-lg">
            <div className="card-body p-5">
              <div className="text-danger mb-4">
                <i className="fas fa-exclamation-triangle fa-3x"></i>
              </div>
              <h4 className="text-danger mb-3">เกิดข้อผิดพลาด</h4>
              <div className="alert alert-danger text-start">
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', margin: 0 }}>
                  {state.error}
                </pre>
              </div>
              
              <div className="d-grid gap-2 mt-4">
                <button 
                  className="btn btn-primary"
                  onClick={retryConnection}
                  disabled={state.isLoading}
                >
                  {state.isLoading ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span className="ms-2">กำลังลองใหม่...</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-sync-alt me-2"></i>
                      ลองเชื่อมต่อใหม่
                    </>
                  )}
                </button>
                
                <button 
                  className="btn btn-outline-secondary"
                  onClick={() => window.location.reload()}
                >
                  <i className="fas fa-redo me-2"></i>
                  รีโหลดหน้า
                </button>
                
                <button 
                  className="btn btn-outline-danger"
                  onClick={handleLogout}
                >
                  <i className="fas fa-sign-out-alt me-2"></i>
                  ออกจากระบบ
                </button>
              </div>
              
              <div className="mt-4">
                <small className="text-muted">
                  <strong>คำแนะนำการแก้ไข:</strong><br/>
                  1. ตรวจสอบว่าเซิร์ฟเวอร์ API ทำงานอยู่ที่ localhost:3001<br/>
                  2. ตรวจสอบการตั้งค่า network และ firewall<br/>
                  3. รีสตาร์ทเซิร์ฟเวอร์ API และลองใหม่<br/>
                  4. ตรวจสอบ console ของเบราว์เซอร์สำหรับข้อมูลเพิ่มเติม
                </small>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const showApiBanner = !state.apiConnected;
  const showDevBanner = isDevelopment() && state.user;

  return (
    <ErrorBoundary>
      <Router>
        <div className="app">
          <Navbar 
            onToggleSidebar={toggleSidebar} 
            aiStatus={state.aiStatus}
            user={state.user}
            onLogout={handleLogout}
          />
          
          <div className="app-content">
            <Sidebar 
              isOpen={sidebarOpen} 
              onClose={() => setSidebarOpen(false)} 
              user={state.user} // Pass the user object to Sidebar
            />
            
            <main className={`main-content ${sidebarOpen ? 'shifted' : ''}`}>
              <div className="main-shell">

                <div className="page-stack">
                  <div className="page-frame">
                    <ErrorBoundary>
                      <Routes>
                        <Route path="/" element={withLayout(DashboardPage, 'dashboard')} />
                    <Route path="/dashboard" element={<Navigate to="/" replace />} />
                    <Route path="/chat" element={withLayout(ChatPage, 'chat')} />
                    <Route path="/chat/:userId" element={withLayout(ChatPage, 'chat')} />
                    <Route path="/chat-test" element={withLayout(ChatTestPage, 'chat-test')} />
                    <Route path="/vector-db" element={withLayout(VectorDBPage, 'vector-db')} />
                    <Route path="/documents" element={withLayout(DocumentsPage, 'documents')} />
                    <Route path="/context-window" element={withLayout(ContextWindowPage, 'context-window')} />
                    <Route path="/keywords" element={withLayout(KeywordManagementPage, 'keywords')} />
                    <Route path="/products" element={withLayout(ProductsPage, 'products')} />
                    <Route path="/image-config" element={withLayout(ImageConfigPage, 'image-config')} />

                    <Route path="/line-oa-config" element={withLayout(LineOaConfigPage, 'line-oa-config')} />
                    <Route path="/ai-personalities" element={withLayout(ContextWindowPage, 'ai-personalities')} />
                    <Route path="/user-management" element={withLayout(UserManagementPage, 'user-management')} />

                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </ErrorBoundary>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
