import React, { useState } from 'react';
import { Card, Button, Form, Badge, Alert, Spinner, Row, Col, Accordion } from 'react-bootstrap';
import { aiTestApi } from '../services/api';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    tokens?: { input: number; output: number; total: number };
    processingTime?: number;
    modelUsed?: string;
    language?: string;
  };
}

interface ChatOptions {
  useKnowledge: boolean;
  includeProducts: boolean;
  temperature: number;
  maxTokens: number;
  topK: number;
  topP: number;
  knowledgeTopK: number;
  knowledgeThreshold: number;
}

const ChatTestPage: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [error, setError] = useState<string | null>(null);

  // Chat options
  const [options, setOptions] = useState<ChatOptions>({
    useKnowledge: true,
    includeProducts: true,
    temperature: 0.7,
    maxTokens: 2000,
    topK: 60,
    topP: 0.6,
    knowledgeTopK: 5,
    knowledgeThreshold: 0.3,
  });

  // Statistics
  const [stats, setStats] = useState({
    totalMessages: 0,
    totalTokens: 0,
    averageProcessingTime: 0,
  });

  const sendMessage = async () => {
    if (!inputMessage.trim() || loading) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: inputMessage,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setLoading(true);
    setError(null);

    try {
      const response = await aiTestApi.chatTest({
        query: inputMessage,
        userId: sessionId,
        useKnowledge: options.useKnowledge,
        includeProducts: options.includeProducts,
        knowledgeOptions: {
          topK: options.knowledgeTopK,
          scoreThreshold: options.knowledgeThreshold,
        },
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
          topP: options.topP,
          topK: options.topK,
        },
      });

      if (response.success && response.data) {
        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now()}-ai`,
          role: 'assistant',
          content: response.data.response,
          timestamp: Date.now(),
          metadata: {
            tokens: response.data.tokens,
            processingTime: response.data.processingTime,
            modelUsed: response.data.metadata?.modelUsed,
            language: response.data.metadata?.language,
          },
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Update stats
        setStats((prev) => ({
          totalMessages: prev.totalMessages + 1,
          totalTokens: prev.totalTokens + (response.data.tokens?.total || 0),
          averageProcessingTime:
            (prev.averageProcessingTime * prev.totalMessages + response.data.processingTime) /
            (prev.totalMessages + 1),
        }));
      } else {
        throw new Error(response.error || 'Failed to get response');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Chat error:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setStats({
      totalMessages: 0,
      totalTokens: 0,
      averageProcessingTime: 0,
    });
    setError(null);
  };

  const exportChat = () => {
    const exportData = {
      sessionId,
      exportDate: new Date().toISOString(),
      messages,
      stats,
      options,
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chat-test-${sessionId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container-fluid mt-4">
      <Row>
        <Col lg={8}>
          <Card className="mb-4">
            <Card.Header className="bg-primary text-white d-flex justify-content-between align-items-center">
              <h5 className="mb-0">
                <i className="fas fa-comments me-2"></i>
                AI Chat Test
              </h5>
              <div>
                <Button variant="light" size="sm" onClick={exportChat} className="me-2">
                  <i className="fas fa-download me-1"></i>
                  Export
                </Button>
                <Button variant="danger" size="sm" onClick={clearChat}>
                  <i className="fas fa-trash me-1"></i>
                  Clear
                </Button>
              </div>
            </Card.Header>
            <Card.Body style={{ height: '500px', overflowY: 'auto' }}>
              {error && (
                <Alert variant="danger" dismissible onClose={() => setError(null)}>
                  <i className="fas fa-exclamation-circle me-2"></i>
                  {error}
                </Alert>
              )}

              {messages.length === 0 ? (
                <div className="text-center text-muted py-5">
                  <i className="fas fa-comment-slash fa-3x mb-3"></i>
                  <p>ยังไม่มีข้อความ เริ่มต้นทดสอบ AI ด้านล่าง</p>
                </div>
              ) : (
                <div>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`mb-3 ${msg.role === 'user' ? 'text-end' : 'text-start'}`}
                    >
                      <div
                        className={`d-inline-block p-3 rounded ${
                          msg.role === 'user'
                            ? 'bg-primary text-white'
                            : 'bg-light border'
                        }`}
                        style={{ maxWidth: '70%' }}
                      >
                        <div className="mb-1">
                          <small>
                            <Badge bg={msg.role === 'user' ? 'light' : 'primary'}>
                              {msg.role === 'user' ? 'You' : 'AI'}
                            </Badge>
                            <span className="ms-2 text-muted">
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </span>
                          </small>
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                        {msg.metadata && (
                          <div className="mt-2 pt-2 border-top">
                            <small className="text-muted">
                              {msg.metadata.tokens && (
                                <span className="me-2">
                                  <i className="fas fa-coins me-1"></i>
                                  {msg.metadata.tokens.total} tokens
                                </span>
                              )}
                              {msg.metadata.processingTime && (
                                <span className="me-2">
                                  <i className="fas fa-clock me-1"></i>
                                  {msg.metadata.processingTime}ms
                                </span>
                              )}
                              {msg.metadata.modelUsed && (
                                <span className="me-2">
                                  <i className="fas fa-robot me-1"></i>
                                  {msg.metadata.modelUsed}
                                </span>
                              )}
                              {msg.metadata.language && (
                                <span>
                                  <i className="fas fa-language me-1"></i>
                                  {msg.metadata.language}
                                </span>
                              )}
                            </small>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="text-center">
                      <Spinner animation="border" variant="primary" size="sm" />
                      <span className="ms-2 text-muted">AI กำลังคิด...</span>
                    </div>
                  )}
                </div>
              )}
            </Card.Body>
            <Card.Footer>
              <Form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
              >
                <div className="d-flex gap-2">
                  <Form.Control
                    type="text"
                    placeholder="พิมพ์ข้อความของคุณ..."
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    disabled={loading}
                  />
                  <Button type="submit" disabled={loading || !inputMessage.trim()}>
                    {loading ? (
                      <Spinner animation="border" size="sm" />
                    ) : (
                      <>
                        <i className="fas fa-paper-plane me-1"></i>
                        ส่ง
                      </>
                    )}
                  </Button>
                </div>
              </Form>
            </Card.Footer>
          </Card>

          {/* Statistics */}
          <Card>
            <Card.Header>
              <h6 className="mb-0">
                <i className="fas fa-chart-bar me-2"></i>
                สถิติ
              </h6>
            </Card.Header>
            <Card.Body>
              <Row>
                <Col md={4}>
                  <div className="text-center">
                    <h4>{stats.totalMessages}</h4>
                    <small className="text-muted">ข้อความทั้งหมด</small>
                  </div>
                </Col>
                <Col md={4}>
                  <div className="text-center">
                    <h4>{stats.totalTokens.toLocaleString()}</h4>
                    <small className="text-muted">Tokens ทั้งหมด</small>
                  </div>
                </Col>
                <Col md={4}>
                  <div className="text-center">
                    <h4>{Math.round(stats.averageProcessingTime)}ms</h4>
                    <small className="text-muted">เวลาเฉลี่ย</small>
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>

        {/* Settings Panel */}
        <Col lg={4}>
          <Card>
            <Card.Header className="bg-success text-white">
              <h6 className="mb-0">
                <i className="fas fa-cog me-2"></i>
                การตั้งค่า
              </h6>
            </Card.Header>
            <Card.Body>
              <Accordion defaultActiveKey="0">
                <Accordion.Item eventKey="0">
                  <Accordion.Header>RAG Settings</Accordion.Header>
                  <Accordion.Body>
                    <Form.Check
                      type="switch"
                      id="useKnowledge"
                      label="ใช้ Knowledge RAG"
                      checked={options.useKnowledge}
                      onChange={(e) =>
                        setOptions({ ...options, useKnowledge: e.target.checked })
                      }
                      className="mb-2"
                    />
                    <Form.Check
                      type="switch"
                      id="includeProducts"
                      label="ใช้ Product RAG"
                      checked={options.includeProducts}
                      onChange={(e) =>
                        setOptions({ ...options, includeProducts: e.target.checked })
                      }
                      className="mb-3"
                    />

                    {options.useKnowledge && (
                      <>
                        <Form.Group className="mb-2">
                          <Form.Label>Knowledge Top K: {options.knowledgeTopK}</Form.Label>
                          <Form.Range
                            min={1}
                            max={10}
                            value={options.knowledgeTopK}
                            onChange={(e) =>
                              setOptions({
                                ...options,
                                knowledgeTopK: parseInt(e.target.value),
                              })
                            }
                          />
                        </Form.Group>

                        <Form.Group>
                          <Form.Label>
                            Threshold: {options.knowledgeThreshold.toFixed(2)}
                          </Form.Label>
                          <Form.Range
                            min={0}
                            max={1}
                            step={0.05}
                            value={options.knowledgeThreshold}
                            onChange={(e) =>
                              setOptions({
                                ...options,
                                knowledgeThreshold: parseFloat(e.target.value),
                              })
                            }
                          />
                        </Form.Group>
                      </>
                    )}
                  </Accordion.Body>
                </Accordion.Item>

                <Accordion.Item eventKey="1">
                  <Accordion.Header>Generation Config</Accordion.Header>
                  <Accordion.Body>
                    <Form.Group className="mb-2">
                      <Form.Label>Temperature: {options.temperature.toFixed(2)}</Form.Label>
                      <Form.Range
                        min={0}
                        max={2}
                        step={0.1}
                        value={options.temperature}
                        onChange={(e) =>
                          setOptions({ ...options, temperature: parseFloat(e.target.value) })
                        }
                      />
                      <small className="text-muted">ควบคุมความสร้างสรรค์</small>
                    </Form.Group>

                    <Form.Group className="mb-2">
                      <Form.Label>Max Tokens: {options.maxTokens}</Form.Label>
                      <Form.Range
                        min={500}
                        max={35000}
                        step={500}
                        value={options.maxTokens}
                        onChange={(e) =>
                          setOptions({ ...options, maxTokens: parseInt(e.target.value) })
                        }
                      />
                    </Form.Group>

                    <Form.Group className="mb-2">
                      <Form.Label>Top K: {options.topK}</Form.Label>
                      <Form.Range
                        min={1}
                        max={100}
                        value={options.topK}
                        onChange={(e) =>
                          setOptions({ ...options, topK: parseInt(e.target.value) })
                        }
                      />
                    </Form.Group>

                    <Form.Group>
                      <Form.Label>Top P: {options.topP.toFixed(2)}</Form.Label>
                      <Form.Range
                        min={0}
                        max={1}
                        step={0.05}
                        value={options.topP}
                        onChange={(e) =>
                          setOptions({ ...options, topP: parseFloat(e.target.value) })
                        }
                      />
                    </Form.Group>
                  </Accordion.Body>
                </Accordion.Item>
              </Accordion>

              <div className="mt-3">
                <small className="text-muted">
                  <i className="fas fa-info-circle me-1"></i>
                  Session ID: {sessionId}
                </small>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ChatTestPage;
