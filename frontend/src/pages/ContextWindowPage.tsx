import React, { useState, useEffect } from 'react';
import { apiCall } from '../services/apiCore';
import { Card, Button, Modal, Form, Table, Alert, Spinner, Badge } from 'react-bootstrap';

interface ContextWindow {
  id: string;
  name: string;
  system_prompt: string;
  model_name: string;
  temperature: number;
  max_tokens: number;
  image_model_name?: string;
  image_prompt?: string;
  text_api_key?: string;
  image_api_key?: string;
}

interface GeminiModel {
  name: string;
  displayName: string;
}

const ContextWindowPage: React.FC = () => {
  const [configs, setConfigs] = useState<ContextWindow[]>([]);
  const [geminiModels, setGeminiModels] = useState<GeminiModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ContextWindow | null>(null);
  const [formData, setFormData] = useState<Partial<ContextWindow>>({
    name: '',
    system_prompt: '',
    model_name: 'gpt-4',
    temperature: 0.7,
    max_tokens: 2000,
    image_model_name: 'gemini-pro-vision',
    image_prompt: '',
    text_api_key: '',
    image_api_key: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const configsRes = await apiCall('/api/context-window');

      if (configsRes.success && configsRes.data) {
        setConfigs(configsRes.data.data);
      } else {
        throw new Error(configsRes.error || 'Failed to fetch AI Personalities');
      }

    } catch (err: any) {
      setError('Failed to fetch page data.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchModels = async (apiKey: string) => {
    if (!apiKey) {
      setError('Please enter an API key to load models.');
      return;
    }
    try {
      const modelsRes = await apiCall('/api/gemini/models/fetch', {
        method: 'POST',
        body: JSON.stringify({ apiKey }),
      });

      if (modelsRes.success && modelsRes.data && modelsRes.data.models) {
        setGeminiModels(modelsRes.data.models.all || []);
        setError(null);
      } else {
        throw new Error(modelsRes.error || 'Failed to fetch Gemini models with the provided key.');
      }
    } catch (err: any) {
      setError(err.message);
      setGeminiModels([]); // Clear models on error
    }
  };

  const handleOpenModal = (config: ContextWindow | null = null) => {
    setEditingConfig(config);
    if (config) {
      setFormData(config);
    } else {
      setFormData({ name: '', system_prompt: '', model_name: 'gpt-4', temperature: 0.7, max_tokens: 2000, image_model_name: 'gemini-pro-vision', image_prompt: '' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingConfig(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const isNumber = ['temperature', 'max_tokens'].includes(name);
    setFormData(prev => ({ ...prev, [name]: isNumber ? Number(value) : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingConfig) {
        await apiCall(`/api/context-window/${editingConfig.id}`, { method: 'PUT', body: JSON.stringify(formData) });
      } else {
        await apiCall('/api/context-window', { method: 'POST', body: JSON.stringify(formData) });
      }
      fetchData();
      handleCloseModal();
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration.');
    }
  };

  const handleDelete = async (configId: string) => {
    if (window.confirm('Are you sure you want to delete this AI Personality?')) {
      try {
        await apiCall(`/api/context-window/${configId}`, { method: 'DELETE' });
        fetchData();
      } catch (err: any) {
        setError(err.message || 'Failed to delete configuration.');
      }
    }
  };

  return (
    <div className="container-fluid py-4">
      <h2 className="text-primary mb-4"><i className="fas fa-brain me-2" />AI Personalities (Context Windows)</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      <Card className="shadow-sm">
        <Card.Header as="h5" className="d-flex justify-content-between align-items-center">
          Manage AI Personalities
          <Button variant="primary" onClick={() => handleOpenModal()}>
            <i className="fas fa-plus me-2" /> Create New Personality
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
                  <th>System Prompt</th>
                  <th>Text Model</th>
                  <th>Image Model</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {configs.length > 0 ? (
                  configs.map(config => (
                    <tr key={config.id}>
                      <td>{config.name}</td>
                      <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxWidth: '400px' }}>{config.system_prompt}</td>
                      <td><Badge bg="info">{config.model_name}</Badge></td>
                      <td><Badge bg="secondary">{config.image_model_name}</Badge></td>
                      <td>
                        <Button variant="outline-primary" size="sm" className="me-2" onClick={() => handleOpenModal(config)}><i className="fas fa-edit" /></Button>
                        <Button variant="outline-danger" size="sm" onClick={() => handleDelete(config.id)}><i className="fas fa-trash" /></Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center text-muted">No AI Personalities found.</td>
                  </tr>
                )}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      <Modal show={isModalOpen} onHide={handleCloseModal} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{editingConfig ? 'Edit' : 'Create'} AI Personality</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Personality Name</Form.Label>
              <Form.Control type="text" name="name" value={formData.name} onChange={handleInputChange} required />
            </Form.Group>
            <hr />
            <h5 className="mt-4">Text Generation</h5>
            <Form.Group className="mb-3">
              <Form.Label>System Prompt</Form.Label>
              <Form.Control as="textarea" rows={5} name="system_prompt" value={formData.system_prompt} onChange={handleInputChange} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Text Model Name</Form.Label>
              <Form.Select name="model_name" value={formData.model_name} onChange={handleInputChange} required>
                {geminiModels.map(model => (
                  <option key={model.name} value={model.name}>{model.displayName}</option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Text Model API Key (Optional)</Form.Label>
              <div className="input-group">
                <Form.Control type="password" name="text_api_key" value={formData.text_api_key || ''} onChange={handleInputChange} placeholder="Leave blank to use default system key" />
                <Button variant="outline-secondary" onClick={() => fetchModels(formData.text_api_key || '')}>Load Models</Button>
              </div>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Temperature</Form.Label>
              <Form.Control type="number" step="0.1" name="temperature" value={formData.temperature} onChange={handleInputChange} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Max Tokens</Form.Label>
              <Form.Control type="number" step="1" name="max_tokens" value={formData.max_tokens} onChange={handleInputChange} required />
            </Form.Group>
            <hr />
            <h5 className="mt-4">Image Analysis</h5>
            <Form.Group className="mb-3">
              <Form.Label>Image Analysis Model</Form.Label>
              <Form.Select name="image_model_name" value={formData.image_model_name} onChange={handleInputChange}>
                {geminiModels.map(model => (
                  <option key={model.name} value={model.name}>{model.displayName}</option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Image Model API Key (Optional)</Form.Label>
              <Form.Control type="password" name="image_api_key" value={formData.image_api_key || ''} onChange={handleInputChange} placeholder="Leave blank to use default system key" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Image Analysis Prompt</Form.Label>
              <Form.Control as="textarea" rows={3} name="image_prompt" value={formData.image_prompt || ''} onChange={handleInputChange} />
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

export default ContextWindowPage;