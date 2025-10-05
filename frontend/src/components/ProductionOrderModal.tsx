
// src/components/ProductionOrderModal.tsx
import React, { useState } from 'react';
import { LoadingSpinner } from '../pages/DashboardModels/UIComponents';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';

interface PackDetails {
  pieces_per_pack: number;
  boxes_per_case: number;
  pieces_per_case: number;
}

interface PriceTier {
  min: number;
  max: number;
  price: number;
}

interface PrintingPriceTier {
  min: number;
  max: number;
  prices: {
    '1-2': number;
    '3-4': number;
    '5-6': number;
  };
}

interface ProductDimensions {
  length: number;
  width: number;
  height: number;
  weight: number;
}

interface ProductionProduct {
  mc: string;
  code: string;
  name: string;
  specs: string;
  pack_details: PackDetails;
  pricing: {
    regular: PriceTier[];
    printing: PrintingPriceTier[];
  };
  dimensions: ProductDimensions;
  category: string;
}

interface ProductionOrderModalProps {
  show: boolean;
  onHide: () => void;
  onSave: (product: ProductionProduct) => Promise<void>;
}

const ProductionOrderModal: React.FC<ProductionOrderModalProps> = ({ show, onHide, onSave }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [productData, setProductData] = useState<ProductionProduct>({
    mc: '',
    code: '',
    name: '',
    specs: '',
    pack_details: {
      pieces_per_pack: 0,
      boxes_per_case: 0,
      pieces_per_case: 0
    },
    pricing: {
      regular: [{
        min: 0,
        max: 0,
        price: 0
      }],
      printing: [{
        min: 0,
        max: 0,
        prices: {
          '1-2': 0,
          '3-4': 0,
          '5-6': 0
        }
      }]
    },
    dimensions: {
      length: 0,
      width: 0,
      height: 0,
      weight: 0
    },
    category: 'บรรจุภัณฑ์กระดาษ'
  });

  const resetForm = () => {
    setProductData({
      mc: '',
      code: '',
      name: '',
      specs: '',
      pack_details: {
        pieces_per_pack: 0,
        boxes_per_case: 0,
        pieces_per_case: 0
      },
      pricing: {
        regular: [{
          min: 0,
          max: 0,
          price: 0
        }],
        printing: [{
          min: 0,
          max: 0,
          prices: {
            '1-2': 0,
            '3-4': 0,
            '5-6': 0
          }
        }]
      },
      dimensions: {
        length: 0,
        width: 0,
        height: 0,
        weight: 0
      },
      category: 'บรรจุภัณฑ์กระดาษ'
    });
    setError(null);
    setSuccess(null);
  };

  const handleClose = () => {
    if (!loading) {
      resetForm();
      onHide();
    }
  };

  const validateForm = (): boolean => {
    if (!productData.mc || !productData.code || !productData.name || !productData.specs) {
      setError('กรุณากรอกข้อมูลพื้นฐานให้ครบถ้วน');
      return false;
    }

    if (productData.pack_details.pieces_per_pack <= 0 || 
        productData.pack_details.boxes_per_case <= 0 || 
        productData.pack_details.pieces_per_case <= 0) {
      setError('กรุณากรอกข้อมูลการบรรจุให้ถูกต้อง');
      return false;
    }

    for (const tier of productData.pricing.regular) {
      if (tier.min < 0 || tier.max <= tier.min || tier.price < 0) {
        setError('กรุณาตรวจสอบช่วงราคามาตรฐาน');
        return false;
      }
    }

    for (const tier of productData.pricing.printing) {
      if (tier.min < 0 || tier.max <= tier.min) {
        setError('กรุณาตรวจสอบช่วงราคาพิมพ์');
        return false;
      }
      if (tier.prices['1-2'] < 0 || tier.prices['3-4'] < 0 || tier.prices['5-6'] < 0) {
        setError('กรุณาตรวจสอบราคาพิมพ์ตามจำนวนสี');
        return false;
      }
    }

    if (productData.dimensions.length <= 0 || 
        productData.dimensions.width <= 0 || 
        productData.dimensions.height <= 0 || 
        productData.dimensions.weight <= 0) {
      setError('กรุณากรอกมิติและน้ำหนักให้ถูกต้อง');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!validateForm()) return;

    try {
      setLoading(true);
      await onSave(productData);
      setSuccess('บันทึกสินค้าสั่งผลิตเรียบร้อยแล้ว');
      setTimeout(() => {
        resetForm();
        onHide();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const addRegularPriceTier = () => {
    setProductData(prev => ({
      ...prev,
      pricing: {
        ...prev.pricing,
        regular: [...prev.pricing.regular, { min: 0, max: 0, price: 0 }]
      }
    }));
  };

  const removeRegularPriceTier = (index: number) => {
    if (productData.pricing.regular.length > 1) {
      setProductData(prev => ({
        ...prev,
        pricing: {
          ...prev.pricing,
          regular: prev.pricing.regular.filter((_, i) => i !== index)
        }
      }));
    }
  };

  const addPrintingPriceTier = () => {
    setProductData(prev => ({
      ...prev,
      pricing: {
        ...prev.pricing,
        printing: [...prev.pricing.printing, {
          min: 0,
          max: 0,
          prices: { '1-2': 0, '3-4': 0, '5-6': 0 }
        }]
      }
    }));
  };

  const removePrintingPriceTier = (index: number) => {
    if (productData.pricing.printing.length > 1) {
      setProductData(prev => ({
        ...prev,
        pricing: {
          ...prev.pricing,
          printing: prev.pricing.printing.filter((_, i) => i !== index)
        }
      }));
    }
  };

  const updateRegularTier = (index: number, field: keyof PriceTier, value: number) => {
    setProductData(prev => ({
      ...prev,
      pricing: {
        ...prev.pricing,
        regular: prev.pricing.regular.map((tier, i) => 
          i === index ? { ...tier, [field]: value } : tier
        )
      }
    }));
  };

  const updatePrintingTier = (index: number, field: 'min' | 'max', value: number) => {
    setProductData(prev => ({
      ...prev,
      pricing: {
        ...prev.pricing,
        printing: prev.pricing.printing.map((tier, i) => 
          i === index ? { ...tier, [field]: value } : tier
        )
      }
    }));
  };

  const updatePrintingPrice = (index: number, colorRange: '1-2' | '3-4' | '5-6', value: number) => {
    setProductData(prev => ({
      ...prev,
      pricing: {
        ...prev.pricing,
        printing: prev.pricing.printing.map((tier, i) => 
          i === index ? { 
            ...tier, 
            prices: { ...tier.prices, [colorRange]: value }
          } : tier
        )
      }
    }));
  };

  if (!show) return null;

  return (
    <div className="modal" style={{display: 'block'}}>
      <div className="modal-content">
        <div className="modal-header">
          <h3>เพิ่มสินค้าสั่งผลิต</h3>
          <button onClick={handleClose} className="btn-icon btn-ghost" disabled={loading}><CloseIcon /></button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {error && <div className="alert alert-danger">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <form onSubmit={handleSubmit}>
            <div className="card mb-4">
              <div className="card-header">
                <h5 className="mb-0">ข้อมูลพื้นฐาน</h5>
              </div>
              <div className="card-body component-grid">
                <div className="input-group">
                  <label>รหัสสินค้า (MC) <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    className="input-field"
                    value={productData.mc}
                    onChange={(e) => setProductData(prev => ({ ...prev, mc: e.target.value }))}
                    placeholder="MC-001"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="input-group">
                  <label>รหัสสินค้า (Code) <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    className="input-field"
                    value={productData.code}
                    onChange={(e) => setProductData(prev => ({ ...prev, code: e.target.value }))}
                    placeholder="PROD-001"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="input-group">
                  <label>ชื่อสินค้า <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    className="input-field"
                    value={productData.name}
                    onChange={(e) => setProductData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="กล่องกระดาษขาว"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="input-group">
                  <label>รายละเอียด SPEC <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    className="input-field"
                    value={productData.specs}
                    onChange={(e) => setProductData(prev => ({ ...prev, specs: e.target.value }))}
                    placeholder="กล่องกระดาษ 300g"
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            <div className="card mb-4">
              <div className="card-header">
                <h5 className="mb-0">ขนาดบรรจุ</h5>
              </div>
              <div className="card-body component-grid">
                <div className="input-group">
                  <label>ชิ้นต่อแพ็ค <span className="text-danger">*</span></label>
                  <input
                    type="number"
                    className="input-field"
                    value={productData.pack_details.pieces_per_pack}
                    onChange={(e) => setProductData(prev => ({ 
                      ...prev, 
                      pack_details: { ...prev.pack_details, pieces_per_pack: parseInt(e.target.value) || 0 }
                    }))}
                    min="1"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="input-group">
                  <label>กล่องต่อลัง <span className="text-danger">*</span></label>
                  <input
                    type="number"
                    className="input-field"
                    value={productData.pack_details.boxes_per_case}
                    onChange={(e) => setProductData(prev => ({ 
                      ...prev, 
                      pack_details: { ...prev.pack_details, boxes_per_case: parseInt(e.target.value) || 0 }
                    }))}
                    min="1"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="input-group">
                  <label>ชิ้นต่อลัง <span className="text-danger">*</span></label>
                  <input
                    type="number"
                    className="input-field"
                    value={productData.pack_details.pieces_per_case}
                    onChange={(e) => setProductData(prev => ({ 
                      ...prev, 
                      pack_details: { ...prev.pack_details, pieces_per_case: parseInt(e.target.value) || 0 }
                    }))}
                    min="1"
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            <div className="card mb-4">
              <div className="card-header d-flex justify-content-between align-items-center">
                <h5 className="mb-0">ราคามาตรฐานตามจำนวน</h5>
                <button type="button" className="btn btn-primary btn-sm" onClick={addRegularPriceTier} disabled={loading}>
                  <AddIcon fontSize="small" className="me-1" />เพิ่มช่วงราคา
                </button>
              </div>
              <div className="card-body">
                {productData.pricing.regular.map((tier, index) => (
                  <div key={index} className="border rounded p-3 mb-3 bg-light component-grid">
                    <div className="input-group">
                      <label>จำนวนขั้นต่ำ</label>
                      <input
                        type="number"
                        className="input-field"
                        value={tier.min}
                        onChange={(e) => updateRegularTier(index, 'min', parseInt(e.target.value) || 0)}
                        min="0"
                        disabled={loading}
                      />
                    </div>
                    <div className="input-group">
                      <label>จำนวนสูงสุด</label>
                      <input
                        type="number"
                        className="input-field"
                        value={tier.max}
                        onChange={(e) => updateRegularTier(index, 'max', parseInt(e.target.value) || 0)}
                        min="0"
                        disabled={loading}
                      />
                    </div>
                    <div className="input-group">
                      <label>ราคาต่อชิ้น (บาท)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input-field"
                        value={tier.price}
                        onChange={(e) => updateRegularTier(index, 'price', parseFloat(e.target.value) || 0)}
                        min="0"
                        disabled={loading}
                      />
                    </div>
                    <div className="d-flex align-items-end">
                      {productData.pricing.regular.length > 1 && (
                        <button 
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => removeRegularPriceTier(index)}
                          disabled={loading}
                        >
                          <CloseIcon fontSize="small" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card mb-4">
              <div className="card-header d-flex justify-content-between align-items-center">
                <h5 className="mb-0">ราคาพิมพ์ตามจำนวนสี</h5>
                <button type="button" className="btn btn-primary btn-sm" onClick={addPrintingPriceTier} disabled={loading}>
                  <AddIcon fontSize="small" className="me-1" />เพิ่มช่วงราคา
                </button>
              </div>
              <div className="card-body">
                {productData.pricing.printing.map((tier, index) => (
                  <div key={index} className="border rounded p-3 mb-3 bg-light">
                    <div className="component-grid mb-3">
                      <div className="input-group">
                        <label>จำนวนขั้นต่ำ</label>
                        <input
                          type="number"
                          className="input-field"
                          value={tier.min}
                          onChange={(e) => updatePrintingTier(index, 'min', parseInt(e.target.value) || 0)}
                          min="0"
                          disabled={loading}
                        />
                      </div>
                      <div className="input-group">
                        <label>จำนวนสูงสุด</label>
                        <input
                          type="number"
                          className="input-field"
                          value={tier.max}
                          onChange={(e) => updatePrintingTier(index, 'max', parseInt(e.target.value) || 0)}
                          min="0"
                          disabled={loading}
                        />
                      </div>
                      <div className="d-flex align-items-end">
                        {productData.pricing.printing.length > 1 && (
                          <button 
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => removePrintingPriceTier(index)}
                            disabled={loading}
                          >
                            <CloseIcon fontSize="small" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="component-grid">
                      <div className="input-group">
                        <label><span className="badge badge-info me-1">1-2 สี</span>ราคาต่อชิ้น</label>
                        <input
                          type="number"
                          step="0.01"
                          className="input-field"
                          value={tier.prices['1-2']}
                          onChange={(e) => updatePrintingPrice(index, '1-2', parseFloat(e.target.value) || 0)}
                          min="0"
                          disabled={loading}
                        />
                      </div>
                      <div className="input-group">
                        <label><span className="badge badge-warning me-1">3-4 สี</span>ราคาต่อชิ้น</label>
                        <input
                          type="number"
                          step="0.01"
                          className="input-field"
                          value={tier.prices['3-4']}
                          onChange={(e) => updatePrintingPrice(index, '3-4', parseFloat(e.target.value) || 0)}
                          min="0"
                          disabled={loading}
                        />
                      </div>
                      <div className="input-group">
                        <label><span className="badge badge-danger me-1">5-6 สี</span>ราคาต่อชิ้น</label>
                        <input
                          type="number"
                          step="0.01"
                          className="input-field"
                          value={tier.prices['5-6']}
                          onChange={(e) => updatePrintingPrice(index, '5-6', parseFloat(e.target.value) || 0)}
                          min="0"
                          disabled={loading}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card mb-4">
              <div className="card-header">
                <h5 className="mb-0">มิติและน้ำหนัก</h5>
              </div>
              <div className="card-body component-grid">
                <div className="input-group">
                  <label>ความยาว (ซม.) <span className="text-danger">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={productData.dimensions.length}
                    onChange={(e) => setProductData(prev => ({
                      ...prev,
                      dimensions: { ...prev.dimensions, length: parseFloat(e.target.value) || 0 }
                    }))}
                    min="0"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="input-group">
                  <label>ความกว้าง (ซม.) <span className="text-danger">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={productData.dimensions.width}
                    onChange={(e) => setProductData(prev => ({
                      ...prev,
                      dimensions: { ...prev.dimensions, width: parseFloat(e.target.value) || 0 }
                    }))}
                    min="0"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="input-group">
                  <label>ความสูง (ซม.) <span className="text-danger">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={productData.dimensions.height}
                    onChange={(e) => setProductData(prev => ({
                      ...prev,
                      dimensions: { ...prev.dimensions, height: parseFloat(e.target.value) || 0 }
                    }))}
                    min="0"
                    required
                    disabled={loading}
                  />
                </div>
                <div className="input-group">
                  <label>น้ำหนัก (กรัม) <span className="text-danger">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={productData.dimensions.weight}
                    onChange={(e) => setProductData(prev => ({
                      ...prev,
                      dimensions: { ...prev.dimensions, weight: parseFloat(e.target.value) || 0 }
                    }))}
                    min="0"
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          </form>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={handleClose} disabled={loading}>
            ยกเลิก
          </button>
          <button type="submit" className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <>
                <LoadingSpinner />
                <span className="ms-2">กำลังบันทึก...</span>
              </>
            ) : (
              <>
                <SaveIcon className="me-2" />
                บันทึกสินค้า
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductionOrderModal;
