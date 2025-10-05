const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

const TOKEN_FILE_PATH = path.join(process.cwd(), 'config', 'DROPBOX_ACCESS_TOKEN.json');

async function readTokenFile() {
    try {
        return await DropboxBackupManager.loadTokenFromFile(TOKEN_FILE_PATH);
    } catch (error) {
        throw new Error('Failed to read token file');
    }
}

module.exports = function(logger) {
    let backupManager = null;

    const validateDropboxToken = async (token) => {
        const manager = new DropboxBackupManager({
            accessToken: token,
            logger: logger,
            baseDir: process.cwd()
        });
        await manager.validateDropboxConnection();
        return manager;
    };

    const handleError = (error, res) => {
        const isTokenError = error.status === 401;
        const statusCode = error.status || 500;

        logger.error('Operation failed', {
            errorMessage: error.message,
            errorStack: error.stack,
            isTokenError
        });

        res.status(statusCode).json({
            success: false,
            message: isTokenError ? 
                'Token หมดอายุหรือไม่ถูกต้อง' : 
                'เกิดข้อผิดพลาดในการดำเนินการ',
            error: {
                code: isTokenError ? 'TOKEN_EXPIRED' : 'OPERATION_FAILED',
                message: error.message,
                details: error.details || null
            }
        });
    };

    router.post('/reset-token', async (req, res) => {
        try {
            const { token } = req.body;
            if (!token) {
                return res.status(400).json({
                    success: false,
                    message: 'กรุณาระบุ Token ใหม่',
                    error: { code: 'MISSING_TOKEN' }
                });
            }

            logger.info('Validating new Dropbox token');
            const newManager = await validateDropboxToken(token);
            await newManager.refreshToken(token);
            backupManager = newManager;

            res.json({
                success: true,
                message: 'อัปเดต Token สำเร็จ',
                details: {
                    timestamp: new Date().toISOString(),
                    tokenUpdated: true
                }
            });
        } catch (error) {
            handleError(error, res);
        }
    });

    router.get('/token-status', async (req, res) => {
        try {
            const token = await readTokenFile();
            if (!token) {
                return res.status(404).json({
                    success: false,
                    message: 'ไม่พบ Token ในระบบ',
                    status: 'NOT_CONFIGURED'
                });
            }

            if (!backupManager) {
                backupManager = new DropboxBackupManager({
                    accessToken: token,
                    logger: logger,
                    baseDir: process.cwd()
                });
            }

            await backupManager.validateDropboxConnection();
            res.json({
                success: true,
                message: 'Token ยังใช้งานได้',
                status: 'VALID',
                lastValidated: new Date().toISOString()
            });
        } catch (error) {
            handleError(error, res);
        }
    });

    router.use(async (req, res, next) => {
        try {
            if (!backupManager) {
                const token = await readTokenFile();
                if (!token) {
                    return res.status(401).json({
                        success: false,
                        message: 'ไม่พบ Token สำหรับเชื่อมต่อ Dropbox',
                        error: { code: 'TOKEN_MISSING' }
                    });
                }
                backupManager = await validateDropboxToken(token);
            }
            next();
        } catch (error) {
            handleError(error, res);
        }
    });

    router.post('/create', async (req, res) => {
        try {
            const backupPath = await backupManager.createBackup();
            res.json({
                success: true,
                message: 'การสำรองข้อมูลสำเร็จ',
                backupPath,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            handleError(error, res);
        }
    });

    router.post('/restore', async (req, res) => {
        try {
            const { backupPath } = req.body;
            if (!backupPath) {
                return res.status(400).json({
                    success: false,
                    message: 'กรุณาระบุที่อยู่การสำรองข้อมูล'
                });
            }

            await backupManager.validateBackupPath(backupPath);
            const restoreResult = await backupManager.restoreBackup(backupPath);

            res.json({
                success: true,
                message: 'กู้คืนข้อมูลสำเร็จ',
                details: restoreResult,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            handleError(error, res);
        }
    });

    router.get('/list', async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const sortBy = req.query.sortBy || 'created';
            const sortOrder = req.query.sortOrder || 'desc';
            const searchTerm = req.query.search || '';

            if (page < 1 || limit < 1 || limit > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid pagination parameters',
                    error: 'Page must be >= 1 and limit must be between 1 and 100'
                });
            }

            let backups = await backupManager.listBackups();
            if (!Array.isArray(backups)) {
                throw new Error('Invalid backup list response');
            }

            if (searchTerm) {
                backups = backups.filter(backup => 
                    backup.path.toLowerCase().includes(searchTerm.toLowerCase())
                );
            }

            backups.sort((a, b) => {
                try {
                    let comparison = 0;
                    switch (sortBy) {
                        case 'path':
                            comparison = a.path.localeCompare(b.path);
                            break;
                        case 'created':
                        default:
                            const dateA = new Date(a.created);
                            const dateB = new Date(b.created);
                            if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
                                throw new Error('Invalid date comparison');
                            }
                            comparison = dateB - dateA;
                            break;
                    }
                    return sortOrder === 'desc' ? comparison : -comparison;
                } catch (error) {
                    logger.error('Sort error', {
                        error: error.message,
                        backupA: a,
                        backupB: b
                    });
                    return 0;
                }
            });

            const totalItems = backups.length;
            const totalPages = Math.ceil(totalItems / limit);
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            const paginatedBackups = backups.slice(startIndex, endIndex);

            const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;
            const currentTime = new Date();

            const response = {
                success: true,
                data: {
                    backups: paginatedBackups,
                    pagination: {
                        page,
                        limit,
                        totalItems,
                        totalPages,
                        hasNextPage: page < totalPages,
                        hasPrevPage: page > 1,
                        links: {
                            self: `${baseUrl}?page=${page}&limit=${limit}`,
                            first: `${baseUrl}?page=1&limit=${limit}`,
                            last: `${baseUrl}?page=${totalPages}&limit=${limit}`
                        }
                    },
                    sorting: {
                        sortBy,
                        sortOrder
                    },
                    search: searchTerm || null
                },
                timestamp: currentTime.toISOString(),
                serverTime: currentTime.toLocaleString('th-TH', {
                    timeZone: 'Asia/Bangkok',
                    hour12: false
                })
            };

            if (response.data.pagination.hasNextPage) {
                response.data.pagination.links.next = 
                    `${baseUrl}?page=${page + 1}&limit=${limit}`;
            }
            
            if (response.data.pagination.hasPrevPage) {
                response.data.pagination.links.prev = 
                    `${baseUrl}?page=${page - 1}&limit=${limit}`;
            }

            res.json(response);
        } catch (error) {
            handleError(error, res);
        }
    });

    router.delete('/delete/:backupPath(*)', async (req, res) => {
        try {
            const { backupPath } = req.params;
            if (!backupPath) {
                return res.status(400).json({
                    success: false,
                    message: 'กรุณาระบุที่อยู่การสำรองข้อมูลที่ต้องการลบ'
                });
            }

            await backupManager.validateBackupPath(backupPath);
            const result = await backupManager.deleteBackup(backupPath);

            res.json({
                success: true,
                message: 'ลบการสำรองข้อมูลสำเร็จ',
                details: result,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            handleError(error, res);
        }
    });

    router.get('/details/:backupPath(*)', async (req, res) => {
        try {
            const { backupPath } = req.params;
            if (!backupPath) {
                return res.status(400).json({
                    success: false,
                    message: 'กรุณาระบุที่อยู่การสำรองข้อมูล'
                });
            }

            await backupManager.validateBackupPath(backupPath);
            const details = await backupManager.getBackupDetails(backupPath);

            res.json({
                success: true,
                data: details,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            handleError(error, res);
        }
    });

    router.post('/cleanup', async (req, res) => {
        try {
            const { maxBackups } = req.body;
            const result = await backupManager.cleanupOldBackups(maxBackups);

            res.json({
                success: true,
                message: 'ทำความสะอาดการสำรองข้อมูลสำเร็จ',
                details: result,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            handleError(error, res);
        }
    });

    return router;
};