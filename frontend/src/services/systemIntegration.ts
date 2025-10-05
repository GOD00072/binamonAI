// src/services/systemIntegration.ts
import { apiCall, BASE_URL, ApiResponse } from './apiCore';

// Helper to get auth headers specifically for FormData requests (no Content-Type)
const getFormDataAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// AI API
export const aiApi = {
  getStatus: async () => { // Path from aiRoutes.js
    return await apiCall('/api/ai/status');
  },
  getConfig: async () => { // Path from aiRoutes.js
    return await apiCall('/api/ai/config');
  },
  getAiSettings: async () => { // Fallback logic from original
    const endpoints = ['/api/config/ai', '/api/ai/config', '/api/settings/ai', '/api/config/templates'];
    for (const endpoint of endpoints) {
      try {
        const response = await apiCall(endpoint);
        if (response.success && response.data) return response;
      } catch (error) { continue; }
    }
    return { success: true, data: { modelConfig: {}, generationConfig: {}, templateConfig: {} }, status: 200 };
  },
  // getSystemHealth is part of systemApi now, this was a fallback in original aiApi
  updateModelConfig: async (modelConfig: any) => { // Fallback logic from original
    const endpoints = ['/api/config/ai/model', '/api/ai/model', '/api/settings/model'];
    for (const endpoint of endpoints) {
      try {
        const response = await apiCall(endpoint, { method: 'POST', body: JSON.stringify(modelConfig) });
        if (response.success) return response;
      } catch (error) { continue; }
    }
    return { success: true, data: { message: 'Model config saved (simulated)' }, status: 200 };
  },
  updateGenerationConfig: async (generationConfig: any) => { // Fallback logic from original / Path from aiRoutes.js is /api/ai/config (POST)
    // This function from original api.ts seems to try multiple specific endpoints.
    // aiRoutes.js has a single /api/ai/config POST endpoint to update parts of generationConfig.
    // For simplicity, we map to the known backend endpoint for now.
     return await apiCall('/api/ai/config', { // Path from aiRoutes.js
       method: 'POST', // aiRoutes.js uses POST for this
       body: JSON.stringify(generationConfig)
     });
  },
  updateTemplateConfig: async (templateConfig: any) => { // Fallback logic from original
    const endpoints = ['/api/config/ai/templates', '/api/ai/templates', '/api/settings/templates'];
    for (const endpoint of endpoints) {
      try {
        const response = await apiCall(endpoint, { method: 'POST', body: JSON.stringify(templateConfig) });
        if (response.success) return response;
      } catch (error) { continue; }
    }
    return { success: true, data: { message: 'Template config saved (simulated)' }, status: 200 };
  },
  updateAiMainConfig: async (config: any) => { // Maps to POST /api/ai/config from aiRoutes.js
    return await apiCall('/api/ai/config', { // Changed from PUT to POST as per aiRoutes.js
      method: 'POST',
      body: JSON.stringify(config)
    });
  },
  toggleGlobal: async (enabled: boolean) => { // Path from aiRoutes.js
    return await apiCall('/api/ai/toggle-global', {
      method: 'POST',
      body: JSON.stringify({ enabled })
    });
  },
  toggleUser: async (userId: string, enabled: boolean) => { // Path from aiRoutes.js is /api/ai/toggle-user/:userId
    return await apiCall(`/api/ai/toggle-user/${userId}`, { // Adjusted path to match backend
      method: 'POST',
      body: JSON.stringify({ enabled }) // Backend expects { enabled } in body
    });
  },
  getUsageStats: async (period: 'day' | 'week' | 'month' = 'day') => { // Path from aiRoutes.js /api/ai/usage
                                                                      // original client /api/ai/stats?period=...
    return await apiCall(`/api/ai/usage?period=${period}`); // Use correct path
  },
  getCostAnalysis: async (startDate: string, endDate: string) => {
    return await apiCall(`/api/ai/costs?start=${startDate}&end=${endDate}`);
  },
  resetAiConfig: async () => { // From aiRoutes.js
    return await apiCall('/api/ai/reset-config', {
        method: 'POST'
    });
  },
};

// Dashboard API
export const dashboardApi = {
  getOverviewStats: async () => {
    return await apiCall('/api/dashboard/overview');
  },
  getUserActivityStats: async (period: 'day' | 'week' | 'month' = 'week') => {
    return await apiCall(`/api/dashboard/user-activity?period=${period}`);
  },
  getMessageStats: async (period: 'day' | 'week' | 'month' = 'week') => {
    return await apiCall(`/api/dashboard/message-stats?period=${period}`);
  },
  getAIUsageStats: async (period: 'day' | 'week' | 'month' = 'week') => {
    return await apiCall(`/api/dashboard/ai-usage?period=${period}`);
  },
  getProductStats: async () => {
    return await apiCall('/api/dashboard/product-stats');
  },
  getRecentActivities: async (limit: number = 20) => {
    return await apiCall(`/api/dashboard/recent-activities?limit=${limit}`);
  },
  getSystemHealth: async () => { // Path from original. systemRoutes.js has /api/system/health
    return await apiCall('/api/system/health'); // Adjusted path
  },
  getPerformanceMetrics: async (period: 'hour' | 'day' | 'week' | 'month' = 'day') => {
    return await apiCall(`/api/dashboard/performance?period=${period}`);
  },
  getErrorLogs: async (params: { page?: number; limit?: number; level?: string } = {}) => {
    const queryString = new URLSearchParams(params as any).toString();
    const url = queryString ? `/api/dashboard/errors?${queryString}` : '/api/dashboard/errors';
    return await apiCall(url);
  },
  getResourceUsage: async () => {
    return await apiCall('/api/dashboard/resources');
  },
  exportDashboardData: async (type: 'overview' | 'users' | 'products' | 'messages', format: 'json' | 'csv' | 'xlsx' = 'json') => {
    return await apiCall(`/api/dashboard/export/${type}?format=${format}`);
  }
};

// Settings API
export const settingsApi = {
  getSystemSettings: async () => {
    return await apiCall('/api/settings/system');
  },
  updateSystemSettings: async (settings: any) => {
    return await apiCall('/api/settings/system', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  },
  getUserSettings: async (userId: string) => {
    return await apiCall(`/api/settings/user/${userId}`);
  },
  updateUserSettings: async (userId: string, settings: any) => {
    return await apiCall(`/api/settings/user/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  },
  getNotificationSettings: async (userId: string) => { // Also in notificationApi
    return await apiCall(`/api/settings/notifications/${userId}`);
  },
  updateNotificationSettings: async (userId: string, settings: any) => { // Also in notificationApi
    return await apiCall(`/api/settings/notifications/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  },
  backupData: async () => {
    return await apiCall('/api/settings/backup', {
      method: 'POST'
    });
  },
  restoreData: async (backupFile: File): Promise<ApiResponse<any>> => { // Kept original fetch for FormData
    const formData = new FormData();
    formData.append('backup', backupFile);
    return await fetch(`${BASE_URL}/api/settings/restore`, {
      method: 'POST',
      headers: getFormDataAuthHeaders(),
      body: formData
    }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Restore failed');
      return { success: true, data, status: response.status };
    }).catch(error => {
        return { success: false, data: null, message: error.message, error:error.message, status: 0 };
    });
  },
  getThemeSettings: async () => {
    return await apiCall('/api/settings/theme');
  },
  updateThemeSettings: async (theme: any) => {
    return await apiCall('/api/settings/theme', {
      method: 'PUT',
      body: JSON.stringify(theme)
    });
  },
  getSecuritySettings: async () => {
    return await apiCall('/api/settings/security');
  },
  updateSecuritySettings: async (security: any) => {
    return await apiCall('/api/settings/security', {
      method: 'PUT',
      body: JSON.stringify(security)
    });
  },
  getIntegrationSettings: async () => {
    return await apiCall('/api/settings/integrations');
  },
  updateIntegrationSettings: async (integrations: any) => {
    return await apiCall('/api/settings/integrations', {
      method: 'PUT',
      body: JSON.stringify(integrations)
    });
  },
  resetToDefaults: async (section: 'all' | 'system' | 'user' | 'theme' | 'security') => {
    return await apiCall('/api/settings/reset', {
      method: 'POST',
      body: JSON.stringify({ section })
    });
  },
  exportSettings: async (format: 'json' | 'xml' = 'json') => {
    return await apiCall(`/api/settings/export?format=${format}`);
  },
  importSettings: async (settingsFile: File): Promise<ApiResponse<any>> => { // Kept original fetch for FormData
    const formData = new FormData();
    formData.append('settings', settingsFile);
    return await fetch(`${BASE_URL}/api/settings/import`, {
      method: 'POST',
      headers: getFormDataAuthHeaders(),
      body: formData
    }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Import failed');
      return { success: true, data, status: response.status };
    }).catch(error => {
        return { success: false, data: null, message: error.message, error:error.message, status: 0 };
    });
  },
  // From messageConfigRoutes.js
  getMessageConfig: async () => {
    return await apiCall('/api/message-config');
  },
  updateMessageAggregationConfig: async (config: any) => {
    return await apiCall('/api/message-config/aggregation', {
        method: 'POST',
        body: JSON.stringify(config)
    });
  },
  updateMessageTtlConfig: async (config: any) => {
    return await apiCall('/api/message-config/ttl', {
        method: 'POST',
        body: JSON.stringify(config)
    });
  },
  runMessageMaintenanceTasks: async (cleanupType: 'all' | 'processedMessages' | 'oldHistories') => {
    return await apiCall('/api/message-config/maintenance', {
        method: 'POST',
        body: JSON.stringify({ cleanupType })
    });
  },
  getMessageConfigStats: async () => {
    return await apiCall('/api/message-config/stats');
  }
};

// System API
export const systemApi = {
  getSystemInfo: async () => { // Original, systemRoutes.js has /health and /stats
    return await apiCall('/api/system/stats'); // Mapped to stats
  },
  getSystemHealth: async () => { // Path from systemRoutes.js
    return await apiCall('/api/system/health');
  },
  getSystemStats: async () => { // From systemRoutes.js
    return await apiCall('/api/system/stats');
  },
  getLogs: async (params: { type?: string, lines?: number, level?: string; service?: string; limit?: number } = {}) => {
    // systemRoutes.js has /api/system/logs?type=info&lines=100
    // Original client had level, service, limit. We'll use type and lines for now.
    const queryParams: Record<string, string> = {};
    if (params.type) queryParams.type = params.type;
    if (params.lines) queryParams.lines = String(params.lines);
    else if (params.limit) queryParams.lines = String(params.limit); // map limit to lines

    const queryString = new URLSearchParams(queryParams).toString();
    const url = queryString ? `/api/system/logs?${queryString}` : '/api/system/logs';
    return await apiCall(url);
  },
  getMetrics: async (metric: string, params: { startTime?: string; endTime?: string } = {}) => {
    const queryString = new URLSearchParams(params as any).toString();
    const url = queryString ? `/api/system/metrics/${metric}?${queryString}` : `/api/system/metrics/${metric}`;
    return await apiCall(url);
  },
  restartService: async (serviceName: string) => {
    return await apiCall('/api/system/services/restart', {
      method: 'POST',
      body: JSON.stringify({ serviceName })
    });
  },
  getServiceStatus: async () => {
    return await apiCall('/api/system/services/status');
  },
  updateSystemConfig: async (config: any) => {
    return await apiCall('/api/system/config', {
      method: 'PUT',
      body: JSON.stringify(config)
    });
  },
  getSystemConfig: async () => {
    return await apiCall('/api/system/config');
  },
  runMaintenance: async (maintenanceType: string) => {
    return await apiCall('/api/system/maintenance', {
      method: 'POST',
      body: JSON.stringify({ type: maintenanceType })
    });
  },
  getMaintenanceStatus: async () => {
    return await apiCall('/api/system/maintenance/status');
  },
  forceGarbageCollection: async () => { // From systemRoutes.js
    return await apiCall('/api/system/gc', {
        method: 'POST'
    });
  }
};

// Webhook API (generic, not from specific backend file but common pattern)
export const webhookApi = {
  getWebhooks: async () => {
    return await apiCall('/api/webhooks');
  },
  createWebhook: async (webhookData: any) => {
    return await apiCall('/api/webhooks', {
      method: 'POST',
      body: JSON.stringify(webhookData)
    });
  },
  updateWebhook: async (webhookId: string, webhookData: any) => {
    return await apiCall(`/api/webhooks/${webhookId}`, {
      method: 'PUT',
      body: JSON.stringify(webhookData)
    });
  },
  deleteWebhook: async (webhookId: string) => {
    return await apiCall(`/api/webhooks/${webhookId}`, {
      method: 'DELETE'
    });
  },
  testWebhook: async (webhookId: string) => {
    return await apiCall(`/api/webhooks/${webhookId}/test`, {
      method: 'POST'
    });
  },
  getWebhookLogs: async (webhookId: string, params: { page?: number; limit?: number } = {}) => {
    const queryString = new URLSearchParams(params as any).toString();
    const url = queryString ? `/api/webhooks/${webhookId}/logs?${queryString}` : `/api/webhooks/${webhookId}/logs`;
    return await apiCall(url);
  },
  retryWebhook: async (webhookId: string, logId: string) => {
    return await apiCall(`/api/webhooks/${webhookId}/retry/${logId}`, {
      method: 'POST'
    });
  }
};

// WebSocket related API calls (from websocketRoutes.js)
export const websocketApi = {
    getWebSocketStatus: async () => {
        return await apiCall('/api/websocket/status');
    },
    updateWebSocketConfig: async (config: any) => {
        return await apiCall('/api/websocket/config', {
            method: 'POST',
            body: JSON.stringify(config)
        });
    },
    getWebSocketConnections: async () => {
        return await apiCall('/api/websocket/connections');
    },
    broadcastWebSocketMessage: async (event: string, data: any) => {
        return await apiCall('/api/websocket/broadcast', {
            method: 'POST',
            body: JSON.stringify({ event, data })
        });
    },
    controlAdminTyping: async (action: 'start' | 'stop', userId: string, adminId: string) => {
        return await apiCall(`/api/websocket/admin/typing/${action}`, {
            method: 'POST',
            body: JSON.stringify({ userId, adminId })
        });
    },
    cancelAIProcessing: async (userId: string, messageId: string) => {
        return await apiCall('/api/websocket/ai/cancel', {
            method: 'POST',
            body: JSON.stringify({ userId, messageId })
        });
    },
    approveAIResponse: async (userId: string, responseId: string) => {
        return await apiCall('/api/websocket/ai/approve', {
            method: 'POST',
            body: JSON.stringify({ userId, responseId })
        });
    },
    rejectAIResponse: async (userId: string, responseId: string, reason?: string) => {
        return await apiCall('/api/websocket/ai/reject', {
            method: 'POST',
            body: JSON.stringify({ userId, responseId, reason })
        });
    },
    getAIProcessingStatus: async () => {
        return await apiCall('/api/websocket/ai/processing');
    },
    getPendingAIApprovals: async () => {
        return await apiCall('/api/websocket/ai/pending');
    }
};