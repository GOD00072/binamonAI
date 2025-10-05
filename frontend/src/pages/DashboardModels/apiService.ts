// DashboardModels/apiService.ts

import { SyncResult, SearchFilters } from './types';

const API_BASE = 'http://localhost:3001/api';

export const apiService = {
  async fetchAPI(endpoint: string, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }
    const data = await response.json();
    if (data.success) {
      return data.data || data;
    }
    throw new Error(data.message || `Failed to fetch ${endpoint}`);
  },

  async getDashboard() {
    return this.fetchAPI('/dashboard');
  },

  async getProducts() {
    return this.fetchAPI('/products');
  },

  async getQualityInteractions(limit = 50, sortBy = 'relevance') {
    return this.fetchAPI(`/quality-interactions?limit=${limit}&sortBy=${sortBy}`);
  },

  async getHotProducts(limit = 50, sortBy = 'hotScore') {
    return this.fetchAPI(`/hot-products?limit=${limit}&sortBy=${sortBy}`);
  },

  async getStockStatus() {
    return this.fetchAPI('/stock-status');
  },

  async getSlowMoveAnalysis() {
    return this.fetchAPI('/slow-move-analysis');
  },

  async getMovementAnalysis() {
    return this.fetchAPI('/movement-analysis');
  },

  async getInteractions() {
    return this.fetchAPI('/interactions');
  },

  async getUserInteractions(userId: string) {
    return this.fetchAPI(`/interactions/${userId}`);
  },

  async getFullAnalysis() {
    return this.fetchAPI('/analysis');
  },

  async getDebugMapping() {
    return this.fetchAPI('/debug/mapping');
  },

  async searchProducts(filters: SearchFilters) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]: [string, any]) => {
      if (value !== '' && value !== null && value !== undefined && value !== false) {
        params.append(key, value.toString());
      }
    });
    return this.fetchAPI(`/search?${params.toString()}`);
  },

  async syncStock(skus: string[]): Promise<SyncResult> {
    return this.fetchAPI('/sync-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus })
    });
  },

  async syncAllStock(): Promise<SyncResult> {
    return this.fetchAPI('/sync-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncAll: true })
    });
  }
};