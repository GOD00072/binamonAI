// src/pages/ProductsPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { productApi } from '../services/api';
import { Product, PriceTier } from '../types';
import { formatDate, formatCurrency } from '../utils/helpers';
import { LoadingSpinner } from './DashboardModels/UIComponents';
import '../styles/theme.css';

import {
  AddIcon,
  CloseIcon,
  EditIcon,
  SaveIcon,
  SyncIcon,
  VisibilityIcon,
  OpenInNewIcon,
  DeleteIcon
} from '../components/Icons';

const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);


  // Add/Edit product form states
  const [newProduct, setNewProduct] = useState({
    product_name: '',
    sku: '',
    category: '',
    price: '',
    stock_quantity: '',
    unit: '',
    short_description: '',
    description: '',
    url: ''
  });

  // Price Tiers for Add/Edit forms
  const [formPriceTiers, setFormPriceTiers] = useState<Array<{
    min_quantity: string;
    max_quantity: string;
    price: string;
  }>>([]);

  // Price Tier Management states (old modal - can be removed)
  const [showPriceTierModal, setShowPriceTierModal] = useState(false);
  const [selectedProductForPriceTiers, setSelectedProductForPriceTiers] = useState<Product | null>(null);
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [newPriceTier, setNewPriceTier] = useState({
    min_quantity: '',
    max_quantity: '',
    price: '',
    unit: ''
  });

  // Bulk selection states
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());

  const itemsPerPage = 20;

  // Load products
  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await productApi.getAllProducts({
        page: currentPage,
        limit: itemsPerPage,
        sort: 'product_name',
        order: 'asc'
      });

      if (response.success && response.data) {
        const loadedProducts = response.data.products || response.data.results || [];
        setProducts(loadedProducts);
        setTotalPages(response.data.pagination?.pages || 1);
      }
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการโหลดสินค้า');
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  // Search products
  const searchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await productApi.searchProducts({
        query: searchTerm,
        page: currentPage,
        limit: itemsPerPage
      });

      if (response.success && response.data) {
        const searchResults = response.data.results || response.data.products || [];
        setProducts(searchResults);
        setTotalPages(response.data.pagination?.pages || 1);
      }
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการค้นหาสินค้า');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, currentPage]);

  // Load data when page changes
  useEffect(() => {
    if (searchTerm) {
      searchProducts();
    } else {
      loadProducts();
    }
  }, [currentPage, searchTerm, loadProducts, searchProducts]);

  // Debounce function
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const timer = setTimeout(() => {
      setSearchTerm(value);
      setCurrentPage(1);
    }, 500);

    setDebounceTimer(timer);
  }, [debounceTimer]);

  useEffect(() => {
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [debounceTimer]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleRefresh = () => {
    if (searchTerm) {
      searchProducts();
    } else {
      loadProducts();
    }
  };

  // Show product details
  const handleShowProductDetails = async (product: Product) => {
    try {
      const response = await productApi.getProduct(product.id);
      if (response.success && response.data) {
        setSelectedProduct(response.data.product || response.data);
        setShowModal(true);
      }
    } catch (err: any) {
      setError('เกิดข้อผิดพลาดในการโหลดรายละเอียดสินค้า');
    }
  };

  // Add product with price tiers
  const handleAddProduct = async () => {
    try {
      if (!newProduct.product_name.trim()) {
        setError('กรุณากรอกชื่อสินค้า');
        return;
      }

      const response = await productApi.createProduct({
        product_name: newProduct.product_name,
        sku: newProduct.sku || null,
        category: newProduct.category || null,
        price: newProduct.price || null,
        stock_quantity: newProduct.stock_quantity ? parseInt(newProduct.stock_quantity) : null,
        unit: newProduct.unit || null,
        short_description: newProduct.short_description || null,
        description: newProduct.description || null,
        url: newProduct.url || null,
        manual: true
      });

      if (response.success) {
        const productId = response.data.product.id;

        // Add price tiers if any
        if (formPriceTiers.length > 0) {
          const validTiers = formPriceTiers.filter(t => t.min_quantity && t.price);
          if (validTiers.length > 0) {
            await productApi.batchUpdatePriceTiers(productId, validTiers.map(t => ({
              min_quantity: parseInt(t.min_quantity),
              max_quantity: t.max_quantity ? parseInt(t.max_quantity) : null,
              price: parseFloat(t.price)
            })));
          }
        }

        setSuccess('เพิ่มสินค้าสำเร็จ');
        setShowAddModal(false);
        setNewProduct({
          product_name: '',
          sku: '',
          category: '',
          price: '',
          stock_quantity: '',
          unit: '',
          short_description: '',
          description: '',
          url: ''
        });
        setFormPriceTiers([]);
        loadProducts();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        throw new Error(response.message || 'ไม่สามารถเพิ่มสินค้าได้');
      }
    } catch (error: any) {
      setError(error.message);
      setTimeout(() => setError(null), 5000);
    }
  };

  // Edit product
  const handleEditProduct = async (product: Product) => {
    try {
      setEditingProduct(product);
      setNewProduct({
        product_name: product.product_name || '',
        sku: product.sku || '',
        category: product.category || '',
        price: product.price?.toString() || '',
        stock_quantity: product.stock_quantity?.toString() || '',
        unit: product.unit || '',
        short_description: product.description || '',
        description: product.description || '',
        url: product.url || ''
      });

      // Load price tiers
      const response = await productApi.getPriceTiers(product.id);
      if (response.success && response.data?.priceTiers) {
        setFormPriceTiers(response.data.priceTiers.map((t: PriceTier) => ({
          min_quantity: t.min_quantity.toString(),
          max_quantity: t.max_quantity?.toString() || '',
          price: t.price.toString()
        })));
      } else {
        setFormPriceTiers([]);
      }

      setShowEditModal(true);
    } catch (error: any) {
      setError('ไม่สามารถโหลดข้อมูลสินค้าได้');
    }
  };

  // Save edited product
  const handleSaveEditProduct = async () => {
    try {
      if (!editingProduct) return;

      if (!newProduct.product_name.trim()) {
        setError('กรุณากรอกชื่อสินค้า');
        return;
      }

      const response = await productApi.updateProduct(editingProduct.id, {
        product_name: newProduct.product_name,
        sku: newProduct.sku || null,
        category: newProduct.category || null,
        price: newProduct.price || null,
        stock_quantity: newProduct.stock_quantity ? parseInt(newProduct.stock_quantity) : null,
        unit: newProduct.unit || null,
        short_description: newProduct.short_description || null,
        description: newProduct.description || null,
        url: newProduct.url || null
      });

      if (response.success) {
        // Update price tiers
        const validTiers = formPriceTiers.filter(t => t.min_quantity && t.price);
        await productApi.batchUpdatePriceTiers(editingProduct.id, validTiers.map(t => ({
          min_quantity: parseInt(t.min_quantity),
          max_quantity: t.max_quantity ? parseInt(t.max_quantity) : null,
          price: parseFloat(t.price)
        })));

        setSuccess('แก้ไขสินค้าสำเร็จ');
        setShowEditModal(false);
        setEditingProduct(null);
        setNewProduct({
          product_name: '',
          sku: '',
          category: '',
          price: '',
          stock_quantity: '',
          unit: '',
          short_description: '',
          description: '',
          url: ''
        });
        setFormPriceTiers([]);
        loadProducts();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        throw new Error(response.message || 'ไม่สามารถแก้ไขสินค้าได้');
      }
    } catch (error: any) {
      setError(error.message);
      setTimeout(() => setError(null), 5000);
    }
  };

  // Delete product
  const handleDeleteProduct = async (productId: string) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบสินค้านี้?')) {
      return;
    }

    try {
      const response = await productApi.deleteProduct(productId);

      if (response.success) {
        setSuccess('ลบสินค้าสำเร็จ');
        loadProducts();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        throw new Error(response.message || 'ไม่สามารถลบสินค้าได้');
      }
    } catch (error: any) {
      setError(error.message);
      setTimeout(() => setError(null), 5000);
    }
  };

  // Price Tier Management Functions
  const handleManagePriceTiers = async (product: Product) => {
    try {
      setSelectedProductForPriceTiers(product);

      // Load price tiers for this product
      const response = await productApi.getPriceTiers(product.id);
      if (response.success && response.data) {
        setPriceTiers(response.data.priceTiers || []);
      } else {
        setPriceTiers([]);
      }

      setShowPriceTierModal(true);
    } catch (err: any) {
      setError('ไม่สามารถโหลดข้อมูลราคาขั้นบันไดได้');
    }
  };

  const handleAddPriceTier = async () => {
    try {
      if (!selectedProductForPriceTiers) return;

      if (!newPriceTier.min_quantity || !newPriceTier.price) {
        setError('กรุณากรอกจำนวนขั้นต่ำและราคา');
        return;
      }

      const response = await productApi.addPriceTier(selectedProductForPriceTiers.id, {
        min_quantity: parseInt(newPriceTier.min_quantity),
        max_quantity: newPriceTier.max_quantity ? parseInt(newPriceTier.max_quantity) : null,
        price: parseFloat(newPriceTier.price),
        unit: newPriceTier.unit || null
      });

      if (response.success) {
        setSuccess('เพิ่มราคาขั้นบันไดเรียบร้อยแล้ว');
        setTimeout(() => setSuccess(null), 3000);

        // Reload price tiers
        await handleManagePriceTiers(selectedProductForPriceTiers);

        // Reset form
        setNewPriceTier({
          min_quantity: '',
          max_quantity: '',
          price: '',
          unit: ''
        });
      } else {
        setError(response.error || 'ไม่สามารถเพิ่มราคาขั้นบันไดได้');
      }
    } catch (err: any) {
      setError('เกิดข้อผิดพลาดในการเพิ่มราคาขั้นบันได');
    }
  };

  const handleDeletePriceTier = async (tierId: string) => {
    try {
      if (!selectedProductForPriceTiers) return;

      if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบราคาขั้นบันไดนี้?')) {
        return;
      }

      const response = await productApi.deletePriceTier(selectedProductForPriceTiers.id, tierId);

      if (response.success) {
        setSuccess('ลบราคาขั้นบันไดเรียบร้อยแล้ว');
        setTimeout(() => setSuccess(null), 3000);

        // Reload price tiers
        await handleManagePriceTiers(selectedProductForPriceTiers);
      } else {
        setError(response.error || 'ไม่สามารถลบราคาขั้นบันไดได้');
      }
    } catch (err: any) {
      setError('เกิดข้อผิดพลาดในการลบราคาขั้นบันได');
    }
  };

  // Bulk Selection Functions
  const handleSelectProduct = (productId: string) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(products.map(p => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedProducts.size === 0) {
      setError('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ');
      return;
    }

    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบสินค้า ${selectedProducts.size} รายการ?`)) {
      return;
    }

    try {
      let successCount = 0;
      let failCount = 0;

      for (const productId of selectedProducts) {
        try {
          const response = await productApi.deleteProduct(productId);
          if (response.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      if (successCount > 0) {
        setSuccess(`ลบสินค้าสำเร็จ ${successCount} รายการ${failCount > 0 ? `, ล้มเหลว ${failCount} รายการ` : ''}`);
        setTimeout(() => setSuccess(null), 3000);
        setSelectedProducts(new Set());
        await loadProducts();
      } else {
        setError('ไม่สามารถลบสินค้าได้');
      }
    } catch (err: any) {
      setError('เกิดข้อผิดพลาดในการลบสินค้า');
    }
  };

  if (loading && products.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '400px' }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="container">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="mb-0">จัดการสินค้า</h1>
        <div className="d-flex gap-2">
          <button
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
            disabled={loading}
          >
            <AddIcon className="me-2" />
            เพิ่มสินค้า
          </button>
          <button className="btn btn-ghost" onClick={handleRefresh} disabled={loading}>
            {loading ? <LoadingSpinner /> : <SyncIcon className="me-2" />}
            รีเฟรช
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success" role="alert">
          {success}
        </div>
      )}
      <div className="input-group mb-4">
        <input
          type="text"
          className="input-field"
          placeholder="ค้นหาสินค้า..."
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </div>

      {selectedProducts.size > 0 && (
        <div className="alert alert-info d-flex justify-content-between align-items-center">
          <span>เลือกแล้ว {selectedProducts.size} รายการ</span>
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-danger" onClick={handleBulkDelete}>
              <DeleteIcon className="me-1" />
              ลบที่เลือก
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setSelectedProducts(new Set())}>
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h2 className="section-title mb-0">
            รายการสินค้า ({products.length} รายการ)
          </h2>
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="selectAllCheck"
              checked={products.length > 0 && selectedProducts.size === products.length}
              onChange={handleSelectAll}
            />
            <label className="form-check-label" htmlFor="selectAllCheck">
              เลือกทั้งหมด
            </label>
          </div>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table mb-0 table-hover">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={products.length > 0 && selectedProducts.size === products.length}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th>ชื่อสินค้า</th>
                  <th>หมวดหมู่</th>
                  <th>SKU</th>
                  <th>ราคา</th>
                  <th>สต็อก</th>
                  <th>อัปเดตล่าสุด</th>
                  <th>การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className={selectedProducts.has(product.id) ? 'table-active' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={selectedProducts.has(product.id)}
                        onChange={() => handleSelectProduct(product.id)}
                      />
                    </td>
                    <td>
                      <div>
                        <h6 className="mb-0">{product.product_name || product.name}</h6>
                        <small className="text-muted">#{product.id}</small>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-info">
                        {product.category || 'ไม่ระบุ'}
                      </span>
                    </td>
                    <td>
                      <code>{product.sku || 'N/A'}</code>
                    </td>
                    <td>
                      <strong className="text-success">
                        {product.price ? formatCurrency(product.price) : 'ไม่ระบุ'}
                      </strong>
                    </td>
                    <td>
                      <span className={`badge ${
                        (product.stock_quantity || 0) > 10 ? 'badge-success' :
                        (product.stock_quantity || 0) > 0 ? 'badge-warning' : 'badge-danger'
                      }`}>
                        {product.stock_quantity || 0}
                      </span>
                    </td>
                    <td>
                      <small>
                        {product.last_updated
                          ? formatDate(new Date(product.last_updated).getTime())
                          : product.updatedAt
                            ? formatDate(product.updatedAt)
                            : 'N/A'
                        }
                      </small>
                    </td>
                    <td>
                      <div className="d-flex gap-1 flex-wrap">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleShowProductDetails(product)}
                          title="ดูรายละเอียด"
                        >
                          <VisibilityIcon />
                        </button>
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => handleEditProduct(product)}
                          title="แก้ไขสินค้า"
                        >
                          <EditIcon />
                        </button>
                        {product.url && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => window.open(product.url, '_blank')}
                            title="เปิดเว็บไซต์"
                          >
                            <OpenInNewIcon />
                          </button>
                        )}
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteProduct(product.id)}
                          title="ลบสินค้า"
                        >
                          <DeleteIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {products.length === 0 && !loading && (
            <div className="text-center py-5">
              <h5 className="text-muted">ไม่พบสินค้า</h5>
              <p className="text-muted">
                {searchTerm ? 'ไม่พบสินค้าที่ตรงกับการค้นหา' : 'ยังไม่มีสินค้าในระบบ'}
              </p>
              <button
                className="btn btn-primary"
                onClick={() => setShowAddModal(true)}
              >
                <AddIcon className="me-2" />
                เพิ่มสินค้า
              </button>
            </div>
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="d-flex justify-content-center mt-4">
          <nav>
            <ul className="pagination">
              <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                <button
                  className="page-link"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  &laquo;
                </button>
              </li>

              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                const page = i + 1;
                if (totalPages <= 10) {
                  return page;
                }

                if (currentPage <= 5) {
                  return i < 10 ? page : null;
                } else if (currentPage > totalPages - 5) {
                  return i >= totalPages - 10 ? totalPages - 9 + i : null;
                } else {
                  return currentPage - 5 + i;
                }
              }).filter(Boolean).map((page) => (
                <li key={page} className={`page-item ${currentPage === page ? 'active' : ''}`}>
                  <button
                    className="page-link"
                    onClick={() => handlePageChange(page!)}
                  >
                    {page}
                  </button>
                </li>
              ))}

              <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                <button
                  className="page-link"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  &raquo;
                </button>
              </li>
            </ul>
          </nav>
        </div>
      )}

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="modal" style={{display: 'block'}}>
          <div className="modal-content">
            <div className="modal-header">
              <h3><AddIcon className="me-2" />เพิ่มสินค้า</h3>
              <button onClick={() => setShowAddModal(false)} className="btn-icon btn-ghost"><CloseIcon /></button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label>ชื่อสินค้า *</label>
                <input
                  type="text"
                  className="input-field"
                  value={newProduct.product_name}
                  onChange={(e) => setNewProduct({...newProduct, product_name: e.target.value})}
                  placeholder="กรอกชื่อสินค้า"
                />
              </div>

              <div className="input-group">
                <label>SKU</label>
                <input
                  type="text"
                  className="input-field"
                  value={newProduct.sku}
                  onChange={(e) => setNewProduct({...newProduct, sku: e.target.value})}
                  placeholder="กรอกรหัสสินค้า"
                />
              </div>

              <div className="input-group">
                <label>หมวดหมู่</label>
                <input
                  type="text"
                  className="input-field"
                  value={newProduct.category}
                  onChange={(e) => setNewProduct({...newProduct, category: e.target.value})}
                  placeholder="กรอกหมวดหมู่"
                />
              </div>

              <div className="component-grid">
                <div className="input-group">
                  <label>ราคา</label>
                  <input
                    type="text"
                    className="input-field"
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({...newProduct, price: e.target.value})}
                    placeholder="0.00"
                  />
                </div>

                <div className="input-group">
                  <label>จำนวนสต็อก</label>
                  <input
                    type="number"
                    className="input-field"
                    value={newProduct.stock_quantity}
                    onChange={(e) => setNewProduct({...newProduct, stock_quantity: e.target.value})}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="input-group">
                <label>หน่วย (ชิ้น, กล่อง, แพ็ค, ฯลฯ)</label>
                <input
                  type="text"
                  className="input-field"
                  value={newProduct.unit}
                  onChange={(e) => setNewProduct({...newProduct, unit: e.target.value})}
                  placeholder="เช่น ชิ้น, กล่อง, แพ็ค"
                />
              </div>

              <div className="input-group">
                <label>URL (ถ้ามี)</label>
                <input
                  type="text"
                  className="input-field"
                  value={newProduct.url}
                  onChange={(e) => setNewProduct({...newProduct, url: e.target.value})}
                  placeholder="https://example.com/product"
                />
              </div>

              <div className="input-group">
                <label>คำอธิบายสั้น</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={newProduct.short_description}
                  onChange={(e) => setNewProduct({...newProduct, short_description: e.target.value})}
                  placeholder="คำอธิบายสั้นๆ"
                />
              </div>

              <div className="input-group">
                <label>คำอธิบายแบบเต็ม</label>
                <textarea
                  className="input-field"
                  rows={4}
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({...newProduct, description: e.target.value})}
                  placeholder="คำอธิบายแบบละเอียด"
                />
              </div>

              {/* Price Tiers Section */}
              <div className="card mt-3">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h6 className="mb-0">ราคาขั้นบันได (ถ้ามี)</h6>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => setFormPriceTiers([...formPriceTiers, { min_quantity: '', max_quantity: '', price: '' }])}
                  >
                    <AddIcon className="me-1" /> เพิ่มขั้นราคา
                  </button>
                </div>
                <div className="card-body">
                  {formPriceTiers.length === 0 ? (
                    <p className="text-muted text-center mb-0">ยังไม่มีราคาขั้นบันได</p>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-sm">
                        <thead>
                          <tr>
                            <th>จำนวนขั้นต่ำ</th>
                            <th>จำนวนสูงสุด</th>
                            <th>ราคา</th>
                            <th style={{ width: '60px' }}>ลบ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {formPriceTiers.map((tier, index) => (
                            <tr key={index}>
                              <td>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={tier.min_quantity}
                                  onChange={(e) => {
                                    const newTiers = [...formPriceTiers];
                                    newTiers[index].min_quantity = e.target.value;
                                    setFormPriceTiers(newTiers);
                                  }}
                                  placeholder="1"
                                  min="1"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={tier.max_quantity}
                                  onChange={(e) => {
                                    const newTiers = [...formPriceTiers];
                                    newTiers[index].max_quantity = e.target.value;
                                    setFormPriceTiers(newTiers);
                                  }}
                                  placeholder="ไม่จำกัด"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={tier.price}
                                  onChange={(e) => {
                                    const newTiers = [...formPriceTiers];
                                    newTiers[index].price = e.target.value;
                                    setFormPriceTiers(newTiers);
                                  }}
                                  placeholder="100"
                                  step="0.01"
                                  min="0"
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-danger"
                                  onClick={() => {
                                    const newTiers = formPriceTiers.filter((_, i) => i !== index);
                                    setFormPriceTiers(newTiers);
                                  }}
                                >
                                  <DeleteIcon />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => {
                setShowAddModal(false);
                setFormPriceTiers([]);
              }}>
                ยกเลิก
              </button>
              <button className="btn btn-primary" onClick={handleAddProduct}>
                <SaveIcon className="me-2" />
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Details Modal */}
      {showModal && selectedProduct && (
        <div className="modal" style={{display: 'block'}}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>รายละเอียดสินค้า</h3>
              <button onClick={() => setShowModal(false)} className="btn-icon btn-ghost"><CloseIcon /></button>
            </div>
            <div className="modal-body">
              <div className="component-grid">
                <div>
                  <h6 className="text-primary mb-3">ข้อมูลพื้นฐาน</h6>
                  <div className="mb-3">
                    <strong>ชื่อสินค้า:</strong>
                    <div>{selectedProduct.product_name || selectedProduct.name}</div>
                  </div>

                  <div className="mb-3">
                    <strong>หมวดหมู่:</strong>
                    <div>
                      <span className="badge badge-info">
                        {selectedProduct.category || 'ไม่ระบุ'}
                      </span>
                    </div>
                  </div>

                  <div className="mb-3">
                    <strong>SKU:</strong>
                    <div><code>{selectedProduct.sku || 'N/A'}</code></div>
                  </div>

                  <div className="mb-3">
                    <strong>ราคา:</strong>
                    <div className="text-success h5">
                      {selectedProduct.price ? formatCurrency(selectedProduct.price) : 'ไม่ระบุ'}
                    </div>
                  </div>

                  <div className="mb-3">
                    <strong>จำนวนสต็อก:</strong>
                    <div>
                      <span className={`badge ${
                        (selectedProduct.stock_quantity || 0) > 10 ? 'badge-success' :
                        (selectedProduct.stock_quantity || 0) > 0 ? 'badge-warning' : 'badge-danger'
                      }`}>
                        {selectedProduct.stock_quantity || 0} ชิ้น
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h6 className="text-primary mb-3">ข้อมูลเพิ่มเติม</h6>

                  {selectedProduct.url && (
                    <div className="mb-3">
                      <strong>URL:</strong>
                      <div>
                        <a
                          href={selectedProduct.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-decoration-none"
                        >
                          <OpenInNewIcon className="me-2" />
                          ดูสินค้า
                        </a>
                      </div>
                    </div>
                  )}

                  <div className="mb-3">
                    <strong>อัปเดตล่าสุด:</strong>
                    <div>
                      {selectedProduct.last_updated
                        ? formatDate(new Date(selectedProduct.last_updated).getTime())
                        : selectedProduct.updatedAt
                          ? formatDate(selectedProduct.updatedAt)
                          : 'N/A'
                      }
                    </div>
                  </div>

                  <div className="mb-3">
                    <strong>ID สินค้า:</strong>
                    <div><code>{selectedProduct.id}</code></div>
                  </div>

                  {selectedProduct.description && (
                    <div className="mb-3">
                      <strong>รายละเอียด:</strong>
                      <div className="text-muted">{selectedProduct.description}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>
                ปิด
              </button>
              {selectedProduct?.url && (
                <button
                  className="btn btn-primary"
                  onClick={() => window.open(selectedProduct.url, '_blank')}
                >
                  <OpenInNewIcon className="me-2" />
                  ดูสินค้า
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {showEditModal && editingProduct && (
        <div className="modal" style={{display: 'block'}}>
          <div className="modal-content" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h3><EditIcon className="me-2" />แก้ไขสินค้า</h3>
              <button onClick={() => {
                setShowEditModal(false);
                setEditingProduct(null);
                setFormPriceTiers([]);
              }} className="btn-icon btn-ghost"><CloseIcon /></button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label>ชื่อสินค้า *</label>
                <input
                  type="text"
                  className="input-field"
                  value={newProduct.product_name}
                  onChange={(e) => setNewProduct({...newProduct, product_name: e.target.value})}
                  placeholder="กรอกชื่อสินค้า"
                />
              </div>

              <div className="input-group">
                <label>SKU</label>
                <input
                  type="text"
                  className="input-field"
                  value={newProduct.sku}
                  onChange={(e) => setNewProduct({...newProduct, sku: e.target.value})}
                  placeholder="กรอกรหัสสินค้า"
                />
              </div>

              <div className="input-group">
                <label>หมวดหมู่</label>
                <input
                  type="text"
                  className="input-field"
                  value={newProduct.category}
                  onChange={(e) => setNewProduct({...newProduct, category: e.target.value})}
                  placeholder="กรอกหมวดหมู่"
                />
              </div>

              <div className="component-grid">
                <div className="input-group">
                  <label>ราคา</label>
                  <input
                    type="text"
                    className="input-field"
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({...newProduct, price: e.target.value})}
                    placeholder="0.00"
                  />
                </div>

                <div className="input-group">
                  <label>จำนวนสต็อก</label>
                  <input
                    type="number"
                    className="input-field"
                    value={newProduct.stock_quantity}
                    onChange={(e) => setNewProduct({...newProduct, stock_quantity: e.target.value})}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="input-group">
                <label>หน่วย (ชิ้น, กล่อง, แพ็ค, ฯลฯ)</label>
                <input
                  type="text"
                  className="input-field"
                  value={newProduct.unit}
                  onChange={(e) => setNewProduct({...newProduct, unit: e.target.value})}
                  placeholder="เช่น ชิ้น, กล่อง, แพ็ค"
                />
              </div>

              <div className="input-group">
                <label>URL (ถ้ามี)</label>
                <input
                  type="text"
                  className="input-field"
                  value={newProduct.url}
                  onChange={(e) => setNewProduct({...newProduct, url: e.target.value})}
                  placeholder="https://example.com/product"
                />
              </div>

              <div className="input-group">
                <label>คำอธิบายสั้น</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={newProduct.short_description}
                  onChange={(e) => setNewProduct({...newProduct, short_description: e.target.value})}
                  placeholder="คำอธิบายสั้นๆ"
                />
              </div>

              <div className="input-group">
                <label>คำอธิบายแบบเต็ม</label>
                <textarea
                  className="input-field"
                  rows={4}
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({...newProduct, description: e.target.value})}
                  placeholder="คำอธิบายแบบละเอียด"
                />
              </div>

              {/* Price Tiers Section */}
              <div className="card mt-3">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h6 className="mb-0">ราคาขั้นบันได (ถ้ามี)</h6>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => setFormPriceTiers([...formPriceTiers, { min_quantity: '', max_quantity: '', price: '' }])}
                  >
                    <AddIcon className="me-1" /> เพิ่มขั้นราคา
                  </button>
                </div>
                <div className="card-body">
                  {formPriceTiers.length === 0 ? (
                    <p className="text-muted text-center mb-0">ยังไม่มีราคาขั้นบันได</p>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-sm">
                        <thead>
                          <tr>
                            <th>จำนวนขั้นต่ำ</th>
                            <th>จำนวนสูงสุด</th>
                            <th>ราคา</th>
                            <th style={{ width: '60px' }}>ลบ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {formPriceTiers.map((tier, index) => (
                            <tr key={index}>
                              <td>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={tier.min_quantity}
                                  onChange={(e) => {
                                    const newTiers = [...formPriceTiers];
                                    newTiers[index].min_quantity = e.target.value;
                                    setFormPriceTiers(newTiers);
                                  }}
                                  placeholder="1"
                                  min="1"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={tier.max_quantity}
                                  onChange={(e) => {
                                    const newTiers = [...formPriceTiers];
                                    newTiers[index].max_quantity = e.target.value;
                                    setFormPriceTiers(newTiers);
                                  }}
                                  placeholder="ไม่จำกัด"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={tier.price}
                                  onChange={(e) => {
                                    const newTiers = [...formPriceTiers];
                                    newTiers[index].price = e.target.value;
                                    setFormPriceTiers(newTiers);
                                  }}
                                  placeholder="100"
                                  step="0.01"
                                  min="0"
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-danger"
                                  onClick={() => {
                                    const newTiers = formPriceTiers.filter((_, i) => i !== index);
                                    setFormPriceTiers(newTiers);
                                  }}
                                >
                                  <DeleteIcon />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => {
                setShowEditModal(false);
                setEditingProduct(null);
                setFormPriceTiers([]);
              }}>
                ยกเลิก
              </button>
              <button className="btn btn-primary" onClick={handleSaveEditProduct}>
                <SaveIcon className="me-2" />
                บันทึกการแก้ไข
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price Tier Modal */}
      {showPriceTierModal && selectedProductForPriceTiers && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">จัดการราคาขั้นบันได - {selectedProductForPriceTiers.product_name}</h5>
                <button type="button" className="btn-close" onClick={() => setShowPriceTierModal(false)}></button>
              </div>
              <div className="modal-body">
                {/* Add Price Tier Form */}
                <div className="card mb-3">
                  <div className="card-header">
                    <h6 className="mb-0">เพิ่มราคาขั้นบันไดใหม่</h6>
                  </div>
                  <div className="card-body">
                    <div className="row g-3">
                      <div className="col-md-3">
                        <label className="form-label">จำนวนขั้นต่ำ *</label>
                        <input
                          type="number"
                          className="form-control"
                          value={newPriceTier.min_quantity}
                          onChange={(e) => setNewPriceTier({ ...newPriceTier, min_quantity: e.target.value })}
                          placeholder="เช่น 1"
                          min="1"
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">จำนวนสูงสุด</label>
                        <input
                          type="number"
                          className="form-control"
                          value={newPriceTier.max_quantity}
                          onChange={(e) => setNewPriceTier({ ...newPriceTier, max_quantity: e.target.value })}
                          placeholder="ไม่จำกัด"
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">ราคา *</label>
                        <input
                          type="number"
                          className="form-control"
                          value={newPriceTier.price}
                          onChange={(e) => setNewPriceTier({ ...newPriceTier, price: e.target.value })}
                          placeholder="เช่น 100"
                          step="0.01"
                          min="0"
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">หน่วย</label>
                        <input
                          type="text"
                          className="form-control"
                          value={newPriceTier.unit}
                          onChange={(e) => setNewPriceTier({ ...newPriceTier, unit: e.target.value })}
                          placeholder="เช่น ชิ้น"
                        />
                      </div>
                    </div>
                    <button className="btn btn-primary mt-3" onClick={handleAddPriceTier}>
                      <AddIcon className="me-2" />
                      เพิ่มราคาขั้นบันได
                    </button>
                  </div>
                </div>

                {/* Price Tiers List */}
                <div className="card">
                  <div className="card-header">
                    <h6 className="mb-0">รายการราคาขั้นบันได ({priceTiers.length})</h6>
                  </div>
                  <div className="card-body">
                    {priceTiers.length === 0 ? (
                      <p className="text-muted text-center mb-0">ยังไม่มีราคาขั้นบันได</p>
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-sm">
                          <thead>
                            <tr>
                              <th>จำนวนขั้นต่ำ</th>
                              <th>จำนวนสูงสุด</th>
                              <th>ราคา</th>
                              <th>การจัดการ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {priceTiers.map((tier) => (
                              <tr key={tier.id}>
                                <td>{tier.min_quantity}</td>
                                <td>{tier.max_quantity || 'ไม่จำกัด'}</td>
                                <td>{formatCurrency(tier.price)}</td>
                                <td>
                                  <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() => handleDeletePriceTier(tier.id)}
                                  >
                                    <DeleteIcon />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setShowPriceTierModal(false)}>
                  ปิด
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ProductsPage;
