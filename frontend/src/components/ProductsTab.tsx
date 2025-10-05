import React, { useState, useEffect } from 'react';
import { Table, Card, Spinner, Alert, Button, Pagination } from 'react-bootstrap';
// FIX: Import productApi from the correct source
import { productApi } from '../services/api';

const ProductsTab = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const productsPerPage = 15;

  const fetchProducts = async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      // FIX: Call the function from productApi
      const res = await productApi.getAllProducts({ page: page, limit: productsPerPage });

      if (res.success && res.data) {
        // Assuming the API returns products in a 'data' array and pagination info
        setProducts(res.data.data || []);
        setTotalPages(res.data.totalPages || 1);
        setCurrentPage(res.data.currentPage || 1);
      } else {
        throw new Error(res.message || 'Failed to load products');
      }
    } catch (err: any) {
      setError(err.message);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts(currentPage);
  }, [currentPage]);

  const handlePageChange = (pageNumber: number) => {
    if (pageNumber > 0 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
    }
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    let items = [];
    for (let number = 1; number <= totalPages; number++) {
      items.push(
        <Pagination.Item key={number} active={number === currentPage} onClick={() => handlePageChange(number)}>
          {number}
        </Pagination.Item>,
      );
    }
    return (
        <Pagination>
            <Pagination.Prev onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} />
            {items}
            <Pagination.Next onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} />
        </Pagination>
    );
  }

  return (
    <Card className="modern-card">
      <Card.Header className="d-flex justify-content-between align-items-center">
        <h5 className="mb-0"><i className="fas fa-boxes me-2"></i>All Products</h5>
        <Button variant="outline-primary" size="sm" onClick={() => fetchProducts(currentPage)} disabled={loading}>
          <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i> Refresh
        </Button>
      </Card.Header>
      <Card.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        {loading ? (
          <div className="text-center p-5">
            <Spinner animation="border" />
            <p className="mt-2">Loading Products...</p>
          </div>
        ) : (
          <Table responsive hover size="sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Stock</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {products.length > 0 ? (
                products.map(p => (
                  <tr key={p.id || p._id}>
                    <td>{p.name || p.product_name}</td>
                    <td>{p.sku || '-'}</td>
                    <td>{p.category || '-'}</td>
                    <td>{p.stock_quantity ?? p.stock ?? 0}</td>
                    <td>{p.price ? `${p.price.toFixed(2)} THB` : '-'}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="text-center text-muted py-4">No products found.</td></tr>
              )}
            </tbody>
          </Table>
        )}
      </Card.Body>
      <Card.Footer className="d-flex justify-content-center">
        {renderPagination()}
      </Card.Footer>
    </Card>
  );
};

export default ProductsTab;