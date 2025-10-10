
import React, { useState, useEffect } from 'react';
import { apiCall } from '../services/apiCore';
import { Card, Button, Modal, Form, Table, Alert, InputGroup, Spinner } from 'react-bootstrap';

interface LineOaConfig {
  id: string;
  name: string;
  channelId: string;
  channelSecret: string;
  channelAccessToken: string;
  createdAt: string;
  updatedAt: string;
  webhookUrl: string;
  contextWindowId?: string; // Added this property
}

interface ContextWindow {
  id: string;
  name: string;
}

const LineOaConfigPage: React.FC = () => {
  const [configs, setConfigs] = useState<LineOaConfig[]>([]);
  const [contextWindows, setContextWindows] = useState<ContextWindow[]>([]); // New state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<LineOaConfig | null>(null);
  const [formData, setFormData] = useState<Partial<LineOaConfig>>({
    name: '',
    channelId: '',
    channelSecret: '',
    channelAccessToken: '',
    contextWindowId: undefined
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [configsRes, contextWindowsRes] = await Promise.all([
        apiCall('/api/line-oa-configs'),
        apiCall('/api/context-window')
      ]);

      if (configsRes.success && configsRes.data) {
        setConfigs(configsRes.data.data);
      } else {
        throw new Error(configsRes.error || 'Failed to fetch LINE OA configs');
      }

      if (contextWindowsRes.success && contextWindowsRes.data) {
        setContextWindows(contextWindowsRes.data.data);
      } else {
        throw new Error(contextWindowsRes.error || 'Failed to fetch AI Personalities');
      }

      setError(null);
    } catch (err: any) {
      setError('Failed to fetch page data.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (config: LineOaConfig | null = null) => {
    setEditingConfig(config);
    if (config) {
      setFormData({
        id: config.id,
        name: config.name,
        channelId: config.channelId,
        channelSecret: '' /* Do not pre-fill secrets */,
        channelAccessToken: '' /* Do not pre-fill secrets */,
        contextWindowId: config.contextWindowId
      });
    } else {
      setFormData({ id: '', name: '', channelId: '', channelSecret: '', channelAccessToken: '', contextWindowId: undefined });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingConfig(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value === '' ? undefined : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const dataToSend: Partial<LineOaConfig> = { ...formData };
      if (editingConfig) {
        if (!formData.channelSecret) delete dataToSend.channelSecret;
        if (!formData.channelAccessToken) delete dataToSend.channelAccessToken;

        await apiCall(`/api/line-oa-configs/${editingConfig.id}`, {
          method: 'PUT',
          body: JSON.stringify(dataToSend)
        });
      } else {
        await apiCall('/api/line-oa-configs', {
          method: 'POST',
          body: JSON.stringify(dataToSend)
        });
      }
      fetchData();
      handleCloseModal();
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration.');
      console.error(err);
    }
  };

  const handleDelete = async (configId: string) => {
    if (window.confirm('Are you sure you want to delete this configuration?')) {
      try {
        await apiCall(`/api/line-oa-configs/${configId}`, { method: 'DELETE' });
        fetchData();
      } catch (err: any) {
        setError(err.message || 'Failed to delete configuration.');
        console.error(err);
      }
    }
  };

  return (
    <div className="container-fluid py-4">
        <h2 className="text-primary mb-4"><i className="fas fa-cog me-2" />LINE OA Configurations</h2>
        {error && <Alert variant="danger">{error}</Alert>}
        <Card className="shadow-sm">
            <Card.Header as="h5" className="d-flex justify-content-between align-items-center">
                Managed LINE OA Channels
                <Button variant="primary" onClick={() => handleOpenModal()}>
                    <i className="fas fa-plus me-2" /> Add New OA
                </Button>
            </Card.Header>
            <Card.Body>
                {isLoading ? (
                    <div className="text-center"><Spinner animation="border" /></div>
                ) : (
                    <Table responsive hover>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Channel ID</th>
                                <th>AI Personality</th>
                                <th>Webhook URL</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {configs.length > 0 ? (
                                configs.map(config => (
                                    <tr key={config.id}>
                                        <td>{config.name}</td>
                                        <td>{config.channelId}</td>
                                        <td>{contextWindows.find(cw => cw.id === config.contextWindowId)?.name || <span className="text-muted">Default</span>}</td>
                                        <td>
                                            <Button variant="outline-secondary" size="sm" onClick={() => navigator.clipboard.writeText(config.webhookUrl)}>
                                                <i className="fas fa-copy me-2" /> Copy Webhook URL
                                            </Button>
                                        </td>
                                        <td>
                                            <Button variant="outline-primary" size="sm" className="me-2" onClick={() => handleOpenModal(config)}><i className="fas fa-edit" /></Button>
                                            <Button variant="outline-danger" size="sm" onClick={() => handleDelete(config.id)}><i className="fas fa-trash" /></Button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="text-center text-muted">No configurations found.</td>
                                </tr>
                            )}
                        </tbody>
                    </Table>
                )}
            </Card.Body>
        </Card>

        <Modal show={isModalOpen} onHide={handleCloseModal} size="lg">
            <Modal.Header closeButton>
                <Modal.Title>{editingConfig ? 'Edit' : 'Add'} LINE OA Config</Modal.Title>
            </Modal.Header>
            <Form onSubmit={handleSubmit}>
                <Modal.Body>
                    <Form.Group className="mb-3">
                        <Form.Label>Name</Form.Label>
                        <Form.Control type="text" name="name" value={formData.name} onChange={handleInputChange} required />
                    </Form.Group>
                    <Form.Group className="mb-3">
                        <Form.Label>Channel ID</Form.Label>
                        <Form.Control type="text" name="channelId" value={formData.channelId} onChange={handleInputChange} required />
                    </Form.Group>
                    <Form.Group className="mb-3">
                        <Form.Label>Channel Secret</Form.Label>
                        <Form.Control type="password" name="channelSecret" value={formData.channelSecret} onChange={handleInputChange} placeholder={editingConfig ? "Leave blank to keep unchanged" : ""} required={!editingConfig} />
                    </Form.Group>
                    <Form.Group className="mb-3">
                        <Form.Label>Channel Access Token</Form.Label>
                        <Form.Control type="password" name="channelAccessToken" value={formData.channelAccessToken} onChange={handleInputChange} placeholder={editingConfig ? "Leave blank to keep unchanged" : ""} required={!editingConfig} />
                    </Form.Group>
                    <Form.Group className="mb-3">
                        <Form.Label>AI Personality</Form.Label>
                        <Form.Select name="contextWindowId" value={formData.contextWindowId || ''} onChange={handleInputChange}>
                            <option value="">Default</option>
                            {contextWindows.map(cw => (
                                <option key={cw.id} value={cw.id}>{cw.name}</option>
                            ))}
                        </Form.Select>
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleCloseModal}>Cancel</Button>
                    <Button variant="primary" type="submit">Save</Button>
                </Modal.Footer>
            </Form>
        </Modal>
    </div>
  );
};

export default LineOaConfigPage;

