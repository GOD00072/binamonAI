'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// ตั้งค่า Multer สำหรับการอัปโหลดไฟล์
const upload = multer({
   dest: 'uploads/product_images/',
   limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
   fileFilter: (req, file, cb) => {
       const allowedTypes = /jpeg|jpg|png|gif|webp|bmp/;
       const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
       const mimetype = allowedTypes.test(file.mimetype);
       
       if (mimetype && extname) {
           return cb(null, true);
       } else {
           cb(new Error('Only image files are allowed'));
       }
   }
});

module.exports = (productImageSender, logger) => {
   const router = express.Router();

   // *** Helper function สำหรับตรวจสอบว่าไฟล์มีอยู่จริง ***
   async function checkFileExists(filepath) {
       try {
           await fs.access(filepath);
           return true;
       } catch {
           return false;
       }
   }

   // =============== TEMP IMAGES ENDPOINTS ===============

   // List all temp images
   router.get('/images/temp', async (req, res) => {
       try {
           const tempImagesDir = path.join(__dirname, '..', 'temp_images');
           
           logger.info('📋 Listing temp images directory:', { tempImagesDir });
           
           try {
               // สร้าง directory ถ้าไม่มี
               await fs.mkdir(tempImagesDir, { recursive: true });
               
               const files = await fs.readdir(tempImagesDir);
               const fileDetails = [];

               for (const file of files) {
                   try {
                       const filePath = path.join(tempImagesDir, file);
                       const stats = await fs.stat(filePath);
                       const ageMinutes = (Date.now() - stats.mtime.getTime()) / (1000 * 60);
                       const ageHours = ageMinutes / 60;

                       // ตรวจสอบว่าเป็นไฟล์รูปภาพ
                       const ext = path.extname(file).toLowerCase();
                       const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);

                       fileDetails.push({
                           filename: file,
                           size: stats.size,
                           sizeMB: Math.round(stats.size / 1024 / 1024 * 100) / 100,
                           sizeKB: Math.round(stats.size / 1024 * 100) / 100,
                           created: stats.birthtime,
                           modified: stats.mtime,
                           ageMinutes: Math.round(ageMinutes),
                           ageHours: Math.round(ageHours * 100) / 100,
                           url: `/api/product-images/images/temp/${file}`,
                           fullUrl: `${req.protocol}://${req.get('host')}/api/product-images/images/temp/${file}`,
                           isImage: isImage,
                           extension: ext,
                           isExpired: ageHours > 2, // มากกว่า 2 ชั่วโมง
                           isOld: ageMinutes > 30 // มากกว่า 30 นาที
                       });
                   } catch (error) {
                       fileDetails.push({
                           filename: file,
                           error: error.message,
                           errorType: 'stat_failed'
                       });
                   }
               }

               // เรียงตามเวลาที่สร้าง (ใหม่สุดก่อน)
               fileDetails.sort((a, b) => {
                   if (a.modified && b.modified) {
                       return new Date(b.modified) - new Date(a.modified);
                   }
                   return 0;
               });

               const summary = {
                   totalFiles: fileDetails.length,
                   totalSize: fileDetails.reduce((sum, f) => sum + (f.size || 0), 0),
                   totalSizeMB: Math.round(fileDetails.reduce((sum, f) => sum + (f.size || 0), 0) / 1024 / 1024 * 100) / 100,
                   imageFiles: fileDetails.filter(f => f.isImage).length,
                   expiredFiles: fileDetails.filter(f => f.isExpired).length,
                   oldFiles: fileDetails.filter(f => f.isOld).length,
                   errorFiles: fileDetails.filter(f => f.error).length
               };

               logger.info('✅ Temp images listed successfully:', summary);

               res.json({
                   success: true,
                   tempDir: tempImagesDir,
                   summary: summary,
                   files: fileDetails,
                   actions: {
                       cleanup: 'POST /api/product-images/images/temp/cleanup',
                       cleanupOld: 'POST /api/product-images/images/temp/cleanup?maxAgeMinutes=30',
                       cleanupExpired: 'POST /api/product-images/images/temp/cleanup?maxAgeMinutes=120'
                   }
               });

           } catch (dirError) {
               logger.warn('📁 Temp directory not accessible:', {
                   tempImagesDir: tempImagesDir,
                   error: dirError.message
               });

               res.json({
                   success: true,
                   tempDir: tempImagesDir,
                   summary: {
                       totalFiles: 0,
                       totalSize: 0,
                       totalSizeMB: 0,
                       imageFiles: 0,
                       expiredFiles: 0,
                       oldFiles: 0,
                       errorFiles: 0
                   },
                   files: [],
                   message: 'Temp directory does not exist or is empty',
                   actions: {
                       create: 'POST /api/product-images/images/temp/create',
                       cleanup: 'POST /api/product-images/images/temp/cleanup'
                   }
               });
           }

       } catch (error) {
           logger.error('❌ Error listing temp files:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: error.message,
               tempDir: path.join(__dirname, '..', 'temp_images')
           });
       }
   });

   // Manual cleanup endpoint
   router.post('/images/temp/cleanup', async (req, res) => {
       try {
           const tempImagesDir = path.join(__dirname, '..', 'temp_images');
           const { maxAgeMinutes = 30, dryRun = false, force = false } = req.body;
           
           logger.info('🧹 Starting temp images cleanup:', {
               tempImagesDir: tempImagesDir,
               maxAgeMinutes: maxAgeMinutes,
               dryRun: dryRun,
               force: force
           });
           
           let cleanedFiles = 0;
           let errors = [];
           let totalFiles = 0;
           let skippedFiles = 0;
           let cleanedSize = 0;

           try {
               await fs.mkdir(tempImagesDir, { recursive: true });
               const files = await fs.readdir(tempImagesDir);
               totalFiles = files.length;
               const now = Date.now();

               if (totalFiles === 0) {
                   return res.json({
                       success: true,
                       message: 'No files to clean up',
                       summary: {
                           totalFiles: 0,
                           cleanedFiles: 0,
                           skippedFiles: 0,
                           errors: 0,
                           cleanedSizeMB: 0
                       }
                   });
               }

               for (const file of files) {
                   try {
                       const filePath = path.join(tempImagesDir, file);
                       const stats = await fs.stat(filePath);
                       const ageMinutes = (now - stats.mtime.getTime()) / (1000 * 60);

                       if (ageMinutes > maxAgeMinutes || force) {
                           if (!dryRun) {
                               await fs.unlink(filePath);
                               cleanedSize += stats.size;
                           }
                           cleanedFiles++;
                           
                           logger.debug(`${dryRun ? '🔍' : '🗑️'} ${dryRun ? 'Would clean' : 'Cleaned'} temp file:`, {
                               file: file,
                               ageMinutes: Math.round(ageMinutes),
                               sizeMB: Math.round(stats.size / 1024 / 1024 * 100) / 100
                           });
                       } else {
                           skippedFiles++;
                       }
                   } catch (error) {
                       errors.push({
                           file: file,
                           error: error.message,
                           operation: dryRun ? 'check' : 'delete'
                       });
                   }
               }

               const summary = {
                   totalFiles: totalFiles,
                   cleanedFiles: cleanedFiles,
                   skippedFiles: skippedFiles,
                   errors: errors.length,
                   cleanedSizeMB: Math.round(cleanedSize / 1024 / 1024 * 100) / 100,
                   maxAgeMinutes: maxAgeMinutes,
                   dryRun: dryRun,
                   force: force
               };

               logger.info(`✅ Temp cleanup ${dryRun ? 'simulation' : 'completed'}:`, summary);

               res.json({
                   success: true,
                   message: dryRun ? 
                       `Would clean up ${cleanedFiles}/${totalFiles} temp files` :
                       `Cleaned up ${cleanedFiles}/${totalFiles} temp files`,
                   summary: summary,
                   errors: errors.length > 0 ? errors : undefined,
                   recommendation: cleanedFiles === 0 && skippedFiles > 0 ? 
                       'No files old enough to clean. Consider using lower maxAgeMinutes or force=true' : undefined
               });

           } catch (dirError) {
               if (dirError.code === 'ENOENT') {
                   res.json({
                       success: true,
                       message: 'Temp directory does not exist - nothing to clean up',
                       summary: {
                           totalFiles: 0,
                           cleanedFiles: 0,
                           skippedFiles: 0,
                           errors: 0,
                           cleanedSizeMB: 0
                       }
                   });
               } else {
                   throw dirError;
               }
           }

       } catch (error) {
           logger.error('❌ Error in temp cleanup:', {
               error: error.message,
               stack: error.stack
           });
           
           res.status(500).json({
               success: false,
               error: error.message,
               tempDir: path.join(__dirname, '..', 'temp_images')
           });
       }
   });

   // Create temp directory endpoint
   router.post('/images/temp/create', async (req, res) => {
       try {
           const tempImagesDir = path.join(__dirname, '..', 'temp_images');
           
           await fs.mkdir(tempImagesDir, { recursive: true, mode: 0o755 });
           
           // ตรวจสอบว่าสร้างสำเร็จ
           const stats = await fs.stat(tempImagesDir);
           
           logger.info('📁 Temp directory created/verified:', {
               tempImagesDir: tempImagesDir,
               isDirectory: stats.isDirectory(),
               permissions: stats.mode.toString(8)
           });
           
           res.json({
               success: true,
               message: 'Temp directory created/verified successfully',
               tempDir: tempImagesDir,
               permissions: stats.mode.toString(8),
               isDirectory: stats.isDirectory()
           });
           
       } catch (error) {
           logger.error('❌ Error creating temp directory:', error);
           res.status(500).json({
               success: false,
               error: error.message
           });
       }
   });

   // Temp directory status endpoint
   router.get('/images/temp/status', async (req, res) => {
       try {
           const tempImagesDir = path.join(__dirname, '..', 'temp_images');
           
           const status = {
               tempDir: tempImagesDir,
               exists: false,
               isDirectory: false,
               readable: false,
               writable: false,
               fileCount: 0,
               totalSize: 0,
               permissions: null,
               created: null,
               modified: null
           };
           
           try {
               // ตรวจสอบการมีอยู่
               await fs.access(tempImagesDir);
               status.exists = true;
               
               // ตรวจสอบการอ่าน
               await fs.access(tempImagesDir, fs.constants.R_OK);
               status.readable = true;
               
               // ตรวจสอบการเขียน
               await fs.access(tempImagesDir, fs.constants.W_OK);
               status.writable = true;
               
               // ข้อมูล directory
               const stats = await fs.stat(tempImagesDir);
               status.isDirectory = stats.isDirectory();
               status.permissions = stats.mode.toString(8);
               status.created = stats.birthtime;
               status.modified = stats.mtime;
               
               // นับไฟล์
               if (status.isDirectory && status.readable) {
                   const files = await fs.readdir(tempImagesDir);
                   status.fileCount = files.length;
                   
                   for (const file of files) {
                       try {
                           const fileStats = await fs.stat(path.join(tempImagesDir, file));
                           status.totalSize += fileStats.size;
                       } catch (error) {
                           // Skip file if can't stat
                       }
                   }
               }
               
           } catch (error) {
               // Directory doesn't exist or not accessible
               status.error = error.message;
           }
           
           status.totalSizeMB = Math.round(status.totalSize / 1024 / 1024 * 100) / 100;
           status.healthy = status.exists && status.isDirectory && status.readable && status.writable;
           
           res.json({
               success: true,
               status: status
           });
           
       } catch (error) {
           logger.error('❌ Error checking temp directory status:', error);
           res.status(500).json({
               success: false,
               error: error.message
           });
       }
   });

   // Debug temp file serving endpoint
   router.get('/images/temp/:filename/debug', async (req, res) => {
       try {
           const { filename } = req.params;
           const tempImagesDir = path.join(__dirname, '..', 'temp_images');
           const filePath = path.join(tempImagesDir, filename);
           
           const debugInfo = {
               filename: filename,
               tempDir: tempImagesDir,
               filePath: filePath,
               timestamp: new Date().toISOString(),
               checks: {}
           };
           
           // ตรวจสอบ directory
           try {
               await fs.access(tempImagesDir);
               debugInfo.checks.directoryExists = true;
               
               const dirStats = await fs.stat(tempImagesDir);
               debugInfo.checks.directoryInfo = {
                   isDirectory: dirStats.isDirectory(),
                   permissions: dirStats.mode.toString(8),
                   created: dirStats.birthtime,
                   modified: dirStats.mtime
               };
           } catch (error) {
               debugInfo.checks.directoryExists = false;
               debugInfo.checks.directoryError = error.message;
           }
           
           // ตรวจสอบไฟล์
           try {
               await fs.access(filePath);
               debugInfo.checks.fileExists = true;
               
               const fileStats = await fs.stat(filePath);
               debugInfo.checks.fileInfo = {
                   size: fileStats.size,
                   sizeMB: Math.round(fileStats.size / 1024 / 1024 * 100) / 100,
                   isFile: fileStats.isFile(),
                   permissions: fileStats.mode.toString(8),
                   created: fileStats.birthtime,
                   modified: fileStats.mtime,
                   ageMinutes: Math.round((Date.now() - fileStats.mtime.getTime()) / (1000 * 60))
               };
           } catch (error) {
               debugInfo.checks.fileExists = false;
               debugInfo.checks.fileError = error.message;
           }
           
           // ตรวจสอบการอ่าน
           try {
               await fs.access(filePath, fs.constants.R_OK);
               debugInfo.checks.fileReadable = true;
               
               // อ่านส่วนเริ่มต้น
               const buffer = await fs.readFile(filePath, { start: 0, end: 99 });
               debugInfo.checks.readTest = {
                   bytesRead: buffer.length,
                   firstBytesHex: buffer.slice(0, 10).toString('hex'),
                   readable: true
               };
           } catch (error) {
               debugInfo.checks.fileReadable = false;
               debugInfo.checks.readError = error.message;
           }
           
           // ตรวจสอบไฟล์ทั้งหมดใน directory
           try {
               const files = await fs.readdir(tempImagesDir);
               debugInfo.directoryContents = {
                   totalFiles: files.length,
                   hasRequestedFile: files.includes(filename),
                   allFiles: files.slice(0, 20), // แค่ 20 ไฟล์แรก
                   similarFiles: files.filter(f => {
                       const parts = filename.split('_');
                       return parts.some(part => part.length > 3 && f.includes(part));
                   })
               };
           } catch (error) {
               debugInfo.directoryContents = {
                   error: error.message
               };
           }
           
           // URL tests
           const baseUrl = process.env.NGROK_URL || process.env.BASE_URL || process.env.PUBLIC_URL;
           if (baseUrl) {
               debugInfo.urlTests = {
                   baseUrl: baseUrl,
                   generatedUrl: `${baseUrl}/api/product-images/images/temp/${filename}`,
                   localUrl: `http://localhost:${process.env.PORT || 3000}/api/product-images/images/temp/${filename}`
               };
           }
           
           res.json({
               success: true,
               debug: debugInfo
           });
           
       } catch (error) {
           res.status(500).json({
               success: false,
               error: error.message,
               filename: req.params.filename
           });
       }
   });

   // Enhanced temp image serving endpoint
   router.get('/images/temp/:filename', async (req, res) => {
       const startTime = Date.now();
       
       try {
           const { filename } = req.params;
           
           // Security validation
           if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
               logger.warn('🚫 Invalid filename attempted:', { 
                   filename, 
                   ip: req.ip,
                   userAgent: req.get('User-Agent')?.substring(0, 50) + '...'
               });
               return res.status(400).json({
                   success: false,
                   error: 'Invalid filename'
               });
           }
           
           const tempImagesDir = path.join(__dirname, '..', 'temp_images');
           const filePath = path.join(tempImagesDir, filename);
           
           logger.info('🔍 Serving temp image request:', {
               filename,
               filePath,
               tempImagesDir,
               userAgent: req.get('User-Agent')?.substring(0, 50) + '...',
               ip: req.ip,
               referer: req.get('Referer'),
               method: req.method
           });
           
           // Enhanced directory creation and verification
           try {
               await fs.mkdir(tempImagesDir, { recursive: true });
               const dirStats = await fs.stat(tempImagesDir);
               if (!dirStats.isDirectory()) {
                   throw new Error('Temp path exists but is not a directory');
               }
               logger.debug('📁 Temp directory verified:', { tempImagesDir });
           } catch (dirError) {
               logger.error('❌ Cannot create/access temp directory:', {
                   tempImagesDir,
                   error: dirError.message
               });
               return res.status(500).json({
                   success: false,
                   error: 'Temp directory not accessible'
               });
           }
           
           // Enhanced file existence and verification
           let fileExists = false;
           let stats = null;
           
           try {
               // Method 1: Check file access
               await fs.access(filePath, fs.constants.F_OK | fs.constants.R_OK);
               
               // Method 2: Get file stats
               stats = await fs.stat(filePath);
               
               // Method 3: Verify it's a regular file and has size
               if (!stats.isFile()) {
                   throw new Error('Path exists but is not a regular file');
               }
               
               if (stats.size === 0) {
                   throw new Error('File is empty');
               }
               
               fileExists = true;
               
           } catch (error) {
               logger.error('❌ Temp image file not found or not accessible:', { 
                   filename, 
                   filePath,
                   error: error.message,
                   errno: error.errno,
                   code: error.code
               });
               
               // Enhanced directory listing for debugging
               try {
                   const files = await fs.readdir(tempImagesDir);
                   const fileAnalysis = {
                       tempImagesDir,
                       fileCount: files.length,
                       requestedFile: filename,
                       hasRequestedFile: files.includes(filename),
                       recentFiles: files
                           .map(f => {
                               try {
                                   const fPath = path.join(tempImagesDir, f);
                                   const fStats = require('fs').statSync(fPath);
                                   return {
                                       name: f,
                                       size: fStats.size,
                                       age: Math.round((Date.now() - fStats.mtime.getTime()) / (1000 * 60))
                                   };
                               } catch {
                                   return { name: f, error: 'cannot stat' };
                               }
                           })
                           .sort((a, b) => (a.age || 999) - (b.age || 999))
                           .slice(0, 10)
                   };
                   
                   // Look for similar files
                   const similarFiles = files.filter(f => {
                       const filenameParts = filename.split('_');
                       return filenameParts.some(part => part.length > 3 && f.includes(part));
                   });
                   
                   if (similarFiles.length > 0) {
                       fileAnalysis.similarFiles = similarFiles;
                       logger.warn('🔍 Found similar files in temp directory:', {
                           requestedFile: filename,
                           similarFiles: similarFiles
                       });
                   }
                   
                   logger.info('📁 Current temp directory analysis:', fileAnalysis);
                   
               } catch (dirError) {
                   logger.error('❌ Cannot analyze temp directory:', {
                       tempImagesDir,
                       error: dirError.message
                   });
               }
               
               return res.status(404).json({
                   success: false,
                   error: 'Temp image not found',
                   filename: filename,
                   tempDir: tempImagesDir,
                   details: error.message,
                   troubleshooting: {
                       suggestion: 'File may have expired or was not properly created',
                       checkUrl: 'Verify the image URL is correct and recently generated',
                       debugEndpoint: `/api/product-images/images/temp/${filename}/debug`
                   }
               });
           }
           
           // Read and serve file with enhanced error handling
           try {
               const imageBuffer = await fs.readFile(filePath);
               
               if (imageBuffer.length === 0) {
                   throw new Error('File is empty after reading');
               }
               
               if (imageBuffer.length !== stats.size) {
                   throw new Error(`File size mismatch during read: expected ${stats.size}, got ${imageBuffer.length}`);
               }
               
               // Determine content type
               const ext = path.extname(filename).toLowerCase();
               const mimeTypes = {
                   '.jpg': 'image/jpeg',
                   '.jpeg': 'image/jpeg', 
                   '.png': 'image/png',
                   '.gif': 'image/gif',
                   '.webp': 'image/webp',
                   '.bmp': 'image/bmp',
                   '.svg': 'image/svg+xml'
               };
               
               const contentType = mimeTypes[ext] || 'image/jpeg';
               
               // Set comprehensive headers for LINE API compatibility
               res.setHeader('Content-Type', contentType);
               res.setHeader('Content-Length', imageBuffer.length);
               res.setHeader('Cache-Control', 'public, max-age=3600, immutable'); // 1 hour for temp files
               res.setHeader('Access-Control-Allow-Origin', '*');
               res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
               res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, User-Agent');
               res.setHeader('ngrok-skip-browser-warning', 'true');
               res.setHeader('Last-Modified', stats.mtime.toUTCString());
               res.setHeader('Accept-Ranges', 'bytes');
               
               // ETag for caching
               const etag = `"${stats.mtime.getTime()}-${stats.size}"`;
               res.setHeader('ETag', etag);
               
               // Additional headers for better LINE API compatibility
               res.setHeader('Server', 'nginx/1.18.0');
               res.setHeader('Connection', 'keep-alive');
               
               // Handle conditional requests
               const ifNoneMatch = req.get('If-None-Match');
               if (ifNoneMatch === etag) {
                   logger.info('📦 Serving cached temp image (304):', { filename });
                   return res.status(304).end();
               }
               
               // Send image buffer
               res.send(imageBuffer);
               
               const responseTime = Date.now() - startTime;
               
               logger.info('✅ Temp image served successfully:', {
                   filename,
                   size: imageBuffer.length,
                   contentType,
                   responseTime: `${responseTime}ms`,
                   userAgent: req.get('User-Agent')?.substring(0, 30) + '...'
               });
               
           } catch (readError) {
               logger.error('❌ Error reading temp image file:', {
                   filename,
                   filePath,
                   error: readError.message,
                   fileSize: stats?.size
               });
               
               return res.status(500).json({
                   success: false,
                   error: 'Error reading temp image file',
                   details: readError.message
               });
           }
           
       } catch (error) {
           const responseTime = Date.now() - startTime;
           
           logger.error('❌ Error serving temp image:', {
               error: error.message,
               filename: req.params.filename,
               responseTime: `${responseTime}ms`,
               stack: error.stack,
               userAgent: req.get('User-Agent')?.substring(0, 50) + '...'
           });
           
           res.status(500).json({
               success: false,
               error: 'Internal server error',
               filename: req.params.filename
           });
       }
   });

   // HEAD method support for temp images
   router.head('/images/temp/:filename', async (req, res) => {
       try {
           const { filename } = req.params;
           
           // Security validation
           if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
               logger.warn('🚫 HEAD request with invalid filename:', { filename, ip: req.ip });
               return res.status(400).end();
           }
           
           const tempImagesDir = path.join(__dirname, '..', 'temp_images');
           const filePath = path.join(tempImagesDir, filename);
           
           logger.info('🔍 HEAD request for temp image:', {
               filename,
               filePath,
               userAgent: req.get('User-Agent')?.substring(0, 50) + '...',
               ip: req.ip
           });
           
           // Check if file exists and get stats
           let fileExists = false;
           let stats = null;
           
           try {
               await fs.access(filePath);
               stats = await fs.stat(filePath);
               fileExists = true;
           } catch (error) {
               logger.warn('🔍 HEAD request - file not found:', { 
                   filename,
                   filePath,
                   error: error.message
               });
               return res.status(404).end();
           }
           
           // Determine content type
           const ext = path.extname(filename).toLowerCase();
           const mimeTypes = {
               '.jpg': 'image/jpeg',
               '.jpeg': 'image/jpeg',
               '.png': 'image/png',
               '.gif': 'image/gif',
               '.webp': 'image/webp',
               '.bmp': 'image/bmp',
               '.svg': 'image/svg+xml'
           };
           
           const contentType = mimeTypes[ext] || 'image/jpeg';
           
           // Set comprehensive headers for LINE API compatibility
           res.setHeader('Content-Type', contentType);
           res.setHeader('Content-Length', stats.size);
           res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
           res.setHeader('Access-Control-Allow-Origin', '*');
           res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
           res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, User-Agent');
           res.setHeader('ngrok-skip-browser-warning', 'true');
           res.setHeader('Last-Modified', stats.mtime.toUTCString());
           res.setHeader('Accept-Ranges', 'bytes');
           
           // ETag for caching
           const etag = `"${stats.mtime.getTime()}-${stats.size}"`;
           res.setHeader('ETag',
           etag);
           
           // Additional headers for better LINE API compatibility
           res.setHeader('Server', 'nginx/1.18.0');
           res.setHeader('Connection', 'keep-alive');
           
           logger.info('✅ HEAD request served successfully:', { 
               filename,
               size: stats.size,
               contentType 
           });
           
           res.status(200).end();
           
       } catch (error) {
           logger.error('❌ Error in HEAD request for temp image:', {
               error: error.message,
               filename: req.params.filename,
               stack: error.stack,
               userAgent: req.get('User-Agent')?.substring(0, 50) + '...'
           });
           res.status(500).end();
       }
   });

   // *** API endpoint สำหรับ serve รูปภาพจาก products/images ***
   router.get('/images/product/:filename', async (req, res) => {
       try {
           const { filename } = req.params;
           const imagesDir = path.join(__dirname, '..', 'products', 'images');
           const filePath = path.join(imagesDir, filename);
           
           logger.info(`Serving product image: ${filename}`, {
               filename: filename,
               filePath: filePath,
               timestamp: new Date().toISOString()
           });
           
           // ตรวจสอบว่าไฟล์มีอยู่จริง
           const fileExists = await checkFileExists(filePath);
           if (!fileExists) {
               logger.warn('Image file not found', { 
                   filePath: filePath, 
                   filename: filename,
                   timestamp: new Date().toISOString()
               });
               return res.status(404).json({
                   success: false,
                   error: 'Image not found'
               });
           }
           
           // ตรวจสอบประเภทไฟล์และกำหนด Content-Type
           const ext = path.extname(filename).toLowerCase();
           const mimeTypes = {
               '.jpg': 'image/jpeg',
               '.jpeg': 'image/jpeg',
               '.png': 'image/png',
               '.gif': 'image/gif',
               '.webp': 'image/webp',
               '.bmp': 'image/bmp'
           };
           
           const mimeType = mimeTypes[ext] || 'application/octet-stream';
           
           // ตั้งค่า headers
           res.setHeader('Content-Type', mimeType);
           res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
           res.setHeader('Access-Control-Allow-Origin', '*');
           res.setHeader('Access-Control-Allow-Methods', 'GET');
           res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
           
           // ส่งไฟล์
           res.sendFile(path.resolve(filePath), (err) => {
               if (err) {
                   logger.error('Error sending file:', {
                       error: err.message,
                       filename: filename,
                       filePath: filePath
                   });
                   if (!res.headersSent) {
                       res.status(500).json({
                           success: false,
                           error: 'Error serving image'
                       });
                   }
               } else {
                   logger.info('Image served successfully', {
                       filename: filename,
                       mimeType: mimeType
                   });
               }
           });
           
       } catch (error) {
           logger.error('Error serving product image:', {
               error: error.message,
               filename: req.params.filename,
               stack: error.stack
           });
           
           if (!res.headersSent) {
               res.status(500).json({
                   success: false,
                   error: 'Internal server error'
               });
           }
       }
   });

   // *** Basic Configuration Endpoints ***
   router.get('/config', (req, res) => {
       try {
           const config = productImageSender.getConfig();
           res.json({
               success: true,
               config: config
           });
       } catch (error) {
           logger.error('Error getting config:', error);
           res.status(500).json({
               success: false,
               error: 'Internal server error'
           });
       }
   });

   router.post('/config', async (req, res) => {
       try {
           const result = await productImageSender.updateConfig(req.body);
           res.json(result);
       } catch (error) {
           logger.error('Error updating config:', error);
           res.status(500).json({
               success: false,
               error: error.message
           });
       }
   });

   router.post('/config/custom', async (req, res) => {
       try {
           const result = await productImageSender.updateCustomConfig(req.body);
           res.json(result);
       } catch (error) {
           logger.error('Error updating custom config:', error);
           res.status(500).json({
               success: false,
               error: error.message
           });
       }
   });
   
   // *** Test Send Endpoints ***
   router.post('/test', async (req, res) => {
       try {
           const { userId, productUrl } = req.body;
           
           if (!userId || !productUrl) {
               return res.status(400).json({
                   success: false,
                   error: 'userId and productUrl are required'
               });
           }
           
           const result = await productImageSender.testImageSend(userId, productUrl);
           res.json(result);
       } catch (error) {
           logger.error('Error testing image send:', error);
           res.status(500).json({
               success: false,
               error: error.message
           });
       }
   });

  // *** Statistics Endpoints ***
  router.get('/stats/user/:userId', (req, res) => {
      try {
          const { userId } = req.params;
          const stats = productImageSender.getUserStatistics(userId);
          res.json({
              success: true,
              userId: userId,
              statistics: stats
          });
      } catch (error) {
          logger.error('Error getting user statistics:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

  router.get('/stats/global', (req, res) => {
      try {
          const stats = productImageSender.getGlobalStatistics();
          res.json({
              success: true,
              statistics: stats
          });
      } catch (error) {
          logger.error('Error getting global statistics:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

  // *** Product Image Management ***
  router.get('/products/:encodedUrl/images', async (req, res) => {
      try {
          const productUrl = decodeURIComponent(req.params.encodedUrl);
          const imageDetails = await productImageSender.getProductImageDetails(productUrl);

          res.json({
              success: true,
              ...imageDetails
          });
      } catch (error) {
          logger.error('Error getting product images:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });
  
  // *** NEW: Update Image Selections for a Product ***
  router.post('/products/:encodedUrl/selections', async (req, res) => {
      try {
          const productUrl = decodeURIComponent(req.params.encodedUrl);
          const selections = req.body; // { selectedImages: string[], imageOrder: { [key:string]: number } }

          if (!selections || !selections.selectedImages || !selections.imageOrder) {
              return res.status(400).json({
                  success: false,
                  error: 'Invalid selection data provided. Required: selectedImages (array) and imageOrder (object).',
              });
          }

          logger.info('Updating image selections for product', { productUrl, selectedCount: selections.selectedImages.length });

          const result = await productImageSender.updateProductImageSelections(productUrl, selections);

          res.json({
              success: true,
              message: 'Selections updated successfully.',
              data: result,
          });

      } catch (error) {
          logger.error('Error updating image selections route:', error);
          res.status(500).json({
              success: false,
              error: error.message,
          });
      }
  });

  router.get('/products/:encodedUrl/stats', async (req, res) => {
      try {
          const productUrl = decodeURIComponent(req.params.encodedUrl);
          const stats = await productImageSender.getProductImageStatistics(productUrl);

          res.json({
              success: true,
              statistics: stats
          });
      } catch (error) {
          logger.error('Error getting product image statistics:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

  // *** Get all products with images ***
  router.get('/products', async (req, res) => {
      try {
          const products = await productImageSender.getAllProductsWithImages();
          res.json({
              success: true,
              products: products,
              total: products.length
          });
      } catch (error) {
          logger.error('Error getting products with images:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

  // Upload images to product
  router.post('/products/:encodedUrl/images', upload.array('images', 10), async (req, res) => {
      try {
          const productUrl = decodeURIComponent(req.params.encodedUrl);
          const files = req.files;
          
          if (!files || files.length === 0) {
              return res.status(400).json({
                  success: false,
                  error: 'No images provided'
              });
          }
          
          logger.info('Processing image upload', {
              productUrl,
              fileCount: files.length
          });

          const uploadResults = [];
          const errors = [];

          for (let i = 0; i < files.length; i++) {
              const file = files[i];
              
              try {
                  // Generate safe filename
                  const timestamp = Date.now();
                  const randomStr = Math.random().toString(36).substring(2, 8);
                  const ext = path.extname(file.originalname);
                  const nameWithoutExt = path.basename(file.originalname, ext);
                  const cleanName = nameWithoutExt.replace(/[^a-zA-Z0-9.-]/g, '_');
                  const safeFilename = `upload_${timestamp}_${randomStr}_${cleanName}${ext}`;

                  // Move file to images directory
                  const targetPath = await productImageSender.moveImageFile(file.path, safeFilename);

                  // สร้าง URL ที่ถูกต้อง
                  const baseUrl = process.env.NGROK_URL || process.env.BASE_URL || process.env.PUBLIC_URL || 'http://localhost:3000';
                  const imageUrl = `${baseUrl}/api/product-images/images/product/${safeFilename}`;

                  const imageData = {
                      filename: file.originalname,
                      safeFilename: safeFilename,
                      originalName: file.originalname,
                      localPath: file.path,
                      targetPath: targetPath,
                      url: imageUrl, // เพิ่ม URL ที่ถูกต้อง
                      size: file.size,
                      uploadedManually: true,
                      uploadedAt: new Date().toISOString(),
                      status: 'downloaded',
                      alt: `${file.originalname}`,
                      title: `รูปภาพของสินค้า`,
                      isPrimary: false,
                      selected: false,
                      order: 999
                  };

                  uploadResults.push(imageData);
                  
              } catch (error) {
                  logger.error('Error processing file:', error);
                  errors.push({
                      filename: file.originalname,
                      error: error.message
                  });
              }
          }

          // Add uploaded images to product
          if (uploadResults.length > 0) {
              try {
                  const addResult = await productImageSender.addImagesToProduct(
                      productUrl, 
                      uploadResults
                  );
                  
                  logger.info('Images added to product successfully', addResult);
                  
              } catch (error) {
                  logger.error('Error adding images to product:', error);
                  errors.push({
                      filename: 'bulk_add',
                      error: `Failed to add images to product: ${error.message}`
                  });
              }
          }

          res.json({
              success: uploadResults.length > 0,
              message: `Uploaded ${uploadResults.length} images successfully`,
              uploadedImages: uploadResults.map(img => ({
                  originalName: img.originalName,
                  filename: img.safeFilename,
                  size: img.size,
                  uploadedAt: img.uploadedAt,
                  url: img.url
              })),
              errors: errors,
              totalUploaded: uploadResults.length,
              totalErrors: errors.length
          });

      } catch (error) {
          logger.error('Error uploading images:', error);
          
          // Clean up temp files
          if (req.files) {
              for (const file of req.files) {
                  try {
                      if (await productImageSender.fileExists(file.path)) {
                          await fs.unlink(file.path);
                      }
                  } catch (cleanupError) {
                      logger.warn('Failed to cleanup temp file:', cleanupError);
                  }
              }
          }
          
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

  // Remove image from product
  router.delete('/products/:encodedUrl/images/:filename', async (req, res) => {
      try {
          const productUrl = decodeURIComponent(req.params.encodedUrl);
          const { filename } = req.params;
          
          logger.info('Deleting image', { productUrl, filename });

          // Find image first
          const findResult = productImageSender.findImageInProduct(productUrl, filename);
          
          if (!findResult.found) {
              logger.warn('Image not found for deletion', {
                  productUrl,
                  filename,
                  reason: findResult.reason,
                  availableImages: findResult.availableImages
              });
              
              return res.status(404).json({
                  success: false,
                  error: `Image not found: ${findResult.reason}`,
                  availableImages: findResult.availableImages,
                  searchedFilename: filename
              });
          }

          const actualFilename = findResult.image.filename;
          logger.info('Found image for deletion', {
              searchFilename: filename,
              actualFilename: actualFilename,
              method: findResult.method
          });

          // Delete from productImageSender
          const result = await productImageSender.removeImageFromProduct(productUrl, filename);
          
          // Delete physical file
          const deleteResult = await productImageSender.deleteImageFile(actualFilename);

          res.json({
              success: true,
              message: 'Image deleted successfully',
              deletedImage: result.removedImage,
              fileDeleted: deleteResult.deleted,
              searchFilename: filename,
              actualFilename: actualFilename
          });

      } catch (error) {
          logger.error('Error deleting image:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

  // *** History Management ***
  router.delete('/history/user/:userId', async (req, res) => {
      try {
          const { userId } = req.params;
          const result = await productImageSender.clearUserHistory(userId);
          res.json(result);
      } catch (error) {
          logger.error('Error clearing user history:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

  router.delete('/history/product/:encodedUrl', async (req, res) => {
      try {
          const productUrl = decodeURIComponent(req.params.encodedUrl);
          const result = await productImageSender.clearProductHistory(productUrl);
          res.json(result);
      } catch (error) {
          logger.error('Error clearing product history:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

  router.get('/history/user/:userId', (req, res) => {
      try {
          const { userId } = req.params;
          const stats = productImageSender.getUserStatistics(userId);
          
          res.json({
              success: true,
              userId: userId,
              history: stats.productBreakdown || {},
              summary: {
                  totalProducts: stats.totalProductsWithImages || 0,
                  totalImages: stats.totalImagesSent || 0,
                  totalEvents: stats.totalSendEvents || 0,
                  lastActivity: stats.lastActivity || null
              }
          });
      } catch (error) {
          logger.error('Error getting user history:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

  // *** Import/Export ***
  router.get('/export', async (req, res) => {
      try {
          const result = await productImageSender.exportData();
          
          if (result.success) {
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Content-Disposition', `attachment; filename="product_image_sender_export_${Date.now()}.json"`);
              
              if (result.exportPath) {
                  res.download(result.exportPath);
              } else {
                  res.json(result);
              }
          } else {
              res.status(500).json(result);
          }
      } catch (error) {
          logger.error('Error exporting data:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

  router.post('/import', upload.single('importFile'), async (req, res) => {
      try {
          if (!req.file) {
              return res.status(400).json({
                  success: false,
                  error: 'No import file provided'
              });
          }
          
          const result = await productImageSender.importData(req.file.path);
          res.json(result);
      } catch (error) {
          logger.error('Error importing data:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

  // *** Utility Endpoints ***
  router.get('/health', async (req, res) => {
      try {
          const health = await productImageSender.healthCheck();
          res.json(health);
      } catch (error) {
          logger.error('Error checking health:', error);
          res.status(500).json({
              status: 'unhealthy',
              error: error.message
          });
      }
  });

  router.get('/info', (req, res) => {
      try {
          const config = productImageSender.getConfig();
          
          res.json({
              success: true,
              service: 'ProductImageSender',
              version: '2.0.0',
              status: config.enabled ? 'enabled' : 'disabled',
              features: [
                  'Manual image selection and ordering',
                  'Original file sending without conversion',
                  'Multiple display modes (Individual, Carousel, Flex)',
                  'URL detection and product matching',
                  'Send history tracking and duplicate prevention',
                  'Real-time selection management',
                  'Enhanced temp image management'
              ],
              configuration: {
                  enabled: config.enabled,
                  maxImagesPerProduct: config.maxImagesPerProduct,
                  preventDuplicateSends: config.preventDuplicateSends,
                  autoSendOnUrlDetection: config.autoSendOnUrlDetection,
                  imageSelectionMode: config.imageSelectionMode,
                  imageDisplayMode: config.imageDisplayMode,
                  useOriginalImages: config.useOriginalImages,
                  sendDelay: config.sendDelay
              },
              statistics: config.statistics || {},
              endpoints: {
                  config: '/api/product-images/config',
                  test: '/api/product-images/test',
                  stats: '/api/product-images/stats',
                  products: '/api/product-images/products',
                  history: '/api/product-images/history',
                  export: '/api/product-images/export',
                  import: '/api/product-images/import',
                  health: '/api/product-images/health',
                  imageServing: '/api/product-images/images/product/:filename',
                  tempImages: '/api/product-images/images/temp',
                  tempImageServing: '/api/product-images/images/temp/:filename'
              }
          });
      } catch (error) {
          logger.error('Error getting service info:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

  // Validate product URLs
  router.post('/validate-urls', async (req, res) => {
      try {
          const { urls } = req.body;
          
          if (!urls || !Array.isArray(urls)) {
              return res.status(400).json({
                  success: false,
                  error: 'urls array is required'
              });
          }

          const validationResults = [];
          
          for (const url of urls) {
              try {
                  const productData = await productImageSender.findProductByUrl(url);
                  
                  if (productData) {
                      const validImages = productData.images.filter(img => 
                          img.status === 'downloaded' && !img.skipped
                      );
                      
                      validationResults.push({
                          url: url,
                          valid: true,
                          productName: productData.productName,
                          totalImages: productData.images.length,
                          validImages: validImages.length,
                          hasImages: validImages.length > 0
                      });
                  } else {
                      validationResults.push({
                          url: url,
                          valid: false,
                          error: 'Product not found'
                      });
                  }
              } catch (error) {
                  validationResults.push({
                      url: url,
                      valid: false,
                      error: error.message
                  });
              }
          }

          const summary = {
              total: validationResults.length,
              valid: validationResults.filter(r => r.valid).length,
              invalid: validationResults.filter(r => !r.valid).length,
              withImages: validationResults.filter(r => r.valid && r.hasImages).length,
              withoutImages: validationResults.filter(r => r.valid && !r.hasImages).length
          };

          res.json({
              success: true,
              summary: summary,
              results: validationResults
          });

      } catch (error) {
          logger.error('Error validating URLs:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

  // Get upload statistics
  router.get('/upload-stats', async (req, res) => {
      try {
          const imagesDir = path.join(__dirname, '..', 'products', 'images');
          
          let totalFiles = 0;
          let totalSize = 0;
          let uploadedFiles = 0;
          let scrapedFiles = 0;

          try {
              const files = await fs.readdir(imagesDir);
              
              for (const file of files) {
                  const filePath = path.join(imagesDir, file);
                  const stats = await fs.stat(filePath);
                  
                  totalFiles++;
                  totalSize += stats.size;
                  
                  if (file.startsWith('upload_') || file.startsWith('manual_')) {
                      uploadedFiles++;
                  } else {
                      scrapedFiles++;
                  }
              }
          } catch (error) {
              logger.warn('Error reading images directory:', error);
          }

          res.json({
              success: true,
              statistics: {
                  totalFiles,
                  totalSize,
                  totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
                  uploadedFiles,
                  scrapedFiles,
                  uploadPercentage: totalFiles > 0 ? Math.round((uploadedFiles / totalFiles) * 100) : 0
              }
          });

      } catch (error) {
          logger.error('Error getting upload statistics:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

  // Bulk operations
  router.post('/bulk-delete', async (req, res) => {
      try {
          const { productUrl, filenames } = req.body;
          
          if (!productUrl || !Array.isArray(filenames)) {
              return res.status(400).json({
                  success: false,
                  error: 'productUrl and filenames array are required'
              });
          }

          logger.info('Bulk deleting images', { productUrl, count: filenames.length });

          const removeResult = await productImageSender.removeImagesFromProduct(productUrl, filenames);
          
          const fileDeletePromises = filenames.map(filename => 
              productImageSender.deleteImageFile(filename).catch(error => ({
                  filename,
                  deleted: false,
                  error: error.message
              }))
          );
          
          const fileResults = await Promise.all(fileDeletePromises);

          res.json({
              success: removeResult.success,
              message: removeResult.message,
              removeResults: removeResult.results,
              fileResults: fileResults
          });

      } catch (error) {
          logger.error('Error in bulk delete:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

   router.post('/bulk-stats', async (req, res) => {
       try {
           const { urls } = req.body;

           if (!urls || !Array.isArray(urls)) {
               return res.status(400).json({
                   success: false,
                   error: 'An array of "urls" is required.'
               });
           }

           logger.info('Request for bulk product stats received', { count: urls.length });

           const result = await productImageSender.getBulkProductImageStatistics(urls);

           res.json(result);

       } catch (error) {
           logger.error('Error in bulk-stats:', error);
           res.status(500).json({
               success: false,
               error: error.message
           });
       }
   });

  // Get products by category with URLs
   router.get('/products/categories/:category/urls', async (req, res) => {
       try {
           const category = decodeURIComponent(req.params.category);
           const { format = 'json', includeImages = 'true' } = req.query;

           logger.info('Getting products by category', { category, format });

           const allProducts = await productImageSender.readAllProductFiles();
           
           // Filter by category
           let products = allProducts.filter(product => product.category && product.category.toLowerCase() === category.toLowerCase()
          );

          // Filter products with images
          if (includeImages === 'true') {
              products = products.filter(product => 
                  product.images && 
                  product.images.length > 0 &&
                  product.images.some(img => img.status === 'downloaded' && !img.skipped)
              );
          }

          const productUrls = products.map(product => ({
              url: product.url,
              productName: product.product_name || 'Unknown Product',
              sku: product.sku || '',
              totalImages: product.images ? product.images.filter(img => 
                  img.status === 'downloaded' && !img.skipped
              ).length : 0
          }));

          if (format === 'urls-only') {
              const urlList = productUrls.map(p => p.url).join('\n');
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.send(urlList);
          } else {
              res.json({
                  success: true,
                  category: category,
                  products: productUrls,
                  total: productUrls.length
              });
          }

      } catch (error) {
          logger.error('Error getting products by category:', error);
          
          if (req.query.format === 'urls-only') {
              res.setHeader('Content-Type', 'text/plain');
              res.status(500).send(`# Error getting products by category: ${error.message}\n`);
          } else {
              res.status(500).json({
                  success: false,
                  error: error.message
              });
          }
      }
  });

  // Get all categories
  router.get('/categories', async (req, res) => {
      try {
          const allProducts = await productImageSender.readAllProductFiles();
          
          // Extract unique categories
          const categories = [...new Set(allProducts
              .map(product => product.category)
              .filter(category => category && category.trim())
          )].sort();

          const categoryStats = categories.map(category => {
              const productsInCategory = allProducts.filter(product => product.category === category);
              const productsWithImages = productsInCategory.filter(product => 
                  product.images && 
                  product.images.length > 0 &&
                  product.images.some(img => img.status === 'downloaded' && !img.skipped)
              );

              return {
                  category: category,
                  totalProducts: productsInCategory.length,
                  productsWithImages: productsWithImages.length,
                  percentage: productsInCategory.length > 0 ? 
                      Math.round((productsWithImages.length / productsInCategory.length) * 100) : 0
              };
          });

          res.json({
              success: true,
              categories: categoryStats,
              total: categories.length
          });

      } catch (error) {
          logger.error('Error getting categories:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

  // Search products
  router.get('/search', async (req, res) => {
      try {
          const { q, category, hasImages = 'true', limit = 20, page = 1 } = req.query;
          
          if (!q || q.trim().length < 2) {
              return res.status(400).json({
                  success: false,
                  error: 'Search query must be at least 2 characters long'
              });
          }

          const allProducts = await productImageSender.readAllProductFiles();
          const searchQuery = q.toLowerCase().trim();
          
          // Filter products based on search criteria
          let filteredProducts = allProducts.filter(product => {
              const matchesSearch = 
                  (product.product_name && product.product_name.toLowerCase().includes(searchQuery)) ||
                  (product.sku && product.sku.toLowerCase().includes(searchQuery)) ||
                  (product.url && product.url.toLowerCase().includes(searchQuery));
              
              const matchesCategory = !category || product.category === category;
              
              const matchesImageCriteria = hasImages !== 'true' || (
                  product.images && 
                  product.images.length > 0 &&
                  product.images.some(img => img.status === 'downloaded' && !img.skipped)
              );

              return matchesSearch && matchesCategory && matchesImageCriteria;
          });

          // Sort by relevance (exact matches first, then partial matches)
          filteredProducts.sort((a, b) => {
              const aExactMatch = (a.product_name && a.product_name.toLowerCase() === searchQuery) ||
                                 (a.sku && a.sku.toLowerCase() === searchQuery);
              const bExactMatch = (b.product_name && b.product_name.toLowerCase() === searchQuery) ||
                                 (b.sku && b.sku.toLowerCase() === searchQuery);
              
              if (aExactMatch && !bExactMatch) return -1;
              if (!aExactMatch && bExactMatch) return 1;
              
              return (a.product_name || '').localeCompare(b.product_name || '');
          });

          // Pagination
          const totalResults = filteredProducts.length;
          const pageNum = parseInt(page);
          const limitNum = parseInt(limit);
          const startIndex = (pageNum - 1) * limitNum;
          const endIndex = startIndex + limitNum;
          const paginatedResults = filteredProducts.slice(startIndex, endIndex);

          // Format results
          const formattedResults = paginatedResults.map(product => ({
              url: product.url,
              productName: product.product_name || 'Unknown Product',
              sku: product.sku || '',
              category: product.category || '',
              totalImages: product.images ? product.images.filter(img => 
                  img.status === 'downloaded' && !img.skipped
              ).length : 0,
              hasCustomSelection: productImageSender.getImageSelection ? 
                  !!productImageSender.getImageSelection(product.url) : false,
              lastUpdated: product.last_updated
          }));

          res.json({
              success: true,
              query: searchQuery,
              results: formattedResults,
              pagination: {
                  total: totalResults,
                  page: pageNum,
                  limit: limitNum,
                  pages: Math.ceil(totalResults / limitNum),
                  hasNext: endIndex < totalResults,
                  hasPrev: pageNum > 1
              }
          });

      } catch (error) {
          logger.error('Error searching products:', error);
          res.status(500).json({
              success: false,
              error: error.message
          });
      }
  });

 // Debug endpoints
 router.get('/debug/files', async (req, res) => {
     try {
         const imagesDir = path.join(__dirname, '..', 'products', 'images');
         
         const files = await fs.readdir(imagesDir);
         const imageFiles = [];
         
         for (const file of files) {
             const ext = path.extname(file).toLowerCase();
             if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) {
                 const fullPath = path.join(imagesDir, file);
                 const stats = await fs.stat(fullPath);
                 
                 imageFiles.push({
                     filename: file,
                     size: stats.size,
                     sizeMB: Math.round(stats.size / 1024 / 1024 * 100) / 100,
                     created: stats.birthtime,
                     modified: stats.mtime,
                     extension: ext,
                     isUploaded: file.startsWith('upload_') || file.startsWith('manual_'),
                     url: `/api/product-images/images/product/${file}`
                 });
             }
         }
         
         imageFiles.sort((a, b) => new Date(b.modified) - new Date(a.modified));
         
         res.json({
             success: true,
             imagesDir: imagesDir,
             totalFiles: imageFiles.length,
             totalSize: imageFiles.reduce((sum, file) => sum + file.size, 0),
             totalSizeMB: Math.round(imageFiles.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024 * 100) / 100,
             uploadedFiles: imageFiles.filter(file => file.isUploaded).length,
             scrapedFiles: imageFiles.filter(file => !file.isUploaded).length,
             files: imageFiles
         });
         
     } catch (error) {
         logger.error('Error listing image files:', error);
         res.status(500).json({
             success: false,
             error: error.message
         });
     }
 });

 // Debug specific product
 router.get('/debug/product/:encodedUrl', async (req, res) => {
     try {
         const productUrl = decodeURIComponent(req.params.encodedUrl);
         
         // Get product data
         const productData = await productImageSender.findProductByUrl(productUrl);
         
         if (!productData) {
             return res.status(404).json({
                 success: false,
                 error: 'Product not found'
             });
         }

         // Get image selection
         const imageSelection = productImageSender.getImageSelection ? 
             productImageSender.getImageSelection(productUrl) : null;

         // Check which image files actually exist
         const imageStatus = [];
         if (productData.images) {
             for (const image of productData.images) {
                 const imagePath = image.localPath || path.join(__dirname, '..', 'products', 'images', image.filename);
                 const exists = await checkFileExists(imagePath);
                 
                 imageStatus.push({
                     filename: image.filename,
                     localPath: image.localPath,
                     exists: exists,
                     status: image.status,
                     selected: image.selected,
                     url: image.url,
                     generatedUrl: `/api/product-images/images/product/${image.filename}`
                 });
             }
         }

         res.json({
             success: true,
             productUrl: productUrl,
             productData: {
                 ...productData,
                 imagesCount: productData.images ? productData.images.length : 0
             },
             imageSelection: imageSelection,
             imageStatus: imageStatus,
             debug: {
                 hasSelection: !!imageSelection,
                 selectedCount: imageSelection ? 
                     imageSelection.selectedImages.filter(img => img.selected).length : 0,
                 existingFiles: imageStatus.filter(img => img.exists).length,
                 missingFiles: imageStatus.filter(img => !img.exists).length
             }
         });

     } catch (error) {
         logger.error('Error debugging product:', error);
         res.status(500).json({
             success: false,
             error: error.message
         });
     }
 });

 // Debug temp directory
 router.get('/debug/temp', async (req, res) => {
     try {
         const tempImagesDir = path.join(__dirname, '..', 'temp_images');
         
         const debugInfo = {
             tempDir: tempImagesDir,
             timestamp: new Date().toISOString(),
             checks: {}
         };
         
         // Check directory existence and permissions
         try {
             await fs.access(tempImagesDir);
             debugInfo.checks.directoryExists = true;
             
             const dirStats = await fs.stat(tempImagesDir);
             debugInfo.checks.directoryInfo = {
                 isDirectory: dirStats.isDirectory(),
                 permissions: dirStats.mode.toString(8),
                 created: dirStats.birthtime,
                 modified: dirStats.mtime
             };
             
             // Check read/write permissions
             await fs.access(tempImagesDir, fs.constants.R_OK);
             debugInfo.checks.readable = true;
             
             await fs.access(tempImagesDir, fs.constants.W_OK);
             debugInfo.checks.writable = true;
             
             // List files
             const files = await fs.readdir(tempImagesDir);
             debugInfo.files = {
                 count: files.length,
                 list: files.slice(0, 20), // First 20 files
                 totalSize: 0
             };
             
             // Calculate total size
             for (const file of files) {
                 try {
                     const filePath = path.join(tempImagesDir, file);
                     const fileStats = await fs.stat(filePath);
                     debugInfo.files.totalSize += fileStats.size;
                 } catch (error) {
                     // Skip files that can't be stat'ed
                 }
             }
             
             debugInfo.files.totalSizeMB = Math.round(debugInfo.files.totalSize / 1024 / 1024 * 100) / 100;
             
         } catch (error) {
             debugInfo.checks.directoryExists = false;
             debugInfo.checks.error = error.message;
         }
         
         res.json({
             success: true,
             debug: debugInfo
         });
         
     } catch (error) {
         logger.error('Error debugging temp directory:', error);
         res.status(500).json({
             success: false,
             error: error.message
         });
     }
 });

 // Cleanup endpoints
 router.post('/cleanup/temp-images', async (req, res) => {
     try {
         const tempDir = path.join(__dirname, '..', 'temp_images');
         const maxAge = req.body.maxAgeHours || 24; // Default 24 hours
         
         let cleanedFiles = 0;
         let errors = [];

         try {
             const files = await fs.readdir(tempDir);
             const now = Date.now();

             for (const file of files) {
                 try {
                     const filePath = path.join(tempDir, file);
                     const stats = await fs.stat(filePath);
                     const ageHours = (now - stats.mtime.getTime()) / (1000 * 60 * 60);

                     if (ageHours > maxAge) {
                         await fs.unlink(filePath);
                         cleanedFiles++;
                         logger.info(`Cleaned up temp file: ${file} (age: ${Math.round(ageHours)}h)`);
                     }
                 } catch (error) {
                     errors.push({
                         file: file,
                         error: error.message
                     });
                 }
             }
         } catch (error) {
             if (error.code !== 'ENOENT') {
                 throw error;
             }
         }

         res.json({
             success: true,
             message: `Cleaned up ${cleanedFiles} temp files`,
             cleanedFiles: cleanedFiles,
             errors: errors,
             maxAgeHours: maxAge
         });

     } catch (error) {
         logger.error('Error cleaning up temp images:', error);
         res.status(500).json({
             success: false,
             error: error.message
         });
     }
 });

 // System info endpoint
 router.get('/system-info', async (req, res) => {
     try {
         const config = productImageSender.getConfig();
         const globalStats = productImageSender.getGlobalStatistics();
         const health = await productImageSender.healthCheck();

         // Get directory sizes
         const productImagesDir = path.join(__dirname, '..', 'products', 'images');
         const tempImagesDir = path.join(__dirname, '..', 'temp_images');
         
         let productImageStats = { files: 0, size: 0 };
         let tempImageStats = { files: 0, size: 0 };

         try {
             const productFiles = await fs.readdir(productImagesDir);
             for (const file of productFiles) {
                 const stats = await fs.stat(path.join(productImagesDir, file));
                 productImageStats.files++;
                 productImageStats.size += stats.size;
             }
         } catch (error) {
             // Directory might not exist
         }

         try {
             const tempFiles = await fs.readdir(tempImagesDir);
             for (const file of tempFiles) {
                 const stats = await fs.stat(path.join(tempImagesDir, file));
                 tempImageStats.files++;
                 tempImageStats.size += stats.size;
             }
         } catch (error) {
             // Directory might not exist
         }

         res.json({
             success: true,
             system: {
                 service: 'ProductImageSender',
                 version: '2.1.0',
                 status: config.enabled ? 'enabled' : 'disabled',
                 uptime: process.uptime(),
                 memory: process.memoryUsage(),
                 nodeVersion: process.version
             },
             configuration: config,
             statistics: globalStats,
             health: health,
             storage: {
                 productImages: {
                     ...productImageStats,
                     sizeMB: Math.round(productImageStats.size / 1024 / 1024 * 100) / 100
                 },
                 tempImages: {
                     ...tempImageStats,
                     sizeMB: Math.round(tempImageStats.size / 1024 / 1024 * 100) / 100
                 }
             },
             endpoints: {
                 tempImagesList: '/api/product-images/images/temp',
                 tempImagesCleanup: '/api/product-images/images/temp/cleanup',
                 tempImagesStatus: '/api/product-images/images/temp/status',
                 tempImagesCreate: '/api/product-images/images/temp/create',
                 tempImageServing: '/api/product-images/images/temp/:filename',
                 tempImageDebug: '/api/product-images/images/temp/:filename/debug'
             },
             timestamp: new Date().toISOString()
         });

     } catch (error) {
         logger.error('Error getting system info:', error);
         res.status(500).json({
             success: false,
             error: error.message
         });
     }
 });

 // Error handling middleware
 router.use((err, req, res, next) => {
     logger.error('ProductImageRoutes Error:', err);
     
     if (err.message === 'Only image files are allowed') {
         return res.status(400).json({
             success: false,
             error: 'Only image files (JPEG, PNG, GIF, WebP, BMP) are allowed'
         });
     }
     
     if (err.code === 'LIMIT_FILE_SIZE') {
         return res.status(400).json({
             success: false,
             error: 'File size too large. Maximum size is 10MB'
         });
     }
     
     if (err.code === 'ENOENT') {
         return res.status(404).json({
             success: false,
             error: 'File or directory not found'
         });
     }
     
     res.status(500).json({
         success: false,
         error: 'Internal server error',
         details: process.env.NODE_ENV === 'development' ? err.message : undefined
     });
 });

 return router;
};