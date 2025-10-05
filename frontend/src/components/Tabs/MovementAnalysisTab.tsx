import React from 'react';
import { Table, Card, Row, Col } from 'react-bootstrap';
import { formatSlowMoveCategory } from '../../utils/formatters';

interface Props {
  data: any;
  loading: boolean;
}

const MovementAnalysisTab: React.FC<Props> = ({ data, loading }) => {
  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <Card className="mb-4">
        <Card.Header>
          <h5 className="mb-0"><i className="fas fa-chart-bar me-2"></i>📊 Slow Move Summary</h5>
        </Card.Header>
        <Card.Body>
          <Table responsive hover>
            <thead>
              <tr>
                <th>ประเภท</th>
                <th>จำนวนสินค้า</th>
                <th>เปอร์เซ็นต์</th>
                <th>จำนวนหน่วย</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Normal (≤60 วัน)</td>
                <td>{data?.summary?.normalCount || 0}</td>
                <td>{data?.summary?.totalProducts ? ((data.summary.normalCount || 0) / data.summary.totalProducts * 100).toFixed(1) : '0'}%</td>
                <td>{(data?.summary?.normalUnits || 0).toLocaleString()} units</td>
              </tr>
              <tr>
                <td>Slow Move (61-90 วัน)</td>
                <td>{data?.summary?.slowMoveCount || 0}</td>
                <td>{data?.summary?.totalProducts ? ((data.summary.slowMoveCount || 0) / data.summary.totalProducts * 100).toFixed(1) : '0'}%</td>
                <td>{(data?.summary?.slowMoveUnits || 0).toLocaleString()} units</td>
              </tr>
              <tr>
                <td>Very Slow #1 (91-120 วัน)</td>
                <td>{data?.summary?.verySlowMove1Count || 0}</td>
                <td>{data?.summary?.totalProducts ? ((data.summary.verySlowMove1Count || 0) / data.summary.totalProducts * 100).toFixed(1) : '0'}%</td>
                <td>{(data?.summary?.verySlowMove1Units || 0).toLocaleString()} units</td>
              </tr>
              <tr>
                <td>Very Slow #2 (121-150 วัน)</td>
                <td>{data?.summary?.verySlowMove2Count || 0}</td>
                <td>{data?.summary?.totalProducts ? ((data.summary.verySlowMove2Count || 0) / data.summary.totalProducts * 100).toFixed(1) : '0'}%</td>
                <td>{(data?.summary?.verySlowMove2Units || 0).toLocaleString()} units</td>
              </tr>
              <tr>
                <td>Very Slow #3 (151-180 วัน)</td>
                <td>{data?.summary?.verySlowMove3Count || 0}</td>
                <td>{data?.summary?.totalProducts ? ((data.summary.verySlowMove3Count || 0) / data.summary.totalProducts * 100).toFixed(1) : '0'}%</td>
                <td>{(data?.summary?.verySlowMove3Units || 0).toLocaleString()} units</td>
              </tr>
              <tr>
                <td>Dead Stock ({'>'}180 วัน)</td>
                <td>{data?.summary?.deadStockCount || 0}</td>
                <td>{data?.summary?.totalProducts ? ((data.summary.deadStockCount || 0) / data.summary.totalProducts * 100).toFixed(1) : '0'}%</td>
                <td>{(data?.summary?.deadStockUnits || 0).toLocaleString()} units</td>
              </tr>
              <tr>
                <td>No Data</td>
                <td>{data?.summary?.noDataCount || 0}</td>
                <td>{data?.summary?.totalProducts ? ((data.summary.noDataCount || 0) / data.summary.totalProducts * 100).toFixed(1) : '0'}%</td>
                <td>{(data?.summary?.noDataUnits || 0).toLocaleString()} units</td>
              </tr>
              <tr className="table-light fw-bold">
                <td>รวมทั้งหมด</td>
                <td>{(data?.summary?.totalProducts || 0).toLocaleString()}</td>
                <td>100%</td>
                <td>{(
                  (data?.summary?.normalUnits || 0) +
                  (data?.summary?.slowMoveUnits || 0) +
                  (data?.summary?.verySlowMove1Units || 0) +
                  (data?.summary?.verySlowMove2Units || 0) +
                  (data?.summary?.verySlowMove3Units || 0) +
                  (data?.summary?.deadStockUnits || 0) +
                  (data?.summary?.noDataUnits || 0)
                ).toLocaleString()} units</td>
              </tr>
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      {/* Top Movers */}
      {data.topMovers?.length > 0 && (
        <Card className="mb-4">
          <Card.Header>
            <h5>🚀 Top Movement Products</h5>
          </Card.Header>
          <Card.Body>
            <Table responsive>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>SKU</th>
                  <th>Sales Velocity</th>
                  <th>Total Sold</th>
                  <th>Movement Frequency</th>
                  <th>Avg Order Size</th>
                  <th>Recent Activity</th>
                  <th>Age</th>
                </tr>
              </thead>
              <tbody>
                {data.topMovers.map((product: any) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.sku || '-'}</td>
                    <td>{product.salesVelocity} units/day</td>
                    <td>{product.totalSold}</td>
                    <td>{product.movementFrequency} /day</td>
                    <td>{product.averageOrderSize}</td>
                    <td>{product.recentActivity ? '✅ Yes' : '❌ No'}</td>
                    <td>{formatSlowMoveCategory(product.movementAnalysis)}</td>
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

export default MovementAnalysisTab;
