import React, { useState } from 'react';
import { Form, Button, Card, Table, Row, Col } from 'react-bootstrap';
import { formatStockStatus, formatInterestLevel, formatMovementHistory, formatHotScore, formatSlowMoveCategory } from '../../utils/formatters';

interface SearchFilters {
  query: string;
  category: string;
  minStock: string;
  maxStock: string;
  minRelevance: string;
  maxRelevance: string;
  minSalesVelocity: string;
  maxSalesVelocity: string;
  interestLevel: string;
  movementLevel: string;
  slowMoveCategory: string;
  hasStockHistory: boolean;
  needsSync: boolean;
}

interface Props {
  loading: boolean;
  onSearch: (filters: SearchFilters) => void;
  results: any[];
  filters: SearchFilters;
  onSync: (sku: string) => void;
}

const AdvancedSearchTab: React.FC<Props> = ({ loading, onSearch, results, filters, onSync }) => {
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(filters);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchFilters);
  };

  const handleClear = () => {
    setSearchFilters({
      query: '',
      category: '',
      minStock: '',
      maxStock: '',
      minRelevance: '',
      maxRelevance: '',
      minSalesVelocity: '',
      maxSalesVelocity: '',
      interestLevel: '',
      movementLevel: '',
      slowMoveCategory: '',
      hasStockHistory: false,
      needsSync: false
    });
  };

  return (
    <div>
      <Card className="mb-4">
        <Card.Header>
          <h5>🔍 Advanced Search</h5>
        </Card.Header>
        <Card.Body>
          <Form onSubmit={handleSubmit}>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Search</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Product name, category, SKU"
                    value={searchFilters.query}
                    onChange={(e) => setSearchFilters({ ...searchFilters, query: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Category</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Category name"
                    value={searchFilters.category}
                    onChange={(e) => setSearchFilters({ ...searchFilters, category: e.target.value })}
                  />
                </Form.Group>
              </Col>
            </Row>

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Stock Range</Form.Label>
                  <Row>
                    <Col>
                      <Form.Control
                        type="number"
                        placeholder="Min"
                        min="0"
                        value={searchFilters.minStock}
                        onChange={(e) => setSearchFilters({ ...searchFilters, minStock: e.target.value })}
                      />
                    </Col>
                    <Col>
                      <Form.Control
                        type="number"
                        placeholder="Max"
                        min="0"
                        value={searchFilters.maxStock}
                        onChange={(e) => setSearchFilters({ ...searchFilters, maxStock: e.target.value })}
                      />
                    </Col>
                  </Row>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Relevance Range</Form.Label>
                  <Row>
                    <Col>
                      <Form.Control
                        type="number"
                        placeholder="0.0"
                        step="0.01"
                        min="0"
                        max="1"
                        value={searchFilters.minRelevance}
                        onChange={(e) => setSearchFilters({ ...searchFilters, minRelevance: e.target.value })}
                      />
                    </Col>
                    <Col>
                      <Form.Control
                        type="number"
                        placeholder="1.0"
                        step="0.01"
                        min="0"
                        max="1"
                        value={searchFilters.maxRelevance}
                        onChange={(e) => setSearchFilters({ ...searchFilters, maxRelevance: e.target.value })}
                      />
                    </Col>
                  </Row>
                </Form.Group>
              </Col>
            </Row>

            <Row>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Interest Level</Form.Label>
                  <Form.Select
                    value={searchFilters.interestLevel}
                    onChange={(e) => setSearchFilters({ ...searchFilters, interestLevel: e.target.value })}
                  >
                    <option value="">All</option>
                    <option value="high">High ({'>'}0.7)</option>
                    <option value="medium">Medium (0.5-0.7)</option>
                    <option value="low">Low (0.25-0.5)</option>
                    <option value="none">None (≤0.25)</option>
                    <option value="quality">Quality ({'>'}0.25)</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Movement Level</Form.Label>
                  <Form.Select
                    value={searchFilters.movementLevel}
                    onChange={(e) => setSearchFilters({ ...searchFilters, movementLevel: e.target.value })}
                  >
                    <option value="">All</option>
                    <option value="high">High ({'>'}50/day)</option>
                    <option value="medium">Medium (10-50/day)</option>
                    <option value="low">Low (0-10/day)</option>
                    <option value="none">None (0/day)</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Slow Move Category</Form.Label>
                  <Form.Select
                    value={searchFilters.slowMoveCategory}
                    onChange={(e) => setSearchFilters({ ...searchFilters, slowMoveCategory: e.target.value })}
                  >
                    <option value="">All</option>
                    <option value="normal">Normal (≤60 วัน)</option>
                    <option value="slow-move">Slow Move (61-90 วัน)</option>
                    <option value="very-slow-1">Very Slow #1 (91-120 วัน)</option>
                    <option value="very-slow-2">Very Slow #2 (121-150 วัน)</option>
                    <option value="very-slow-3">Very Slow #3 (151-180 วัน)</option>
                    <option value="dead-stock">Dead Stock ({'>'}180 วัน)</option>
                    <option value="no-data">No Data</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label="Has Stock History"
                checked={searchFilters.hasStockHistory}
                onChange={(e) => setSearchFilters({ ...searchFilters, hasStockHistory: e.target.checked })}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label="Needs Sync"
                checked={searchFilters.needsSync}
                onChange={(e) => setSearchFilters({ ...searchFilters, needsSync: e.target.checked })}
              />
            </Form.Group>

            <div className="text-end">
              <Button variant="secondary" className="me-2" onClick={handleClear}>
                🧹 Clear
              </Button>
              <Button variant="primary" type="submit" disabled={loading}>
                🔍 Search
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>

      {/* Search Results */}
      {results.length > 0 && (
        <Card>
          <Card.Header>
            <div className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Search Results ({results.length})</h5>
              <Button
                variant="primary"
                size="sm"
                onClick={() => results.forEach(p => p.sku && onSync(p.sku))}
              >
                🔄 Sync All Results
              </Button>
            </div>
          </Card.Header>
          <Card.Body>
            <Table responsive>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Stock</th>
                  <th>Interest Level</th>
                  <th>Movement Level</th>
                  <th>Age</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {results.map((product: any) => (
                  <tr key={product.id}>
                    <td>
                      {product.name}
                      {formatMovementHistory(product)}
                    </td>
                    <td>{product.sku || '-'}</td>
                    <td>{product.category || '-'}</td>
                    <td>{product.stock}</td>
                    <td>{formatInterestLevel(product.averageRelevance)}</td>
                    <td>{product.movementLevel || '-'}</td>
                    <td>{formatSlowMoveCategory(product.movementAnalysis)}</td>
                    <td>{formatStockStatus(product)}</td>
                    <td>
                      <Button 
                        variant="primary" 
                        size="sm"
                        onClick={() => onSync(product.sku)}
                        disabled={!product.sku}
                      >
                        🔄
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}
    </div>
  );
};

export default AdvancedSearchTab;
