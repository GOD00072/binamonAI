// src/components/ModelInfoCard.tsx
import React from 'react';
import { Card, Badge, Button, Row, Col } from 'react-bootstrap';

interface ModelInfoCardProps {
    model: {
        name: string;
        displayName: string;
        description: string;
        version: string;
        inputTokenLimit: number;
        outputTokenLimit: number;
        isVisionCapable?: boolean;
        temperature?: number;
        topP?: number;
        topK?: number;
    };
    isActive?: boolean;
    isSelected?: boolean;
    onSelect?: (modelName: string) => void;
    onTest?: (modelName: string) => void;
    onSwitch?: (modelName: string) => void;
    showActions?: boolean;
}

const ModelInfoCard: React.FC<ModelInfoCardProps> = ({
    model,
    isActive = false,
    isSelected = false,
    onSelect,
    onTest,
    onSwitch,
    showActions = true
}) => {
    return (
        <Card 
            className={`h-100 ${isActive ? 'border-success' : isSelected ? 'border-primary' : ''}`}
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
            onClick={() => onSelect && onSelect(model.name)}
        >
            <Card.Body>
                <div className="d-flex justify-content-between align-items-start mb-2">
                    <h6 className="card-title mb-0">{model.displayName}</h6>
                    <div className="d-flex flex-column align-items-end">
                        {isActive && (
                            <Badge bg="success" className="mb-1">ใช้งานอยู่</Badge>
                        )}
                        {isSelected && !isActive && (
                            <Badge bg="primary" className="mb-1">เลือกอยู่</Badge>
                        )}
                        {model.isVisionCapable && (
                            <Badge bg="info">Vision</Badge>
                        )}
                    </div>
                </div>
                
                <p className="card-text small text-muted mb-3">{model.description}</p>
                
                <Row className="small mb-3">
                    <Col>
                        <div><strong>รุ่น:</strong> {model.version}</div>
                        <div><strong>Input:</strong> {model.inputTokenLimit.toLocaleString()} tokens</div>
                        <div><strong>Output:</strong> {model.outputTokenLimit.toLocaleString()} tokens</div>
                    </Col>
                </Row>

                {(model.temperature !== undefined || model.topP !== undefined || model.topK !== undefined) && (
                    <Row className="small mb-3">
                        <Col>
                            {model.temperature !== undefined && (
                                <div><strong>Temperature:</strong> {model.temperature}</div>
                            )}
                            {model.topP !== undefined && (
                                <div><strong>Top P:</strong> {model.topP}</div>
                            )}
                            {model.topK !== undefined && (
                                <div><strong>Top K:</strong> {model.topK}</div>
                            )}
                        </Col>
                    </Row>
                )}
                
                {showActions && (
                    <div className="d-flex gap-1 mt-auto">
                        {onTest && (
                            <Button 
                                variant="outline-info" 
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onTest(model.name);
                                }}
                            >
                                <i className="fas fa-flask me-1"></i>
                                ทดสอบ
                            </Button>
                        )}
                        
                        {onSwitch && !isActive && (
                            <Button 
                                variant="outline-primary" 
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSwitch(model.name);
                                }}
                            >
                                <i className="fas fa-exchange-alt me-1"></i>
                                เปลี่ยน
                            </Button>
                        )}
                    </div>
                )}
            </Card.Body>
        </Card>
    );
};

export default ModelInfoCard;