import React from 'react';
import { Table, Card, Row, Col, Button } from 'react-bootstrap';

interface Props {
  data: any;
  loading: boolean;
  onSync: (sku: string) => void;
}

const StockStatusTab: React.FC<Props> = ({ data, loading, onSync }) => {
  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <Row>
        <Col>
          <Card className="mb-4">
            <Card.Header>
              <h5>📊 Summary</h5>
            </Card.Header>
            <Card.Body>
              <Table responsive>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Count</th>
                    <th>Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Total Products</td>
                    <td>{data.totalProducts}</td>
                    <td>100%</td>
                  </tr>
                  <tr>
                    <td>Products with SKU</td>
                    <td>{data.productsWithSKU}</td>
                    <td>{((data.productsWithSKU/data.totalProducts)*100).toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td>Stored Stock Files</td>
                    <td>{data.storedStockFiles}</td>
                    <td>{((data.storedStockFiles/data.productsWithSKU)*100).toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td>Missing Stock Data</td>
                    <td>{data.missingStockData.length}</td>
                    <td>{((data.missingStockData.length/data.productsWithSKU)*100).toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td>Outdated Stock Data</td>
                    <td>{data.outdatedStockData.length}</td>
                    <td>{((data.outdatedStockData.length/data.productsWithSKU)*100).toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td>Recently Updated</td>
                    <td>{data.recentlyUpdated.length}</td>
                    <td>{((data.recentlyUpdated.length/data.productsWithSKU)*100).toFixed(1)}%</td>
                  </tr>
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Missing Stock Data */}
      {data.missingStockData.length > 0 && (
        <Card className="mb-4">
          <Card.Header>
            <h5>❌ Missing Stock Data</h5>
          </Card.Header>
          <Card.Body>
            <Table responsive>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product Name</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.missingStockData.map((item: any) => (
                  <tr key={item.sku}>
                    <td>{item.sku}</td>
                    <td>{item.productName}</td>
                    <td>
                      <Button 
                        variant="primary" 
                        size="sm"
                        onClick={() => onSync(item.sku)}
                      >
                        🔄 Sync
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}

      {/* Outdated Stock Data */}
      {data.outdatedStockData.length > 0 && (
        <Card className="mb-4">
          <Card.Header>
            <h5>⏰ Outdated Stock Data</h5>
          </Card.Header>
          <Card.Body>
            <Table responsive>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product Name</th>
                  <th>Last Updated</th>
                  <th>Days Old</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.outdatedStockData.map((item: any) => (
                  <tr key={item.sku}>
                    <td>{item.sku}</td>
                    <td>{item.productName}</td>
                    <td>{new Date(item.lastUpdated).toLocaleDateString('th-TH')}</td>
                    <td>{item.daysOld} days</td>
                    <td>
                      <Button 
                        variant="primary" 
                        size="sm"
                        onClick={() => onSync(item.sku)}
                      >
                        🔄 Sync
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}

      {/* Recently Updated */}
      {data.recentlyUpdated.length > 0 && (
        <Card className="mb-4">
          <Card.Header>
            <h5>✅ Recently Updated</h5>
          </Card.Header>
          <Card.Body>
            <Table responsive>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product Name</th>
                  <th>Last Updated</th>
                  <th>Hours Ago</th>
                </tr>
              </thead>
              <tbody>
                {data.recentlyUpdated.map((item: any) => (
                  <tr key={item.sku}>
                    <td>{item.sku}</td>
                    <td>{item.productName}</td>
                    <td>{new Date(item.lastUpdated).toLocaleString('th-TH')}</td>
                    <td>{item.hoursAgo} hours</td>
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

export default StockStatusTab;
