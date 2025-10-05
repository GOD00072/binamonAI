// src/pages/IntentDetectionConfig.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { configurationApi } from '../services/api';
import { getConfiguration, updateConfiguration, resetConfiguration } from '../services/configurationApi';

const styles = {
    cardHeader: { backgroundColor: '#312783', color: '#FFFFFF' },
    buttonPrimary: { backgroundColor: '#EF7D00', borderColor: '#EF7D00', color: '#FFFFFF' },
    buttonSecondary: { borderColor: '#312783', color: '#312783' }
};

const IntentDetectionConfig: React.FC = () => {
    const [config, setConfig] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        const response = await getConfiguration('intent-detection');
        if (response.success) {
            setConfig(response.config);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleTextAreaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const { id, value } = e.target;
        const [category, key] = id.split('.');
        setConfig((prev: any) => ({
            ...prev,
            [category]: {
                ...prev[category],
                [key]: value.split(',').map(s => s.trim())
            }
        }));
    };

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setConfig((prev: any) => ({ ...prev, enabled: e.target.checked }));
    };

    const handleSave = async () => {
        await updateConfiguration('intent-detection', config);
        alert('Settings saved!');
        fetchData();
    };

    const handleReset = async () => {
        if (window.confirm('Reset to default settings?')) {
            await resetConfiguration('intent-detection');
            alert('Settings reset.');
            fetchData();
        }
    };

    if (isLoading || !config) return <div>Loading...</div>;

    return (
        <div className="container-fluid">
            <div className="card shadow-sm">
                <div className="card-header" style={styles.cardHeader}>
                    <h4 className="mb-0">Intent Detection Configuration</h4>
                </div>
                <div className="card-body">
                    <div className="form-check form-switch mb-4">
                        <input className="form-check-input" type="checkbox" id="enabled" checked={config.enabled} onChange={handleCheckboxChange} />
                        <label className="form-check-label" htmlFor="enabled">Enable Intent Detection</label>
                    </div>
                    <div className="row g-4">
                        <div className="col-md-6">
                            <h5>Keywords</h5>
                            {Object.keys(config.keywords).map(key => (
                                <div className="mb-3" key={key}>
                                    <label htmlFor={`keywords.${key}`} className="form-label text-capitalize">{key}</label>
                                    <textarea
                                        className="form-control"
                                        id={`keywords.${key}`}
                                        rows={3}
                                        value={config.keywords[key].join(', ')}
                                        onChange={handleTextAreaChange}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="col-md-6">
                            <h5>Product Attributes</h5>
                            {Object.keys(config.productAttributes).map(key => (
                                <div className="mb-3" key={key}>
                                    <label htmlFor={`productAttributes.${key}`} className="form-label text-capitalize">{key}</label>
                                    <textarea
                                        className="form-control"
                                        id={`productAttributes.${key}`}
                                        rows={3}
                                        value={config.productAttributes[key].join(', ')}
                                        onChange={handleTextAreaChange}
                                    />
                                </div>
                            ))}
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

export default IntentDetectionConfig;