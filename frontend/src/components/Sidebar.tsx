// src/components/Sidebar.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: string;
    username: string;
    employeeId?: string;
    role: string;
    permissions: string[];
    createdAt?: number;
    updatedAt?: number;
  } | null;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, user }) => {
  const location = useLocation();

  const hasPermission = useCallback((requiredPermission?: string) => {
    if (!user || !Array.isArray(user.permissions) || user.permissions.length === 0) {
      return false;
    }
    if (user.permissions.includes('admin:access')) {
      return true; // Admin has all permissions
    }
    return requiredPermission ? user.permissions.includes(requiredPermission) : true;
  }, [user?.permissions]);

  // Static list of all menu items (doesn't change at runtime)
  const allMenuItems = useMemo(() => ([
    { path: '/', icon: 'fas fa-gauge-high', label: 'แดชบอร์ด', permission: undefined }, // No specific permission for dashboard
    { path: '/keywords', icon: 'fas fa-tags', label: 'จัดการ Keywords', permission: 'keywords:manage' },
    { path: '/chat', icon: 'fas fa-comments', label: 'แชท', permission: 'chat:view' },
    { path: '/chat-test', icon: 'fas fa-flask-vial', label: 'Chat Test', permission: 'chat:view' }, // Assuming chat:view for chat test
    { path: '/products', icon: 'fas fa-box-open', label: 'สินค้า', permission: 'products:view' },
    { path: '/image-config', icon: 'fas fa-images', label: 'จัดการรูปภาพ', permission: 'media:manage' }, // Assuming media:manage for image config
    { path: '/documents', icon: 'fas fa-file-lines', label: 'เอกสาร', permission: 'documents:manage' },
    { path: '/vector-db', icon: 'fas fa-database', label: 'Vector DB', permission: 'system:admin' }, // Assuming system:admin for vector-db
    { path: '/context-window', icon: 'fas fa-window-maximize', label: 'Context Window', permission: 'config:manage' }, // Assuming config:manage for context window
    { path: '/line-oa-config', icon: 'fas fa-cog', label: 'LINE OA Configs', permission: 'config:manage' }, // Assuming config:manage for line OA configs
    { path: '/ai-personalities', icon: 'fas fa-brain', label: 'AI Personalities', permission: 'config:manage' }, // Assuming config:manage for AI personalities
    { path: '/user-management', icon: 'fas fa-users', label: 'จัดการผู้ใช้งาน', permission: 'users:manage' },
  ]), []);

  // Keep last visible menu; initialize with safe, filtered defaults
  const initialMenu = useMemo(() => {
    // If user/permissions not ready, only show items without permission requirement
    if (!user || !Array.isArray(user.permissions) || user.permissions.length === 0) {
      return allMenuItems.filter(item => !item.permission);
    }
    return allMenuItems.filter(item => hasPermission(item.permission));
  }, [allMenuItems, user, hasPermission]);

  const [menuItems, setMenuItems] = useState(initialMenu);
  const lastPermissionsKeyRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  // Build a stable key from current user's permissions for change detection
  const permissionsKey = useMemo(() => {
    if (!user || !Array.isArray(user.permissions) || user.permissions.length === 0) {
      return null;
    }
    const sorted = [...user.permissions].sort();
    return `${user.id || 'unknown'}::${sorted.join('|')}`;
  }, [user]);

  useEffect(() => {
    // Recompute menu when permissions change or when user/permissions become available
    if (!user || !Array.isArray(user.permissions) || user.permissions.length === 0) {
      const publicItems = allMenuItems.filter(item => !item.permission);
      setMenuItems(publicItems);
      lastPermissionsKeyRef.current = null;
      currentUserIdRef.current = null;
      return;
    }

    if (permissionsKey && permissionsKey !== lastPermissionsKeyRef.current) {
      const filtered = allMenuItems.filter(item => hasPermission(item.permission));
      setMenuItems(filtered);
      lastPermissionsKeyRef.current = permissionsKey;
      currentUserIdRef.current = user.id || null;
    }
  }, [permissionsKey, allMenuItems, hasPermission, user]);

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
