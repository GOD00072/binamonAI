import React from 'react';
import { Table, Card, Badge } from 'react-bootstrap';
import { formatStockStatus, formatInterestLevel, formatMovementHistory, formatHotScore, formatSlowMoveCategory } from '../../utils/formatters';

interface Props {
  data: any[];
  loading: boolean;
}

const QualityInteractionsTab: React.FC<Props> = ({ data, loading }) => {
  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Card>
      <Card.Header>
        <h5>🎯 Quality Interactions</h5>
      </Card.Header>
      <Card.Body>
        <Table responsive>
          <thead>
            <tr>
              <th>Name</th>
              <th>SKU</th>
              <th>Category</th>
              <th>Stock</th>
              <th>Interactions</th>
              <th>Relevance</th>
              <th>Movement</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((product: any) => (
              <tr key={product.id}>
                <td>
                  {product.name}
                  {formatMovementHistory(product)}
                </td>
                <td>{product.sku || '-'}</td>
                <td>{product.category || '-'}</td>
                <td>{product.stock}</td>
                <td>{`${product.interactions} (${product.userCount} users)`}</td>
                <td>{formatInterestLevel(product.averageRelevance)} {product.averageRelevance}</td>
                <td>{formatSlowMoveCategory(product.movementAnalysis)}</td>
                <td>{formatStockStatus(product)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card.Body>
    </Card>
  );
};

export default QualityInteractionsTab;
