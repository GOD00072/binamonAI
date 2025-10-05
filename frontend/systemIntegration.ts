// src/services/systemIntegration.ts
import { apiCall, ApiResponse } from './apiCore';

// --- AI API ---
export const aiApi = {
  getStatus: async () => apiCall('/api/ai/status'),
  ask: async (question: string, stockOnly: boolean = false) => {
    return apiCall('/api/ai/ask', {
      method: 'POST',
      body: JSON.stringify({ question, stockOnly }),
    });
  },
  // Additional AI endpoints would go here...
};

// --- Dashboard API ---
export const dashboardApi = {
  getDashboardStats: async () => apiCall('/api/dashboard'),
  getUserActivityStats: async (period: 'day' | 'week' | 'month' = 'week') =>
    apiCall(`/api/dashboard/user-activity?period=${period}`),
  getMessageStats: async (period: 'day' | 'week' | 'month' = 'week') =>
    apiCall(`/api/dashboard/message-stats?period=${period}`),
  getProductStats: async () => apiCall('/api/dashboard/product-stats'),

  // Added to satisfy DashboardPage.tsx
  getQualityInteractions: async () => apiCall('/api/dashboard/quality-interactions'),
  getHotProducts: async () => apiCall('/api/dashboard/hot-products'),

  // Added to satisfy StockManagementTab.tsx
  getStockStatus: async () => apiCall('/api/stock/status'),
  syncStock: async (payload: { syncAll?: boolean; skus?: string[] }) =>
    apiCall('/api/stock/sync', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  exportDashboardData: async (
    type: 'overview' | 'users' | 'products' | 'messages',
    format: 'json' | 'csv' | 'xlsx' = 'json'
  ) => apiCall(`/api/dashboard/export/${type}?format=${format}`),
};

// --- Settings API (minimal stub to keep existing imports happy) ---
export const settingsApi = {
  getSystemSettings: async () => apiCall('/api/settings'),
  updateSystemSettings: async (settings: any) =>
    apiCall('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }),
};

// --- System API (minimal) ---
export const systemApi = {
  ping: async () => apiCall('/api/system/ping'),
};

// --- Webhook API (minimal) ---
export const webhookApi = {
  getAll: async () => apiCall('/api/webhooks'),
};

// --- Websocket API (minimal stub) ---
export const websocketApi = {
  getStatus: async () => apiCall('/api/websocket/status'),
};
