// src/pages/SearchSettingsConfig.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { getConfiguration, updateConfiguration, resetConfiguration } from '../services/configurationApi';

const styles = {
    cardHeader: { backgroundColor: '#312783', color: '#FFFFFF' },
    buttonPrimary: { backgroundColor: '#EF7D00', borderColor: '#EF7D00', color: '#FFFFFF' },
    buttonSecondary: { borderColor: '#312783', color: '#312783' }
};

const SearchSettingsConfig: React.FC = () => {
    const [config, setConfig] = useState<any>(null);

    const fetchData = useCallback(async () => {
        const response = await getConfiguration('search');
        if (response.success) setConfig(response.config);
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { id, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        setConfig((prev: any) => ({ ...prev, [id]: type === 'checkbox' ? checked : (e.target.type.startsWith('number') ? Number(value) : value) }));
    };

    const handleSave = async () => {
        await updateConfiguration('search', config);
        alert('Settings saved!');
    };

    const handleReset = async () => {
        if(window.confirm('Reset to default?')) {
            await resetConfiguration('search');
            fetchData();
            alert('Settings reset.');
        }
    };

    if (!config) return <div>Loading...</div>;

    return (
        <div className="container-fluid">
            <div className="card shadow-sm" style={{maxWidth: '800px', margin: 'auto'}}>
                <div className="card-header" style={styles.cardHeader}>
                    <h4 className="mb-0">Search Settings</h4>
                </div>
                <div className="card-body">
                    <div className="row g-3">
                        <div className="col-md-6"><label>Top K Results</label><input type="number" className="form-control" id="topK" value={config.topK} onChange={handleInputChange} /></div>
                        <div className="col-md-6"><label>Score Threshold</label><input type="number" step="0.01" className="form-control" id="scoreThreshold" value={config.scoreThreshold} onChange={handleInputChange} /></div>
                        <div className="col-md-6"><label>Max Tokens</label><input type="number" className="form-control" id="maxTokens" value={config.maxTokens} onChange={handleInputChange} /></div>
                        <div className="col-md-6"><label>Max Content Length</label><input type="number" className="form-control" id="maxContentLength" value={config.maxContentLength} onChange={handleInputChange} /></div>
                        <div className="col-md-6"><label>Sort By</label>
                            <select className="form-select" id="sortBy" value={config.sortBy} onChange={handleInputChange}>
                                <option value="relevance">Relevance</option>
                                <option value="date">Date</option>
                                <option value="score">Score</option>
                            </select>
                        </div>
                        <div className="col-md-6 d-flex align-items-end">
                             <div className="form-check form-switch mb-1">
                                <input className="form-check-input" type="checkbox" id="includeMetadata" checked={config.includeMetadata} onChange={handleInputChange} />
                                <label className="form-check-label">Include Metadata</label>
                            </div>
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
export default SearchSettingsConfig;