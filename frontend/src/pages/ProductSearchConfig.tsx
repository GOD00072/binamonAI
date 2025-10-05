// src/pages/ProductSearchConfig.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { getConfiguration, updateConfiguration, resetConfiguration } from '../services/configurationApi';
import { configurationApi } from '../services/api';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/theme.css';


const ProductSearchConfig: React.FC = () => {
    const [config, setConfig] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await getConfiguration('product-search');
            if (response.success) {
                setConfig(response.config);
            } else {
                throw new Error(response.error || 'Failed to fetch config');
            }
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value, type, checked } = e.target;
        const keys = id.split('.');
        
        setConfig((prevConfig: any) => {
            let newConfig = { ...prevConfig };
            let current = newConfig;
            for (let i = 0; i < keys.length - 1; i++) {
                current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = type === 'checkbox' ? checked : (type === 'number' ? parseFloat(value) || 0 : value);
            return newConfig;
        });
    };

    const handleSave = async () => {
        if (!config) return;
        try {
            await updateConfiguration('product-search', config);
            alert('Product Search configuration saved successfully!');
            fetchData();
        } catch (err) {
            alert('Failed to save configuration.');
        }
    };

    const handleReset = async () => {
        if (window.confirm('Are you sure you want to reset to default settings?')) {
            try {
                await resetConfiguration('product-search');
                alert('Product Search configuration has been reset.');
                fetchData();
            } catch (err) {
                alert('Failed to reset configuration.');
            }
        }
    };

    if (isLoading) return (
        <div className="page-container d-flex justify-content-center align-items-center">
            <div className="text-center">
                <div className="loading-dots mb-3">
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                </div>
                <h4 className="text-muted">Loading Configuration...</h4>
            </div>
        </div>
    );

    if (error) return (
        <div className="page-container">
            <div className="container">
                <div className="alert alert-danger">
                    <i className="fas fa-exclamation-triangle me-2"></i>
                    Error: {error}
                </div>
            </div>
        </div>
    );

    if (!config) return (
        <div className="page-container">
            <div className="container">
                <div className="alert alert-warning">
                    <i className="fas fa-info-circle me-2"></i>
                    No configuration data found.
                </div>
            </div>
        </div>
    );

    return (
        <div className="page-container">
            <div className="container">
                <h1 className="mb-2">
                    <i className="fas fa-search me-2"></i>
                    Product Search Configuration
                </h1>
                <p className="subtitle">จัดการการตั้งค่าสำหรับการค้นหาผลิตภัณฑ์</p>

                <div className="grid grid-2">
                    {/* Basic Settings */}
                    <div className="section">
                        <h3 className="section-title">Basic Settings</h3>
                        <div className="input-group">
                            <label htmlFor="topResults" className="input-label">Top Results</label>
                            <input
                                type="number"
                                className="input-field"
                                id="topResults"
                                value={config.topResults || ''}
                                onChange={handleInputChange}
                            />
                        </div>
                        <div className="input-group">
                            <label htmlFor="contextWindow" className="input-label">Context Window</label>
                            <input
                                type="number"
                                className="input-field"
                                id="contextWindow"
                                value={config.contextWindow || ''}
                                onChange={handleInputChange}
                            />
                        </div>
                        <div className="input-group">
                            <label htmlFor="relevanceThreshold" className="input-label">Relevance Threshold</label>
                            <input
                                type="number"
                                step="0.01"
                                className="input-field"
                                id="relevanceThreshold"
                                value={config.relevanceThreshold || ''}
                                onChange={handleInputChange}
                            />
                        </div>
                        <div className="input-group">
                            <label htmlFor="embeddingBoostFactor" className="input-label">Embedding Boost Factor</label>
                            <input
                                type="number"
                                step="0.1"
                                className="input-field"
                                id="embeddingBoostFactor"
                                value={config.embeddingBoostFactor || ''}
                                onChange={handleInputChange}
                            />
                        </div>
                    </div>

                    {/* Score Thresholds */}
                    <div className="section">
                        <h3 className="section-title">Score Thresholds</h3>
                        {config.scoreThresholds && Object.entries(config.scoreThresholds).map(([key, value]) => (
                            <div className="input-group" key={key}>
                                <label htmlFor={`scoreThresholds.${key}`} className="input-label text-capitalize">{key.replace(/([A-Z])/g, ' $1')}</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    id={`scoreThresholds.${key}`}
                                    value={value as number}
                                    onChange={handleInputChange}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Search Methods */}
                    <div className="section">
                        <h3 className="section-title">Search Methods</h3>
                        {config.searchMethods && Object.entries(config.searchMethods).map(([key, value]) => (
                            <div className="toggle-container" key={key} style={{ marginBottom: '1rem' }}>
                                <label className="input-label text-capitalize">{key.replace(/([A-Z])/g, ' $1')}</label>
                                <label className="toggle">
                                    <input
                                        type="checkbox"
                                        id={`searchMethods.${key}`}
                                        checked={!!value}
                                        onChange={handleInputChange}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                        ))}
                    </div>
                    {/* Caching & Cleanup */}
                    <div className="section">
                        <h3 className="section-title">Caching (TTL in seconds)</h3>
                        {config.caching && Object.entries(config.caching).map(([key, value]) => (
                            <div className="input-group" key={key}>
                                <label htmlFor={`caching.${key}`} className="input-label text-capitalize">{key.replace(/([A-Z])/g, ' $1')}</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    id={`caching.${key}`}
                                    value={value as number}
                                    onChange={handleInputChange}
                                />
                            </div>
                        ))}

                        <h4 className="mt-4 mb-3">Cleanup (in ms)</h4>
                        {config.cleanup && Object.entries(config.cleanup).map(([key, value]) => (
                            <div className="input-group" key={key}>
                                <label htmlFor={`cleanup.${key}`} className="input-label text-capitalize">{key.replace(/([A-Z])/g, ' $1')}</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    id={`cleanup.${key}`}
                                    value={value as number}
                                    onChange={handleInputChange}
                                />
                            </div>
                        ))}
                    </div>
                </div>


                <div className="section">
                    <div className="d-flex justify-content-end gap-3">
                        <button
                            className="btn btn-outline"
                            onClick={handleReset}
                        >
                            <i className="fas fa-undo me-2"></i>
                            Reset to Defaults
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleSave}
                        >
                            <i className="fas fa-save me-2"></i>
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductSearchConfig;