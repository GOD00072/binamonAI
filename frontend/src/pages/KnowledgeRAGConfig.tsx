// src/pages/KnowledgeRAGConfig.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { configurationApi } from '../services/api';
import { getConfiguration, updateConfiguration, resetConfiguration } from '../services/configurationApi';

const styles = {
    cardHeader: { backgroundColor: '#312783', color: '#FFFFFF' },
    buttonPrimary: { backgroundColor: '#EF7D00', borderColor: '#EF7D00', color: '#FFFFFF' },
    buttonSecondary: { borderColor: '#312783', color: '#312783' }
};

const KnowledgeRAGConfig: React.FC = () => {
    const [config, setConfig] = useState<any>(null);
    
    const fetchData = useCallback(async () => {
        const response = await getConfiguration('knowledge-rag');
        if (response.success) setConfig(response.config);
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value, type, checked } = e.target;
        const keys = id.split('.');

        if (keys[0] === 'enabled') {
             setConfig((prev: any) => ({ ...prev, enabled: checked }));
             return;
        }

        setConfig((prev: any) => {
            let newConfig = JSON.parse(JSON.stringify(prev));
            let current = newConfig;
            keys.slice(0, -1).forEach(key => current = current[key]);
            
            if (id === 'textSplitter.separators') {
                 current[keys[keys.length - 1]] = value.split(',').map(s => s.trim().replace(/\\n/g, '\n'));
            } else {
                 current[keys[keys.length - 1]] = type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value);
            }
            return newConfig;
        });
    };

    const handleSave = async () => {
        await updateConfiguration('knowledge-rag', config);
        alert('Settings saved!');
    };

    const handleReset = async () => {
        if(window.confirm('Reset to default?')) {
            await resetConfiguration('knowledge-rag');
            fetchData();
            alert('Settings reset.');
        }
    };

    if (!config) return <div>Loading...</div>;

    return (
        <div className="container-fluid">
            <div className="card shadow-sm">
                <div className="card-header" style={styles.cardHeader}>
                    <h4 className="mb-0">Knowledge RAG Configuration</h4>
                </div>
                <div className="card-body">
                    <div className="form-check form-switch mb-4">
                        <input className="form-check-input" type="checkbox" id="enabled." checked={config.enabled} onChange={handleInputChange} />
                        <label className="form-check-label" htmlFor="enabled.">Enable Knowledge RAG</label>
                    </div>
                    <div className="row g-4">
                        <div className="col-md-6">
                            <h5>Pinecone</h5>
                            <label>Index Name</label>
                            <input type="text" className="form-control" id="pinecone.indexName" value={config.pinecone.indexName} onChange={handleInputChange} />
                        </div>
                        <div className="col-md-6">
                            <h5>Embedding</h5>
                            <label>Model</label>
                            <input type="text" className="form-control mb-2" id="embedding.model" value={config.embedding.model} onChange={handleInputChange} />
                            <label>Dimension</label>
                            <input type="number" className="form-control" id="embedding.dimension" value={config.embedding.dimension} onChange={handleInputChange} />
                        </div>
                        <div className="col-12">
                            <h5>Text Splitter</h5>
                            <div className="row g-3">
                                <div className="col-md-4"><label>Chunk Size</label><input type="number" className="form-control" id="textSplitter.chunkSize" value={config.textSplitter.chunkSize} onChange={handleInputChange} /></div>
                                <div className="col-md-4"><label>Chunk Overlap</label><input type="number" className="form-control" id="textSplitter.chunkOverlap" value={config.textSplitter.chunkOverlap} onChange={handleInputChange} /></div>
                                <div className="col-md-4"><label>Separators (comma-separated, use \n for newlines)</label><input type="text" className="form-control" id="textSplitter.separators" value={config.textSplitter.separators.map((s:string) => s.replace(/\n/g, '\\n')).join(',')} onChange={handleInputChange} /></div>
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
export default KnowledgeRAGConfig;