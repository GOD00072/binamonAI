import React, { useState } from 'react';
import { Form, Button, Card, Row, Col, Spinner, Alert } from 'react-bootstrap';
import { knowledgeApi } from '../services/api';

// แปลชื่อภาษาเป็นภาษาไทย
const LANGUAGES = [
  { code: 'TH', name: '🇹🇭 ไทย' },
  { code: 'EN', name: '🇬🇧 อังกฤษ' },
  { code: 'CN', name: '🇨🇳 จีน' },
  { code: 'KR', name: '🇰🇷 เกาหลี' },
  { code: 'JP', name: '🇯🇵 ญี่ปุ่น' },
];

const KnowledgeUploadPage: React.FC = () => {
  // State สำหรับการอัปโหลดไฟล์
  const [file, setFile] = useState<File | null>(null);
  const [fileForm, setFileForm] = useState({ language: 'TH', category: '', customName: '', description: '', tags: '' });
  const [fileLoading, setFileLoading] = useState(false);
  const [fileResult, setFileResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // State สำหรับการเพิ่มข้อความ
  const [textForm, setTextForm] = useState({ language: 'TH', category: '', file_name: '', text: '', tags: '' });
  const [textLoading, setTextLoading] = useState(false);
  const [textResult, setTextResult] = useState<{ success: boolean; message: string } | null>(null);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !fileForm.category || !fileForm.customName) {
      setFileResult({ success: false, message: 'กรุณาระบุภาษา, หมวดหมู่ และชื่อเอกสาร' });
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('language', fileForm.language);
    formData.append('category', fileForm.category);
    formData.append('customName', fileForm.customName);
    formData.append('description', fileForm.description);
    formData.append('tags', fileForm.tags);

    setFileLoading(true);
    setFileResult(null);
    try {
      const response = await knowledgeApi.uploadFile(formData);
      if (response.success) {
                 setFileResult({ success: true, message: `อัปโหลดและประมวลผลสำเร็จ ${response.data.chunks} ส่วน` });      } else {
        setFileResult({ success: false, message: response.error || 'การอัปโหลดล้มเหลว' });
      }
    } catch (error: any) {
      setFileResult({ success: false, message: error.response?.data?.error || 'เกิดข้อผิดพลาด' });
    } finally {
      setFileLoading(false);
    }
  };

  const handleTextAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textForm.category || !textForm.file_name || !textForm.text) {
      setTextResult({ success: false, message: 'กรุณาระบุภาษา, หมวดหมู่, ชื่อไฟล์ และเนื้อหา' });
      return;
    }

    setTextLoading(true);
    setTextResult(null);
    try {
      const response = await knowledgeApi.addText(textForm);
      if (response.success) {
                 setTextResult({ success: true, message: `เพิ่มองค์ความรู้สำเร็จ มี ${response.data.chunks} ส่วน` });      } else {
        setTextResult({ success: false, message: response.error || 'ไม่สามารถเพิ่มข้อความได้' });
      }
    } catch (error: any) {
      setTextResult({ success: false, message: error.response?.data?.error || 'เกิดข้อผิดพลาด' });
    } finally {
      setTextLoading(false);
    }
  };
  
  const headerStyle = {
    backgroundColor: '#312783',
    color: '#FFFFFF'
  };

  const buttonStyle = {
    backgroundColor: '#EF7D00',
    borderColor: '#EF7D00',
  };

  return (
    <div>
       <h2 style={{color: '#312783'}} className="mb-4"><i className="fas fa-plus-circle me-2"></i>เพิ่มองค์ความรู้ใหม่</h2>
       <Row>
         <Col md={6}>
           <Card>
             <Card.Header as="h5" style={headerStyle}>
               <i className="fas fa-file-upload me-2"></i>อัปโหลดไฟล์องค์ความรู้
             </Card.Header>
             <Card.Body>
                <Form onSubmit={handleFileUpload}>
                   <Form.Group className="mb-3">
                     <Form.Label>ภาษา</Form.Label>
                     <Form.Select value={fileForm.language} onChange={e => setFileForm({...fileForm, language: e.target.value})}>
                       {LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
                     </Form.Select>
                   </Form.Group>
                   <Form.Group className="mb-3">
                     <Form.Label>หมวดหมู่</Form.Label>
                     <Form.Control type="text" placeholder="เช่น ข้อมูลสินค้า, คำถามที่พบบ่อย" required value={fileForm.category} onChange={e => setFileForm({...fileForm, category: e.target.value})} />
                   </Form.Group>
                   <Form.Group className="mb-3">
                     <Form.Label>ชื่อเอกสาร</Form.Label>
                     <Form.Control type="text" placeholder="ชื่อเฉพาะสำหรับเอกสารนี้" required value={fileForm.customName} onChange={e => setFileForm({...fileForm, customName: e.target.value})} />
                   </Form.Group>
                   <Form.Group className="mb-3">
                     <Form.Label>ไฟล์</Form.Label>
                     <Form.Control type="file" required onChange={handleFileChange} accept=".txt,.pdf,.doc,.docx" />
                     <Form.Text>รูปแบบที่รองรับ: .txt, .pdf, .doc, .docx</Form.Text>
                   </Form.Group>
                    <Form.Group className="mb-3">
                     <Form.Label>แท็ก (คั่นด้วยจุลภาค)</Form.Label>
                     <Form.Control type="text" placeholder="เช่น ภายใน, v2" value={fileForm.tags} onChange={e => setFileForm({...fileForm, tags: e.target.value})} />
                   </Form.Group>
                   <Button variant="primary" type="submit" disabled={fileLoading} style={buttonStyle}>
                     {fileLoading ? <><Spinner as="span" animation="border" size="sm" /> กำลังอัปโหลด...</> : 'อัปโหลดไฟล์'}
                   </Button>
                 </Form>
                 {fileResult && <Alert variant={fileResult.success ? 'success' : 'danger'} className="mt-3">{fileResult.message}</Alert>}
             </Card.Body>
           </Card>
         </Col>
         <Col md={6}>
           <Card>
             <Card.Header as="h5" style={headerStyle}>
               <i className="fas fa-paste me-2"></i>เพิ่มองค์ความรู้ด้วยข้อความ
             </Card.Header>
             <Card.Body>
               <Form onSubmit={handleTextAdd}>
                  <Form.Group className="mb-3">
                     <Form.Label>ภาษา</Form.Label>
                     <Form.Select value={textForm.language} onChange={e => setTextForm({...textForm, language: e.target.value})}>
                       {LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
                     </Form.Select>
                   </Form.Group>
                  <Form.Group className="mb-3">
                     <Form.Label>หมวดหมู่</Form.Label>
                     <Form.Control type="text" placeholder="เช่น โน้ตชั่วคราว" required value={textForm.category} onChange={e => setTextForm({...textForm, category: e.target.value})} />
                   </Form.Group>
                   <Form.Group className="mb-3">
                     <Form.Label>ชื่อไฟล์ (สำหรับอ้างอิง)</Form.Label>
                     <Form.Control type="text" placeholder="ชื่อสำหรับระบุกลุ่มข้อความนี้" required value={textForm.file_name} onChange={e => setTextForm({...textForm, file_name: e.target.value})} />
                   </Form.Group>
                   <Form.Group className="mb-3">
                     <Form.Label>เนื้อหา</Form.Label>
                     <Form.Control as="textarea" rows={5} required value={textForm.text} onChange={e => setTextForm({...textForm, text: e.target.value})} />
                   </Form.Group>
                   <Button variant="primary" type="submit" disabled={textLoading} style={buttonStyle}>
                     {textLoading ? <><Spinner as="span" animation="border" size="sm" /> กำลังบันทึก...</> : 'บันทึกองค์ความรู้'}
                   </Button>
               </Form>
               {textResult && <Alert variant={textResult.success ? 'success' : 'danger'} className="mt-3">{textResult.message}</Alert>}
             </Card.Body>
           </Card>
         </Col>
       </Row>
    </div>
  );
};

export default KnowledgeUploadPage;