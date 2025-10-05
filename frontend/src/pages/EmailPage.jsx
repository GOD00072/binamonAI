import React, { useState, useEffect, useCallback } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { Modal, Button, Accordion, Badge, Image } from 'react-bootstrap';
import ReactMarkdown from 'react-markdown';

// --- ใหม่: คอมโพเนนต์สำหรับจัดการ CSS Theme สีเขียว ---
const GreenThemeStyles = () => (
  <style>{`
    :root {
      --primary-green: #198754;
      --primary-green-hover: #157347;
      --light-green-bg: #e8f5e9;
      --text-on-primary: #ffffff;
      --subtle-border: #a5d6a7;
    }
    body {
        background-color: #fcfcfc;
    }
    h1, h2, h3, h4, h5, h6 {
        color: var(--primary-green);
    }
    .card {
        border: 1px solid #e0e0e0;
        transition: box-shadow 0.3s ease-in-out;
    }
    .card:hover {
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }
    .card-header {
      background-color: var(--light-green-bg);
      border-bottom: 2px solid var(--subtle-border);
    }
    .btn-primary {
      background-color: var(--primary-green);
      border-color: var(--primary-green);
      color: var(--text-on-primary);
      transition: background-color 0.2s;
    }
    .btn-primary:hover {
      background-color: var(--primary-green-hover);
      border-color: var(--primary-green-hover);
    }
    .btn-outline-primary {
        color: var(--primary-green);
        border-color: var(--primary-green);
    }
    .btn-outline-primary:hover {
        background-color: var(--primary-green);
        border-color: var(--primary-green);
        color: var(--text-on-primary);
    }
    .accordion-button:not(.collapsed) {
      background-color: var(--light-green-bg);
      color: var(--primary-green);
      box-shadow: inset 0 -1px 0 var(--subtle-border);
    }
    .accordion-button:focus {
        box-shadow: 0 0 0 0.25rem rgba(25, 135, 84, 0.25);
    }
    .badge.bg-primary {
      background-color: var(--primary-green) !important;
    }
    .list-group-item-action:hover, .list-group-item-action:focus {
      background-color: var(--light-green-bg);
    }
    .modal-header {
        background-color: var(--primary-green);
        color: var(--text-on-primary);
    }
    .modal-header .btn-close {
        filter: invert(1) grayscale(100%) brightness(200%);
    }
    .markdown-content h1, .markdown-content h2, .markdown-content h3 {
        border-bottom: 1px solid #dee2e6;
        padding-bottom: .3em;
        margin-top: 1em;
    }
    .markdown-content table {
        width: 100%;
        border-collapse: collapse;
    }
    .markdown-content th, .markdown-content td {
        border: 1px solid #ddd;
        padding: 8px;
    }
    .markdown-content th {
        background-color: #f2f2f2;
    }
  `}</style>
);

const ApiError = ({ message, onRetry }) => (
    <div className="alert alert-danger d-flex justify-content-between align-items-center">
        <span><i className="fas fa-exclamation-triangle me-2"></i>{message}</span>
        <button className="btn btn-sm btn-danger" onClick={onRetry}>ลองอีกครั้ง</button>
    </div>
);

const Card = ({ title, children }) => (
    <div className="card mb-4">
        <div className="card-header">
            <h5>{title}</h5>
        </div>
        <div className="card-body">
            {children}
        </div>
    </div>
);


const EmailPage = () => {
    const API_BASE_URL = 'http://localhost:3001/api/email';

    const [recipients, setRecipients] = useState('');
    const [scheduleTimes, setScheduleTimes] = useState('');
    const [scheduleTimesArray, setScheduleTimesArray] = useState([]);
    const [currentTime, setCurrentTime] = useState('08:00');
    const [enableSchedule, setEnableSchedule] = useState(false);
    const [individualEnabled, setIndividualEnabled] = useState(true);
    const [aggregateEnabled, setAggregateEnabled] = useState(true);
    const [individualPrompt, setIndividualPrompt] = useState('');
    const [aggregatePrompt, setAggregatePrompt] = useState('');
    const [statusLog, setStatusLog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [history, setHistory] = useState([]);
    const [selectedHistory, setSelectedHistory] = useState(null);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    const logStatus = useCallback((message, isError = false) => {
        const timestamp = new Date().toLocaleTimeString('th-TH');
        setStatusLog(prevLog => [{ timestamp, message, isError }, ...prevLog]);
    }, []);
    
    const loadInitialData = useCallback(async () => {
        setLoading(true);
        setError(null);
        logStatus('กำลังโหลดข้อมูลตั้งค่าเริ่มต้น...');
        try {
            const [settingsRes, summaryConfigRes, templatesRes] = await Promise.all([
                fetch(`${API_BASE_URL}/default-settings`),
                fetch(`${API_BASE_URL}/summary-config`),
                fetch(`${API_BASE_URL}/prompt-templates`)
            ]);

            const settingsData = await settingsRes.json();
            if (settingsData.success) {
                setRecipients(settingsData.settings.defaultRecipients.join(','));
                const times = settingsData.settings.scheduleTimes || [];
                setScheduleTimesArray(times);
                setScheduleTimes(times.join(','));
                setEnableSchedule(settingsData.settings.enableSchedule);
            }

            const summaryConfigData = await summaryConfigRes.json();
            if (summaryConfigData.success) {
                setIndividualEnabled(summaryConfigData.config.individualSummaryEnabled);
                setAggregateEnabled(summaryConfigData.config.aggregateSummaryEnabled);
            }

            const templatesData = await templatesRes.json();
            if (templatesData.success) {
                setIndividualPrompt(templatesData.templates.individualSummaryPrompt);
                setAggregatePrompt(templatesData.templates.aggregateSummaryPrompt);
            }
            
            logStatus('โหลดข้อมูลตั้งค่าเริ่มต้นสำเร็จ');
        } catch (err) {
            const errorMessage = 'ไม่สามารถโหลดข้อมูลเริ่มต้นได้ กรุณาตรวจสอบว่าเซิร์ฟเวอร์ API กำลังทำงานอยู่';
            setError(errorMessage);
            logStatus(errorMessage, true);
        } finally {
            setLoading(false);
        }
    }, [API_BASE_URL, logStatus]);

    useEffect(() => {
        loadInitialData();
    }, [loadInitialData]);

    const handleAddTime = () => {
        if (currentTime && !scheduleTimesArray.includes(currentTime)) {
            const updatedTimes = [...scheduleTimesArray, currentTime].sort();
            setScheduleTimesArray(updatedTimes);
            setScheduleTimes(updatedTimes.join(','));
        }
    };

    const handleRemoveTime = (timeToRemove) => {
        const updatedTimes = scheduleTimesArray.filter(t => t !== timeToRemove);
        setScheduleTimesArray(updatedTimes);
        setScheduleTimes(updatedTimes.join(','));
    };

    const handlePostRequest = async (endpoint, body, successMessage) => {
        logStatus(`กำลังบันทึกข้อมูลไปยัง ${endpoint}...`);
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const result = await response.json();
            if (result.success) {
                logStatus(successMessage);
            } else {
                logStatus(`เกิดข้อผิดพลาด: ${result.message}`, true);
            }
        } catch (err) {
            logStatus(`เกิดข้อผิดพลาดในการเชื่อมต่อ: ${err.message}`, true);
        }
    };
    
    const handleEmailSettingsSave = (e) => {
        e.preventDefault();
        const data = {
            defaultRecipients: recipients.split(',').map(email => email.trim()).filter(Boolean),
            scheduleTimes: scheduleTimes.split(',').map(time => time.trim()).filter(Boolean),
            enableSchedule,
        };
        handlePostRequest('/default-settings', data, 'บันทึกการตั้งค่าอีเมลสำเร็จ');
    };

    const handleSummaryConfigSave = (e) => {
        e.preventDefault();
        const data = {
            individualSummaryEnabled: individualEnabled,
            aggregateSummaryEnabled: aggregateEnabled,
        };
        handlePostRequest('/summary-config', data, 'บันทึกการตั้งค่าสรุปผลสำเร็จ');
    };

    const handleIndividualPromptSave = (e) => {
        e.preventDefault();
        handlePostRequest('/prompt-templates/individual', { template: individualPrompt }, 'บันทึก Prompt (รายบุคคล) สำเร็จ');
    };

    const handleAggregatePromptSave = (e) => {
        e.preventDefault();
        handlePostRequest('/prompt-templates/aggregate', { template: aggregatePrompt }, 'บันทึก Prompt (ภาพรวม) สำเร็จ');
    };

    const handleSendSummary = async () => {
        logStatus('กำลังเริ่มต้นกระบวนการสร้างสรุปผล...');
        try {
            const response = await fetch(`${API_BASE_URL}/comprehensive-summary`, { method: 'POST' });
            const result = await response.json();
            if (result.success) {
                const individualCount = result.summaries.individual.length;
                const hasAggregate = !!result.summaries.aggregate;
                logStatus(`สร้างสรุปผลสำเร็จ! สรุปรายบุคคล: ${individualCount} คน, มีสรุปภาพรวม: ${hasAggregate ? 'ใช่' : 'ไม่'}`);
                handleGetHistory();
            } else {
                logStatus(`เกิดข้อผิดพลาด: ${result.message}`, true);
            }
        } catch (err) {
            logStatus(`เกิดข้อผิดพลาดในการเชื่อมต่อ: ${err.message}`, true);
        }
    };


    const handleGetHistory = async () => {
        logStatus('กำลังดึงข้อมูลประวัติ...');
        setHistory([]);
        try {
            const response = await fetch(`${API_BASE_URL}/summary-history`);
            const result = await response.json();
            if (result.success && result.histories.length > 0) {
                 logStatus(`พบประวัติการส่ง ${result.histories.length} รายการล่าสุด`);
                 setHistory(result.histories);
            } else if (result.success) {
                 logStatus('ไม่พบประวัติการส่ง');
            } else {
                logStatus(`เกิดข้อผิดพลาด: ${result.message}`, true);
            }
        } catch (err) {
            logStatus(`เกิดข้อผิดพลาดในการเชื่อมต่อ: ${err.message}`, true);
        }
    };
    
    const handleShowHistoryDetails = (historyItem) => {
        setSelectedHistory(historyItem);
        setShowHistoryModal(true);
    };

    const handleCloseHistoryModal = () => {
        setShowHistoryModal(false);
        setSelectedHistory(null);
    };

    const renderEngagementBadge = (engagement) => {
        let bg = 'secondary';
        if (engagement === 'สูง') bg = 'success';
        if (engagement === 'กลาง') bg = 'warning';
        if (engagement === 'ต่ำ') bg = 'danger';
        return <Badge bg={bg}>{engagement || 'ไม่มีข้อมูล'}</Badge>;
    };

    return (
        <>
            <GreenThemeStyles />
            <div className="container-fluid mt-4">
                <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom">
                    <h1><i className="fas fa-envelope-open-text me-3"></i>ระบบสรุปผลและส่งอีเมล</h1>
                </div>

                {error && <ApiError message={error} onRetry={loadInitialData} />}
                {loading && <div className="text-center my-4"><div className="spinner-border text-success" role="status"><span className="visually-hidden">Loading...</span></div><p className="mt-2">กำลังโหลดข้อมูล...</p></div>}
                
                <Card title={<><i className="fas fa-cogs me-2"></i>แผงควบคุม (Control Panel)</>}>
                    <button className="btn btn-primary me-2" onClick={handleSendSummary}>
                        <i className="fas fa-paper-plane me-2"></i>สั่งสร้างและส่งสรุปผลทันที
                    </button>
                    <button className="btn btn-secondary" onClick={handleGetHistory}>
                        <i className="fas fa-history me-2"></i>โหลดประวัติการส่งล่าสุด
                    </button>
                </Card>

                <div className="row">
                    <div className="col-lg-6">
                        <Card title={<><i className="fas fa-at me-2"></i>ตั้งค่าอีเมล (Email Settings)</>}>
                            <form onSubmit={handleEmailSettingsSave}>
                                <div className="mb-3">
                                    <label htmlFor="defaultRecipients" className="form-label">อีเมลผู้รับ (คั่นด้วยจุลภาค ,)</label>
                                    <input type="text" id="defaultRecipients" className="form-control" value={recipients} onChange={e => setRecipients(e.target.value)} required />
                                </div>
                                <div className="mb-3">
                                    <label htmlFor="scheduleTimes" className="form-label">เวลาที่ต้องการให้ส่งสรุป</label>
                                    <div className="input-group">
                                        <input type="time" className="form-control" value={currentTime} onChange={e => setCurrentTime(e.target.value)} />
                                        <button type="button" className="btn btn-outline-primary" onClick={handleAddTime}>เพิ่มเวลา</button>
                                    </div>
                                    <div className="mt-2">
                                        {scheduleTimesArray.map(time => (
                                            <span key={time} className="badge bg-primary me-2 p-2">
                                                <i className="far fa-clock me-1"></i>{time}
                                                <button type="button" className="btn-close btn-close-white ms-2" style={{fontSize: '0.6rem'}} onClick={() => handleRemoveTime(time)}></button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="form-check mb-3">
                                    <input type="checkbox" id="enableSchedule" className="form-check-input" checked={enableSchedule} onChange={e => setEnableSchedule(e.target.checked)} />
                                    <label className="form-check-label" htmlFor="enableSchedule">เปิดใช้งานการส่งตามกำหนดเวลา</label>
                                </div>
                                <button type="submit" className="btn btn-primary"><i className="fas fa-save me-2"></i>บันทึกการตั้งค่าอีเมล</button>
                            </form>
                        </Card>
                    </div>
                    <div className="col-lg-6">
                        <Card title={<><i className="fas fa-file-invoice me-2"></i>ตั้งค่าสรุปผล (Summary Configuration)</>}>
                            <form onSubmit={handleSummaryConfigSave}>
                                <div className="form-check mb-3 fs-5">
                                    <input type="checkbox" id="individualSummaryEnabled" className="form-check-input" checked={individualEnabled} onChange={e => setIndividualEnabled(e.target.checked)} />
                                    <label className="form-check-label" htmlFor="individualSummaryEnabled">เปิดใช้งานการสรุปผลรายบุคคล</label>
                                </div>
                                <div className="form-check mb-3 fs-5">
                                    <input type="checkbox" id="aggregateSummaryEnabled" className="form-check-input" checked={aggregateEnabled} onChange={e => setAggregateEnabled(e.target.checked)} />
                                    <label className="form-check-label" htmlFor="aggregateSummaryEnabled">เปิดใช้งานการสรุปผลภาพรวม</label>
                                </div>
                                <button type="submit" className="btn btn-primary mt-3"><i className="fas fa-save me-2"></i>บันทึกการตั้งค่าสรุปผล</button>
                            </form>
                        </Card>
                    </div>
                </div>

                <div className="row">
                    <div className="col-lg-6">
                        <Card title={<><i className="fas fa-user-edit me-2"></i>เทมเพลต Prompt (รายบุคคล)</>}>
                            <form onSubmit={handleIndividualPromptSave}>
                                <div className="mb-3">
                                    <label htmlFor="individualSummaryPrompt" className="form-label">แก้ไข Prompt สำหรับสรุปรายบุคคล</label>
                                    <textarea id="individualSummaryPrompt" className="form-control" rows="5" value={individualPrompt} onChange={e => setIndividualPrompt(e.target.value)}></textarea>
                                </div>
                                <button type="submit" className="btn btn-primary"><i className="fas fa-save me-2"></i>บันทึก Prompt</button>
                            </form>
                        </Card>
                    </div>
                    <div className="col-lg-6">
                        <Card title={<><i className="fas fa-users-cog me-2"></i>เทมเพลต Prompt (ภาพรวม)</>}>
                            <form onSubmit={handleAggregatePromptSave}>
                                <div className="mb-3">
                                    <label htmlFor="aggregateSummaryPrompt" className="form-label">แก้ไข Prompt สำหรับสรุปภาพรวม</label>
                                    <textarea id="aggregateSummaryPrompt" className="form-control" rows="5" value={aggregatePrompt} onChange={e => setAggregatePrompt(e.target.value)}></textarea>
                                </div>
                                <button type="submit" className="btn btn-primary"><i className="fas fa-save me-2"></i>บันทึก Prompt</button>
                            </form>
                        </Card>
                    </div>
                </div>
                
                <Card title={<><i className="fas fa-tasks me-2"></i>สถานะและประวัติ (Status & History)</>}>
                    <div className="row">
                        <div className="col-md-6">
                            <h6><i className="fas fa-clipboard-list me-2"></i>ประวัติการสรุปล่าสุด</h6>
                            {history.length > 0 ? (
                                <div className="list-group" style={{maxHeight: '250px', overflowY: 'auto'}}>
                                    {history.map((h, index) => (
                                        <button
                                            key={index}
                                            type="button"
                                            className="list-group-item list-group-item-action"
                                            onClick={() => handleShowHistoryDetails(h)}
                                        >
                                            <div className="d-flex w-100 justify-content-between">
                                                <h6 className="mb-1" style={{color: 'var(--primary-green)'}}><i className="far fa-file-alt me-2"></i>{h.filename}</h6>
                                                <small>{new Date(h.timestamp).toLocaleString('th-TH')}</small>
                                            </div>
                                            <p className="mb-1 text-muted small">
                                                <i className="fas fa-users me-1"></i> {h.content?.individual?.length || 0} สรุปรายบุคคล
                                                {h.content?.aggregate ? <><i className="fas fa-globe-asia mx-2"></i> 1 สรุปภาพรวม</> : ''}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center p-3 text-muted">
                                    <i className="fas fa-folder-open fa-2x mb-2"></i>
                                    <p>ไม่พบข้อมูลประวัติ</p>
                                </div>
                            )}
                        </div>
                        <div className="col-md-6">
                             <h6><i className="fas fa-terminal me-2"></i>สถานะการทำงาน (Log)</h6>
                            <div style={{ height: '250px', backgroundColor: '#212529', color: '#f8f9fa', overflowY: 'auto', border: '1px solid #dee2e6', borderRadius: '.25rem', padding: '1rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                {statusLog.length === 0 && !loading && <div style={{color: '#6c757d'}}>พร้อมทำงาน...</div>}
                                {statusLog.map((log, index) => (
                                    <div key={index} className={log.isError ? 'text-danger' : 'text-light'}>
                                       <span className="me-2" style={{color: '#adb5bd'}}>[{log.timestamp}]</span> 
                                       <span className={log.isError ? '' : 'text-success'}>{log.isError ? 'ERROR:' : 'INFO:'}</span> {log.message}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            <Modal show={showHistoryModal} onHide={handleCloseHistoryModal} size="xl" centered>
                <Modal.Header closeButton>
                    <Modal.Title><i className="fas fa-file-alt me-2"></i>รายละเอียดสรุป: {selectedHistory?.filename}</Modal.Title>
                </Modal.Header>
                <Modal.Body style={{maxHeight: '70vh', overflowY: 'auto', backgroundColor: '#f8f9fa'}}>
                    {selectedHistory?.content?.aggregate && (
                        <Card title={<><i className="fas fa-globe-asia me-2"></i>สรุปภาพรวม (Aggregate Summary)</>}>
                            <div className='markdown-content p-3'>
                                <ReactMarkdown>
                                    {selectedHistory.content.aggregate.summary}
                                </ReactMarkdown>
                            </div>
                        </Card>
                    )}

                    <h5 className='mt-4'>สรุปรายบุคคล (Individual Summaries)</h5>
                    {selectedHistory?.content?.individual.length > 0 ? (
                        <Accordion>
                            {selectedHistory.content.individual.map((ind, index) => (
                                <Accordion.Item eventKey={String(index)} key={index}>
                                    <Accordion.Header>
                                        <div className='d-flex align-items-center justify-content-between w-100 me-3'>
                                            <div className='d-flex align-items-center'>
                                                <Image
                                                    src={ind.pictureUrl || `https://ui-avatars.com/api/?name=${ind.displayName}&background=random`}
                                                    alt={ind.displayName}
                                                    roundedCircle
                                                    width="40"
                                                    height="40"
                                                    className="me-3 border"
                                                />
                                                <div>
                                                    <div className='fw-bold'>{ind.displayName}</div>
                                                    <small className='text-muted'>{ind.userId}</small>
                                                </div>
                                            </div>
                                            <div>
                                                <Badge bg="info" className='me-2'>ข้อความ: {ind.messageCount}</Badge>
                                                {renderEngagementBadge(ind.engagement)}
                                            </div>
                                        </div>
                                    </Accordion.Header>
                                    <Accordion.Body>
                                        <h6><i className="fas fa-clipboard-check me-2"></i>บทสรุป:</h6>
                                        <div className='markdown-content border rounded p-3 mb-3' style={{backgroundColor: '#fff'}}>
                                           <ReactMarkdown>
                                                {ind.summary}
                                            </ReactMarkdown>
                                        </div>
                                        
                                        <h6 className='mt-3'><i className="fas fa-history me-2"></i>สรุปครั้งก่อนหน้า:</h6>
                                        {ind.previousSummaries && ind.previousSummaries.length > 0 ? (
                                            ind.previousSummaries.map((prev, prevIndex) => (
                                                <div key={prevIndex} className='markdown-content border rounded p-3' style={{backgroundColor: '#e9ecef'}}>
                                                    <ReactMarkdown>
                                                        {prev.summary}
                                                    </ReactMarkdown>
                                                </div>
                                            ))
                                        ) : (<p className="text-muted">ไม่มีข้อมูลสรุปครั้งก่อน</p>)}
                                    </Accordion.Body>
                                </Accordion.Item>
                            ))}
                        </Accordion>
                    ) : (
                        <p className="text-muted">ไม่มีข้อมูลสรุปรายบุคคลในไฟล์นี้</p>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleCloseHistoryModal}>
                        ปิด
                    </Button>
                </Modal.Footer>
            </Modal>
        </>
    );
};

export default EmailPage;