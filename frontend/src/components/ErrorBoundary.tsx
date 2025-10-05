import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

// The props and state types are now correctly placed within < >
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="page-shell">
          <div className="page-header">
            <div className="page-header-icon">
              <i className="fas fa-triangle-exclamation"></i>
            </div>
            <div className="page-header-text">
              <h1>เกิดข้อผิดพลาด</h1>
              <p>มีบางอย่างผิดพลาดกับแอปพลิเคชัน กรุณาลองใหม่อีกครั้งหรือล้างหน้า</p>
            </div>
          </div>

          <div className="page-body">
            <div className="main-banners">
              <div className="alert alert-danger main-alert">
                <div className="main-alert-content">
                  <i className="fas fa-circle-exclamation"></i>
                  <div>
                    มีบางอย่างผิดพลาดกับหน้านี้ หากกด "ลองใหม่" แล้วยังเกิดปัญหา กรุณารีเฟรชหน้าเว็บ
                  </div>
                </div>
                <div className="main-alert-actions">
                  <button 
                    className="btn btn-outline-secondary"
                    onClick={() => this.setState({ hasError: false, error: undefined, errorInfo: undefined })}
                  >
                    <i className="fas fa-rotate-left me-1"></i>
                    ลองใหม่
                  </button>
                  <button 
                    className="btn btn-outline-danger"
                    onClick={() => window.location.reload()}
                  >
                    <i className="fas fa-arrows-rotate me-1"></i>
                    รีเฟรช
                  </button>
                </div>
              </div>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="card-custom">
                <h5 className="mb-3">รายละเอียดข้อผิดพลาด (Development)</h5>
                <pre className="mt-2 small text-danger" style={{ fontSize: '0.8rem', maxHeight: '260px', overflow: 'auto' }}>
                  {this.state.error.toString()}
                  {this.state.error.stack}
                  {this.state.errorInfo && (
                    <>
                      {'\n\nComponent Stack:'}
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </pre>
              </div>
            )}
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
