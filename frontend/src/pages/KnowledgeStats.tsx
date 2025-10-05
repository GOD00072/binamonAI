import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// --- API Service (Included directly to resolve import error) ---
const API_BASE_URL = 'http://localhost:3001/api/knowledge';

const knowledgeApiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * ดึงข้อมูลสถิติของ Knowledge Base ทั้งหมด
 */
const getKnowledgeStats = async () => {
  const response = await knowledgeApiClient.get('/system/stats');
  return response.data;
};
// --- End of API Service ---


const styles = {
    card: {
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        borderRadius: '8px'
    },
    cardHeader: {
        backgroundColor: '#312783',
        color: '#FFFFFF',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px'
    }
};

const KnowledgeStats: React.FC = () => {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await getKnowledgeStats();
            if (response.success) {
                setStats(response.statistics);
            } else {
                throw new Error(response.error || 'Failed to fetch statistics.');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    if (loading) return <div className="text-center p-5"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>;
    if (error) return <div className="alert alert-danger">Error: {error}</div>;

    return (
        <div className="container mt-4">
            <div className="card" style={styles.card}>
                <div className="card-header" style={styles.cardHeader}>
                    <h4 className="mb-0">📈 Knowledge Base Statistics</h4>
                </div>
                <div className="card-body">
                    {stats ? (
                        <div className="row">
                            <div className="col-md-4">
                                <h5>Overall</h5>
                                <p><strong>Total Documents:</strong> {stats.total_knowledge || 0}</p>
                                <p><strong>Total Chunks Processed:</strong> {stats.total_chunks || 0}</p>
                                <p><strong>Total Words Indexed:</strong> {stats.total_words?.toLocaleString() || 0}</p>
                            </div>
                            <div className="col-md-8">
                                <h5>Breakdown by Language</h5>
                                {stats.by_language ? (
                                    <ul className="list-group">
                                        {Object.entries(stats.by_language).map(([lang, data]: [string, any]) => (
                                            <li key={lang} className="list-group-item d-flex justify-content-between align-items-center">
                                                {lang}
                                                <span className="badge bg-primary rounded-pill">{data.total || 0} docs</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <p>No language-specific data available.</p>}
                            </div>
                        </div>
                    ) : (
                        <p>No statistics data available.</p>
                    )}
                    <button className="btn btn-outline-primary mt-3" onClick={fetchStats}>
                        <i className="fas fa-sync-alt me-2"></i>Refresh
                    </button>
                </div>
            </div>
        </div>
    );
};

export default KnowledgeStats;
