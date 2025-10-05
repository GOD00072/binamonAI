import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Tabs, Tab, Card, Table, Button, Spinner, Alert, Modal, Form } from 'react-bootstrap';
import { knowledgeApi, Knowledge } from '../services/api';

const LANGUAGES = [
  { code: 'TH', name: '🇹🇭 Thai' },
  { code: 'EN', name: '🇬🇧 English' },
  { code: 'CN', name: '🇨🇳 Chinese' },
  { code: 'KR', name: '🇰🇷 Korean' },
  { code: 'JP', name: '🇯🇵 Japanese' },
];

const KnowledgeNamespacePage: React.FC = () => {
    const [activeTab, setActiveTab] = useState('TH');
    const [allKnowledge, setAllKnowledge] = useState<Knowledge[]>([]); // State สำหรับเก็บข้อมูลทั้งหมด
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    // State สำหรับ Modal ลบข้อมูล
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deletingDoc, setDeletingDoc] = useState<Knowledge | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    
    // State สำหรับ Modal แก้ไขข้อมูล
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingDoc, setEditingDoc] = useState<Knowledge | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [editFormData, setEditFormData] = useState({ file_name: '', category: '', tags: '' });

    // 1. ดึงข้อมูลทั้งหมดเพียงครั้งเดียวเมื่อ Component โหลด
    const fetchAllKnowledge = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await knowledgeApi.listAllKnowledge();
            if (response.success) {
                                 setAllKnowledge(response.data.knowledge);            } else {
                setAllKnowledge([]);
                setError('Failed to fetch documents.');
            }
        } catch (err) {
            setError('An error occurred while connecting to the server.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAllKnowledge();
    }, [fetchAllKnowledge]);

    // 2. กรองข้อมูลที่จะแสดงผลตาม activeTab โดยไม่ต้องเรียก API ใหม่
    const filteredKnowledge = useMemo(() => {
        return allKnowledge
            .filter(doc => doc.language === activeTab)
            .sort((a, b) => {
                const aTime = a.created_at ? new Date(a.created_at).getTime() : (a.createdAt ? a.createdAt : 0);
                const bTime = b.created_at ? new Date(b.created_at).getTime() : (b.createdAt ? b.createdAt : 0);
                return bTime - aTime;
            });
    }, [allKnowledge, activeTab]);


    // --- Handlers สำหรับการลบ ---
    const handleDeleteClick = (doc: Knowledge) => {
        setDeletingDoc(doc);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!deletingDoc) return;
        setIsDeleting(true);
        try {
            await knowledgeApi.deleteKnowledge(deletingDoc.id);
            setShowDeleteModal(false);
            fetchAllKnowledge(); // 3. Refresh ข้อมูลทั้งหมดหลังลบสำเร็จ
        } catch (err) {
            console.error("Delete failed", err);
        } finally {
            setIsDeleting(false);
        }
    };

    // --- Handlers สำหรับการแก้ไข ---
    const handleEditClick = (doc: Knowledge) => {
        setEditingDoc(doc);
        setEditFormData({
            file_name: doc.file_name || '',
            category: doc.category || '',
            tags: (doc.tags && Array.isArray(doc.tags)) ? doc.tags.join(', ') : ''
        });
        setShowEditModal(true);
    };

    const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setEditFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingDoc) return;

        setIsUpdating(true);
        try {
            await knowledgeApi.updateKnowledge(editingDoc.id, editFormData);
            setShowEditModal(false);
            fetchAllKnowledge(); // 4. Refresh ข้อมูลทั้งหมดหลังแก้ไขสำเร็จ
        } catch (err) {
            console.error("Update failed", err);
        } finally {
            setIsUpdating(false);
        }
    };

    const headerStyle = { backgroundColor: '#312783', color: '#FFFFFF' };

    return (
        <div>
            <h2 style={{color: '#312783'}} className="mb-4">
                <i className="fas fa-file-alt me-2"></i>Knowledge Document Management
            </h2>
            <Card>
                <Card.Header style={headerStyle}>
                    <Tabs id="language-tabs" activeKey={activeTab} onSelect={(k) => setActiveTab(k || 'TH')}>
                        {LANGUAGES.map(lang => (
                            <Tab eventKey={lang.code} title={lang.name} key={lang.code} />
                        ))}
                    </Tabs>
                </Card.Header>
                <Card.Body>
                    {loading && <div className="text-center"><Spinner style={{color: '#EF7D00'}} animation="border" /></div>}
                    {error && <Alert variant="danger">{error}</Alert>}
                    {!loading && !error && (
                        <Table striped bordered hover responsive>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Document Name</th>
                                    <th>Category</th>
                                    <th>Created At</th>
                                    <th className="text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredKnowledge.length > 0 ? filteredKnowledge.map((doc, index) => (
                                    <tr key={doc.id}>
                                        <td>{index + 1}</td>
                                        <td>{doc.file_name}</td>
                                        <td>{doc.category}</td>
                                        <td>{new Date(doc.created_at || doc.createdAt || '').toLocaleString()}</td>
                                        <td className="text-center">
                                            <Button variant="warning" size="sm" className="me-2" onClick={() => handleEditClick(doc)}>
                                                <i className="fas fa-edit"></i> Edit
                                            </Button>
                                            <Button variant="danger" size="sm" onClick={() => handleDeleteClick(doc)}>
                                                <i className="fas fa-trash-alt"></i> Delete
                                            </Button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="text-center">No documents found for this language.</td>
                                    </tr>
                                )}
                            </tbody>
                        </Table>
                    )}
                </Card.Body>
            </Card>

            {/* Edit Modal */}
            <Modal show={showEditModal} onHide={() => setShowEditModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title><i className="fas fa-edit text-warning me-2"></i>Edit Document</Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleUpdate}>
                    <Modal.Body>
                        <Form.Group className="mb-3">
                            <Form.Label>Document Name</Form.Label>
                            <Form.Control type="text" name="file_name" value={editFormData.file_name} onChange={handleEditFormChange} required />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Category</Form.Label>
                            <Form.Control type="text" name="category" value={editFormData.category} onChange={handleEditFormChange} required />
                        </Form.Group>
                        <Form.Group>
                            <Form.Label>Tags (comma-separated)</Form.Label>
                            <Form.Control type="text" name="tags" value={editFormData.tags} onChange={handleEditFormChange} />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowEditModal(false)}>Cancel</Button>
                        <Button variant="primary" type="submit" disabled={isUpdating} style={{backgroundColor: '#EF7D00', borderColor: '#EF7D00'}}>
                            {isUpdating ? <><Spinner as="span" size="sm"/> Saving...</> : 'Save Changes'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            {/* Delete Modal */}
            <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title><i className="fas fa-exclamation-triangle text-danger me-2"></i>Confirm Deletion</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    Are you sure you want to delete "<strong>{deletingDoc?.file_name}</strong>"? This action cannot be undone.
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
                    <Button variant="danger" onClick={confirmDelete} disabled={isDeleting}>
                        {isDeleting ? <><Spinner as="span" size="sm"/> Deleting...</> : 'Confirm Delete'}
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default KnowledgeNamespacePage;