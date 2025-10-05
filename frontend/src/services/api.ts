// src/services/api.ts
import { apiCall, apiCallFile, apiUtils, ApiResponse } from './apiCore';

// =================================================================
// Consolidated API File
// This file centralizes all API modules for the application.
// =================================================================

// ======================== INTERFACES ========================

// --- Auth ---
// (Interfaces for auth are implicitly handled by responses)

// --- AI Models ---
export interface AIModelConfig {
  modelName: string;
  apiVersion: string;
  modelUrl: string;
  useDirectUrl: boolean;
  generationConfig: {
    temperature: number;
    topP: number;
    topK: number;
    maxOutputTokens: number;
  };
}

export interface ModelPerformanceMetrics {
  averageResponseTime: number;
  successRate: number;
  totalRequests: number;
  failedRequests: number;
  lastUsed: string;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
}

export interface ImageModel {
  name: string;
  displayName: string;
  description: string;
  version: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedGenerationMethods: string[];
  temperature?: number;
  topP?: number;
  topK?: number;
  baseModelId?: string;
  isVisionCapable?: boolean;
  category?: string;
  recommended?: boolean;
  apiVersion?: string;
  useDirectUrl?: boolean;
}

export interface ImageAIConfig {
  currentModel: string;
  modelInfo?: ImageModel;
  lastUpdate?: string;
  promptTemplate: string;
  availableModels: ImageModel[];
  batchTimeout?: number;
  maxBatchSize?: number;
  minImageGap?: number;
  commentLookbackWindow?: number;
  maxCommentLength?: number;
  activeBatches?: number;
}

export interface ModelTestResult {
  success: boolean;
  model?: string;
  response?: string;
  connectionStatus?: string;
  error?: string;
  duration?: number;
  tokens?: {
    input: number;
    output: number;
  };
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'error' | 'unknown';
  timestamp: number;
  system: any;
  services: any;
}

// --- AI Test ---
export interface ChatOptions {
  useKnowledge: boolean;
  includeProducts: boolean;
  temperature: number;
  maxTokens: number;
  topK: number;
  model: string;
  scoreThreshold?: number;
}

export interface ChatWithKnowledgeParams {
  query: string;
  userId: string;
  useKnowledge?: boolean;
  knowledgeOptions?: {
    topK?: number;
    scoreThreshold?: number;
    filter?: any;
  };
  productOptions?: {
    includeProducts?: boolean;
    products?: any[];
  };
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
  };
}

// --- Backup ---
export interface BackupJob {
  id: string;
  name: string;
  type: 'full' | 'incremental' | 'differential';
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  size?: number;
  duration?: number;
  location: string;
  includes: string[];
  excludes?: string[];
  metadata?: any;
}

// --- Chat ---
export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: any;
}

export interface ChatSession {
  id: string;
  userId: string;
  title?: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  metadata?: any;
}

// --- Configuration ---
export interface SystemConfig {
    // Define a comprehensive system config interface if needed
    [key: string]: any;
}


export interface Stats {
  total_knowledge: number;
  total_words: number;
  total_chunks: number;
  by_language: {
    [key: string]: {
      total: number;
      total_words: number;
      categories: { [key: string]: number };
    };
  };
  categories: { [key: string]: number };
}

// --- Knowledge ---
export interface Knowledge {
  id: string;
  file_name: string;
  category: string;
  language?: string;
  text?: string;
  metadata?: any;
  tags?: string[];
  chunks?: any[];
  source?: string;
  // support both camelCase and snake_case timestamps coming from different APIs
  createdAt?: number;
  updatedAt?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SearchResult extends Knowledge {
  relevance_score: number;
  confidence_score: number;
}

// --- User ---
export interface User {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
  language?: string;
  platform?: 'line' | 'web' | 'api' | 'system';
  isActive?: boolean;
  createdAt?: number;
  lastActivity?: number;
  lastActive: number;
  aiEnabled: boolean;
  metadata?: { [key: string]: any };
  stats: { [key: string]: any };
  lastMessageSnippet?: string;
  isNew?: boolean;
}


// ======================== API MODULES ========================

/**
 * Authentication related APIs
 */
export const authApi = {
  login: async (username: string, password: string) => {
    const response = await apiCall('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.success) throw new Error(response.error || 'Login failed');
    return response.data;
  },
  getProfile: async () => {
    const response = await apiCall('/api/auth/profile');
    if (!response.success) throw new Error(response.error || 'Failed to get profile');
    return response.data;
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await apiCall('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    if (!response.success) throw new Error(response.error || 'Failed to change password');
    return response.data;
  },
  logout: async () => apiCall('/api/auth/logout', { method: 'POST' }),
  refreshToken: async () => apiCall('/api/auth/refresh', { method: 'POST' }),
  register: async (userData: any) => apiCall('/api/auth/register', { method: 'POST', body: JSON.stringify(userData) }),
  verifyToken: async (token: string) => apiCall('/api/auth/verify', { method: 'POST', body: JSON.stringify({ token }) }),
  resetPassword: async (email: string) => apiCall('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ email }) }),
  updateProfile: async (profileData: any) => apiCall('/api/auth/profile', { method: 'PUT', body: JSON.stringify(profileData) }),
};


/**
 * AI Model Management APIs
 */
export const aiModelApi = {
  getAllModels: async () => apiCall('/api/ai/models/all'),
  compareModels: async (modelNames: string[]) => apiCall('/api/ai/models/compare', { method: 'POST', body: JSON.stringify({ models: modelNames }) }),
  getModelMetrics: async (modelName: string) => apiCall(`/api/ai/models/${modelName}/metrics`),
  getUsageReport: async (startDate: string, endDate: string, modelName?: string) => {
      const params = new URLSearchParams({ startDate, endDate, ...(modelName && { modelName }) });
      return apiCall(`/api/ai/models/usage-report?${params}`);
  },
  getRealTimeStats: async () => apiCall('/api/ai/models/realtime-stats'),
  clearModelCache: async (modelName: string) => apiCall(`/api/ai/models/${modelName}/clear-cache`, { method: 'POST' }),
  // Toggle AI features for a given user
  toggleUser: async (userId: string, enabled: boolean) => apiCall(`/api/ai/models/users/${userId}/toggle`, { method: 'POST', body: JSON.stringify({ enabled }) }),
};

/**
 * AI Testing and Debugging APIs
 */
export const aiTestApi = {
  chatWithKnowledge: async (params: ChatWithKnowledgeParams) => apiCall('/api/ai/chat-with-knowledge', { method: 'POST', body: JSON.stringify(params) }),
  searchKnowledge: async (params: any) => apiCall('/api/ai/search-knowledge', { method: 'POST', body: JSON.stringify(params) }),
  generateKnowledgeContext: async (params: any) => apiCall('/api/ai/generate-knowledge-context', { method: 'POST', body: JSON.stringify(params) }),
  testUnifiedContext: async (params: any) => apiCall('/api/debug/test-unified-context', { method: 'POST', body: JSON.stringify(params) }),
  testLanguageConfig: async (language?: string) => apiCall(`/api/debug/test-language-config${language ? `?language=${language}`: ''}`),
};


/**
 * Backup and Restore APIs
 */
export const backupApi = {
  getAllBackups: async (limit?: number, offset?: number) => {
      const params = new URLSearchParams({ ...(limit && { limit: String(limit) }), ...(offset && { offset: String(offset) }) });
      return apiCall(`/api/backup/jobs?${params}`);
  },
  createBackup: async (backupData: any) => apiCall<BackupJob>('/api/backup/jobs', { method: 'POST', body: JSON.stringify(backupData) }),
  getBackupDetails: async (backupId: string) => apiCall<BackupJob>(`/api/backup/jobs/${backupId}`),
  deleteBackup: async (backupId: string) => apiCall<void>(`/api/backup/jobs/${backupId}`, { method: 'DELETE' }),
  downloadBackup: async (backupId: string, filename: string) => apiUtils.downloadFile(`/api/backup/jobs/${backupId}/download`, filename),
  restoreBackup: async (backupId: string, options?: any) => apiCall(`/api/backup/jobs/${backupId}/restore`, { method: 'POST', body: JSON.stringify(options || {}) }),
  getBackupSchedules: async () => apiCall('/api/backup/schedules'),
  getBackupStats: async () => apiCall('/api/backup/stats'),
};

/**
 * Chat and Messaging APIs
 */
export const chatApi = {
  getAllSessions: async (userId?: string) => apiCall<ChatSession[]>(userId ? `/api/chat/sessions?userId=${userId}` : '/api/chat/sessions'),
  getSession: async (sessionId: string) => apiCall<ChatSession>(`/api/chat/sessions/${sessionId}`),
  createSession: async (sessionData: Partial<ChatSession>) => apiCall<ChatSession>('/api/chat/sessions', { method: 'POST', body: JSON.stringify(sessionData) }),
  deleteSession: async (sessionId: string) => apiCall<void>(`/api/chat/sessions/${sessionId}`, { method: 'DELETE' }),
  addMessage: async (sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => apiCall<ChatMessage>(`/api/chat/sessions/${sessionId}/messages`, { method: 'POST', body: JSON.stringify(message) }),
  getMessages: async (sessionId: string, page?: number, limit?: number) => {
      const params = new URLSearchParams({ ...(page && { page: String(page) }), ...(limit && { limit: String(limit) }) });
      return apiCall<ChatMessage[]>(`/api/chat/sessions/${sessionId}/messages?${params}`);
  },
  exportChat: async (sessionId?: string, format: 'json' | 'csv' | 'txt' = 'json') => {
      const params = new URLSearchParams({ ...(sessionId && { sessionId }), format });
      const filename = `chat-export-${sessionId || 'all'}.${format}`;
      await apiUtils.downloadFile(`/api/chat/export?${params.toString()}`, filename);
  },
};

export const messageApi = {
  getUserMessages: async (userId: string, type?: string, limit?: number, offset?: number) => {
    const params = new URLSearchParams({ ...(type && { type }), ...(limit && { limit: String(limit) }), ...(offset && { offset: String(offset) }) });
    return apiCall(`/api/messages/${userId}?${params}`);
  },
  sendMessage: async (userId: string, messageData: any) => apiCall(`/api/messages/${userId}`, { method: 'POST', body: JSON.stringify(messageData) }),
  deleteMessage: async (userId: string, messageId: string) => apiCall(`/api/messages/${userId}/${messageId}`, { method: 'DELETE' }),
  getAllMessages: async (filter?: any) => apiCall(`/api/messages?${new URLSearchParams(filter)}`),
  getMessageStats: async (timeframe?: string, userId?: string) => {
    const params = new URLSearchParams({ ...(timeframe && { timeframe }), ...(userId && { userId }) });
    return apiCall(`/api/messages/stats?${params}`);
  },
  markAsRead: async (userId: string) => apiCall(`/api/messages/read/${userId}`, { method: 'POST' }),
};

/**
 * System Configuration APIs
 */
export const configurationApi = {
  getSystemConfig: async () => apiCall<SystemConfig>('/api/configuration/system'),
  updateSystemConfig: async (config: Partial<SystemConfig>) => apiCall<SystemConfig>('/api/configuration/system', { method: 'PUT', body: JSON.stringify(config) }),
  getConfigSection: async (section: keyof SystemConfig) => apiCall(`/api/configuration/system/${section}`),
  updateConfigSection: async (section: keyof SystemConfig, config: any) => apiCall(`/api/configuration/system/${section}`, { method: 'PUT', body: JSON.stringify(config) }),
  resetConfig: async (section?: keyof SystemConfig) => apiCall<SystemConfig>(section ? `/api/configuration/reset/${section}` : '/api/configuration/reset', { method: 'POST' }),
  exportConfig: async (filename: string, format?: 'json' | 'yaml') => apiUtils.downloadFile(`/api/configuration/export${format ? `?format=${format}` : ''}`, filename),
  importConfig: async (file: File, merge?: boolean) => {
      const formData = new FormData();
      formData.append('config', file);
      if (merge) formData.append('merge', 'true');
      return apiCallFile('/api/configuration/import', formData);
  },
};

/**
 * Email Service APIs
 */
export const emailApi = {
  sendEmail: async (emailData: any) => apiCall('/api/email/send', { method: 'POST', body: JSON.stringify(emailData) }),
  getEmailHistory: async (params: any) => apiCall(`/api/email/history?${new URLSearchParams(params)}`),
  getEmailTemplates: async () => apiCall('/api/email/templates'),
  createEmailTemplate: async (templateData: any) => apiCall('/api/email/templates', { method: 'POST', body: JSON.stringify(templateData) }),
  updateEmailTemplate: async (templateId: string, templateData: any) => apiCall(`/api/email/templates/${templateId}`, { method: 'PUT', body: JSON.stringify(templateData) }),
  getEmailConfig: async () => apiCall('/api/email/config'),
  updateEmailConfig: async (configData: any) => apiCall('/api/email/config', { method: 'PUT', body: JSON.stringify(configData) }),
  uploadAttachment: async (file: File) => {
      const formData = new FormData();
      formData.append('attachment', file);
      return apiCallFile('/api/email/attachments', formData);
  },
};

/**
 * Image Handling APIs
 */
export const imageApi = {
  getConfig: async () => apiCall('/api/images/config'),
  updateConfig: async (config: any) => apiCall('/api/images/config', { method: 'POST', body: JSON.stringify(config) }),
  getHealth: async () => apiCall('/api/images/health'),
  getUploads: async () => apiCall('/api/images/uploads'),
  getProcessed: async () => apiCall('/api/images/processed'),
  cleanup: async (days: number, type: 'all' | 'uploads' | 'processed' = 'all') => apiCall('/api/images/cleanup', { method: 'POST', body: JSON.stringify({ days, type }) }),
  getModels: async () => apiCall('/api/images/models'),
  refreshModels: async () => apiCall('/api/images/models/refresh', { method: 'POST' }),
  setModel: async (modelName: string) => apiCall('/api/images/models/set', { method: 'POST', body: JSON.stringify({ modelName }) }),
  testModel: async (modelName?: string) => apiCall('/api/images/models/test', { method: 'POST', body: JSON.stringify({ modelName }) }),
  testModelWithImage: async (modelName: string, imageFile: File) => {
      const formData = new FormData();
      formData.append('testImage', imageFile);
      return apiCallFile(`/api/images/models/${modelName}/test-image`, formData);
  },
  uploadImage: async (file: File, userId?: string, comment?: string) => {
      const formData = new FormData();
      formData.append('image', file);
      if (userId) formData.append('userId', userId);
      if (comment) formData.append('comment', comment);
      return apiCallFile('/api/images/upload', formData);
  },
  analyzeBase64Image: async (imageData: string, userId?: string, comment?: string, modelName?: string) => apiCall('/api/images/analyze-base64', { method: 'POST', body: JSON.stringify({ imageData, userId, comment, modelName }) }),
  downloadImage: (filename: string, type: 'uploads' | 'processed' = 'uploads') => apiUtils.downloadFile(`/api/images/${type}/${filename}`, filename),
};

/**
 * Keyword Management APIs
 */
export const keywordApi = {
  getAllKeywords: async (params: any) => apiCall(`/api/keywords?${new URLSearchParams(params)}`),
  createKeyword: async (keywordData: any) => apiCall('/api/keywords', { method: 'POST', body: JSON.stringify(keywordData) }),
  updateKeyword: async (keywordId: string, keywordData: any) => apiCall(`/api/keywords/${keywordId}`, { method: 'PUT', body: JSON.stringify(keywordData) }),
  deleteKeyword: async (keywordId: string) => apiCall(`/api/keywords/${keywordId}`, { method: 'DELETE' }),
  importKeywords: async (file: File, options?: any) => {
      const formData = new FormData();
      formData.append('keywords', file);
      if (options) formData.append('options', JSON.stringify(options));
      return apiCallFile('/api/keywords/import', formData);
  },
  exportKeywords: async (filename: string, format?: 'json' | 'csv' | 'xlsx', filter?: any) => {
      const params = new URLSearchParams({ ...(format && { format }), ...(filter && { ...filter }) });
      await apiUtils.downloadFile(`/api/keywords/export?${params}`, filename);
  },
};

/**
 * Knowledge Base APIs
 */
export const knowledgeApi = {
  uploadFile: async (formData: FormData) => apiCallFile('/knowledge/upload', formData),
  addText: async (payload: any) => apiCall('/knowledge/add', { method: 'POST', body: JSON.stringify(payload) }),
  search: async (payload: any) => apiCall('/knowledge/search', { method: 'POST', body: JSON.stringify(payload) }),
  getStats: async () => apiCall('/knowledge/system/stats'),
  listAllKnowledge: async () => apiCall('/knowledge/list'),
  getKnowledgeById: async (id: string) => apiCall(`/knowledge/${id}`),
  deleteKnowledge: async (id: string) => apiCall(`/knowledge/${id}`, { method: 'DELETE' }),
  updateKnowledge: async (id: string, updates: any) => apiCall(`/knowledge/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
};

/**
 * Product and Data Management APIs
 */
export const productApi = {
  getAllProducts: async (params: any) => apiCall(`/api/products?${new URLSearchParams(params)}`),
  getProductById: async (productId: string) => apiCall(`/api/products/${productId}`),
  createProduct: async (productData: any) => apiCall('/api/products', { method: 'POST', body: JSON.stringify(productData) }),
  updateProduct: async (productId: string, productData: any) => apiCall(`/api/products/${productId}`, { method: 'PUT', body: JSON.stringify(productData) }),
  deleteProduct: async (productId: string) => apiCall(`/api/products/${productId}`, { method: 'DELETE' }),
  importProducts: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiCallFile('/api/products/import', formData);
  },
  exportProducts: async (filename: string, format: 'csv' | 'xlsx' = 'xlsx') => apiUtils.downloadFile(`/api/products/export?format=${format}`, filename),
  linkProducts: async (productionId: string, regularProductId: string) => apiCall('/api/products/production/link', { method: 'POST', body: JSON.stringify({ productionId, regularProductId }) }),
  getCategories: async () => apiCall('/api/products/categories'),
  getProductStats: async () => apiCall('/api/products/stats'),
  searchProducts: async (params: any) => apiCall(`/api/products/search?${new URLSearchParams(params)}`),
  getProduct: async (productId: string) => apiCall(`/api/products/${productId}`),
  batchUpdatePriceTiers: async (productId: string, priceTiers: any[]) => apiCall(`/api/products/${productId}/price-tiers/batch`, { method: 'POST', body: JSON.stringify({ priceTiers }) }),
  getPriceTiers: async (productId: string) => apiCall(`/api/products/${productId}/price-tiers`),
  addPriceTier: async (productId: string, tierData: any) => apiCall(`/api/products/${productId}/price-tiers`, { method: 'POST', body: JSON.stringify(tierData) }),
  deletePriceTier: async (productId: string, tierId: string) => apiCall(`/api/products/${productId}/price-tiers/${tierId}`, { method: 'DELETE' }),
};

/**
 * System, Health, and Maintenance APIs
 */
export const systemApi = {
  getSystemHealth: async () => apiCall<SystemHealth>('/api/system/health'),
  getSystemStats: async (timeframe?: string) => apiCall<any>(`/api/system/stats${timeframe ? `?timeframe=${timeframe}` : ''}`),
  getSystemInfo: async () => apiCall<any>('/api/system/info'),
  getSystemLogs: async (params: any) => apiCall(`/api/system/logs?${new URLSearchParams(params)}`),
  restartService: async (serviceName: string) => apiCall(`/api/system/services/${serviceName}/restart`, { method: 'POST' }),
  executeMaintenanceTask: async (taskId: string) => apiCall(`/api/system/maintenance/tasks/${taskId}/execute`, { method: 'POST' }),
  getSystemAlerts: async (params: any) => apiCall(`/api/system/alerts?${new URLSearchParams(params)}`),
  acknowledgeAlert: async (alertId: string) => apiCall(`/api/system/alerts/${alertId}/acknowledge`, { method: 'POST' }),
};

/**
 * User Management APIs
 */
export const userApi = {
  getAllUsers: async (filter?: any) => apiCall<any>(`/api/users?${new URLSearchParams(filter)}`),
  getUserProfile: async (userId: string) => apiCall<any>(`/api/users/${userId}/profile`),
  getUser: async (userId: string) => apiCall<User>(`/api/users/${userId}`),
  updateUser: async (userId: string, updates: Partial<User>) => apiCall<User>(`/api/users/${userId}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteUser: async (userId: string) => apiCall<void>(`/api/users/${userId}`, { method: 'DELETE' }),
  refreshLineProfile: async (userId: string) => apiCall(`/api/users/${userId}/line-profile/refresh`, { method: 'POST' }),
  getUserStats: async (timeframe?: string) => apiCall<any>(`/api/users/stats${timeframe ? `?timeframe=${timeframe}` : ''}`),
  exportUsers: async (filename: string, filter?: any, format?: 'json' | 'csv' | 'xlsx') => {
      const params = new URLSearchParams({ ...(filter && { ...filter }), ...(format && { format }) });
      await apiUtils.downloadFile(`/api/users/export?${params}`, filename);
  },
  bulkUserOperation: async (operation: any) => apiCall('/api/users/bulk', { method: 'POST', body: JSON.stringify(operation) }),
  getUserLanguageData: async () => apiCall('/api/language-detection/users'),
  updateUserLanguage: async (userId: string, language: string, isManual: boolean) => apiCall(`/api/language-detection/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ language, isManual, timestamp: new Date().toISOString() })
  }),
  resetUserLanguage: async (userId: string) => apiCall(`/api/language-detection/users/${userId}/reset`, { method: 'POST' }),
};

/**
 * WebSocket and Real-time APIs
 */
export const websocketApi = {
  getActiveConnections: async () => apiCall('/api/websocket/connections'),
  disconnectConnection: async (connectionId: string, reason?: string) => apiCall(`/api/websocket/connections/${connectionId}/disconnect`, { method: 'POST', body: JSON.stringify({ reason }) }),
  broadcastMessage: async (broadcastData: any) => apiCall('/api/websocket/broadcast', { method: 'POST', body: JSON.stringify(broadcastData) }),
  getAllRooms: async () => apiCall('/api/websocket/rooms'),
  createRoom: async (roomData: any) => apiCall('/api/websocket/rooms', { method: 'POST', body: JSON.stringify(roomData) }),
  getWebSocketStats: async (timeframe?: string) => apiCall(`/api/websocket/stats${timeframe ? `?timeframe=${timeframe}` : ''}`),
  restartServer: async () => apiCall('/api/websocket/server/restart', { method: 'POST' }),
  approveAIResponse: async (userId: string, responseId: string) => apiCall('/api/websocket/approve', { method: 'POST', body: JSON.stringify({ userId, responseId }) }),
  rejectAIResponse: async (userId: string, responseId: string, reason: string) => apiCall('/api/websocket/reject', { method: 'POST', body: JSON.stringify({ userId, responseId, reason }) }),
  cancelAIProcessing: async (userId: string, messageId: string) => apiCall('/api/websocket/cancel', { method: 'POST', body: JSON.stringify({ userId, messageId }) }),
};

/**
 * Notification APIs (from userRelatedApi)
 */
export const notificationApi = {
    getNotifications: async (userId: string, params: any) => apiCall(`/api/notifications/${userId}?${new URLSearchParams(params)}`),
    markNotificationAsRead: async (notificationId: string) => apiCall(`/api/notifications/${notificationId}/read`, { method: 'PUT' }),
    sendNotification: async (notificationData: any) => apiCall('/api/notifications/send', { method: 'POST', body: JSON.stringify(notificationData) }),
    getNotificationTemplates: async () => apiCall('/api/notifications/templates'),
};
