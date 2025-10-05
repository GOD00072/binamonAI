// src/pages/LanguageDetectionConfig.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { configurationApi, userApi } from '../services/api';
import { getConfiguration, updateConfiguration, resetConfiguration } from '../services/configurationApi';

const styles = {
    cardHeader: { backgroundColor: '#312783', color: '#FFFFFF' },
    buttonPrimary: { backgroundColor: '#EF7D00', borderColor: '#EF7D00', color: '#FFFFFF' },
    buttonSecondary: { borderColor: '#312783', color: '#312783' },
    buttonSuccess: { backgroundColor: '#28a745', borderColor: '#28a745', color: '#FFFFFF' },
    buttonWarning: { backgroundColor: '#ffc107', borderColor: '#ffc107', color: '#000' }
};

interface UserLanguageData {
    userId: string;
    displayName?: string;
    pictureUrl?: string;
    detectedLanguage: string;
    confidence: number;
    messageCount: number;
    lastDetection: string;
    isLocked: boolean;
    manualOverride?: string;
    lastActive?: number;
}

const LanguageDetectionConfig: React.FC = () => {
    const [config, setConfig] = useState<any>(null);
    const [users, setUsers] = useState<UserLanguageData[]>([]);
    const [activeTab, setActiveTab] = useState<'config' | 'users'>('config');
    const [loading, setLoading] = useState(false);
    const [searchFilter, setSearchFilter] = useState('');

    const fetchData = useCallback(async () => {
        try {
            const response = await configurationApi.getConfigSection('language-detection');
            if (response.success && response.data) {
                setConfig(response.data);
            } else {
                // Fallback or error handling
                console.warn('Could not fetch config, using default.');
                setConfig({
                    enabled: true,
                    minTextLength: 10,
                    englishConfidenceThreshold: 0.7,
                    minEnglishWordsRatio: 0.3,
                    minEnglishWords: 2,
                    cacheTimeout: 300000,
                    lockAfterFirstDetection: false,
                    supportedLanguages: ['th', 'en', 'zh', 'ja', 'ko'],
                    defaultLanguage: 'th'
                });
            }
        } catch (error) {
            console.error('Failed to fetch configuration:', error);
            // Set default config on error
            setConfig({
                enabled: true,
                minTextLength: 10,
                englishConfidenceThreshold: 0.7,
                minEnglishWordsRatio: 0.3,
                minEnglishWords: 2,
                cacheTimeout: 300000,
                lockAfterFirstDetection: false,
                supportedLanguages: ['th', 'en', 'zh', 'ja', 'ko'],
                defaultLanguage: 'th'
            });
        }
    }, []);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const [usersResponse, languageResponse] = await Promise.all([
                userApi.getAllUsers(),
                userApi.getUserLanguageData()
            ]);

            if (usersResponse.success && languageResponse.success) {
                const usersData = usersResponse.data.users || [];
                const languageData = languageResponse.data.users || [];

                const mergedUsers = languageData.map((langUser: any) => {
                    const userInfo = usersData.find((u: any) => u.userId === langUser.userId);
                    return {
                        ...langUser,
                        displayName: userInfo?.displayName || `User ${langUser.userId.slice(-4)}`,
                        pictureUrl: userInfo?.pictureUrl || '',
                        lastActive: userInfo?.lastActive
                    };
                });
                setUsers(mergedUsers);
            } else {
                console.error('Failed to fetch user or language data');
            }
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    const updateUserLanguage = async (userId: string, language: string, isManual: boolean = false) => {
        try {
            const response = await fetch(`http://localhost:3001/api/language-detection/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    language,
                    isManual,
                    timestamp: new Date().toISOString()
                })
            });
            if (response.ok) {
                await fetchUsers();
            }
        } catch (error) {
            console.error('Failed to update user language:', error);
        }
    };

    const resetUserLanguage = async (userId: string) => {
        try {
            const response = await fetch(`http://localhost:3001/api/language-detection/users/${userId}/reset`, {
                method: 'POST'
            });
            if (response.ok) {
                await fetchUsers();
            }
        } catch (error) {
            console.error('Failed to reset user language:', error);
        }
    };

    useEffect(() => {
        fetchData();
        if (activeTab === 'users') {
            fetchUsers();
        }
    }, [fetchData, fetchUsers, activeTab]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { id, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;

        if (id === 'supportedLanguages') {
             setConfig((prev: any) => ({ ...prev, [id]: value.split(',').map(s => s.trim()) }));
        } else {
             setConfig((prev: any) => ({ ...prev, [id]: type === 'checkbox' ? checked : (e.target.type === 'number' ? Number(value) : value) }));
        }
    };
    
    const handleSave = async () => {
        try {
            await updateConfiguration('language-detection', config);
            alert('การตั้งค่าได้รับการบันทึกแล้ว!');
        } catch (error) {
            console.error('Failed to save configuration:', error);
            alert('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
        }
    };

    const handleReset = async () => {
        if(window.confirm('รีเซ็ตเป็นค่าเริ่มต้น?')) {
            try {
                await configurationApi.resetConfig('language-detection');
                fetchData();
                alert('รีเซ็ตการตั้งค่าเรียบร้อยแล้ว');
            } catch (error) {
                console.error('Failed to reset configuration:', error);
                alert('เกิดข้อผิดพลาดในการรีเซ็ตการตั้งค่า');
            }
        }
    };

    const filteredUsers = users.filter(user =>
        user.userId.toLowerCase().includes(searchFilter.toLowerCase()) ||
        user.detectedLanguage.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (user.displayName && user.displayName.toLowerCase().includes(searchFilter.toLowerCase()))
    );

    const getLanguageFlag = (lang: string) => {
        const flags: Record<string, string> = {
            'th': '🇹🇭',
            'en': '🇺🇸',
            'zh': '🇨🇳',
            'ja': '🇯🇵',
            'ko': '🇰🇷',
            'fr': '🇫🇷',
            'de': '🇩🇪',
            'es': '🇪🇸'
        };
        return flags[lang] || '🌐';
    };

    const getConfidenceColor = (confidence: number) => {
        if (confidence >= 0.8) return 'success';
        if (confidence >= 0.6) return 'warning';
        return 'danger';
    };

    if (!config) return <div className="d-flex justify-content-center p-4"><div className="spinner-border" role="status"></div></div>;

    return (
        <div className="container-fluid">
            <div className="card shadow-sm">
                <div className="card-header" style={styles.cardHeader}>
                    <div className="d-flex justify-content-between align-items-center">
                        <h4 className="mb-0">
                            <i className="fas fa-globe me-2"></i>
                            Language Detection Management
                        </h4>
                        <div className="btn-group" role="group">
                            <button
                                className={`btn ${activeTab === 'config' ? 'btn-light' : 'btn-outline-light'}`}
                                onClick={() => setActiveTab('config')}
                            >
                                <i className="fas fa-cogs me-1"></i>Configuration
                            </button>
                            <button
                                className={`btn ${activeTab === 'users' ? 'btn-light' : 'btn-outline-light'}`}
                                onClick={() => setActiveTab('users')}
                            >
                                <i className="fas fa-users me-1"></i>User Languages
                            </button>
                        </div>
                    </div>
                </div>

                {activeTab === 'config' && (
                    <div className="card-body">
                        <div className="form-check form-switch mb-4">
                            <input className="form-check-input" type="checkbox" id="enabled" checked={config.enabled} onChange={handleInputChange} />
                            <label className="form-check-label fw-bold" htmlFor="enabled">
                                <i className="fas fa-power-off me-2"></i>Enable Language Detection
                            </label>
                        </div>

                        <div className="row g-3">
                            <div className="col-md-6">
                                <label className="form-label fw-bold">
                                    <i className="fas fa-ruler me-1"></i>Min Text Length
                                </label>
                                <input type="number" className="form-control" id="minTextLength" value={config.minTextLength} onChange={handleInputChange} />
                                <small className="form-text text-muted">Minimum number of characters needed for detection</small>
                            </div>
                            <div className="col-md-6">
                                <label className="form-label fw-bold">
                                    <i className="fas fa-percentage me-1"></i>English Confidence Threshold
                                </label>
                                <input type="number" step="0.01" className="form-control" id="englishConfidenceThreshold" value={config.englishConfidenceThreshold} onChange={handleInputChange} />
                                <small className="form-text text-muted">Confidence threshold for English detection (0.0-1.0)</small>
                            </div>
                            <div className="col-md-6">
                                <label className="form-label fw-bold">
                                    <i className="fas fa-calculator me-1"></i>Min English Words Ratio
                                </label>
                                <input type="number" step="0.01" className="form-control" id="minEnglishWordsRatio" value={config.minEnglishWordsRatio} onChange={handleInputChange} />
                                <small className="form-text text-muted">Minimum ratio of English words (0.0-1.0)</small>
                            </div>
                            <div className="col-md-6">
                                <label className="form-label fw-bold">
                                    <i className="fas fa-hashtag me-1"></i>Min English Words
                                </label>
                                <input type="number" className="form-control" id="minEnglishWords" value={config.minEnglishWords} onChange={handleInputChange} />
                                <small className="form-text text-muted">Minimum number of English words required</small>
                            </div>
                            <div className="col-md-6">
                                <label className="form-label fw-bold">
                                    <i className="fas fa-clock me-1"></i>Cache Timeout (ms)
                                </label>
                                <input type="number" className="form-control" id="cacheTimeout" value={config.cacheTimeout} onChange={handleInputChange} />
                                <small className="form-text text-muted">Cache expiration time in milliseconds</small>
                            </div>
                            <div className="col-md-6 d-flex align-items-end">
                                <div className="form-check form-switch mb-1">
                                    <input className="form-check-input" type="checkbox" id="lockAfterFirstDetection" checked={config.lockAfterFirstDetection} onChange={handleInputChange} />
                                    <label className="form-check-label fw-bold">
                                        <i className="fas fa-lock me-1"></i>Lock After First Detection
                                    </label>
                                </div>
                            </div>
                            <div className="col-md-6">
                                <label className="form-label fw-bold">
                                    <i className="fas fa-language me-1"></i>Supported Languages
                                </label>
                                <input type="text" className="form-control" id="supportedLanguages" value={config.supportedLanguages.join(', ')} onChange={handleInputChange} />
                                <small className="form-text text-muted">Comma-separated list of supported language codes</small>
                            </div>
                            <div className="col-md-6">
                                <label className="form-label fw-bold">
                                    <i className="fas fa-home me-1"></i>Default Language
                                </label>
                                <select className="form-select" id="defaultLanguage" value={config.defaultLanguage} onChange={handleInputChange}>
                                    {config.supportedLanguages.map((lang: string) => (
                                        <option key={lang} value={lang}>{getLanguageFlag(lang)} {lang.toUpperCase()}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <hr className="my-4" />
                        <div className="d-flex justify-content-end gap-2">
                            <button className="btn" style={styles.buttonSecondary} onClick={handleReset}>
                                <i className="fas fa-undo me-1"></i>Reset to Default
                            </button>
                            <button className="btn" style={styles.buttonPrimary} onClick={handleSave}>
                                <i className="fas fa-save me-1"></i>Save Configuration
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'users' && (
                    <div className="card-body">
                        <div className="d-flex justify-content-between align-items-center mb-4">
                            <div>
                                <h5 className="mb-1">
                                    <i className="fas fa-users me-2"></i>User Language Settings
                                </h5>
                                <p className="text-muted mb-0">Manage individual user language detection results</p>
                            </div>
                            <div className="d-flex gap-2">
                                <div className="input-group" style={{maxWidth: '300px'}}>
                                    <span className="input-group-text">
                                        <i className="fas fa-search"></i>
                                    </span>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="Search users or languages..."
                                        value={searchFilter}
                                        onChange={(e) => setSearchFilter(e.target.value)}
                                    />
                                </div>
                                <button
                                    className="btn"
                                    style={styles.buttonPrimary}
                                    onClick={fetchUsers}
                                    disabled={loading}
                                >
                                    <i className="fas fa-sync-alt me-1"></i>
                                    {loading ? 'Refreshing...' : 'Refresh'}
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="text-center p-4">
                                <div className="spinner-border" role="status"></div>
                                <p className="mt-2">Loading user data...</p>
                            </div>
                        ) : filteredUsers.length === 0 ? (
                            <div className="alert alert-info">
                                <i className="fas fa-info-circle me-2"></i>
                                {searchFilter ? 'No users found matching your search.' : 'No user language data available.'}
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-hover">
                                    <thead className="table-dark">
                                        <tr>
                                            <th><i className="fas fa-user me-1"></i>User ID</th>
                                            <th><i className="fas fa-language me-1"></i>Detected Language</th>
                                            <th><i className="fas fa-chart-bar me-1"></i>Confidence</th>
                                            <th><i className="fas fa-comments me-1"></i>Messages</th>
                                            <th><i className="fas fa-clock me-1"></i>Last Detection</th>
                                            <th><i className="fas fa-lock me-1"></i>Status</th>
                                            <th><i className="fas fa-cogs me-1"></i>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredUsers.map((user) => (
                                            <tr key={user.userId}>
                                                <td>
                                                    <div className="d-flex align-items-center">
                                                        {user.pictureUrl ? (
                                                            <img
                                                                src={user.pictureUrl}
                                                                alt={user.displayName || user.userId}
                                                                className="rounded-circle me-2"
                                                                style={{width: '32px', height: '32px', objectFit: 'cover'}}
                                                                onError={(e) => {
                                                                    const target = e.target as HTMLImageElement;
                                                                    target.style.display = 'none';
                                                                }}
                                                            />
                                                        ) : (
                                                            <div
                                                                className="rounded-circle bg-secondary d-flex align-items-center justify-content-center me-2"
                                                                style={{width: '32px', height: '32px', fontSize: '12px', color: 'white'}}
                                                            >
                                                                {(user.displayName || user.userId).charAt(0).toUpperCase()}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div className="fw-bold">{user.displayName || 'Unknown User'}</div>
                                                            <code className="text-muted small">{user.userId}</code>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="badge bg-primary fs-6">
                                                        {getLanguageFlag(user.detectedLanguage)} {user.detectedLanguage.toUpperCase()}
                                                    </span>
                                                    {user.manualOverride && (
                                                        <small className="text-warning d-block">
                                                            <i className="fas fa-hand-paper me-1"></i>Manual Override
                                                        </small>
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="d-flex align-items-center">
                                                        <div className={`progress me-2`} style={{width: '80px', height: '8px'}}>
                                                            <div
                                                                className={`progress-bar bg-${getConfidenceColor(user.confidence)}`}
                                                                style={{width: `${user.confidence * 100}%`}}
                                                            ></div>
                                                        </div>
                                                        <small className={`text-${getConfidenceColor(user.confidence)} fw-bold`}>
                                                            {(user.confidence * 100).toFixed(1)}%
                                                        </small>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="badge bg-secondary">{user.messageCount}</span>
                                                </td>
                                                <td>
                                                    <small className="text-muted">
                                                        {new Date(user.lastDetection).toLocaleString('th-TH')}
                                                    </small>
                                                </td>
                                                <td>
                                                    {user.isLocked ? (
                                                        <span className="badge bg-warning">
                                                            <i className="fas fa-lock me-1"></i>Locked
                                                        </span>
                                                    ) : (
                                                        <span className="badge bg-success">
                                                            <i className="fas fa-unlock me-1"></i>Active
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="d-flex gap-1 align-items-center">
                                                        <div className="d-flex gap-1 flex-wrap">
                                                            {config?.supportedLanguages?.map((lang: string) => (
                                                                <button
                                                                    key={lang}
                                                                    className={`btn btn-sm ${user.detectedLanguage === lang ? 'btn-primary' : 'btn-outline-primary'}`}
                                                                    onClick={() => updateUserLanguage(user.userId, lang, true)}
                                                                    disabled={user.detectedLanguage === lang}
                                                                    title={`Change to ${lang.toUpperCase()}`}
                                                                    style={{fontSize: '10px', padding: '2px 6px', minWidth: '35px'}}
                                                                >
                                                                    {getLanguageFlag(lang)}
                                                                    {user.detectedLanguage === lang && (
                                                                        <i className="fas fa-check ms-1" style={{fontSize: '8px'}}></i>
                                                                    )}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <button
                                                            className="btn btn-outline-danger btn-sm"
                                                            onClick={() => resetUserLanguage(user.userId)}
                                                            title="Reset language detection for this user"
                                                            style={{fontSize: '10px', padding: '2px 6px'}}
                                                        >
                                                            <i className="fas fa-undo"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="mt-4 p-3 bg-light rounded">
                            <h6><i className="fas fa-info-circle me-2"></i>Statistics Summary</h6>
                            <div className="row g-3 text-center">
                                <div className="col-md-3">
                                    <div className="bg-white p-2 rounded">
                                        <h5 className="text-primary mb-0">{users.length}</h5>
                                        <small className="text-muted">Total Users</small>
                                    </div>
                                </div>
                                <div className="col-md-3">
                                    <div className="bg-white p-2 rounded">
                                        <h5 className="text-success mb-0">
                                            {users.filter(u => u.confidence >= 0.8).length}
                                        </h5>
                                        <small className="text-muted">High Confidence</small>
                                    </div>
                                </div>
                                <div className="col-md-3">
                                    <div className="bg-white p-2 rounded">
                                        <h5 className="text-warning mb-0">
                                            {users.filter(u => u.isLocked).length}
                                        </h5>
                                        <small className="text-muted">Locked Users</small>
                                    </div>
                                </div>
                                <div className="col-md-3">
                                    <div className="bg-white p-2 rounded">
                                        <h5 className="text-info mb-0">
                                            {users.filter(u => u.manualOverride).length}
                                        </h5>
                                        <small className="text-muted">Manual Overrides</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
export default LanguageDetectionConfig;