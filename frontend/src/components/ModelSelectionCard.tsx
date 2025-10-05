// src/components/ModelSelectionCard.tsx
import React from 'react';
import { Card, Badge, Row, Col, Button } from 'react-bootstrap';

interface ModelInfo {
    name: string;
    displayName: string;
    description: string;
    version: string;
    inputTokenLimit: number;
    outputTokenLimit: number;
    supportedMethods: string[];
    apiVersion: string;
    useDirectUrl: boolean;
    category: string;
    recommended: boolean;
}

interface ModelSelectionCardProps {
    model: ModelInfo;
    isActive: boolean;
    isSelected: boolean;
    onSelect: (modelName: string) => void;
    onTest: (modelName: string) => void;
    onSwitch?: (modelName: string) => void;
}

const ModelSelectionCard: React.FC<ModelSelectionCardProps> = ({
    model,
    isActive,
    isSelected,
    onSelect,
    onTest,
    onSwitch
}) => {
    const formatTokenLimit = (limit: number): string => {
        if (limit > 1000000) {
            return (limit / 1000000).toFixed(1) + 'M';
        } else if (limit > 1000) {
            return (limit / 1000).toFixed(0) + 'K';
        }
        return limit.toString();
    };

    const getCategoryBadgeClass = (category: string): string => {
        const categoryLower = category.toLowerCase();
        switch (categoryLower) {
            case 'professional':
                return 'bg-primary';
            case 'fast':
                return 'bg-warning text-dark';
            case 'standard':
                return 'bg-secondary';
            default:
                return 'bg-info';
        }
    };

    const handleCardClick = () => {
        onSelect(model.name);
    };

    const handleTestClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onTest(model.name);
    };

    const handleSwitchClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onSwitch) {
            onSwitch(model.name);
        }
    };

    return (
        <Card 
            className={`h-100 model-card ${isSelected ? 'border-primary bg-light' : ''} ${model.recommended ? 'border-success' : ''}`}
            style={{ 
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                borderWidth: isSelected ? '2px' : '1px',
                transform: isSelected ? 'translateY(-2px)' : 'none',
                boxShadow: isSelected ? '0 4px 8px rgba(0,0,0,0.15)' : 'none'
            }}
            onClick={handleCardClick}
        >
            <Card.Header className="d-flex justify-content-between align-items-center">
                <h6 className="mb-0">{model.displayName}</h6>
                <div className="d-flex gap-1">
                    {model.recommended && (
                        <Badge bg="success">
                            <i className="fas fa-star me-1"></i>
                            แนะนำ
                        </Badge>
                    )}
                    {isActive && (
                        <Badge bg="primary">
                            <i className="fas fa-check-circle me-1"></i>
                            ใช้งานอยู่
                        </Badge>
                    )}
                    {isSelected && !isActive && (
                        <Badge bg="warning" text="dark">
                            <i className="fas fa-mouse-pointer me-1"></i>
                            เลือกอยู่
                        </Badge>
                    )}
                </div>
            </Card.Header>
            
            <Card.Body>
                <div className="mb-2">
                    <Badge className={getCategoryBadgeClass(model.category)}>
                        {model.category}
                    </Badge>
                    <Badge bg="secondary" className="ms-1">
                        {model.apiVersion}
                    </Badge>
                    {model.useDirectUrl && (
                        <Badge bg="info" className="ms-1">Direct API</Badge>
                    )}
                </div>
                
                <p className="card-text small text-muted mb-3" style={{ minHeight: '40px' }}>
                    {model.description}
                </p>
                
                <Row className="small mb-3">
                    <Col xs={6}>
                        <div className="d-flex align-items-center">
                            <i className="fas fa-arrow-down text-primary me-1"></i>
                            <strong>Input:</strong>
                            <span className="ms-1">{formatTokenLimit(model.inputTokenLimit)}</span>
                        </div>
                    </Col>
                    <Col xs={6}>
                        <div className="d-flex align-items-center">
                            <i className="fas fa-arrow-up text-success me-1"></i>
                            <strong>Output:</strong>
                            <span className="ms-1">{formatTokenLimit(model.outputTokenLimit)}</span>
                        </div>
                    </Col>
                </Row>

                {/* Model Features */}
                <div className="mb-2">
                    <div className="small text-muted">
                        <i className="fas fa-cog me-1"></i>
                        <strong>Methods:</strong> {model.supportedMethods.join(', ')}
                    </div>
                </div>
            </Card.Body>
            
            <Card.Footer className="bg-transparent">
                <div className="d-flex gap-2">
                    <Button 
                        size="sm" 
                        variant="outline-primary" 
                        className="flex-fill"
                        onClick={handleTestClick}
                    >
                        <i className="fas fa-flask me-1"></i>
                        ทดสอบ
                    </Button>
                    {!isActive && onSwitch && (
                        <Button 
                            size="sm" 
                            variant={isSelected ? "primary" : "outline-secondary"} 
                           onClick={handleSwitchClick}
                       >
                           <i className="fas fa-exchange-alt me-1"></i>
                           {isSelected ? 'เลือกใช้' : 'เลือก'}
                       </Button>
                   )}
               </div>
           </Card.Footer>
       </Card>
   );
};

export default ModelSelectionCard;