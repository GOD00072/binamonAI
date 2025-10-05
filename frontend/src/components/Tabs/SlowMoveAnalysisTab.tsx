import React from 'react';
import { Table, Card, Row, Col, Alert } from 'react-bootstrap';
import { formatStockStatus, formatInterestLevel, formatMovementHistory, formatHotScore, formatSlowMoveCategory } from '../../utils/formatters';

interface Props {
  data: any;
  loading: boolean;
}

const SlowMoveAnalysisTab: React.FC<Props> = ({ data, loading }) => {
  if (loading) {
    return <div>Loading...</div>;
  }

  // Critical Items Alert
  const criticalCount = (data.summary?.categoryCounts?.verySlowMove3 || 0) + (data.summary?.categoryCounts?.deadStock || 0);

  return (
    <div>
      {criticalCount > 0 && (
        <Alert variant="warning" className="mb-4">
          <Alert.Heading>⚠️ Critical Attention Required</Alert.Heading>
          <p>พบสินค้าที่ต้องการความสนใจเร่งด่วน: <strong>{criticalCount}</strong> รายการ</p>
          <ul>
            <li>Very Slow Move #3 (151-180 วัน): {data.summary?.categoryCounts?.verySlowMove3 || 0} รายการ</li>
            <li>Dead Stock ({'>'}180 วัน): {data.summary?.categoryCounts?.deadStock || 0} รายการ</li>
          </ul>
        </Alert>
      )}

      <Row>
        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <h5>📊 Slow Move Summary</h5>
            </Card.Header>
            <Card.Body>
              <Table responsive>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Count</th>
                    <th>Percentage</th>
                    <th>Stock Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: 'normal', label: 'Normal (≤60 วัน)', class: 'success' },
                    { key: 'slowMove', label: 'Slow Move (61-90 วัน)', class: 'warning' },
                    { key: 'verySlowMove1', label: 'Very Slow #1 (91-120 วัน)', class: 'danger' },
                    { key: 'verySlowMove2', label: 'Very Slow #2 (121-150 วัน)', class: 'danger' },
                    { key: 'verySlowMove3', label: 'Very Slow #3 (151-180 วัน)', class: 'danger' },
                    { key: 'deadStock', label: 'Dead Stock (>180 วัน)', class: 'dark' },
                    { key: 'noData', label: 'No Data', class: 'secondary' }
                  ].map((cat) => (
                    <tr key={cat.key}>
                      <td>
                        <span className={`badge bg-${cat.class}`}>{cat.label}</span>
                      </td>
                      <td>{data.summary?.categoryCounts?.[cat.key] || 0}</td>
                      <td>{data.summary?.percentages?.[cat.key] || '0%'}</td>
                      <td>{(data.summary?.stockValue?.[cat.key] || 0).toLocaleString()} units</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <h5>📅 Age Analysis</h5>
            </Card.Header>
            <Card.Body>
              <Table responsive>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Products with Restock History</td>
                    <td>{data.summary?.totalWithRestockHistory || 0}</td>
                  </tr>
                  <tr>
                    <td>Average Days Since Restock</td>
                    <td>{data.summary?.averageDaysSinceRestock || 0} วัน</td>
                  </tr>
                  {data.summary?.oldestStock && (
                    <tr>
                      <td>Oldest Stock</td>
                      <td>{`${data.summary.oldestStock.name} (${data.summary.oldestStock.days} วัน) - SKU: ${data.summary.oldestStock.sku}`}</td>
                    </tr>
                  )}
                  {data.summary?.newestStock && (
                    <tr>
                      <td>Newest Stock</td>
                      <td>{`${data.summary.newestStock.name} (${data.summary.newestStock.days} วัน) - SKU: ${data.summary.newestStock.sku}`}</td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Category Details */}
      {['deadStock', 'verySlowMove3', 'verySlowMove2', 'verySlowMove1', 'slowMove', 'normal'].map((category) => {
        const categoryData = data.categories?.[category] || [];
        if (categoryData.length === 0) return null;

        const getCategoryLabel = () => {
          switch (category) {
            case 'normal': return 'Normal (≤60 วัน)';
            case 'slowMove': return 'Slow Move (61-90 วัน)';
            case 'verySlowMove1': return 'Very Slow #1 (91-120 วัน)';
            case 'verySlowMove2': return 'Very Slow #2 (121-150 วัน)';
            case 'verySlowMove3': return 'Very Slow #3 (151-180 วัน)';
            case 'deadStock': return 'Dead Stock (>180 วัน)';
            default: return 'Unknown';
          }
        };

        return (
          <Card key={category} className="mb-4">
            <Card.Header>
              <h5>{getCategoryLabel()} ({categoryData.length} รายการ)</h5>
            </Card.Header>
            <Card.Body>
              <Table responsive>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Stock</th>
                    <th>Days Since Restock</th>
                    <th>Last Restock</th>
                    <th>Interest</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryData.slice(0, 20).map((product: any) => (
                    <tr key={product.id}>
                      <td>
                        {product.name}
                        {formatMovementHistory(product)}
                      </td>
                      <td>{product.sku || '-'}</td>
                      <td>{product.category || '-'}</td>
                      <td>{product.stock}</td>
                      <td>
                        {product.daysSinceLastRestock || '-'} วัน
                        {product.daysSinceLastRestock > 120 && (
                          <span className="badge bg-danger ms-1">Critical</span>
                        )}
                      </td>
                      <td>{product.lastRestockDate ? new Date(product.lastRestockDate).toLocaleDateString('th-TH') : '-'}</td>
                      <td>{formatInterestLevel(product.averageRelevance)} {product.averageRelevance?.toFixed(4) || '0'}</td>
                      <td>{formatStockStatus(product)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {categoryData.length > 20 && (
                <div className="text-muted text-center mt-3">
                  Showing first 20 of {categoryData.length} products
                </div>
              )}
            </Card.Body>
          </Card>
        );
      })}
    </div>
  );
};

export default SlowMoveAnalysisTab;
