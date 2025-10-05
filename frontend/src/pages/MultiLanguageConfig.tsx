// src/pages/MultiLanguageConfig.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { configurationApi } from '../services/api';
import { getConfiguration, updateConfiguration, resetConfiguration } from '../services/configurationApi';
import 'bootstrap/dist/css/bootstrap.min.css';

const styles = {
    cardHeader: { backgroundColor: '#312783', color: '#FFFFFF' },
    buttonPrimary: { backgroundColor: '#EF7D00', borderColor: '#EF7D00', color: '#FFFFFF' },
    buttonSecondary: { borderColor: '#312783', color: '#312783' }
};

const MultiLanguageConfig: React.FC = () => {
    const [config, setConfig] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await getConfiguration('multi-language');
            if (response.success) {
                setConfig(response.config);
            } else {
                throw new Error(response.error);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { id, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        const keys = id.split('.');

        setConfig((prev: any) => {
            const newConfig = JSON.parse(JSON.stringify(prev));
            let current = newConfig;
            keys.slice(0, -1).forEach(key => {
                if (!current[key]) current[key] = {};
                current = current[key];
            });
            const finalKey = keys[keys.length - 1];
            if (id === 'supportedLanguages') {
                current[finalKey] = value.split(',').map(s => s.trim());
            } else {
                current[finalKey] = type === 'checkbox' ? checked : (type.startsWith('number') ? Number(value) : value);
            }
            return newConfig;
        });
    };

    const handleSave = async () => {
        try {
            await updateConfiguration('multi-language', config);
            alert('Settings saved!');
            fetchData();
        } catch (err) {
            alert('Save failed.');
        }
    };
    
    const handleReset = async () => {
        if (window.confirm('Reset to default settings?')) {
            try {
                await resetConfiguration('multi-language');
                alert('Settings reset.');
                fetchData();
            } catch (err) {
                alert('Reset failed.');
            }
        }
    };

    if (isLoading) return <div>Loading...</div>;
    if (error) return <div className="alert alert-danger">Error: {error}</div>;
    if (!config) return null;

    return (
        <div className="container-fluid">
            <div className="card shadow-sm">
                <div className="card-header" style={styles.cardHeader}>
                    <h4 className="mb-0">Multi-Language Configuration</h4>
                </div>
                <div className="card-body">
                    <div className="row g-4">
                        <div className="col-md-6">
                            <h5>General</h5>
                            <div className="mb-3">
                                <label htmlFor="supportedLanguages" className="form-label">Supported Languages (comma-separated)</label>
                                <input type="text" className="form-control" id="supportedLanguages" value={config.supportedLanguages?.join(', ') || ''} onChange={handleInputChange} />
                            </div>
                            <div className="mb-3">
                                <label htmlFor="defaultLanguage" className="form-label">Default Language</label>
                                <select className="form-select" id="defaultLanguage" value={config.defaultLanguage} onChange={handleInputChange}>
                                    {config.supportedLanguages?.map((lang: string) => <option key={lang} value={lang}>{lang}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="col-md-6">
                            <h5>Auto Detection</h5>
                            <div className="form-check form-switch mb-2">
                                <input className="form-check-input" type="checkbox" id="autoDetection.enabled" checked={config.autoDetection?.enabled} onChange={handleInputChange} />
                                <label className="form-check-label" htmlFor="autoDetection.enabled">Enabled</label>
                            </div>
                            <div className="mb-3"><label htmlFor="autoDetection.minTextLength" className="form-label">Min Text Length</label><input type="number" className="form-control" id="autoDetection.minTextLength" value={config.autoDetection?.minTextLength} onChange={handleInputChange} /></div>
                            <div className="mb-3"><label htmlFor="autoDetection.confidenceThreshold" className="form-label">Confidence Threshold</label><input type="number" step="0.01" className="form-control" id="autoDetection.confidenceThreshold" value={config.autoDetection?.confidenceThreshold} onChange={handleInputChange} /></div>
                            <div className="mb-3"><label htmlFor="autoDetection.cacheTimeout" className="form-label">Cache Timeout (ms)</label><input type="number" className="form-control" id="autoDetection.cacheTimeout" value={config.autoDetection?.cacheTimeout} onChange={handleInputChange} /></div>
                            <div className="form-check form-switch mb-2">
                                <input className="form-check-input" type="checkbox" id="autoDetection.lockAfterFirstDetection" checked={config.autoDetection?.lockAfterFirstDetection} onChange={handleInputChange} />
                                <label className="form-check-label" htmlFor="autoDetection.lockAfterFirstDetection">Lock After First Detection</label>
                            </div>
                        </div>
                    </div>
                    <hr/>
                    <h5>Language Specific Settings</h5>
                    <div className="row g-3">
                        {config.languageSpecific && Object.keys(config.languageSpecific).map(lang => (
                            <div className="col-lg-6" key={lang}>
                                <div className="card">
                                    <div className="card-header"><strong>{lang.toUpperCase()}</strong></div>
                                    <div className="card-body">
                                        <div className="mb-2"><label htmlFor={`languageSpecific.${lang}.chunkSize`} className="form-label">Chunk Size</label><input type="number" className="form-control" id={`languageSpecific.${lang}.chunkSize`} value={config.languageSpecific[lang].chunkSize} onChange={handleInputChange} /></div>
                                        <div className="mb-2"><label htmlFor={`languageSpecific.${lang}.chunkOverlap`} className="form-label">Chunk Overlap</label><input type="number" className="form-control" id={`languageSpecific.${lang}.chunkOverlap`} value={config.languageSpecific[lang].chunkOverlap} onChange={handleInputChange} /></div>
                                        <div className="mb-2"><label htmlFor={`languageSpecific.${lang}.embeddingModel`} className="form-label">Embedding Model</label><input type="text" className="form-control" id={`languageSpecific.${lang}.embeddingModel`} value={config.languageSpecific[lang].embeddingModel} onChange={handleInputChange} /></div>
                                        <div className="mb-2"><label htmlFor={`languageSpecific.${lang}.namespace`} className="form-label">Namespace</label><input type="text" className="form-control" id={`languageSpecific.${lang}.namespace`} value={config.languageSpecific[lang].namespace} onChange={handleInputChange} /></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                     <hr className="my-4" />
                    <div className="d-flex justify-content-end gap-2">
                        <button className="btn" style={styles.buttonSecondary} onClick={handleReset}>Reset</button>
                        <button className="btn" style={styles.buttonPrimary} onClick={handleSave}>Save</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default MultiLanguageConfig;