'use strict';

const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const TEMP_IMAGES_DIR = path.join(ROOT_DIR, 'temp_images');
const PRODUCTS_DIR = path.join(ROOT_DIR, 'products');
const STATIC_DIR = path.join(ROOT_DIR, 'public');
const LOGS_DIR = path.join(ROOT_DIR, 'logs');
const PROCESSED_DIR = path.join(ROOT_DIR, 'processed_files');

const resolveFrom = (baseDir) => (...segments) => path.join(baseDir, ...segments);

const resolveDataPath = resolveFrom(DATA_DIR);
const resolveUploadsPath = resolveFrom(UPLOADS_DIR);
const resolveTempPath = resolveFrom(TEMP_IMAGES_DIR);
const resolveProductsPath = resolveFrom(PRODUCTS_DIR);
const resolveLogsPath = resolveFrom(LOGS_DIR);
const resolveProcessedPath = resolveFrom(PROCESSED_DIR);

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  UPLOADS_DIR,
  TEMP_IMAGES_DIR,
  PRODUCTS_DIR,
  STATIC_DIR,
  LOGS_DIR,
  PROCESSED_DIR,
  resolveDataPath,
  resolveUploadsPath,
  resolveTempPath,
  resolveProductsPath,
  resolveLogsPath,
  resolveProcessedPath
};
