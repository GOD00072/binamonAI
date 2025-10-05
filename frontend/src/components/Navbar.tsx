// src/components/Navbar.tsx - เวอร์ชันไม่ใช้ systemApi.getHealth
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar as BootstrapNavbar, Nav, Badge, Dropdown } from 'react-bootstrap';

interface NavbarProps {
  onToggleSidebar: () => void;
  aiStatus?: any;
  user?: any;
  onLogout: () => void;
}

// Styled components as objects
const NAVBAR_HEIGHT_FALLBACK = 72;
const NAVBAR_HEIGHT_CSS_VAR = '--navbar-height';

const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar, aiStatus, user, onLogout }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const navbarRef = useRef<HTMLElement | null>(null);

  const updateNavbarHeight = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const height = navbarRef.current?.offsetHeight ?? NAVBAR_HEIGHT_FALLBACK;
    document.documentElement.style.setProperty(
      NAVBAR_HEIGHT_CSS_VAR,
      `${height}px`
    );
  }, []);


  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    updateNavbarHeight();

    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('resize', updateNavbarHeight);

    return () => {
      window.removeEventListener('resize', updateNavbarHeight);
      document.documentElement.style.removeProperty(NAVBAR_HEIGHT_CSS_VAR);
    };
  }, [updateNavbarHeight]);

  useEffect(() => {
    updateNavbarHeight();
  }, [aiStatus, user, updateNavbarHeight]);

  // Format time in Thai locale
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Format date in Thai locale
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('th-TH', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };



  return (
    <>
      <BootstrapNavbar
        ref={navbarRef}
        className="navbar-custom fixed-top"
        expand="lg"
        style={{ minHeight: 'var(--navbar-height, 72px)' }}
      >
        <div className="container-fluid">
          {/* Sidebar Toggle Button */}
          <button
            className="navbar-toggler me-3"
            type="button"
            onClick={onToggleSidebar}
            aria-label="Toggle navigation"
          >
            <i className="fas fa-bars"></i>
          </button>
          
          {/* Brand */}
          <BootstrapNavbar.Brand href="/" className="d-flex align-items-center navbar-brand-enhanced">
            <div className="logo-container me-2">
              <img
                src="https://img5.pic.in.th/file/secure-sv1/893559878e90e124e54bf.md.jpg"
                alt="Hong Thai Food Packaging"
                height="45"
                width="auto"
                className="navbar-logo"
                onError={(e) => {
                  e.currentTarget.src = '/assets/images/logo.png';
                  e.currentTarget.onerror = null;
                }}
              />
            </div>
            <div className="brand-text">
              <div className="brand-title">binamon</div>
              <div className="brand-subtitle d-none d-lg-block">Management System</div>
            </div>
          </BootstrapNavbar.Brand>


          {/* Right side navigation */}
          <Nav className="ms-auto d-flex align-items-center">
            
            {/* Date & Time */}
            <div className="d-none d-md-flex align-items-center text-white me-3 time-display">
              <div className="d-flex flex-column align-items-end">
                <div className="d-flex align-items-center">
                  <div className="clock-icon me-2">
                    <i className="fas fa-clock"></i>
                  </div>
                  <span className="fw-bold digital-time">
                    {formatTime(currentTime)}
                  </span>
                </div>
                <small className="text-white-50 date-text">
                  {formatDate(currentTime)}
                </small>
              </div>
            </div>

            {/* User Menu */}
            <Dropdown align="end">
              <Dropdown.Toggle
                variant="outline-light"
                id="user-dropdown"
                className="d-flex align-items-center border-0 user-dropdown-toggle"
              >
                <div className="d-flex align-items-center">
                  <div className="user-avatar me-2">
                    <i className="fas fa-user"></i>
                  </div>
                  <div className="d-none d-sm-block text-start user-info">
                    <div className="fw-semibold user-name">
                      {user?.name || user?.username || 'ผู้ใช้งาน'}
                    </div>
                    {user?.role && (
                      <small className="text-white-75 user-role">
                        {user.role}
                      </small>
                    )}
                  </div>
                  <i className="fas fa-chevron-down ms-2 dropdown-arrow"></i>
                </div>
              </Dropdown.Toggle>

              <Dropdown.Menu className="shadow dropdown-panel">
               {/* User Info */}
               <Dropdown.Item 
                 disabled 
                 className="py-3 dropdown-profile"
               >
                 <div className="d-flex align-items-center">
                   <div className="user-avatar user-avatar-lg me-3">
                     <i className="fas fa-user"></i>
                   </div>
                   <div>
                     <div className="fw-bold text-dark">
                       {user?.name || user?.username || 'ผู้ใช้งาน'}
                     </div>
                     <small className="text-muted">
                       {user?.email || 'ไม่มีอีเมล'}
                     </small>
                     {user?.role && (
                       <div>
                         <Badge bg="secondary" className="mt-1">
                           {user.role}
                         </Badge>
                       </div>
                     )}
                   </div>
                 </div>
               </Dropdown.Item>
               
               <Dropdown.Divider />
               
               {/* Quick Stats */}
               <Dropdown.Item disabled className="py-2">
                 <div className="d-flex justify-content-between text-muted small">
                   <span>เข้าสู่ระบบเมื่อ:</span>
                   <span>{new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                 </div>
               </Dropdown.Item>
               
               <Dropdown.Divider />
               
               {/* Profile */}
               <Dropdown.Item 
                 href="/profile" 
                 className="dropdown-item-hover"
               >
                 <i className="fas fa-user-edit me-2 text-primary"></i>
                 จัดการโปรไฟล์
               </Dropdown.Item>
               
               {/* Settings */}
               <Dropdown.Item 
                 href="/settings" 
                 className="dropdown-item-hover"
               >
                 <i className="fas fa-cog me-2 text-secondary"></i>
                 การตั้งค่าระบบ
               </Dropdown.Item>
               
               <Dropdown.Divider />
               
               {/* System Status */}
               <Dropdown.Item disabled>
                 <div className="d-flex justify-content-between align-items-center">
                   <span>
                     <i className="fas fa-server me-2 text-info"></i>
                     สถานะระบบ
                   </span>
                   <Badge bg="success">ปกติ</Badge>
                 </div>
               </Dropdown.Item>
               
               <Dropdown.Divider />
               
               {/* Logout */}
               <Dropdown.Item 
                 onClick={onLogout}
                 className="dropdown-item-hover text-danger"
               >
                 <i className="fas fa-sign-out-alt me-2"></i>
                 ออกจากระบบ
               </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </Nav>
        </div>
      </BootstrapNavbar>
    </>
  );
};

export default Navbar;
