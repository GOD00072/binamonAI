// src/pages/KnowledgeScoreConfig.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { configurationApi } from '../services/api';
import { getConfiguration, updateConfiguration, resetConfiguration } from '../services/configurationApi';

const styles = {
    cardHeader: { backgroundColor: '#312783', color: '#FFFFFF' },
    buttonPrimary: { backgroundColor: '#EF7D00', borderColor: '#EF7D00', color: '#FFFFFF' },
    buttonSecondary: { borderColor: '#312783', color: '#312783' }
};

const KnowledgeScoreConfig: React.FC = () => {
    const [config, setConfig] = useState<any>(null);

    const fetchData = useCallback(async () => {
        const response = await getConfiguration('knowledge-score');
        if (response.success) setConfig(response.config);
    }, []);

    const handleSave = async () => {
        await updateConfiguration('knowledge-score', config);
        alert('Settings saved!');
    };

    const handleReset = async () => {
        if (window.confirm('Reset to default?')) {
            await resetConfiguration('knowledge-score');
            fetchData();
            alert('Settings reset.');
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value, type, checked } = e.target;
        const keys = id.split('.');
        setConfig((prev: any) => {
            const newConfig = JSON.parse(JSON.stringify(prev));
            let current = newConfig;
            keys.slice(0, -1).forEach(key => { if (!current[key]) current[key] = {}; current = current[key]; });
            const finalKey = keys[keys.length - 1];
            current[finalKey] = type === 'checkbox' ? checked : (type === 'number' ? Number((e.target as HTMLInputElement).value) : value);
            return newConfig;
        });
    };

    if (!config) return <div>Loading...</div>;

    return (
        <div className="container-fluid">
            <div className="card shadow-sm" style={{maxWidth: '800px', margin: 'auto'}}>
                <div className="card-header" style={styles.cardHeader}>
                    <h4 className="mb-0">Knowledge Score Configuration</h4>
                </div>
                <div className="card-body">
                    <div className="form-check form-switch mb-4">
                        <input className="form-check-input" type="checkbox" id="enabled." checked={config.enabled} onChange={handleInputChange} />
                        <label className="form-check-label" htmlFor="enabled.">Enable Knowledge Score</label>
                    </div>
                    <div className="row g-4">
                        <div className="col-md-6">
                            <h5>Thresholds</h5>
                            <label htmlFor="thresholds.high" className="form-label">High</label>
                            <input type="number" step="0.1" className="form-control mb-2" id="thresholds.high" value={config.thresholds.high} onChange={handleInputChange} />
                            <label htmlFor="thresholds.medium" className="form-label">Medium</label>
                            <input type="number" step="0.1" className="form-control mb-2" id="thresholds.medium" value={config.thresholds.medium} onChange={handleInputChange} />
                            <label htmlFor="thresholds.low" className="form-label">Low</label>
                            <input type="number" step="0.1" className="form-control mb-2" id="thresholds.low" value={config.thresholds.low} onChange={handleInputChange} />
                        </div>
                        <div className="col-md-6">
                            <h5>Weights</h5>
                            <label htmlFor="weights.relevance" className="form-label">Relevance</label>
                            <input type="number" step="0.1" className="form-control mb-2" id="weights.relevance" value={config.weights.relevance} onChange={handleInputChange} />
                            <label htmlFor="weights.confidence" className="form-label">Confidence</label>
                            <input type="number" step="0.1" className="form-control mb-2" id="weights.confidence" value={config.weights.confidence} onChange={handleInputChange} />
                        </div>
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

export default KnowledgeScoreConfig;