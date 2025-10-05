
// src/components/ProductLinkingModal.tsx
import React, { useState, useEffect } from 'react';
import { productApi } from '../services/api';
import { Product } from '../types';
import { LoadingSpinner } from '../pages/DashboardModels/UIComponents';
import LinkIcon from '@mui/icons-material/Link';
import CloseIcon from '@mui/icons-material/Close';

interface ProductLinkingModalProps {
  show: boolean;
  onHide: () => void;
  productionProduct?: any;
  regularProduct?: Product | null;
  onLink: (productionId: string, regularProductId: string) => Promise<void>;
}

const ProductLinkingModal: React.FC<ProductLinkingModalProps> = ({
  show,
  onHide,
  productionProduct,
  regularProduct,
  onLink
}) => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const isLinkingFromRegular = Boolean(regularProduct && !productionProduct);
  const isLinkingFromProduction = Boolean(productionProduct && !regularProduct);

  useEffect(() => {
    if (show) {
      loadProducts();
    }
  }, [show, isLinkingFromRegular]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      
      if (isLinkingFromRegular) {

      } else {
        const response = await productApi.getAllProducts({
          limit: 100,
          sort: 'product_name',
          order: 'asc'
        });
        
        if (response.success && response.data) {
          setProducts(response.data.products || response.data.results || []);
        }
      }
    } catch (err: any) {
      setError('เกิดข้อผิดพลาดในการโหลดรายการสินค้า');
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async () => {
    if (!selectedProduct) return;

    try {
      setLinking(true);
      setError(null);
      
      if (isLinkingFromRegular && regularProduct) {
        await onLink(selectedProduct.id, regularProduct.id);
      } else if (isLinkingFromProduction && productionProduct) {
        await onLink(productionProduct.id, selectedProduct.id);
      }
      
      setSelectedProduct(null);
      onHide();
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมโยงสินค้า');
    } finally {
      setLinking(false);
    }
  };

  const handleClose = () => {
   if (!linking) {
     setSelectedProduct(null);
     setSearchTerm('');
     setError(null);
     onHide();
   }
 };

 const filteredProducts = products.filter(product => {
   const searchLower = searchTerm.toLowerCase();
   if (isLinkingFromRegular) {
     return (
       (product.name || '').toLowerCase().includes(searchLower) ||
       (product.code || '').toLowerCase().includes(searchLower) ||
       (product.mc || '').toLowerCase().includes(searchLower)
     );
   } else {
     return (
       (product.product_name || product.name || '').toLowerCase().includes(searchLower) ||
       (product.sku || '').toLowerCase().includes(searchLower)
     );
   }
 });

 const getModalTitle = () => {
   if (isLinkingFromRegular) {
     return 'เชื่อมโยงกับสินค้าสั่งผลิต';
   }
   return 'เชื่อมโยงสินค้าสั่งผลิต';
 };

 const getSearchPlaceholder = () => {
   if (isLinkingFromRegular) {
     return 'ค้นหาสินค้าสั่งผลิต (MC, Code, ชื่อสินค้า)...';
   }
   return 'ค้นหาสินค้าทั่วไป (ชื่อสินค้า, SKU)...';
 };

 if (!show) return null;

 return (
   <div className="modal" style={{display: 'block'}}>
     <div className="modal-content">
        <div className="modal-header">
            <h3><LinkIcon className="me-2" />{getModalTitle()}</h3>
            <button onClick={handleClose} className="btn-icon btn-ghost" disabled={linking}><CloseIcon /></button>
        </div>
        <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}
            
            {(productionProduct || regularProduct) && (
                <div className="mb-4 p-3 border rounded bg-light">
                <h6 className="text-primary mb-2">
                    {isLinkingFromRegular ? 'สินค้าทั่วไปที่จะเชื่อมโยง:' : 'สินค้าสั่งผลิตที่จะเชื่อมโยง:'}
                </h6>
                {isLinkingFromRegular && regularProduct ? (
                    <div>
                    <div><strong>{regularProduct.product_name || regularProduct.name}</strong></div>
                    <div className="text-muted">
                        ID: {regularProduct.id} | SKU: {regularProduct.sku || 'N/A'}
                    </div>
                    </div>
                ) : productionProduct ? (
                    <div>
                    <div><strong>{productionProduct.name}</strong></div>
                    <div className="text-muted">MC: {productionProduct.mc} | Code: {productionProduct.code}</div>
                    </div>
                ) : null}
                </div>
            )}

            <div className="input-group mb-3">
                <label>{isLinkingFromRegular ? 'ค้นหาสินค้าสั่งผลิต' : 'ค้นหาสินค้าทั่วไป'}</label>
                <input
                    type="text"
                    className="input-field"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={getSearchPlaceholder()}
                    disabled={linking}
                />
            </div>

            {loading ? (
                <div className="text-center py-4">
                <LoadingSpinner />
                </div>
            ) : (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="table table-hover">
                    <thead>
                    <tr>
                        <th style={{ width: '50px' }}></th>
                        {isLinkingFromRegular ? (
                        <>
                            <th>รหัสสินค้า</th>
                            <th>ชื่อสินค้า</th>
                            <th>SPEC</th>
                            <th>ขนาดบรรจุ</th>
                        </>
                        ) : (
                        <>
                            <th>ชื่อสินค้า</th>
                            <th>SKU</th>
                            <th>หมวดหมู่</th>
                            <th>ราคา</th>
                        </>
                        )}
                    </tr>
                    </thead>
                    <tbody>
                    {filteredProducts.map((product) => (
                        <tr 
                        key={product.id}
                        className={selectedProduct?.id === product.id ? 'table-primary' : ''}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedProduct(product)}
                        >
                        <td>
                            <input
                            type="radio"
                            name="selectedProduct"
                            checked={selectedProduct?.id === product.id}
                            onChange={() => setSelectedProduct(product)}
                            disabled={linking}
                            />
                        </td>
                        {isLinkingFromRegular ? (
                            <>
                            <td>
                                <div>
                                <strong className="text-primary">MC: {product.mc}</strong>
                                <br />
                                <small className="text-muted">Code: {product.code}</small>
                                </div>
                            </td>
                            <td>
                                <div>
                                <strong>{product.name}</strong>
                                <div className="small text-muted">#{product.id}</div>
                                </div>
                            </td>
                            <td>
                                <small className="text-muted">{product.specs}</small>
                            </td>
                            <td>
                                <div className="small">
                                <div>แพ็ค: {product.pack_details?.pieces_per_pack || 'N/A'} ชิ้น</div>
                                <div>ลัง: {product.pack_details?.boxes_per_case || 'N/A'} กล่อง</div>
                                </div>
                            </td>
                            </>
                        ) : (
                            <>
                            <td>
                                <div>
                                <strong>{product.product_name || product.name}</strong>
                                <div className="small text-muted">#{product.id}</div>
                                </div>
                            </td>
                            <td>
                                <code>{product.sku || 'N/A'}</code>
                            </td>
                            <td>
                                <span className="badge badge-info">{product.category || 'ไม่ระบุ'}</span>
                            </td>
                            <td>
                                <span className="text-success fw-bold">
                                {product.price ? `${product.price.toLocaleString()} บาท` : 'ไม่ระบุ'}
                                </span>
                            </td>
                            </>
                        )}
                        </tr>
                    ))}
                    </tbody>
                </table>

                {filteredProducts.length === 0 && (
                    <div className="text-center py-4 text-muted">
                    <div>ไม่พบสินค้าที่ตรงกับการค้นหา</div>
                    </div>
                )}
                </div>
            )}
        </div>
        <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={handleClose} disabled={linking}>
                ยกเลิก
            </button>
            <button 
                type="button"
                className="btn btn-primary" 
                onClick={handleLink} 
                disabled={!selectedProduct || linking}
            >
                {linking ? (
                <>
                    <LoadingSpinner />
                    <span className="ms-2">กำลังเชื่อมโยง...</span>
                </>
                ) : (
                <>
                    <LinkIcon className="me-2" />
                    เชื่อมโยงสินค้า
                </>
                )}
            </button>
        </div>
     </div>
   </div>
 );
};

export default ProductLinkingModal;
