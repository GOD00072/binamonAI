// src/components/ImageViewerModal.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner } from '../pages/DashboardModels/UIComponents';
import ImageIcon from '@mui/icons-material/Image';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/Upload';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import VisibilityIcon from '@mui/icons-material/Visibility';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

interface ImageData {
  filename: string;
  url?: string;
  localPath?: string;
  size?: number;
  selected?: boolean;
  selectionOrder?: number;
  isPrimary?: boolean;
  alt?: string;
  title?: string;
  status?: string;
  uploadedManually?: boolean;
  uploadedAt?: string;
}

interface ImageMetadata {
  alt?: string;
  title?: string;
  isPrimary?: boolean;
}

interface ImageViewerModalProps {
  show: boolean;
  onHide: () => void;
  images: ImageData[];
  productName: string;
  productUrl: string;
  onSelectionChange: (selectedImages: string[], imageOrder: { [key: string]: number }) => void;
  onSaveConfiguration: (config: {
    selectedImages: string[];
    imageOrder: { [key: string]: number };
  }) => Promise<void>;
  onUploadImages: (files: File[], metadata: ImageMetadata[]) => Promise<void>;
  onDeleteImage: (filename: string) => Promise<void>;
  maxSelectable?: number;
  maxUploadSize?: number;
  allowedFormats?: string[];
}

const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  show,
  onHide,
  images,
  productName,
  productUrl,
  onSelectionChange,
  onSaveConfiguration,
  onUploadImages,
  onDeleteImage,
  maxSelectable = 10,
  maxUploadSize = 5,
  allowedFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp']
}) => {
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [imageOrder, setImageOrder] = useState<{ [key: string]: number }>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterStatus, setFilterStatus] = useState<'all' | 'selected' | 'unselected'>('all');
  const [sortBy, setSortBy] = useState<'filename' | 'size' | 'uploadedAt' | 'selectionOrder'>('selectionOrder');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [imageLoadErrors, setImageLoadErrors] = useState<Set<string>>(new Set());
  
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadMetadata, setUploadMetadata] = useState<ImageMetadata[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const getImageUrl = useCallback((image: ImageData): string => {
    if (image.url) {
      return image.url;
    }
    if (image.filename) {
      const baseUrl = process.env.REACT_APP_API_URL || window.location.origin;
      if (image.uploadedManually || 
          image.filename.startsWith('manual_') || 
          image.filename.startsWith('upload_') ||
          (image.localPath && image.localPath.includes('products/images'))) {
        return `${baseUrl}/api/images/product/${image.filename}?t=${Date.now()}`;
      }
      return `${baseUrl}/api/images/product/${image.filename}?t=${Date.now()}`;
    }
    return '/placeholder-image.png';
  }, []);

  useEffect(() => {
    if (images.length > 0) {
      const selected = new Set<string>();
      const order: { [key: string]: number } = {};
      
      images.forEach(img => {
        if (img.selected) {
          selected.add(img.filename);
          if (img.selectionOrder !== undefined && img.selectionOrder !== null) {
            order[img.filename] = img.selectionOrder;
          }
        }
      });
      
      setSelectedImages(selected);
      setImageOrder(order);
    }
  }, [images]);

  useEffect(() => {
    onSelectionChange(Array.from(selectedImages), imageOrder);
  }, [selectedImages, imageOrder, onSelectionChange]);

  useEffect(() => {
    if (show) {
      setError(null);
      setSuccess(null);
      setImageLoadErrors(new Set());
    }
  }, [show]);

  const handleImageError = useCallback((filename: string) => {
    console.warn(`Failed to load image: ${filename}`);
    setImageLoadErrors(prev => {
      const newSet = new Set(prev);
      newSet.add(filename);
      return newSet;
    });
  }, []);

  const handleSaveConfiguration = async () => {
    try {
      setLoading(true);
      setError(null);
      
      await onSaveConfiguration({
        selectedImages: Array.from(selectedImages),
        imageOrder: imageOrder
      });
      
      setSuccess('บันทึกการตั้งค่าเรียบร้อย!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (filename: string) => {
    setSelectedImages(prev => {
      const newSet = new Set(prev);
      
      if (newSet.has(filename)) {
        newSet.delete(filename);
        setImageOrder(prevOrder => {
          const newOrder = { ...prevOrder };
          delete newOrder[filename];
          
          const remainingSelected = Array.from(newSet);
          remainingSelected.forEach((fname, index) => {
            newOrder[fname] = index + 1;
          });
          
          return newOrder;
        });
      } else {
        if (newSet.size >= maxSelectable) {
          setError(`สามารถเลือกได้สูงสุด ${maxSelectable} รูป`);
          setTimeout(() => setError(null), 3000);
          return prev;
        }
        
        newSet.add(filename);
        setImageOrder(prevOrder => ({
          ...prevOrder,
          [filename]: newSet.size
        }));
      }
      
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedImages.size === filteredImages.length) {
      setSelectedImages(new Set());
      setImageOrder({});
    } else {
      const imagesToSelect = filteredImages.slice(0, maxSelectable);
      const newSelected = new Set(imagesToSelect.map(img => img.filename));
      const newOrder: { [key: string]: number } = {};
      
      imagesToSelect.forEach((img, index) => {
        newOrder[img.filename] = index + 1;
      });
      
      setSelectedImages(newSelected);
      setImageOrder(newOrder);
    }
  };

  const handleResetToFirst3 = () => {
    const first3 = images.slice(0, Math.min(3, images.length));
    const newSelected = new Set(first3.map(img => img.filename));
    const newOrder: { [key: string]: number } = {};
    
    first3.forEach((img, index) => {
      newOrder[img.filename] = index + 1;
    });
    
    setSelectedImages(newSelected);
    setImageOrder(newOrder);
  };

  const handleDeleteImage = async (filename: string) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบรูปภาพ "${filename}"?`)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      await onDeleteImage(filename);
      
      setSelectedImages(prev => {
        const newSet = new Set(prev);
        newSet.delete(filename);
        return newSet;
      });
      
      setImageOrder(prev => {
        const newOrder = { ...prev };
        delete newOrder[filename];
        return newOrder;
      });
      
      setSuccess('ลบรูปภาพเรียบร้อย!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(`เกิดข้อผิดพลาดในการลบรูปภาพ: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    if (files.length === 0) return;
    
    const validFiles: File[] = [];
    const errors: string[] = [];
    
    files.forEach(file => {
      if (file.size > maxUploadSize * 1024 * 1024) {
        errors.push(`ขนาดไฟล์เกิน ${maxUploadSize}MB`);
        return;
      }
      
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (!extension || !allowedFormats.includes(extension)) {
        errors.push(`รูปแบบไฟล์ไม่ถูกต้อง (รองรับ: ${allowedFormats.join(', ')})`);
        return;
      }
      
      validFiles.push(file);
    });
    
    if (errors.length > 0) {
      setError(errors.join('\n'));
      return;
    }
    
    if (validFiles.length === 0) {
      setError('ไม่พบไฟล์ที่ถูกต้อง');
      return;
    }
    
    setUploadFiles(validFiles);
    setUploadMetadata(validFiles.map(file => ({ 
      alt: `รูปภาพ ${file.name}`, 
      title: `รูปภาพสินค้า ${productName}`, 
      isPrimary: false 
    })));
    setShowUploadForm(true);
    
    event.target.value = '';
  };

  const handleUploadSubmit = async () => {
    try {
      setIsUploading(true);
      setError(null);
      setUploadProgress(0);
      
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);
      
      await onUploadImages(uploadFiles, uploadMetadata);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      setTimeout(() => {
        setShowUploadForm(false);
        setUploadFiles([]);
        setUploadMetadata([]);
        setUploadProgress(0);
        setSuccess('อัปโหลดรูปภาพเรียบร้อย!');
        setTimeout(() => setSuccess(null), 3000);
      }, 500);
      
    } catch (err: any) {
      setError(`เกิดข้อผิดพลาดในการอัปโหลด: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const filteredImages = images
    .filter(img => {
      if (filterStatus === 'selected') return selectedImages.has(img.filename);
      if (filterStatus === 'unselected') return !selectedImages.has(img.filename);
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'size':
          return (b.size || 0) - (a.size || 0);
        case 'uploadedAt':
          return new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime();
        case 'selectionOrder':
          const aOrder = imageOrder[a.filename] || 999;
          const bOrder = imageOrder[b.filename] || 999;
          return aOrder - bOrder;
        default:
          return a.filename.localeCompare(b.filename);
      }
    });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getSelectionOrder = (filename: string): number | null => {
    return imageOrder[filename] || null;
  };

  if (!show) return null;

  return (
    <>
      <div className="modal" style={{display: 'block'}}>
        <div className="modal-content" style={{maxWidth: '90vw'}}>
            <div className="modal-header">
                <h3><ImageIcon className="me-2" />จัดการรูปภาพสินค้า</h3>
                <button onClick={onHide} className="btn-icon btn-ghost"><CloseIcon /></button>
            </div>
            
            <div className="modal-body p-0">
                <div className="p-4">
                    {error && <div className="alert alert-danger">{error}</div>}
                    {success && <div className="alert alert-success">{success}</div>}

                    <div className="card mb-4">
                        <div className="card-body component-grid">
                            <div className="input-group">
                                <label>แสดงผล</label>
                                <div className="btn-group">
                                    <button className={`btn ${viewMode === 'grid' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setViewMode('grid')}>Grid</button>
                                    <button className={`btn ${viewMode === 'list' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setViewMode('list')}>List</button>
                                </div>
                            </div>
                            <div className="input-group">
                                <label>กรอง</label>
                                <select className="input-field" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
                                    <option value="all">ทั้งหมด ({images.length})</option>
                                    <option value="selected">เลือกแล้ว ({selectedImages.size})</option>
                                    <option value="unselected">ยังไม่เลือก ({images.length - selectedImages.size})</option>
                                </select>
                            </div>
                            <div className="input-group">
                                <label>เรียงตาม</label>
                                <select className="input-field" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                                    <option value="selectionOrder">ลำดับการเลือก</option>
                                    <option value="filename">ชื่อไฟล์</option>
                                    <option value="size">ขนาดไฟล์</option>
                                    <option value="uploadedAt">วันที่อัปโหลด</option>
                                </select>
                            </div>
                            <div className="input-group">
                                <label>การจัดการ</label>
                                <div className="d-flex gap-2 flex-wrap">
                                    <button className="btn btn-outline" onClick={handleSelectAll}>{selectedImages.size === filteredImages.length && filteredImages.length > 0 ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}</button>
                                    <button className="btn btn-outline" onClick={handleResetToFirst3}>3 รูปแรก</button>
                                    <input type="file" multiple accept={allowedFormats.map(f => `.${f}`).join(',')} onChange={handleFileUpload} style={{ display: 'none' }} id="image-upload" />
                                    <button className="btn btn-primary" onClick={() => document.getElementById('image-upload')?.click()}><UploadIcon className="me-1" />อัปโหลด</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-body">
                            {filteredImages.length === 0 ? (
                            <div className="text-center py-5">
                                <h5 className="text-muted mb-2">{images.length === 0 ? 'ไม่มีรูปภาพ' : 'ไม่พบรูปภาพที่ตรงกับการกรอง'}</h5>
                                <p className="text-muted mb-4">{images.length === 0 ? 'อัปโหลดรูปภาพเพื่อเริ่มใช้งาน' : 'ลองเปลี่ยนตัวกรองหรือค้นหาใหม่'}</p>
                                {images.length === 0 && (
                                <button className="btn btn-primary" onClick={() => document.getElementById('image-upload')?.click()}><UploadIcon className="me-2" />อัปโหลดรูปภาพแรก</button>
                                )}
                            </div>
                            ) : (
                            <div className={viewMode === 'grid' ? 'component-grid' : ''}>
                                {filteredImages.map((image, index) => {
                                const isSelected = selectedImages.has(image.filename);
                                const selectionOrder = getSelectionOrder(image.filename);
                                const hasError = imageLoadErrors.has(image.filename);
                                const imageUrl = getImageUrl(image);
                                
                                if (viewMode === 'list') {
                                    return (
                                    <div key={image.filename} className={`d-flex align-items-center border-bottom py-3 ${isSelected ? 'bg-success-subtle' : ''}`}>
                                        <div className="col-md-2">
                                            <img src={imageUrl} alt={image.alt || image.filename} className="img-fluid rounded shadow-sm" style={{ height: '80px', width: '80px', objectFit: 'cover' }} onError={() => handleImageError(image.filename)} onClick={() => setPreviewImage(imageUrl)} role="button" />
                                            {isSelected && selectionOrder && <span className="badge badge-primary position-absolute top-0 start-0">{selectionOrder}</span>}
                                        </div>
                                        <div className="col-md-4">
                                            <h6 className="mb-1 fw-bold">{image.filename}</h6>
                                            <div className="small text-muted">
                                                {image.size && <span className="me-3">{formatFileSize(image.size)}</span>}
                                                {image.uploadedAt && <span>{new Date(image.uploadedAt).toLocaleDateString('th-TH')}</span>}
                                            </div>
                                        </div>
                                        <div className="col-md-3">
                                            {image.isPrimary && <span className="badge badge-warning me-1">หลัก</span>}
                                            {image.uploadedManually && <span className="badge badge-info me-1">อัปโหลด</span>}
                                            {isSelected && <span className="badge badge-success">เลือกแล้ว</span>}
                                        </div>
                                        <div className="col-md-3 d-flex gap-1 justify-content-end">
                                            <button className={`btn btn-sm ${isSelected ? "btn-success" : "btn-outline"}`} onClick={() => handleImageSelect(image.filename)}>{isSelected ? <><CheckIcon fontSize="small" />เลือกแล้ว</> : <><AddIcon fontSize="small" />เลือก</>}</button>
                                            <div className="dropdown">
                                                <button className="btn btn-sm btn-ghost dropdown-toggle" type="button" data-bs-toggle="dropdown"><MoreVertIcon /></button>
                                                <ul className="dropdown-menu">
                                                    <li><button className="dropdown-item" onClick={() => setPreviewImage(imageUrl)}><VisibilityIcon fontSize="small" className="me-2" />ดูเต็มจอ</button></li>
                                                    <li><button className="dropdown-item" onClick={() => window.open(imageUrl, '_blank')}><OpenInNewIcon fontSize="small" className="me-2" />เปิดในแท็บใหม่</button></li>
                                                    <li><hr className="dropdown-divider" /></li>
                                                    <li><button className="dropdown-item text-danger" onClick={() => handleDeleteImage(image.filename)}><DeleteIcon fontSize="small" className="me-2" />ลบรูปภาพ</button></li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                    );
                                }
                                
                                return (
                                    <div key={image.filename} className="card">
                                        <div className="position-relative overflow-hidden" style={{ height: '200px' }}>
                                            <img src={imageUrl} alt={image.alt || image.filename} className="h-100 w-100" style={{ objectFit: 'cover', cursor: 'pointer' }} onError={() => handleImageError(image.filename)} onClick={() => setPreviewImage(imageUrl)} />
                                            {isSelected && <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: 'rgba(25, 135, 84, 0.3)' }}><span className="badge badge-success fs-3">{selectionOrder}</span></div>}
                                            <div className="position-absolute top-0 end-0 p-2">
                                                {image.isPrimary && <span className="badge badge-warning me-1">หลัก</span>}
                                                {image.uploadedManually && <span className="badge badge-info">Upload</span>}
                                            </div>
                                        </div>
                                        <div className="card-body p-3">
                                            <div className="d-flex align-items-center justify-content-between mb-2">
                                                <h6 className="small mb-0 fw-bold text-truncate" title={image.filename}>{image.filename}</h6>
                                                {image.size && <span className="badge badge-light text-dark small">{formatFileSize(image.size)}</span>}
                                            </div>
                                            <div className="d-flex gap-1">
                                                <button className={`btn btn-sm flex-grow-1 ${isSelected ? "btn-success" : "btn-outline"}`} onClick={() => handleImageSelect(image.filename)}>{isSelected ? <><CheckIcon fontSize="small" />เลือกแล้ว</> : <><AddIcon fontSize="small" />เลือก</>}</button>
                                                <div className="dropdown">
                                                    <button className="btn btn-sm btn-ghost dropdown-toggle" type="button" data-bs-toggle="dropdown"><MoreVertIcon /></button>
                                                    <ul className="dropdown-menu">
                                                        <li><button className="dropdown-item" onClick={() => setPreviewImage(imageUrl)}><VisibilityIcon fontSize="small" className="me-2" />ดูเต็มจอ</button></li>
                                                        <li><button className="dropdown-item" onClick={() => window.open(imageUrl, '_blank')}><OpenInNewIcon fontSize="small" className="me-2" />เปิดในแท็บใหม่</button></li>
                                                        <li><hr className="dropdown-divider" /></li>
                                                        <li><button className="dropdown-item text-danger" onClick={() => handleDeleteImage(image.filename)}><DeleteIcon fontSize="small" className="me-2" />ลบ</button></li>
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                                })
                            }
                            </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="modal-footer">
                <div className="d-flex w-100 justify-content-between align-items-center">
                    <div>
                        <div className="small text-muted">เลือก <strong>{selectedImages.size}</strong> จาก <strong>{images.length}</strong> รูป (สูงสุด {maxSelectable} รูป)</div>
                        {selectedImages.size > 0 && <div className="small text-success"><CheckIcon fontSize="small" />พร้อมส่งรูปภาพ {selectedImages.size} รูป</div>}
                    </div>
                    <div className="d-flex gap-2">
                        <button type="button" className="btn btn-ghost" onClick={onHide} disabled={loading}>ปิด</button>
                        <button type="button" className="btn btn-primary" onClick={handleSaveConfiguration} disabled={loading || selectedImages.size === 0}>
                            {loading ? <><LoadingSpinner /><span className="ms-2">กำลังบันทึก...</span></> : <><SaveIcon className="me-2" />บันทึกการตั้งค่า ({selectedImages.size} รูป)</>}</button>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {showUploadForm && <div className="modal" style={{display: 'block'}}>
        <div className="modal-content">
            <div className="modal-header">
                <h3><UploadIcon className="me-2" />อัปโหลดรูปภาพใหม่</h3>
                <button onClick={() => !isUploading && setShowUploadForm(false)} className="btn-icon btn-ghost" disabled={isUploading}><CloseIcon /></button>
            </div>
            <div className="modal-body">
                {isUploading && (
                <div className="mb-4">
                    <div className="d-flex justify-content-between mb-2">
                        <span className="fw-bold">กำลังอัปโหลด...</span>
                        <span className="fw-bold text-primary">{uploadProgress}%</span>
                    </div>
                    <div className="progress"><div className="progress-bar" style={{width: `${uploadProgress}%`}}></div></div>
                    <div className="text-center mt-2"><small className="text-muted">กรุณารอสักครู่...</small></div>
                </div>
                )}
                
                <div className="mb-3">
                    <div className="d-flex align-items-center justify-content-between mb-3">
                        <h6 className="mb-0">ไฟล์ที่จะอัปโหลด ({uploadFiles.length} ไฟล์)</h6>
                        <span className="badge badge-info">รวม {uploadFiles.reduce((sum, file) => sum + file.size, 0) > 0 ? formatFileSize(uploadFiles.reduce((sum, file) => sum + file.size, 0)) : '0 B'}</span>
                    </div>
                    
                    <div className="border rounded p-3 bg-light">
                        {uploadFiles.map((file, index) => (
                        <div key={index} className="card mb-3">
                            <div className="card-body component-grid">
                                <div className="d-flex align-items-center">
                                    <div className="me-3"><ImageIcon /></div>
                                    <div>
                                        <div className="fw-bold small">{file.name}</div>
                                        <small className="text-muted">{formatFileSize(file.size)}</small>
                                    </div>
                                </div>
                                <div className="input-group">
                                    <label className="small fw-bold">ข้อความ Alt</label>
                                    <input type="text" className="input-field" value={uploadMetadata[index]?.alt || ''} onChange={(e) => { const newMetadata = [...uploadMetadata]; newMetadata[index] = { ...newMetadata[index], alt: e.target.value }; setUploadMetadata(newMetadata); }} placeholder="คำอธิบายรูปภาพ" disabled={isUploading} />
                                </div>
                                <div className="input-group">
                                    <label className="small fw-bold">Title</label>
                                    <input type="text" className="input-field" value={uploadMetadata[index]?.title || ''} onChange={(e) => { const newMetadata = [...uploadMetadata]; newMetadata[index] = { ...newMetadata[index], title: e.target.value }; setUploadMetadata(newMetadata); }} placeholder="หัวข้อรูปภาพ" disabled={isUploading} />
                                </div>
                                <div className="input-group">
                                    <label className="toggle"><input type="checkbox" checked={uploadMetadata[index]?.isPrimary || false} onChange={(e) => { const newMetadata = [...uploadMetadata]; newMetadata.forEach((meta, i) => { meta.isPrimary = i === index ? e.target.checked : false; }); setUploadMetadata(newMetadata); }} disabled={isUploading} /><span className="toggle-slider"></span></label>
                                    <label>กำหนดเป็นรูปภาพหลัก</label>
                                </div>
                            </div>
                        </div>
                        ))}
                    </div>
                </div>

                <div className="alert alert-info small">
                    <strong>ข้อมูลการอัปโหลด:</strong>
                    <ul className="mb-0 mt-1">
                        <li>ขนาดไฟล์สูงสุด: {maxUploadSize}MB ต่อไฟล์</li>
                        <li>รูปแบบที่รองรับ: {allowedFormats.join(', ').toUpperCase()}</li>
                        <li>รูปภาพจะถูกเพิ่มเข้าในรายการและสามารถเลือกใช้งานได้ทันที</li>
                    </ul>
                </div>
            </div>
            <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowUploadForm(false)} disabled={isUploading}>ยกเลิก</button>
                <button type="button" className="btn btn-primary" onClick={handleUploadSubmit} disabled={isUploading}>
                    {isUploading ? <><LoadingSpinner /><span className="ms-2">กำลังอัปโหลด...</span></> : <><UploadIcon className="me-2" />เริ่มอัปโหลด ({uploadFiles.length} ไฟล์)</>}</button>
            </div>
        </div>
      </div>} 

      {previewImage && <div className="modal" style={{display: 'block'}}>
        <div className="modal-content">
            <div className="modal-header">
                <h3>ดูรูปภาพ</h3>
                <button onClick={() => setPreviewImage(null)} className="btn-icon btn-ghost"><CloseIcon /></button>
            </div>
            <div className="modal-body text-center p-1">
                <img src={previewImage} alt="Preview" className="img-fluid rounded shadow" style={{ maxHeight: '80vh', maxWidth: '100%' }} />
            </div>
            <div className="modal-footer justify-content-center">
                <button className="btn btn-ghost" onClick={() => setPreviewImage(null)}>ปิด</button>
                <button className="btn btn-primary" onClick={() => window.open(previewImage, '_blank')}><OpenInNewIcon className="me-2" />เปิดในแท็บใหม่</button>
            </div>
        </div>
      </div>}
   </>
 );
};

export default ImageViewerModal;
