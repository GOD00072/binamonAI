import React from 'react';
import { getPageMeta } from '../config/pageMeta';

type PageLayoutProps = {
  pageId: string;
  children: React.ReactNode;
  headerExtras?: React.ReactNode;
};

const PageLayout: React.FC<PageLayoutProps> = ({ pageId, children, headerExtras }) => {
  const meta = getPageMeta(pageId);

  return (
    <section className="page-shell" data-page={meta.id}>
      <header className="page-header">
        <div className="page-header-icon" aria-hidden="true">
          <i className={`fas ${meta.icon}`}></i>
        </div>
        <div className="page-header-text">
          <h1>{meta.title}</h1>
          {meta.description && <p>{meta.description}</p>}
        </div>
        {meta.badge && (
          <span className="page-header-badge">{meta.badge}</span>
        )}
        {headerExtras && (
          <div className="page-header-actions">
            {headerExtras}
          </div>
        )}
      </header>

      <div className="page-body">
        {children}
      </div>
    </section>
  );
};

export default PageLayout;
