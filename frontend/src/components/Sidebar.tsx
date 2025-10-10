// src/components/Sidebar.tsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const location = useLocation();

  const menuItems = [
    { path: '/', icon: 'fas fa-gauge-high', label: 'แดชบอร์ด' },
    { path: '/user-management', icon: 'fas fa-users-cog', label: 'จัดการผู้ใช้' },
    { path: '/role-management', icon: 'fas fa-user-shield', label: 'จัดการสิทธิ์' },
    { path: '/keywords', icon: 'fas fa-tags', label: 'จัดการ Keywords' },
    { path: '/chat', icon: 'fas fa-comments', label: 'แชท' },
    { path: '/chat-test', icon: 'fas fa-flask-vial', label: 'Chat Test' },
    { path: '/products', icon: 'fas fa-box-open', label: 'สินค้า' },
    { path: '/image-config', icon: 'fas fa-images', label: 'จัดการรูปภาพ' },
    { path: '/documents', icon: 'fas fa-file-lines', label: 'เอกสาร' },
    { path: '/vector-db', icon: 'fas fa-database', label: 'Vector DB' },
    { path: '/context-window', icon: 'fas fa-window-maximize', label: 'Context Window' },
    { path: '/line-oa-config', icon: 'fas fa-cog', label: 'LINE OA Configs' },
    { path: '/ai-personalities', icon: 'fas fa-brain', label: 'AI Personalities' }
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Overlay for mobile */}
      <div 
        className={`sidebar-overlay ${isOpen ? 'show' : ''}`}
        onClick={onClose}
      ></div>
      
      {/* Sidebar */}
      <aside 
        className={`sidebar ${isOpen ? 'open' : ''}`}
      >
        <nav className="sidebar-nav sidebar-nav--flush">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`sidebar-nav-item ${isActive(item.path) ? 'active' : ''}`}
              onClick={onClose}
            >
              <i className={item.icon} style={{
                marginRight: '12px',
                width: '18px',
                fontSize: '16px'
              }}></i>
              <span className="sidebar-label">{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

    </>
  );
};

export default Sidebar;
