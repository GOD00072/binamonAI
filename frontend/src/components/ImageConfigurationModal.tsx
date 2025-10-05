
// src/components/ImageConfigurationModal.tsx
import React, { useState, useEffect } from 'react';
import { LoadingSpinner } from '../pages/DashboardModels/UIComponents';
import SettingsIcon from '@mui/icons-material/Settings';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import UndoIcon from '@mui/icons-material/Undo';

interface ImageConfig {
  enabled: boolean;
  maxImagesPerProduct: number;
  preventDuplicateSends: boolean;
  autoSendOnUrlDetection: boolean;
  imageSelectionMode: 'manual' | 'primary_first' | 'all' | 'random';
  sendDelay: number;
  imageDisplayMode: 'individual' | 'carousel' | 'flex';
  useOriginalImages: boolean;
}

interface ImageConfigurationModalProps {
  show: boolean;
  onHide: () => void;
  onSave: (config: ImageConfig) => Promise<void>;
  currentConfig?: ImageConfig | null;
}

const ImageConfigurationModal: React.FC<ImageConfigurationModalProps> = ({
  show,
  onHide,
  onSave,
  currentConfig
}) => {
  const [config, setConfig] = useState<ImageConfig>({
    enabled: true,
    maxImagesPerProduct: 10,
    preventDuplicateSends: true,
    autoSendOnUrlDetection: true,
    imageSelectionMode: 'manual',
    sendDelay: 1000,
    imageDisplayMode: 'individual',
    useOriginalImages: true
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    if (currentConfig) {
      setConfig(currentConfig);
    }
  }, [currentConfig]);

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      await onSave(config);
      setSuccess('บันทึกการตั้งค่าเรียบร้อยแล้ว');
      setTimeout(() => {
        setSuccess(null);
        onHide();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if (currentConfig) {
      setConfig(currentConfig);
    }
    setError(null);
    setSuccess(null);
  };

  if (!show) return null;

  return (
    <div className="modal" style={{display: 'block'}}>
        <div className="modal-content">
            <div className="modal-header">
                <h3><SettingsIcon className="me-2" />ตั้งค่าการจัดการรูปภาพ</h3>
                <button onClick={onHide} className="btn-icon btn-ghost"><CloseIcon /></button>
            </div>
            <div className="modal-body">
                {error && <div className="alert alert-danger">{error}</div>}
                {success && <div className="alert alert-success">{success}</div>}

                <div className="tabs">
                    <button className={`tab ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>ทั่วไป</button>
                    <button className={`tab ${activeTab === 'images' ? 'active' : ''}`} onClick={() => setActiveTab('images')}>รูปภาพ</button>
                    <button className={`tab ${activeTab === 'display' ? 'active' : ''}`} onClick={() => setActiveTab('display')}>การแสดงผล</button>
                    <button className={`tab ${activeTab === 'advanced' ? 'active' : ''}`} onClick={() => setActiveTab('advanced')}>ขั้นสูง</button>
                    <button className={`tab ${activeTab === 'statistics' ? 'active' : ''}`} onClick={() => setActiveTab('statistics')}>สถิติ</button>
                </div>

                <div className="mt-3">
                    {activeTab === 'general' && <div>
                        <div className="card mb-3">
                            <div className="card-header"><h6>การเปิดใช้งาน</h6></div>
                            <div className="card-body">
                                <label className="toggle"><input type="checkbox" checked={config.enabled} onChange={(e) => setConfig(prev => ({ ...prev, enabled: e.target.checked }))} /><span className="toggle-slider"></span></label>
                                <label>เปิดใช้งานระบบจัดการรูปภาพ</label>
                                <p className="text-muted small">เมื่อปิดใช้งาน ระบบจะไม่ส่งรูปภาพอัตโนมัติ</p>
                            </div>
                        </div>
                        <div className="card mb-3">
                            <div className="card-header"><h6>การส่งอัตโนมัติ</h6></div>
                            <div className="card-body">
                                <label className="toggle"><input type="checkbox" checked={config.autoSendOnUrlDetection} onChange={(e) => setConfig(prev => ({ ...prev, autoSendOnUrlDetection: e.target.checked }))} disabled={!config.enabled} /><span className="toggle-slider"></span></label>
                                <label>ส่งรูปภาพอัตโนมัติเมื่อตรวจพบ URL</label>
                                <p className="text-muted small">ระบบจะส่งรูปภาพอัตโนมัติเมื่อตรวจพบ URL สินค้าในข้อความ</p>
                            </div>
                        </div>
                        <div className="card mb-3">
                            <div className="card-header"><h6>การป้องกันการส่งซ้ำ</h6></div>
                            <div className="card-body">
                                <label className="toggle"><input type="checkbox" checked={config.preventDuplicateSends} onChange={(e) => setConfig(prev => ({ ...prev, preventDuplicateSends: e.target.checked }))} disabled={!config.enabled} /><span className="toggle-slider"></span></label>
                                <label>ป้องกันการส่งรูปภาพซ้ำ</label>
                                <p className="text-muted small">ป้องกันการส่งรูปภาพสินค้าเดิมซ้ำภายใน 24 ชั่วโมง</p>
                            </div>
                        </div>
                    </div>}

                    {activeTab === 'images' && <div>
                        <div className="card mb-3">
                            <div className="card-header"><h6>จำนวนรูปภาพ</h6></div>
                            <div className="card-body">
                                <label>จำนวนรูปภาพสูงสุดต่อสินค้า</label>
                                <input type="range" className="slider" min={1} max={20} value={config.maxImagesPerProduct} onChange={(e) => setConfig(prev => ({ ...prev, maxImagesPerProduct: parseInt(e.target.value) }))} disabled={!config.enabled} />
                                <div className="d-flex justify-content-between">
                                    <small className="text-muted">1</small>
                                    <span className="badge badge-primary">{config.maxImagesPerProduct} รูป</span>
                                    <small className="text-muted">20</small>
                                </div>
                            </div>
                        </div>
                        <div className="card mb-3">
                            <div className="card-header"><h6>โหมดการเลือกรูปภาพ</h6></div>
                            <div className="card-body">
                                <select className="input-field" value={config.imageSelectionMode} onChange={(e) => setConfig(prev => ({ ...prev, imageSelectionMode: e.target.value as any }))} disabled={!config.enabled}>
                                    <option value="manual">เลือกเอง (Manual)</option>
                                    <option value="primary_first">รูปหลักก่อน</option>
                                    <option value="all">ทั้งหมด</option>
                                    <option value="random">สุ่ม</option>
                                </select>
                                <p className="text-muted small">
                                    {config.imageSelectionMode === 'manual' && 'ให้ผู้ใช้เลือกรูปภาพเอง'}
                                    {config.imageSelectionMode === 'primary_first' && 'เลือกรูปหลักก่อน แล้วตามด้วยรูปอื่น'}
                                    {config.imageSelectionMode === 'all' && 'เลือกรูปภาพทั้งหมดตามจำนวนที่กำหนด'}
                                    {config.imageSelectionMode === 'random' && 'เลือกรูปภาพแบบสุ่ม'}
                                </p>
                            </div>
                        </div>
                        <div className="card mb-3">
                            <div className="card-header"><h6>คุณภาพรูปภาพ</h6></div>
                            <div className="card-body">
                                <label className="toggle"><input type="checkbox" checked={config.useOriginalImages} onChange={(e) => setConfig(prev => ({ ...prev, useOriginalImages: e.target.checked }))} disabled={!config.enabled} /><span className="toggle-slider"></span></label>
                                <label>ใช้รูปภาพต้นฉบับ (คุณภาพสูง)</label>
                                <p className="text-muted small">{config.useOriginalImages ? 'ใช้รูปภาพต้นฉบับคุณภาพสูง (ขนาดไฟล์ใหญ่กว่า)' : 'ปรับขนาดรูปภาพให้เหมาะสม (ขนาดไฟล์เล็กกว่า)'}</p>
                            </div>
                        </div>
                    </div>}

                    {activeTab === 'display' && <div>
                        <div className="card mb-3">
                            <div className="card-header"><h6>รูปแบบการส่งรูปภาพ</h6></div>
                            <div className="card-body">
                                <select className="input-field" value={config.imageDisplayMode} onChange={(e) => setConfig(prev => ({ ...prev, imageDisplayMode: e.target.value as any }))} disabled={!config.enabled}>
                                    <option value="individual">ส่งทีละรูป</option>
                                    <option value="carousel">แบบ Carousel</option>
                                    <option value="flex">แบบ Flex Message</option>
                                </select>
                                <p className="text-muted small">
                                    {config.imageDisplayMode === 'individual' && 'ส่งรูปภาพทีละรูปตามลำดับ'}
                                    {config.imageDisplayMode === 'carousel' && 'ส่งรูปภาพในรูปแบบ Image Carousel'}
                                    {config.imageDisplayMode === 'flex' && 'ส่งรูปภาพในรูปแบบ Flex Message'}
                                </p>
                            </div>
                        </div>
                        <div className="card mb-3">
                            <div className="card-header"><h6>ความหน่วงในการส่ง</h6></div>
                            <div className="card-body">
                                <label>ระยะห่างการส่งรูปภาพ (มิลลิวินาที)</label>
                                <input type="range" className="slider" min={500} max={5000} step={500} value={config.sendDelay} onChange={(e) => setConfig(prev => ({ ...prev, sendDelay: parseInt(e.target.value) }))} disabled={!config.enabled || config.imageDisplayMode !== 'individual'} />
                                <div className="d-flex justify-content-between">
                                    <small className="text-muted">0.5 วินาที</small>
                                    <span className="badge badge-info">{config.sendDelay / 1000} วินาที</span>
                                    <small className="text-muted">5 วินาที</small>
                                </div>
                                <p className="text-muted small">ใช้เฉพาะเมื่อส่งรูปภาพทีละรูป เพื่อป้องกัน spam</p>
                            </div>
                        </div>
                    </div>}

                    {activeTab === 'advanced' && <div>
                        <div className="card mb-3">
                            <div className="card-header"><h6>การตั้งค่าขั้นสูง</h6></div>
                            <div className="card-body">
                                <div className="alert alert-warning">การเปลี่ยนแปลงการตั้งค่าเหล่านี้อาจส่งผลต่อประสิทธิภาพของระบบ</div>
                                <table className="table table-striped table-bordered">
                                    <tbody>
                                        <tr><td><strong>ขนาดไฟล์สูงสุด</strong></td><td>10 MB</td><td><span className="badge badge-secondary">ไม่สามารถเปลี่ยนแปลงได้</span></td></tr>
                                        <tr><td><strong>รูปแบบที่รองรับ</strong></td><td>JPG, PNG, GIF, WebP</td><td><span className="badge badge-secondary">ไม่สามารถเปลี่ยนแปลงได้</span></td></tr>
                                        <tr><td><strong>Timeout การส่ง</strong></td><td>30 วินาที</td><td><span className="badge badge-secondary">ไม่สามารถเปลี่ยนแปลงได้</span></td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="card mb-3">
                            <div className="card-header"><h6>การตรวจสอบ URL</h6></div>
                            <div className="card-body">
                                <label>รูปแบบ URL ที่ตรวจสอบ:</label>
                                <div className="border rounded p-3 bg-light">
                                    <code>hongthaipackaging.com/product/*<br/>www.hongthaipackaging.com/product/*<br/>*.com/product/*<br/>*.html</code>
                                </div>
                                <p className="text-muted small">ระบบจะตรวจสอบ URL ตามรูปแบบเหล่านี้</p>
                            </div>
                        </div>
                    </div>}

                    {activeTab === 'statistics' && <div>
                        <div className="card mb-3">
                            <div className="card-header"><h6>สถิติการใช้งาน</h6></div>
                            <div className="card-body">
                                <div className="component-grid">
                                    <div className="text-center p-3 bg-light rounded"><div className="h4 text-primary">0</div><small className="text-muted">ผู้ใช้ทั้งหมด</small></div>
                                    <div className="text-center p-3 bg-light rounded"><div className="h4 text-success">0</div><small className="text-muted">สินค้าทั้งหมด</small></div>
                                    <div className="text-center p-3 bg-light rounded"><div className="h4 text-info">0</div><small className="text-muted">รูปภาพที่ส่ง</small></div>
                                </div>
                                <hr />
                                <div className="text-center"><p className="text-muted mb-0">สถิติจะแสดงหลังจากที่มีการใช้งานระบบ</p></div>
                            </div>
                        </div>
                        <div className="card mb-3">
                            <div className="card-header"><h6>การทำงานล่าสุด</h6></div>
                            <div className="card-body text-center py-4">
                                <p className="text-muted">ยังไม่มีประวัติการทำงาน</p>
                            </div>
                        </div>
                    </div>}
                </div>
            </div>
            
            <div className="modal-footer">
                <div className="d-flex justify-content-between w-100">
                    <div><button type="button" className="btn btn-ghost" onClick={handleReset}><UndoIcon className="me-2" />รีเซ็ต</button></div>
                    <div className="d-flex gap-2">
                        <button type="button" className="btn btn-ghost" onClick={onHide} disabled={loading}>ยกเลิก</button>
                        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={loading}>
                            {loading ? <><LoadingSpinner /><span className="ms-2">กำลังบันทึก...</span></> : <><SaveIcon className="me-2" />บันทึกการตั้งค่า</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default ImageConfigurationModal;
