
// DashboardModels/UIComponents.tsx

import React, { useState } from 'react';
import { ProductData, SearchFilters } from './types';
import {
  formatHotScore, formatMovementHistory, formatInterestLevel,
  formatMovementStats, formatStockStatus, formatSlowMoveCategory
} from './formatters';
import SyncIcon from '@mui/icons-material/Sync';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SearchIcon from '@mui/icons-material/Search';

export const LoadingSpinner: React.FC<{ message?: string }> = ({ message }) => (
  <div className="text-center p-4">
    <div className="loader-1"></div>
    {message && <div className="mt-2 text-muted">{message}</div>}
  </div>
);

export const SyncProgress: React.FC<{
  show: boolean;
  progress: number;
  status: string;
  logs: string[];
}> = ({ show, progress, status, logs }) => {
  if (!show) return null;
  
  return (
    <div style={{ margin: '15px 0' }}>
      <div className="progress">
        <div className="progress-bar" style={{ width: `${progress}%` }}>{progress}%</div>
      </div>
      <p className="mt-2">{status}</p>
      <div style={{
        backgroundColor: '#f8f9fa',
        border: '1px solid #dee2e6',
        borderRadius: '4px',
        padding: '10px',
        maxHeight: '200px',
        overflowY: 'auto',
        fontFamily: 'monospace',
        fontSize: '0.9em'
      }}>
        {logs.map((log, index) => (
          <div key={index}>[{new Date().toLocaleTimeString()}] {log}</div>
        ))}
      </div>
    </div>
  );
};

export const ProductTable: React.FC<{
  data: ProductData[],
  loading: boolean,
  onSync?: (sku: string) => void,
  showSyncButton?: boolean,
  onAIChat?: (product: ProductData) => void,
  showAIButton?: boolean
}> = ({ data, loading, onSync, showSyncButton = false, onAIChat, showAIButton = false }) => {
  if (loading) return <LoadingSpinner message="กำลังโหลดข้อมูลสินค้า..." />;

  if (!Array.isArray(data) || data.length === 0) {
    return <div className="alert alert-primary">ไม่พบข้อมูลสินค้า</div>;
  }

  return (
    <div className="table-responsive">
      <table className="table table-striped">
        <thead>
          <tr>
            <th>ชื่อสินค้า</th>
            <th>SKU</th>
            <th>หมวดหมู่</th>
            <th>สต็อก</th>
            <th>ความสนใจ</th>
            <th>การขาย</th>
            <th>สถานะ</th>
            {(showSyncButton || showAIButton) && <th>จัดการ</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((product, index) => (
            <tr key={product.id || index}>
              <td>
                <div>
                  <strong>{product.name || product.product_name}</strong>
                  {product.hotScore && formatHotScore(product.hotScore)}
                </div>
                {formatMovementHistory(product)}
              </td>
              <td><code>{product.sku || '-'}</code></td>
              <td>
                <span className="badge badge-outline text-truncate" style={{ maxWidth: '120px' }}>
                  {product.category || '-'}
                </span>
              </td>
              <td>
                <span className={`badge ${
                  (product.stock || product.stock_quantity || 0) <= 5 ? 'badge-danger' : 
                  (product.stock || product.stock_quantity || 0) <= 20 ? 'badge-warning' : 
                  'badge-success'
                }`}>
                  {product.stock || product.stock_quantity || 0} ชิ้น
                </span>
              </td>
              <td>
                {formatInterestLevel(product.averageRelevance || product.average_relevance || 0)}
                <br />
                <small className="text-muted">
                  {product.totalInteractions || product.total_interactions || 0} interactions
                </small>
              </td>
              <td>
                {formatMovementStats(product)}
              </td>
              <td>
                <div className="d-flex flex-column gap-1">
                  {formatStockStatus(product)}
                  {product.movementAnalysis && formatSlowMoveCategory(product.movementAnalysis)}
                </div>
              </td>
              {(showSyncButton || showAIButton) && (
                <td>
                  <div className="d-flex flex-column gap-1">
                    {showSyncButton && product.sku && onSync && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => onSync(product.sku)}
                        title="ซิงค์ข้อมูลสต็อก"
                      >
                        <SyncIcon fontSize="small" /> Sync
                      </button>
                    )}
                    {showAIButton && onAIChat && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => onAIChat(product)}
                        title="ถาม AI เกี่ยวกับสินค้านี้"
                      >
                        <SmartToyIcon fontSize="small" /> ถาม AI
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const SearchForm: React.FC<{
  onSearch: (filters: SearchFilters) => void;
  onClear: () => void;
}> = ({ onSearch, onClear }) => {
  const [filters, setFilters] = useState<SearchFilters>({
    q: '',
    category: '',
    minStock: '',
    maxStock: '',
    minRelevance: '',
    maxRelevance: '',
    minSalesVelocity: '',
    maxSalesVelocity: '',
    interestLevel: '',
    movementLevel: '',
    slowMoveCategory: '',
    hasStockHistory: false,
    needsSync: false
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(filters);
  };

  const handleClear = () => {
    setFilters({
      q: '',
      category: '',
      minStock: '',
      maxStock: '',
      minRelevance: '',
      maxRelevance: '',
      minSalesVelocity: '',
      maxSalesVelocity: '',
      interestLevel: '',
      movementLevel: '',
      slowMoveCategory: '',
      hasStockHistory: false,
      needsSync: false
    });
    onClear();
  };

  return (
    <div className="card mb-4">
        <div className="card-header">
            <h3 className="section-title">🔍 ค้นหาขั้นสูง</h3>
        </div>
        <div className="card-body">
            <form onSubmit={handleSubmit}>
                <div className="component-grid">
                    <div className="input-group">
                        <label>🔍 คำค้นหา:</label>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="ชื่อสินค้า, หมวดหมู่, SKU"
                            value={filters.q}
                            onChange={(e) => setFilters({...filters, q: e.target.value})}
                        />
                    </div>
                    <div className="input-group">
                        <label>📂 หมวดหมู่:</label>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="ชื่อหมวดหมู่"
                            value={filters.category}
                            onChange={(e) => setFilters({...filters, category: e.target.value})}
                        />
                    </div>
                    <div className="input-group">
                        <label>📦 สต็อกขั้นต่ำ:</label>
                        <input
                            type="number"
                            className="input-field"
                            placeholder="จำนวนขั้นต่ำ"
                            value={filters.minStock}
                            onChange={(e) => setFilters({...filters, minStock: e.target.value})}
                        />
                    </div>
                    <div className="input-group">
                        <label>📦 สต็อกสูงสุด:</label>
                        <input
                            type="number"
                            className="input-field"
                            placeholder="จำนวนสูงสุด"
                            value={filters.maxStock}
                            onChange={(e) => setFilters({...filters, maxStock: e.target.value})}
                        />
                    </div>
                    <div className="input-group">
                        <label>🎯 ระดับความสนใจ:</label>
                        <select
                            className="input-field"
                            value={filters.interestLevel}
                            onChange={(e) => setFilters({...filters, interestLevel: e.target.value})}
                        >
                            <option value="">ทั้งหมด</option>
                            <option value="high">สูง (&gt;0.7)</option>
                            <option value="medium">ปานกลาง (0.5-0.7)</option>
                            <option value="low">ต่ำ (0.25-0.5)</option>
                            <option value="none">ไม่มี (≤0.25)</option>
                            <option value="quality">คุณภาพ (&gt;0.25)</option>
                        </select>
                    </div>
                    <div className="input-group">
                        <label>📈 ระดับการเคลื่อนไหว:</label>
                        <select
                            className="input-field"
                            value={filters.movementLevel}
                            onChange={(e) => setFilters({...filters, movementLevel: e.target.value})}
                        >
                            <option value="">ทั้งหมด</option>
                            <option value="high">สูง (&gt;50/วัน)</option>
                            <option value="medium">ปานกลาง (10-50/วัน)</option>
                            <option value="low">ต่ำ (0-10/วัน)</option>
                            <option value="none">ไม่มี (0/วัน)</option>
                        </select>
                    </div>
                    <div className="input-group">
                        <label>🌀 หมวดสินค้าช้า:</label>
                        <select
                            className="input-field"
                            value={filters.slowMoveCategory}
                            onChange={(e) => setFilters({...filters, slowMoveCategory: e.target.value})}
                        >
                            <option value="">ทั้งหมด</option>
                            <option value="normal">ปกติ (≤60 วัน)</option>
                            <option value="slow-move">เคลื่อนไหวช้า (61-90 วัน)</option>
                            <option value="very-slow-1">ช้ามาก #1 (91-120 วัน)</option>
                            <option value="very-slow-2">ช้ามาก #2 (121-150 วัน)</option>
                            <option value="very-slow-3">ช้ามาก #3 (151-180 วัน)</option>
                            <option value="dead-stock">Dead Stock (&gt;180 วัน)</option>
                            <option value="no-data">ไม่มีข้อมูล</option>
                        </select>
                    </div>
                    <div className="input-group">
                        <label>⚙️ ตัวเลือกเพิ่มเติม:</label>
                        <div>
                            <label className="toggle">
                                <input
                                type="checkbox"
                                checked={filters.hasStockHistory}
                                onChange={(e) => setFilters({...filters, hasStockHistory: e.target.checked})}
                                />
                                <span className="toggle-slider"></span>
                            </label>
                            <label>📊 มีประวัติสต็อก</label>
                        </div>
                        <div>
                            <label className="toggle">
                                <input
                                type="checkbox"
                                checked={filters.needsSync}
                                onChange={(e) => setFilters({...filters, needsSync: e.target.checked})}
                                />
                                <span className="toggle-slider"></span>
                            </label>
                            <label>🔄 ต้องการซิงค์</label>
                        </div>
                    </div>
                </div>
                <div className="d-flex gap-2">
                    <button type="submit" className="btn btn-primary">
                        <SearchIcon fontSize="small" className="me-1" /> ค้นหา
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={handleClear}>
                        🧹 เคลียร์
                    </button>
                </div>
            </form>
        </div>
    </div>
  );
};

export const EnhancedAlert: React.FC<{
  variant: 'success' | 'danger' | 'warning' | 'info';
  title: string;
  message: string;
  icon?: React.ReactNode;
}> = ({ variant, title, message, icon }) => {
  const iconMap = {
    success: '✅',
    danger: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  return (
    <div className={`alert alert-${variant} d-flex align-items-center`}>
      <div className="me-3" style={{ fontSize: '1.5em' }}>
        {icon || iconMap[variant]}
      </div>
      <div className="flex-grow-1">
        <h5 className="alert-heading">{title}</h5>
        <div>{message}</div>
      </div>
    </div>
  );
};

export const StatsCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  trend?: 'up' | 'down' | 'stable';
  className?: string;
}> = ({ 
  title, 
  value, 
  subtitle, 
  icon, 
  variant = 'primary', 
  trend,
  className = '' 
}) => {
  const trendIcons = {
    up: '📈',
    down: '📉',
    stable: '➡️'
  };

  return (
    <div className={`card text-center h-100 ${className}`}>
      <div className="card-body">
        {icon && <div style={{ fontSize: '2em', marginBottom: '0.5rem' }}>{icon}</div>}
        <h4 style={{ color: `var(--${variant})` }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
          {trend && <span className="ms-2" style={{ fontSize: '0.7em' }}>{trendIcons[trend]}</span>}
        </h4>
        <div className="text-muted">{title}</div>
        {subtitle && <small className="d-block mt-2" style={{ color: `var(--${variant})` }}>{subtitle}</small>}
      </div>
    </div>
  );
};

export const Pagination: React.FC<{
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showInfo?: boolean;
  totalItems?: number;
  itemsPerPage?: number;
}> = ({ currentPage, totalPages, onPageChange, showInfo = false, totalItems, itemsPerPage }) => {
  const getVisiblePages = () => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];

    for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
      range.push(i);
    }

    if (currentPage - delta > 2) {
      rangeWithDots.push(1, '...');
    } else {
      rangeWithDots.push(1);
    }

    rangeWithDots.push(...range);

    if (currentPage + delta < totalPages - 1) {
      rangeWithDots.push('...', totalPages);
    } else if (totalPages > 1) {
      rangeWithDots.push(totalPages);
    }

    return rangeWithDots;
  };

  return (
    <div className="d-flex justify-content-between align-items-center">
      {showInfo && totalItems && itemsPerPage && (
        <div className="text-muted">
          แสดง {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalItems)} จากทั้งหมด {totalItems.toLocaleString()} รายการ
        </div>
      )}
      
      <nav>
        <ul className="pagination mb-0">
          <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
            <button 
              className="page-link" 
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              ก่อนหน้า
            </button>
          </li>
          
          {getVisiblePages().map((page, index) => (
            <li key={index} className={`page-item ${page === currentPage ? 'active' : ''} ${page === '...' ? 'disabled' : ''}`}>
              {page === '...' ? (
                <span className="page-link">...</span>
              ) : (
                <button 
                  className="page-link" 
                  onClick={() => onPageChange(page as number)}
                >
                  {page}
                </button>
              )}
            </li>
          ))}
          
          <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
            <button 
              className="page-link" 
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              ถัดไป
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
};
